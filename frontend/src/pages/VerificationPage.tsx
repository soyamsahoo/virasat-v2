import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Camera, ImageUp, Search, ShieldAlert, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { checkBlur, type BlurReport } from "../lib/blurCheck";
import { VerificationSeal } from "../components/VerificationSeal";
import { StatusBadge } from "../components/StatusBadge";
import { ScrollReveal } from "../components/ScrollReveal";
import { KeypointMatchInspector } from "../components/KeypointMatchInspector";
import { PassportCard } from "../components/PassportCard";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camState, setCamState] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [camError, setCamError] = useState<string | null>(null);

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
  function onPickPhoto(file: File) {
    if (photo) URL.revokeObjectURL(photo.url);
    const url = URL.createObjectURL(file);
    setPhoto({ blob: file, url, name: file.name });
    setPhotoBlur(null);
    setImageResult(null);
    setResult(null);
    setError(null);
    void checkBlur(file).then(setPhotoBlur).catch(() => setPhotoBlur({ score: 0, pass: false }));
  }

  async function startCamera() {
    if (camState === "starting" || camState === "live") return;
    setCamState("starting");
    setCamError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException("Unsupported", "NotSupportedError");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamState("live");
    } catch (err) {
      setCamState("error");
      const name = err instanceof DOMException ? err.name : "";
      setCamError(
        name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access — verification is live-camera only, no gallery uploads."
          : name === "NotFoundError" || name === "OverconstrainedError" || name === "NotSupportedError"
            ? "No usable camera found on this device."
            : "Camera could not be started. Check that a camera is connected and permissions are granted.",
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamState("idle");
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      onPickPhoto(new File([blob], "live-capture.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
    // Camera lifecycle is managed by explicit buttons; no other deps here.
  }, []);

  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setPhotoBlur(null);
    setImageResult(null);
  }

  function retakePhoto() {
    clearPhoto();
    void startCamera();
  }

  async function runImageVerify() {
    if (!photo || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", photo.blob, photo.name || "plate-photo.jpg");
      console.log("[Verify] Uploading image for verification:", photo.name, photo.blob.size, "bytes");
      const response = await api.verify.byImage(form);
      console.log("[Verify] Response received:", response);
      setImageResult(response);
      setResult(response.result);
    } catch (err) {
      console.error("[Verify] Error:", err);
      setImageResult(null);
      setResult(null);
      const message = err instanceof ApiError ? err.message : "Verification service unavailable. Ensure the backend is running.";
      setError(message);
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
          <span className="text-museum-gold">VR-OD-PAT-2026-000001</span> — or capture the
          plate live with your camera. The registry recomputes the SHA-256 digest of the
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
          <span className="font-serif text-xs italic text-museum-parchment/50">or verify by live camera</span>
          <span className="h-px flex-1 bg-museum-parchment/15" />
        </div>

        <ScrollReveal delay={0.05} className="mt-6">
          {photo ? (
            <div className="overflow-hidden rounded-sm hairline bg-museum-black/40">
              <img
                src={photo.url}
                alt="Live camera capture of the plate"
                className="max-h-80 w-full object-contain"
              />
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-sm hairline bg-black/70">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-72 w-full object-cover"
              />
              {camState !== "live" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-museum-black/85 p-6 text-center">
                  {camState === "error" ? (
                    <>
                      <Camera size={26} className="text-[#E05C4B]" />
                      <p className="max-w-sm text-xs leading-relaxed text-museum-parchment/80">
                        {camError}
                      </p>
                      <button
                        onClick={() => void startCamera()}
                        className="rounded-sm border border-museum-gold/60 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-museum-gold transition-colors hover:bg-museum-gold hover:text-museum-black"
                      >
                        Retry camera
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-museum-gold/30 border-t-museum-gold" />
                      <p className="text-xs uppercase tracking-[0.2em] text-museum-parchment/70">
                        {camState === "starting" ? "Starting camera…" : "Camera ready"}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {!photo && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={capturePhoto}
                disabled={camState !== "live"}
                className="flex items-center gap-2.5 rounded-full border-2 border-museum-gold/80 px-7 py-3 text-xs uppercase tracking-[0.2em] text-museum-gold transition-all hover:bg-museum-gold/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="h-3 w-3 rounded-full bg-museum-gold" /> Capture
              </button>
              <p className="max-w-xs text-center text-[10px] leading-relaxed text-museum-parchment/45">
                Live camera only — the plate is captured in real time, never uploaded from a
                gallery. Flat capture, even light, camera steady.
              </p>
            </div>
          )}

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
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => void runImageVerify()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-sm bg-museum-gold px-6 py-3 text-xs uppercase tracking-[0.2em] text-museum-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <ImageUp size={14} /> {uploading ? "Scanning registry…" : "Verify photograph"}
              </button>
              <button
                onClick={retakePhoto}
                className="flex items-center gap-2 rounded-sm border border-museum-parchment/25 px-5 py-3 text-xs uppercase tracking-[0.2em] text-museum-parchment/70 transition-colors hover:border-museum-gold hover:text-museum-gold"
              >
                <Camera size={13} /> Retake
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
        <div className="mt-14 space-y-10">
          <ScrollReveal className="flex items-start justify-center">
            <VerificationSeal outcome={result.outcome} />
          </ScrollReveal>

          {result.passport && result.artwork && result.artisan && (
            <ScrollReveal delay={0.1}>
              <PassportCard artwork={result.artwork} artisan={result.artisan} passport={result.passport} />
            </ScrollReveal>
          )}

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

              {!result.passport && (
                <p className="mt-6 text-center text-sm text-museum-parchment/60">
                  No passport issued yet for this artwork.
                </p>
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