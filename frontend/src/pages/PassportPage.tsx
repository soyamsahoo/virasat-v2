import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, KeyRound, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { mockPassportFor } from "../lib/passports";
import { mockArtisanById, mockArtworkByHeritageId } from "../lib/mockRegistry";
import { buildRegistryCertificatePdf, saveBlob } from "../lib/passportPdf";
import { PassportCard } from "../components/PassportCard";
import { ScrollReveal } from "../components/ScrollReveal";
import { Timeline } from "../components/Timeline";
import type { Artisan, Artwork, HeritagePassport, ProvenanceEvent } from "../types";

const REGISTERED_IDS = [
  "VR-OD-PAT-2026-000001",
  "VR-OD-PAT-2026-000002",
  "VR-OD-PAT-2026-000003",
  "VR-OD-PAT-2026-000004",
  "VR-OD-PAT-2026-000005",
  "VR-OD-PAT-2026-000006",
  "VR-OD-PAT-2026-000007",
  "VR-OD-PAT-2026-000008",
];

export function PassportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const heritageId = (searchParams.get("id") ?? "").trim();
  const [query, setQuery] = useState(heritageId);

  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [passport, setPassport] = useState<HeritagePassport | null>(null);
  const [events, setEvents] = useState<ProvenanceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setQuery(heritageId);
    if (!heritageId) {
      setArtwork(null);
      setArtisan(null);
      setPassport(null);
      setEvents([]);
      setUnknown(false);
      return;
    }
    setLoading(true);
    setUnknown(false);
    setArtwork(null);
    void api.artworks.get(heritageId)
      .then(async (row) => {
        setArtwork(row);
        setUnknown(false);
        try {
          const detail = await api.artisans.get(row.artisan_id);
          setArtisan(detail);
        } catch {
          setArtisan(mockArtisanById(row.artisan_id) ?? null);
        }
        void api.events.forArtwork(row.id).then(setEvents).catch(() => setEvents([]));
        try {
          setPassport(await api.passports.get(heritageId));
        } catch {
          setPassport(mockPassportFor(heritageId));
        }
      })
      .catch(() => {
        // Static registry fallback: the plate and its passport still render.
        const mock = mockArtworkByHeritageId(heritageId);
        if (mock) {
          setArtwork(mock);
          setArtisan(mockArtisanById(mock.artisan_id));
          setPassport(mockPassportFor(heritageId));
          setEvents([]);
          setUnknown(false);
        } else {
          setArtwork(null);
          setUnknown(true);
        }
      })
      .finally(() => setLoading(false));
  }, [heritageId]);

  const openLookup = (id: string) => {
    const clean = id.trim();
    if (!clean) return;
    setSearchParams({ id: clean }, { replace: false });
  };

  const downloadPdf = async () => {
    const target = (query.trim() || heritageId).toUpperCase();
    if (!target || downloading) return;
    setDownloading(true);
    try {
      // 1) Prefer the live registry certificate.
      const response = await fetch(api.passports.pdfUrl(target), {
        headers: { Accept: "application/pdf" },
      });
      if (response.ok && (response.headers.get("content-type") ?? "").includes("pdf")) {
        saveBlob(await response.blob(), `virasat-passport-${target}.pdf`);
        return;
      }
    } catch {
      /* registry unreachable — fall back to the bundled certificate */
    }
    // 2) Client-side certificate for registered works.
    const art = artwork ?? mockArtworkByHeritageId(target);
    const artn = artisan ?? (art ? mockArtisanById(art.artisan_id) : null);
    const pass = passport ?? mockPassportFor(target);
    if (art && artn) {
      const bytes = await buildRegistryCertificatePdf({
        heritageId: target,
        title: art.title,
        artisanName: artn.full_name,
        pehchanCardId: artn.pehchan_card_id,
        generationNumber: artn.generation_number,
        regionName: artn.region_name,
        traditionTitle: art.tradition_title,
        medium: art.medium,
        creationYear: art.creation_year,
        dimensions: art.dimensions,
        cryptographicHash: pass?.cryptographic_hash ?? mockPassportFor(target).cryptographic_hash,
        issuedAt: pass?.issued_at ?? mockPassportFor(target).issued_at,
      });
      saveBlob(new Blob([bytes], { type: "application/pdf" }), `virasat-passport-${target}.pdf`);
    } else {
      setQuery(target);
      if (!art) openLookup(target);
    }
    setDownloading(false);
  };

  const hasNoId = !heritageId;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-28 pt-32">
      <Link to="/" className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-museum-gold hover:underline">
        <ArrowLeft size={13} /> The Archive
      </Link>

      <header className="mt-8 text-center">
        <ScrollReveal>
          <p className="eyebrow text-museum-gold">Heritage Passport</p>
          <h1 className="mt-3 font-display text-3xl tracking-wide text-museum-parchment md:text-5xl">
            {hasNoId ? "Passport Registry" : artwork?.heritage_id ?? "Opening the passport…"}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-museum-parchment/60">
            Look up any registered heritage identifier below — the passport,
            its QR and a printable certificate open right here.
          </p>
        </ScrollReveal>
      </header>

      {/* ----------------------------------------------------- lookup bar */}
      <ScrollReveal className="mx-auto mt-10 max-w-3xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            openLookup(query);
          }}
          className="rounded-sm hairline p-5"
        >
          <p className="eyebrow flex items-center gap-2">
            <KeyRound size={13} /> Registry lookup
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="VR-OD-PAT-2026-000001"
              spellCheck={false}
              autoCapitalize="characters"
              className="min-w-0 flex-1 rounded-sm border border-museum-parchment/20 bg-museum-black px-4 py-3 font-mono text-sm text-museum-parchment outline-none transition-colors focus:border-museum-gold/70"
            />
            <button
              type="submit"
              className="rounded-sm border border-museum-gold/70 px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-museum-gold transition-colors hover:bg-museum-gold hover:text-museum-black"
            >
              Open passport
            </button>
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={downloading || !(heritageId || query.trim())}
              className="flex items-center justify-center gap-2 rounded-sm bg-museum-gold px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-museum-black transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {downloading ? "Preparing…" : "Download passport"}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.2em] text-museum-parchment/40">
              Registered:
            </span>
            {REGISTERED_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => openLookup(id)}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors ${
                  id === heritageId
                    ? "border-museum-gold bg-museum-gold/15 text-museum-gold"
                    : "border-museum-parchment/20 text-museum-parchment/60 hover:border-museum-gold/60 hover:text-museum-gold"
                }`}
              >
                {id}
              </button>
            ))}
          </div>
        </form>
      </ScrollReveal>

      {/* --------------------------------------------------------- states */}
      {loading && (
        <p className="mt-16 text-center text-sm text-museum-parchment/50">
          Opening the passport…
        </p>
      )}

      {!loading && hasNoId && (
        <div className="mx-auto mt-16 max-w-xl text-center">
          <p className="font-serif text-xl italic text-museum-parchment/60">
            No heritage identifier provided yet.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-museum-parchment/50">
            Enter a registered ID above — e.g.{" "}
            <span className="font-mono text-museum-gold">VR-OD-PAT-2026-000001</span> — or
            pick one of the registered chips to open its passport and download
            the certificate.
          </p>
        </div>
      )}

      {!loading && unknown && (
        <div className="mx-auto mt-16 max-w-xl text-center">
          <p className="eyebrow">Not registered</p>
          <p className="mt-4 font-serif text-2xl text-museum-parchment">
            No passport for{" "}
            <span className="font-mono text-museum-gold">{heritageId}</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-museum-parchment/50">
            This identifier is not present in the registry. Double-check the
            ID — heritage identifiers look like{" "}
            <span className="font-mono text-museum-parchment/80">VR-OD-PAT-2026-000001</span>.
          </p>
        </div>
      )}

      {!loading && !unknown && !hasNoId && artwork && (
        <>
          <ScrollReveal className="mt-14">
            <PassportCard artwork={artwork} artisan={artisan} passport={passport} />
          </ScrollReveal>

          {events.length > 0 && (
            <section className="mt-24">
              <ScrollReveal>
                <p className="eyebrow text-museum-gold">Provenance</p>
                <h2 className="mt-3 font-display text-3xl text-museum-parchment">The Recorded Journey</h2>
              </ScrollReveal>
              <div className="mt-10 max-w-2xl">
                <Timeline events={events} />
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}