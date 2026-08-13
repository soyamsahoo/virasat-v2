import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Award, MapPin } from "lucide-react";
import { api } from "../lib/api";
import { ScrollReveal } from "../components/ScrollReveal";
import { StatusBadge } from "../components/StatusBadge";
import type { Artisan, Tradition } from "../types";

export function TraditionPage() {
  const { id } = useParams<{ id: string }>();
  const [tradition, setTradition] = useState<Tradition | null>(null);
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api.traditions.get(id)
      .then(async (row) => {
        setTradition(row);
        const list = await api.artisans.list({ tradition_id: id });
        setArtisans(list);
      })
      .catch(() => setMissing(true));
  }, [id]);

  if (missing || !tradition) {
    return (
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-40 text-center">
        <p className="eyebrow">Tradition</p>
        <h1 className="mt-4 font-display text-3xl text-museum-parchment">
          {missing ? "Tradition record unavailable" : "Opening the tradition record…"}
        </h1>
        <Link to="/" className="mt-8 inline-block text-xs uppercase tracking-[0.22em] text-museum-gold hover:underline">
          ← Return to the archive
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 pb-28 pt-32">
      <Link to="/" className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-museum-gold hover:underline">
        <ArrowLeft size={13} /> The Archive
      </Link>

      <header className="mt-8 max-w-4xl">
        <ScrollReveal>
          <p className="eyebrow text-museum-gold flex items-center gap-2">
            <Award size={14} />
            {tradition.gi_tag_number ? `Registered · ${tradition.gi_tag_number}` : "Living Tradition"}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-tight text-museum-parchment md:text-6xl">
            {tradition.title}
          </h1>
          {tradition.native_title && (
            <p className="mt-2 font-serif text-2xl italic text-museum-gold/80">{tradition.native_title}</p>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-museum-parchment/55">
            <MapPin size={13} className="text-museum-gold" /> {tradition.origin_state}
          </p>
          <p className="mt-8 text-base leading-relaxed text-museum-parchment/70 md:text-lg">
            {tradition.description}
          </p>
        </ScrollReveal>
      </header>

      {/* -------------------------------------------------- technique */}
      <section className="mt-20 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        <ScrollReveal>
          <p className="eyebrow text-museum-gold">The Method</p>
          <h2 className="mt-3 font-display text-3xl text-museum-parchment">Technique Breakdown</h2>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <p className="whitespace-pre-line rounded-sm hairline p-8 text-sm leading-loose text-museum-parchment/70">
            {tradition.technique_breakdown}
          </p>
        </ScrollReveal>
      </section>

      {/* -------------------------------------------------- artisans */}
      <section className="mt-24">
        <ScrollReveal>
          <p className="eyebrow text-museum-gold">The Keepers</p>
          <h2 className="mt-3 font-display text-3xl text-museum-parchment">
            {tradition.artisan_count} Artisans Documented
          </h2>
        </ScrollReveal>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {artisans.map((artisan, index) => (
            <ScrollReveal key={artisan.id} delay={(index % 3) * 0.08}>
              <Link
                to={`/artisans/${artisan.id}`}
                className="group block rounded-sm hairline p-6 transition-colors hover:border-museum-gold/60"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-museum-gold/70 font-display text-sm text-museum-gold">
                    {artisan.generation_number}
                  </span>
                  <StatusBadge status={artisan.verification_status} />
                </div>
                <h3 className="mt-4 font-serif text-xl text-museum-parchment group-hover:text-museum-gold">
                  {artisan.full_name}
                </h3>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-museum-parchment/45">
                  {artisan.region_name}
                </p>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>
    </main>
  );
}