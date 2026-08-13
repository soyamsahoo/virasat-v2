import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Search, ShieldAlert, FileDown } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { VerificationSeal } from "../components/VerificationSeal";
import { StatusBadge } from "../components/StatusBadge";
import { ScrollReveal } from "../components/ScrollReveal";
import type { VerificationResult } from "../types";

export function VerificationPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runVerify(event?: FormEvent) {
    event?.preventDefault();
    const heritageId = query.trim();
    if (!heritageId || loading) return;
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

  return (
    <main className="mx-auto max-w-5xl px-6 pb-28 pt-36">
      <ScrollReveal className="text-center">
        <p className="eyebrow text-museum-gold">The Trust Layer</p>
        <h1 className="mt-3 font-display text-4xl text-museum-parchment md:text-5xl">
          Verify a Heritage ID
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-museum-parchment/60">
          Enter a registered identifier — such as{" "}
          <span className="text-museum-gold">VR-OD-PAT-2026-000001</span> — and the
          registry recomputes the SHA-256 digest of the stored record against
          the issued passport.
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

      {error && (
        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-3 rounded-sm border border-[#C0392B]/60 bg-[#2A1010]/60 p-5 text-sm text-museum-parchment/80">
          <ShieldAlert size={18} className="shrink-0 text-[#E05C4B]" />
          <span>{error} — the identifier may not be registered.</span>
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
    </main>
  );
}