import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Camera, FileDown, Image, ImageUp, Search, ShieldAlert, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { checkBlur, type BlurReport } from "../lib/blurCheck";
import { VerificationSeal } from "../components/VerificationSeal";
import { StatusBadge } from "../components/StatusBadge";
import { ScrollReveal } from "../components/ScrollReveal";
import { KeypointMatchInspector } from "../components/KeypointMatchInspector";
import type { ImageVerificationResult, SimilarArtwork, VerificationResult } from "../types";

export function VerificationPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [photo, setPhoto] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [photoBlur, setPhotoBlur] = useState<BlurReport | null>(null);
  const [imageResult, setImageResult] = useState<ImageVerificationResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runVerify(event?: FormEvent) {
    event?.preventDefault();
    const heritageId = query.trim();
    if (!heritageId || loading) return;
    clearPhoto();
    setImageResult(null);
    setLoading(true);
    setError(null);
    try {
      setResult(await api.verify.check(heritageId));
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Verification service unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("id");
    if (fromQuery) {
      setQuery(fromQuery);
      void runVerify();
    }
  }, []);

  /* ----------------------------------------------------------- photo flow */
  function onPickPhoto(file: File | undefined) {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.url);
    const url = URL.createObjectURL(file);
    setPhoto({ blob: file, url, name: file.name });
    setPhotoBlur(null);
    setImageResult(null);
    setResult(null);
    setError(null);
    void checkBlur(file).then(setPhotoBlur).catch(() => setPhotoBlur({ score: 0, pass: false }));
  }

  function openImagePicker(source: "camera" | "gallery") {
    setShowImagePicker(false);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (source === "camera") {
      input.capture = "environment";
    }
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onPickPhoto(file);
    };
    input.click();
  }

  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setPhotoBlur(null);
    setImageResult(null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    onPickPhoto(event.dataTransfer.files?.[0]);
  }

  async function runImageVerify() {
    if (!photo || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", photo.blob, photo.name || "plate-photo.jpg");
      const response = await api.verify.byImage(form);
      setImageResult(response);
      setResult(response.result);
    } catch (err) {
      setImageResult(null);
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Verification service unavailable.");
    } finally {
      setUploading(false);
    }
  }

  const bestMatch = imageResult?.matches.find((m) => m.keypoint_pairs.length > 0) ?? null;

  return (
    <main className="mx-auto max-w-5xl px-6 pb-28 pt-36">
      <ScrollReveal className="text-center">
        <p className="eyebrow text-museum-gold">The Trust Layer</p>
        <h1 className="mt-3 font-display text-4xl text-museum-parchment md:text-5xl">
          Verify a Heritage ID
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-museum-parchment/60">
          Enter a registered identifier — such as{" "}
          <span className="text-museum-gold">VR-OD-PAT-2026-000001</span> — or upload a
          photograph of the plate. The registry recomputes the SHA-256 digest of the
          stored record against the issued passport.
        </p>
      </ScrollReveal>

      <form onSubmit={runVerify} className="mx-auto mt-10 flex max-w-2xl gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="VR-OD-PAT-2026-000001"
          className="w-full rounded-sm border border-museum-parchment/20 bg-museum-black/60 px-5 py-3.5 font-display text-sm tracking-wider text-museum-parchment placeholder:text-museum-parchment/30 focus:border-museum-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex shrink-0 items-center gap-2 rounded-sm bg-museum-gold px-6 py-3.5 text-xs uppercase tracking-[0.2em] text-museum-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Search size={14} /> {loading ? "Checking…" : "Verify"}
        </button>
      </form>

      {/* -------------------------------------------------- photo section */}
      <div className="mx-auto mt-14 max-w-3xl">
        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-museum-parchment/15" />
          <span className="font-serif text-xs italic text-museum-parchment/50">or verify by photograph</span>
          <span className="h-px flex-1 bg-museum-parchment/15" />
        </div>

        <ScrollReveal delay={0.05} className="mt-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border border-dashed px-6 py-10 text-center transition-colors ${
              dragOver
                ? "border-museum-gold bg-museum-gold/10"
                : photo
                  ? "border-museum-emerald/60"
                  : "border-museum-gold/40 hover:border-museum-gold"
            }`}
          >
            {photo ? (
              <>
                <img
                  src={photo.url}
                  alt="Selected plate photograph"
                  className="max-h-64 rounded-sm object-contain"
                />
                <span className="text-[10px] uppercase tracking-[0.2em] text-museum-parchment/60">
                  {photo.name} — tap to replace
                </span>
              </>
            ) : (
              <>
                <Camera size={26} className="text-museum-gold" />
                <span className="text-xs uppercase tracking-[0.2em] text-museum-parchment/70">
                  Drop a photograph here or click to browse
                </span>
                <span className="text-[10px] text-museum-parchment/45">
                  Flat capture, even light, camera steady
                </span>
              </>
            )}
            <button
              onClick={() => setShowImagePicker(true)}
              className="hidden"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onPickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          {photoBlur && (
            <div
              className={`mt-3 rounded-sm border p-3 text-xs ${
                photoBlur.pass
                  ? "border-museum-emerald/60 text-[#7FBF94]"
                  : "border-[#C0392B]/60 text-[#E05C4B]"
              }`}
            >
              Local quality pre-check: Laplacian variance{" "}
              <b className="font-display">{photoBlur.score.toFixed(1)}</b> —{" "}
              {photoBlur.pass
                ? "passes the sharpness gate"
                : "blurry; re-capture with a steady camera"}
            </div>
          )}

          {photo && (
            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={() => void runImageVerify()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-sm bg-museum-gold px-6 py-3 text-xs uppercase tracking-[0.2em] text-museum-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <ImageUp size={14} /> {uploading ? "Scanning registry…" : "Verify photograph"}
              </button>
              <button
                onClick={clearPhoto}
                className="flex items-center gap-2 rounded-sm border border-museum-parchment/25 px-5 py-3 text-xs uppercase tracking-[0.2em] text-museum-parchment/70 transition-colors hover:border-museum-gold hover:text-museum-gold"
              >
                <X size={13} /> Remove
              </button>
            </div>
          )}
        </ScrollReveal>
      </div>

      {error && (
        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-3 rounded-sm border border-[#C0392B]/60 bg-[#2A1010]/60 p-5 text-sm text-museum-parchment/80">
          <ShieldAlert size={18} className="shrink-0 text-[#E05C4B]" />
          <span>
            {error}
            {!photo && " — the identifier may not be registered."}
          </span>
        </div>
      )}

      {imageResult && imageResult.matches.length === 0 && (
        <div className="mx-auto mt-10 max-w-2xl rounded-sm hairline p-7 text-center">
          <p className="font-display text-xl text-museum-parchment">No registered match found</p>
          <p className="mt-2 text-xs leading-relaxed text-museum-parchment/55">
            The registry holds no plate with a fingerprint close to this photograph
            (blur score {imageResult.image_quality.blur_score.toFixed(1)}). It may not be
            registered — or the capture differs too much from the archived plate.
          </p>
        </div>
      )}

      {bestMatch && photo && (
        <div className="mx-auto mt-10 max-w-4xl">
          <KeypointMatchInspector
            leftImage={photo.url}
            leftLabel="Your photograph"
            match={bestMatch}
          />
        </div>
      )}

      {result && !error && (
        <div className="mt-14 grid gap-10 lg:grid-cols-[240px_1fr]">
          <ScrollReveal className="flex items-start justify-center lg:justify-start">
            <VerificationSeal outcome={result.outcome} />
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <div className="rounded-sm hairline p-7">
              <p className="eyebrow text-museum-gold">Registry Record</p>
              <h2 className="mt-2 font-display text-2xl tracking-wide text-museum-parchment">
                {result.heritage_id}
              </h2>

              {result.artwork && (
                <div className="mt-6 grid gap-4 border-t border-museum-parchment/10 pt-6 sm:grid-cols-2">
                  {[
                    ["Title", result.artwork.title],
                    ["Year", String(result.artwork.creation_year)],
                    ["Medium", result.artwork.medium ?? "—"],
                    ["Artisan", result.artwork.artisan_name],
                    ["Tradition", result.artwork.tradition_title],
                    ["Blur Score", result.artwork.blur_score?.toFixed(1) ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-[9px] uppercase tracking-[0.22em] text-museum-gold/80">{label}</dt>
                      <dd className="mt-0.5 text-sm text-museum-parchment/85">{value}</dd>
                    </div>
                  ))}
                </div>
              )}

              {result.artisan && (
                <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-museum-parchment/10 pt-6">
                  <StatusBadge status={result.artisan.verification_status} />
                  <Link
                    to={`/artisans/${result.artisan.id}`}
                    className="text-xs uppercase tracking-[0.2em] text-museum-gold hover:underline"
                  >
                    Open artisan record →
                  </Link>
                </div>
              )}

              <div className="mt-6 grid gap-3 border-t border-museum-parchment/10 pt-6 text-[11px] leading-relaxed text-museum-parchment/55">
                <p className="uppercase tracking-[0.2em] text-museum-gold/80">Cryptographic Digest</p>
                <p className="break-all">stored&nbsp;&nbsp;&nbsp;{result.stored_sha256 ?? "—"}</p>
                <p className="break-all">computed {result.computed_sha256 ?? "—"}</p>
              </div>

              {result.passport && (
                <div className="mt-6 flex flex-wrap gap-3 border-t border-museum-parchment/10 pt-6">
                  <Link
                    to={`/passport?id=${encodeURIComponent(result.heritage_id)}`}
                    className="rounded-sm border border-museum-gold/70 px-5 py-2.5 text-[10px] uppercase tracking-[0.22em] text-museum-gold transition-colors hover:bg-museum-gold hover:text-museum-black"
                  >
                    View passport document
                  </Link>
                  <a
                    href={api.passports.pdfUrl(result.heritage_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-sm border border-museum-parchment/25 px-5 py-2.5 text-[10px] uppercase tracking-[0.22em] text-museum-parchment/80 transition-colors hover:border-museum-gold hover:text-museum-gold"
                  >
                    <FileDown size={13} /> PDF certificate
                  </a>
                </div>
              )}
            </div>
          </ScrollReveal>
        </div>
      )}

      {imageResult && imageResult.matches.length > 0 && (
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {imageResult.matches.map((match) => (
            <MatchCard key={match.artwork_id} match={match} />
          ))}
        </div>
      )}

      {/* Image picker modal */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowImagePicker(false)}>
          <div className="bg-museum-black rounded-sm border border-museum-gold/30 p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-center text-sm font-medium text-museum-parchment mb-4">Select image source</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => openImagePicker("camera")}
                className="flex flex-col items-center gap-2 rounded-sm border border-museum-gold/50 p-4 text-center transition-colors hover:border-museum-gold hover:bg-museum-gold/10"
              >
                <Camera size={28} className="text-museum-gold" />
                <span className="text-xs uppercase tracking-[0.2em] text-museum-parchment">Camera</span>
              </button>
              <button
                onClick={() => openImagePicker("gallery")}
                className="flex flex-col items-center gap-2 rounded-sm border border-museum-gold/50 p-4 text-center transition-colors hover:border-museum-gold hover:bg-museum-gold/10"
              >
                <Image size={28} className="text-museum-gold" />
                <span className="text-xs uppercase tracking-[0.2em] text-museum-parchment">Gallery</span>
              </button>
            </div>
            <button
              onClick={() => setShowImagePicker(false)}
              className="mt-4 w-full rounded-sm border border-museum-parchment/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-museum-parchment/70 hover:border-museum-gold hover:text-museum-gold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function MatchCard({ match }: { match: SimilarArtwork }) {
  return (
    <div className="rounded-sm hairline p-4">
      <div className="flex items-start gap-3">
        {match.artwork_image_url ? (
          <img
            src={match.artwork_image_url}
            alt={match.title}
            className="h-20 w-20 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-museum-parchment/10 font-serif text-xs italic text-museum-parchment/40">
            No plate
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm text-museum-parchment/90">{match.title}</p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.18em] text-museum-gold">
            {match.heritage_id}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-museum-parchment/60">{match.artisan_name}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] uppercase tracking-[0.18em] text-museum-parchment/55">
        <span>
          Similarity <b className="text-museum-gold">{Math.round(match.orb_match_score * 100)}%</b>
        </span>
        {match.orb_verified && <span className="text-[#7FBF94]">ORB verified</span>}
        <span>
          pHash <b className="text-museum-gold">{match.phash_distance}</b>
        </span>
        <Link to={`/verify?id=${encodeURIComponent(match.heritage_id)}`} className="text-museum-gold hover:underline">
          Check ID →
        </Link>
      </div>
    </div>
  );
}