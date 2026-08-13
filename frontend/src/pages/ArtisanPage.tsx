import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Handshake, MapPin, ScrollText } from "lucide-react";
import { api } from "../lib/api";
import { ScrollReveal } from "../components/ScrollReveal";
import { StatusBadge } from "../components/StatusBadge";
import { LineageTree } from "../components/LineageTree";
import { Timeline } from "../components/Timeline";
import { ArtworkCard } from "../components/ArtworkCard";
import { InquiryModal } from "../components/InquiryModal";
import type { ArtisanDetail, Artwork, ProvenanceEvent, Story } from "../types";

export function ArtisanPage() {
  const { id } = useParams<{ id: string }>();
  const [artisan, setArtisan] = useState<ArtisanDetail | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [events, setEvents] = useState<ProvenanceEvent[]>([]);
  const [openStory, setOpenStory] = useState<string | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api.artisans.get(id)
      .then((detail) => {
        setArtisan(detail);
        return Promise.all([
          api.artisans.artworks(id),
          api.artisans.stories(id).catch(() => []),
        ]);
      })
      .then(([works, oralStories]) => {
        setArtworks(works);
        setStories(oralStories);
        const firstArtwork = works[0];
        if (firstArtwork) {
          void api.events.forArtwork(firstArtwork.id)
            .then(setEvents)
            .catch(() => setEvents([]));
        }
      })
      .catch(() => setMissing(true));
  }, [id]);

  if (missing) {
    return (
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-40 text-center">
        <p className="eyebrow">Not found</p>
        <h1 className="mt-4 font-display text-3xl text-museum-parchment">Artisan record unavailable</h1>
        <Link to="/" className="mt-8 inline-block text-xs uppercase tracking-[0.22em] text-museum-gold hover:underline">
          ← Return to the archive
        </Link>
      </main>
    );
  }

  if (!artisan) {
    return (
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-40">
        <p className="font-serif text-2xl italic text-museum-parchment/60">Opening the lineage record…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 pb-28 pt-32">
      <Link to="/" className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-museum-gold hover:underline">
        <ArrowLeft size={13} /> The Archive
      </Link>

      {/* -------------------------------------------------------- header */}
      <header className="mt-8 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <ScrollReveal>
            <p className="eyebrow text-museum-gold">
              {artisan.tradition_title} · Generation {artisan.generation_number}
            </p>
            <h1 className="mt-4 font-display text-4xl leading-tight text-museum-parchment md:text-6xl">
              {artisan.full_name}
            </h1>
            <p className="mt-4 flex flex-wrap items-center gap-4">
              <StatusBadge status={artisan.verification_status} />
              <span className="flex items-center gap-1.5 text-xs text-museum-parchment/55">
                <MapPin size={13} className="text-museum-gold" /> {artisan.region_name}
              </span>
              <span className="rounded-full border border-museum-gold/40 px-3 py-1 text-[10px] tracking-[0.2em] text-museum-gold">
                {artisan.pehchan_card_id ?? "Pehchan ID pending"}
              </span>
            </p>
            <p className="mt-8 max-w-2xl text-base leading-relaxed text-museum-parchment/70 md:text-lg">
              {artisan.biography}
            </p>
            <p className="mt-6 text-[11px] uppercase tracking-[0.24em] text-museum-parchment/45">
              {artisan.artwork_count} fingerprinted works · {artisan.story_count} oral stories recorded
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setInquiryOpen(true)}
                className="flex items-center gap-2 rounded-sm border border-museum-gold/70 px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-museum-gold transition-colors hover:bg-museum-gold hover:text-museum-black"
              >
                <Handshake size={14} /> Institutional inquiry · Grant / Exhibition
              </button>
              <Link
                to="/dashboard/inquiries"
                className="flex items-center gap-2 rounded-sm border border-museum-parchment/25 px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-museum-parchment/70 transition-colors hover:border-museum-gold hover:text-museum-gold"
              >
                Patronage inbox
              </Link>
            </div>
          </ScrollReveal>
        </div>
        <ScrollReveal delay={0.15}>
          <LineageTree lineage={artisan.lineage} />
        </ScrollReveal>
      </header>

      {/* ------------------------------------------------------- artworks */}
      <section className="mt-24">
        <ScrollReveal>
          <p className="eyebrow text-museum-gold">The Hand</p>
          <h2 className="mt-3 font-display text-3xl text-museum-parchment md:text-4xl">
            Works of the Workshop
          </h2>
        </ScrollReveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {artworks.map((artwork, index) => (
            <ScrollReveal key={artwork.id} delay={(index % 3) * 0.08}>
              <ArtworkCard artwork={artwork} />
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- stories */}
      <section className="mt-24 grid gap-12 lg:grid-cols-2">
        <ScrollReveal>
          <p className="eyebrow text-museum-gold flex items-center gap-2">
            <ScrollText size={14} /> Oral Tradition
          </p>
          <h2 className="mt-3 font-display text-3xl text-museum-parchment">
            Stories of the Village
          </h2>
          <div className="mt-8 space-y-4">
            {stories.length === 0 && (
              <p className="italic text-museum-parchment/50">No oral stories recorded yet.</p>
            )}
            {stories.map((story) => (
              <div key={story.id} className="rounded-sm hairline">
                <button
                  onClick={() => setOpenStory(openStory === story.id ? null : story.id)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left"
                >
                  <span className="font-serif text-lg text-museum-parchment">{story.title}</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-museum-gold">
                    {story.language} · {openStory === story.id ? "Close" : "Read"}
                  </span>
                </button>
                {openStory === story.id && (
                  <div className="border-t border-museum-parchment/10">
                    {story.audio_recording_url && (
                      <div className="border-b border-museum-parchment/10 p-4">
                        <audio controls src={story.audio_recording_url} className="h-9 w-full" />
                      </div>
                    )}
                    <p className="whitespace-pre-line p-5 text-sm leading-relaxed text-museum-parchment/65">
                      {story.transcript}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollReveal>

        {events.length > 0 && (
          <ScrollReveal delay={0.15}>
            <p className="eyebrow text-museum-gold">Provenance</p>
            <h2 className="mt-3 font-display text-3xl text-museum-parchment">
              The Work's Journey
            </h2>
            <div className="mt-8">
              <Timeline events={events} />
            </div>
          </ScrollReveal>
        )}
      </section>

      {inquiryOpen && artisan && (
        <InquiryModal
          artisanId={artisan.id}
          artisanName={artisan.full_name}
          onClose={() => setInquiryOpen(false)}
        />
      )}
    </main>
  );
}