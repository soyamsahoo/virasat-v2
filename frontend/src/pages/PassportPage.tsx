import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { PassportCard } from "../components/PassportCard";
import { ScrollReveal } from "../components/ScrollReveal";
import { Timeline } from "../components/Timeline";
import type { Artisan, Artwork, HeritagePassport, ProvenanceEvent } from "../types";

export function PassportPage() {
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [passport, setPassport] = useState<HeritagePassport | null>(null);
  const [events, setEvents] = useState<ProvenanceEvent[]>([]);
  const [missing, setMissing] = useState(false);

  const heritageId = new URLSearchParams(window.location.search).get("id") ?? "";

  useEffect(() => {
    if (!heritageId) {
      setMissing(true);
      return;
    }
    void api.artworks.get(heritageId)
      .then(async (row) => {
        setArtwork(row);
        const detail = await api.artisans.get(row.artisan_id);
        setArtisan(detail);
        void api.events.forArtwork(row.id).then(setEvents).catch(() => setEvents([]));
        return api.passports.get(heritageId).catch(() => null);
      })
      .then((record) => setPassport(record))
      .catch(() => setMissing(true));
  }, [heritageId]);

  if (missing || !artwork) {
    return (
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-40 text-center">
        <p className="eyebrow">Passport</p>
        <h1 className="mt-4 font-display text-3xl text-museum-parchment">
          {missing ? "No heritage identifier provided" : "Opening the passport…"}
        </h1>
        <Link to="/" className="mt-8 inline-block text-xs uppercase tracking-[0.22em] text-museum-gold hover:underline">
          ← Return to the archive
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 pb-28 pt-32">
      <Link to="/" className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-museum-gold hover:underline">
        <ArrowLeft size={13} /> The Archive
      </Link>

      <header className="mt-8 text-center">
        <ScrollReveal>
          <p className="eyebrow text-museum-gold">Heritage Passport</p>
          <h1 className="mt-3 font-display text-3xl tracking-wide text-museum-parchment md:text-5xl">
            {artwork.heritage_id}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-museum-parchment/60">
            A printable museum certificate is available above the fold of the
            document below; scan the QR to re-verify at any time.
          </p>
        </ScrollReveal>
      </header>

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
    </main>
  );
}