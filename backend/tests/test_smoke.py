"""End-to-end API regression suite (memory mode, seeded from seed_data/).

Covers: health, catalogue reads, artisan lineage, verification outcomes,
passport QR/PDF issuance, the full CV upload pipeline, tamper detection,
blur rejection and duplicate matching — everything the previous ad-hoc
``smoke_test.py`` (temp dir) verified, but committed and CI-runnable.
"""
from __future__ import annotations

from conftest import make_flat_image, make_sharp_image, upload_artwork


# ---------------------------------------------------------------- catalogue
def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["mode"] == "memory"
    assert body["repository_initialised"] is True


def test_catalogue_seeded(client):
    traditions = client.get("/api/v1/traditions").json()
    assert len(traditions) == 1
    assert traditions[0]["gi_tag_number"] == "GI-88"
    assert traditions[0]["artisan_count"] >= 6

    assert len(client.get("/api/v1/regions").json()) == 2
    assert len(client.get("/api/v1/artisans").json()) == 6
    assert len(client.get("/api/v1/artworks").json()) == 8


def test_artwork_list_filters(client):
    traditions = client.get("/api/v1/traditions").json()
    artists = client.get("/api/v1/artisans").json()
    gopinath = next(a for a in artists if a["full_name"] == "Gopinath Moharana")

    by_state = client.get("/api/v1/artworks?state=Odisha").json()
    assert len(by_state) == 8
    assert all(a["origin_state"] == "Odisha" for a in by_state)
    assert client.get("/api/v1/artworks?state=Rajasthan").json() == []

    by_tradition = client.get(
        f"/api/v1/artworks?tradition_id={traditions[0]['id']}"
    ).json()
    assert len(by_tradition) == 8

    by_artisan = client.get(f"/api/v1/artworks?artisan_id={gopinath['id']}").json()
    assert len(by_artisan) == 2
    assert all(a["artisan_name"] == "Gopinath Moharana" for a in by_artisan)

    by_century = client.get("/api/v1/artworks?century=21").json()
    assert len(by_century) == 8
    assert client.get("/api/v1/artworks?century=19").json() == []

    mediums = {a["medium"] for a in client.get("/api/v1/artworks").json()}
    if mediums:
        sample = next(iter(mediums))
        by_medium = client.get(
            "/api/v1/artworks", params={"medium": sample}
        ).json()
        assert len(by_medium) >= 1
        assert all(a["medium"] == sample for a in by_medium)


# ----------------------------------------------------------------- lineages
def test_lineage_self_only_when_no_ancestors(client):
    artisans = client.get("/api/v1/artisans").json()
    gopinath = next(a for a in artisans if a["full_name"] == "Gopinath Moharana")
    detail = client.get(f"/api/v1/artisans/{gopinath['id']}").json()
    assert len(detail["lineage"]) == 1
    assert detail["lineage"][-1]["id"] == gopinath["id"]
    assert detail["artwork_count"] == 2
    assert detail["story_count"] == 1


def test_lineage_multiple_generations(client):
    artisans = client.get("/api/v1/artisans").json()
    aditya = next(a for a in artisans if a["full_name"] == "Aditya Moharana")
    detail = client.get(f"/api/v1/artisans/{aditya['id']}").json()
    assert len(detail["lineage"]) == 3
    assert [m["generation_number"] for m in detail["lineage"]] == [1, 2, 3]
    assert detail["lineage"][0]["full_name"] == "Gopinath Moharana"
    assert detail["lineage"][-1]["id"] == aditya["id"]

    shyam = next(a for a in artisans if a["full_name"] == "Shyamsundar Moharana")
    shyam_detail = client.get(f"/api/v1/artisans/{shyam['id']}").json()
    assert len(shyam_detail["lineage"]) == 2


# --------------------------------------------------------------- verification
def test_seed_passport_verifies(client):
    vr = client.get("/api/v1/verify/VR-OD-PAT-2026-000001").json()
    assert vr["outcome"] == "verified"
    assert len(vr["stored_sha256"] or "") == 64
    assert len(vr["events"]) == 5
    assert vr["artwork"]["heritage_id"] == "VR-OD-PAT-2026-000001"


def test_unknown_id_not_registered(client):
    vr = client.get("/api/v1/verify/VR-XX-YYY-2099-999999").json()
    assert vr["outcome"] == "not_registered"


# ------------------------------------------------------------- photo verify
def test_verify_by_photograph_matches_registry(client):
    gopinath = next(
        a for a in client.get("/api/v1/artisans").json()
        if a["full_name"] == "Gopinath Moharana"
    )
    upload = upload_artwork(
        client, make_sharp_image(), gopinath["id"], auto_passport="true"
    )
    assert upload.status_code == 201
    new_id = upload.json()["heritage_id"]

    verify = client.post(
        "/api/v1/verify/image",
        files={"file": ("photo.jpg", make_sharp_image(), "image/jpeg")},
    )
    assert verify.status_code == 200, verify.text
    body = verify.json()

    assert body["image_quality"]["blur_pass"] is True
    assert isinstance(body["matches"], list) and len(body["matches"]) > 0
    matched_ids = {m["heritage_id"] for m in body["matches"]}
    assert new_id in matched_ids
    assert all(m["orb_match_score"] >= 0.0 for m in body["matches"])

    if body["result"] is not None:
        assert body["result"]["outcome"] == "verified"
        assert body["result"]["computed_sha256"] == body["result"]["stored_sha256"]


def test_verify_by_photograph_rejects_blurry(client):
    rejected = client.post(
        "/api/v1/verify/image",
        files={"file": ("blurry.jpg", make_flat_image(), "image/jpeg")},
    )
    assert rejected.status_code == 422


def test_verify_rotated_seed_plate_via_orb_fallback(client):
    """A real capture is never square-on: a rotated seed plate drifts past
    the pHash/dHash Hamming pre-filter, so the structural ORB fallback must
    still surface the plate and reach the digest outcome."""
    import cv2
    from pathlib import Path

    plate_path = (
        Path(__file__).resolve().parents[2]
        / "seed_data" / "media" / "artworks" / "artwork-01.jpg"
    )
    img = cv2.imread(str(plate_path))
    h, w = img.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), 3.0, 1.0)
    rotated = cv2.warpAffine(img, matrix, (w, h), borderValue=(30, 25, 18))
    ok, buf = cv2.imencode(".jpg", rotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
    assert ok

    verify = client.post(
        "/api/v1/verify/image",
        files={"file": ("capture.jpg", buf.tobytes(), "image/jpeg")},
    )
    assert verify.status_code == 200, verify.text
    body = verify.json()
    assert len(body["matches"]) > 0
    top = body["matches"][0]
    assert top["heritage_id"] == "VR-OD-PAT-2026-000001"
    assert top["orb_match_score"] >= 0.6
    assert body["result"] is not None
    assert body["result"]["outcome"] == "verified"


# ------------------------------------------------------------------- passports
def test_passport_qr_and_pdf(client):
    qr = client.get("/api/v1/passports/VR-OD-PAT-2026-000001/qr")
    assert qr.status_code == 200
    assert qr.headers["content-type"] == "image/png"

    pdf = client.get("/api/v1/passports/VR-OD-PAT-2026-000001/pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:4] == b"%PDF"
    assert len(pdf.content) > 1000


def test_passport_unknown_id_404(client):
    assert client.get("/api/v1/passports/VR-XX-999999/qr").status_code == 404
    assert client.get("/api/v1/passports/VR-XX-999999").status_code == 404


# ------------------------------------------------------------- cv upload path
def test_upload_full_pipeline(client):
    gopinath = next(
        a for a in client.get("/api/v1/artisans").json()
        if a["full_name"] == "Gopinath Moharana"
    )
    image_bytes = make_sharp_image()
    upload = upload_artwork(
        client, image_bytes, gopinath["id"], auto_passport="true"
    )
    assert upload.status_code == 201, upload.text
    body = upload.json()

    assert body["heritage_id"].startswith("VR-OD-PAT-2026-000")
    assert body["image_quality"]["blur_pass"] is True
    assert len(body["phash_signature"] or "") in (16, 64)
    assert body["passport"] is not None
    assert isinstance(body["possible_duplicates"], list)
    assert body["heritage_id"] != "VR-OD-PAT-2026-000001"

    new_id = body["heritage_id"]
    vr = client.get(f"/api/v1/verify/{new_id}").json()
    assert vr["outcome"] == "verified"
    assert vr["computed_sha256"] == vr["stored_sha256"]


def test_upload_blurry_image_rejected(client):
    gopinath = next(
        a for a in client.get("/api/v1/artisans").json()
        if a["full_name"] == "Gopinath Moharana"
    )
    rejected = upload_artwork(
        client, make_flat_image(), gopinath["id"], title="Blurry"
    )
    assert rejected.status_code == 422


def test_tamper_detection(client):
    gopinath = next(
        a for a in client.get("/api/v1/artisans").json()
        if a["full_name"] == "Gopinath Moharana"
    )
    upload = upload_artwork(
        client, make_sharp_image(), gopinath["id"], auto_passport="true"
    )
    assert upload.status_code == 201
    new_id = upload.json()["heritage_id"]
    assert client.get(f"/api/v1/verify/{new_id}").json()["outcome"] == "verified"

    repo = client.app.state.repository
    artwork_row = next(a for a in repo.artworks.values() if a["heritage_id"] == new_id)
    artwork_row["title"] = "Mutated Title"
    tampered = client.get(f"/api/v1/verify/{new_id}").json()
    assert tampered["outcome"] == "tampered"
    artwork_row["title"] = upload.json()["title"]


def test_duplicate_similar_endpoint(client):
    gopinath = next(
        a for a in client.get("/api/v1/artisans").json()
        if a["full_name"] == "Gopinath Moharana"
    )
    upload = upload_artwork(client, make_sharp_image(), gopinath["id"])
    assert upload.status_code == 201
    similar = client.get(
        f"/api/v1/artworks/{upload.json()['heritage_id']}/similar"
    ).json()
    assert isinstance(similar, list)