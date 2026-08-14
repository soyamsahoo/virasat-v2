import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, ScrollText, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { api } from "../lib/api";
import { plateUrlFor } from "../lib/plates";
import { Hero } from "../components/Hero";
import { MapExplorer } from "../components/MapExplorer";
import { ScrollReveal } from "../components/ScrollReveal";
import { ArtworkCard } from "../components/ArtworkCard";
import { PassportCard } from "../components/PassportCard";
import { StatusBadge } from "../components/StatusBadge";
import type { Artisan, Artwork, Tradition } from "../types";

interface ArtworkFilters {
  state: string;
  tradition_id: string;
  artisan_id: string;
  medium: string;
  century: string;
}

const EMPTY_FILTERS: ArtworkFilters = {
  state: "",
  tradition_id: "",
  artisan_id: "",
  medium: "",
  century: "",
};

/** Static archive fallback: mirrors the seeded registry so the fingerprinted
 *  works (and their plates) stay viewable even when the API is unreachable.
 *  Plates resolve via ``plateUrlFor`` to the bundled public media. */
const MOCK_ARTWORKS: Artwork[] = [
  {
    id: "mock-artwork-01",
    heritage_id: "VR-OD-PAT-2026-000001",
    title: "Dashavatara Patta",
    dimensions: "24 x 18 in",
    medium: "Cotton Patta with Tamarind seed adhesive, mineral pigments, lacquer seal",
    creation_year: 2026,
    artisan_id: "mock-artisan-01",
    phash_signature: null,
    dhash_signature: null,
    blur_score: 3505.7,
    primary_image_url: "/media/artworks/artwork-01.jpg",
    created_at: "",
    artisan_name: "Gopinath Moharana",
    tradition_title: "Odisha Pattachitra",
    origin_state: "Odisha",
    verification_status: "master_verified",
  },
  {
    id: "mock-artwork-02",
    heritage_id: "VR-OD-PAT-2026-000002",
    title: "Krishna Leela Kriya",
    dimensions: "12 x 9 in",
    medium: "Cotton Patta with Tamarind seed adhesive, mineral pigments",
    creation_year: 2024,
    artisan_id: "mock-artisan-01",
    phash_signature: null,
    dhash_signature: null,
    blur_score: 15783.9,
    primary_image_url: "/media/artworks/artwork-02.jpg",
    created_at: "",
    artisan_name: "Gopinath Moharana",
    tradition_title: "Odisha Pattachitra",
    origin_state: "Odisha",
    verification_status: "master_verified",
  },
  {
    id: "mock-artwork-03",
    heritage_id: "VR-OD-PAT-2026-000003",
    title: "Nabagunjara — Cosmic Form of Krishna",
    dimensions: "30 x 22 in",
    medium: "Cotton Patta with chalk & conch-shell ground, mineral pigments",
    creation_year: 2025,
    artisan_id: "mock-artisan-02",
    phash_signature: null,
    dhash_signature: null,
    blur_score: 5678.7,
    primary_image_url: "/media/artworks/artwork-03.jpg",
    created_at: "",
    artisan_name: "Shyamsundar Moharana",
    tradition_title: "Odisha Pattachitra",
    origin_state: "Odisha",
    verification_status: "field_verified",
  },
  {
    id: "mock-artwork-04",
    heritage_id: "VR-OD-PAT-2026-000004",
    title: "Radha-Krishna in the Grove",
    dimensions: "18 x 14 in",
    medium: "Cotton Patta with Tamarind seed adhesive, mineral pigments",
    creation_year: 2026,
    artisan_id: "mock-artisan-03",
    phash_signature: null,
    dhash_signature: null,
    blur_score: 49094.8,
    primary_image_url: "/media/artworks/artwork-04.jpg",
    created_at: "",
    artisan_name: "Aditya Moharana",
    tradition_title: "Odisha Pattachitra",
    origin_state: "Odisha",
    verification_status: "field_verified",
  },
  {
    id: "mock-artwork-05",
    heritage_id: "VR-OD-PAT-2026-000005",
    title: "Matsya Avatar on Patta",
    dimensions: "15 x 11 in",
    medium: "Cotton Patta with mineral pigments",
    creation_year: 2023,
    artisan_id: "mock-artisan-03",
    phash_signature: null,
    dhash_signature: null,
    blur_score: 15364.2,
    primary_image_url: "/media/artworks/artwork-05.jpg",
    created_at: "",
    artisan_name: "Aditya Moharana",
    tradition_title: "Odisha Pattachitra",
    origin_state: "Odisha",
    verification_status: "pending",
  },
  {
    id: "mock-artwork-06",
    heritage_id: "VR-OD-PAT-2026-000006",
    title: "Vamana Avatar — Three Strides",
    dimensions: "20 x 16 in",
    medium: "Cotton Patta with chalk ground, mineral pigments",
    creation_year: 2025,
    artisan_id: "mock-artisan-04",
    phash_signature: null,
    dhash_signature: null,
    blur_score: 15502.9,
    primary_image_url: "/media/artworks/artwork-06.jpg",
    created_at: "",
    artisan_name: "Kanchana Sahoo",
    tradition_title: "Odisha Pattachitra",
    origin_state: "Odisha",
    verification_status: "field_verified",
  },
  {
    id: "mock-artwork-07",
    heritage_id: "VR-OD-PAT-2026-000007",
    title: "Kalika Pattachitra",
    dimensions: "16 x 12 in",
    medium: "Cotton Patta with mineral pigments",
    creation_year: 2024,
    artisan_id: "mock-artisan-05",
    phash_signature: null,
    dhash_signature: null,
    blur_score: 950.4,
    primary_image_url: "/media/artworks/artwork-07.jpg",
    created_at: "",
    artisan_name: "Sunita Sahoo",
    tradition_title: "Odisha Pattachitra",
    origin_state: "Odisha",
    verification_status: "pending",
  },
  {
    id: "mock-artwork-08",
    heritage_id: "VR-OD-PAT-2026-000008",
    title: "Jagannath Trinity on Patta",
    dimensions: "24 x 18 in",
    medium: "Cotton Patta with chalk & conch-shell ground, mineral pigments",
    creation_year: 2026,
    artisan_id: "mock-artisan-06",
    phash_signature: null,
    dhash_signature: null,
    blur_score: 16923.7,
    primary_image_url: "/media/artworks/artwork-08.jpg",
    created_at: "",
    artisan_name: "Devraj Sahoo",
    tradition_title: "Odisha Pattachitra",
    origin_state: "Odisha",
    verification_status: "master_verified",
  },
];

export function HomePage() {
  const [traditions, setTraditions] = useState<Tradition[]>([]);
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [allArtworks, setAllArtworks] = useState<Artwork[]>([]);
  const [spotlightArtwork, setSpotlightArtwork] = useState<Artwork | null>(null);
  const [filters, setFilters] = useState<ArtworkFilters>(EMPTY_FILTERS);

  useEffect(() => {
    void api.traditions.list().then(setTraditions).catch(() => setTraditions([]));
    void api.artisans.list().then(setArtisans).catch(() => setArtisans([]));
    void api.artworks.list()
      .then((rows) => {
        setAllArtworks(rows);
        setArtworks(rows);
      })
      .catch(() => {
        setAllArtworks(MOCK_ARTWORKS);
        setArtworks(MOCK_ARTWORKS);
      });
    void api.artworks.get("VR-OD-PAT-2026-000001")
      .then(setSpotlightArtwork)
      .catch(() => setSpotlightArtwork(MOCK_ARTWORKS[0]));
  }, []);

  useEffect(() => {
    const active = Object.values(filters).some(Boolean);
    if (!active) return;
    const timer = setTimeout(() => {
      void api.artworks.list({
        state: filters.state || undefined,
        tradition_id: filters.tradition_id || undefined,
        artisan_id: filters.artisan_id || undefined,
        medium: filters.medium || undefined,
        century: filters.century ? Number(filters.century) : undefined,
      })
        .then(setArtworks)
        .catch(() => setArtworks([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [filters]);

  const mediums = useMemo(
    () => Array.from(new Set(allArtworks.map((a) => a.medium).filter(Boolean))) as string[],
    [allArtworks],
  );
  const centuries = useMemo(
    () => Array.from(new Set(allArtworks.map((a) => Math.ceil(a.creation_year / 100))))
      .sort((a, b) => a - b),
    [allArtworks],
  );
  const states = useMemo(
    () => Array.from(new Set(allArtworks.map((a) => a.origin_state).filter(Boolean))) as string[],
    [allArtworks],
  );

  const hasActiveFilters = Object.values(filters).some(Boolean);
  const setFilter = (key: keyof ArtworkFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const spotlightArtisan = spotlightArtwork
    ? artisans.find((a) => a.id === spotlightArtwork.artisan_id) ?? null
    : null;

  return (
    <main>
      <Hero
        stats={{
          traditions: traditions.length || 1,
          artisans: artisans.length || 6,
          artworks: artworks.length || 8,
          passports: 3,
        }}
      />

      <MapExplorer />

      {/* ------------------------------------------- the showpiece */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <ScrollReveal>
          <figure className="overflow-hidden rounded-sm hairline">
            <img
              src={plateUrlFor("VR-OD-PAT-2026-000008") ?? undefined}
              alt="Jagannath, Subhadra & Balabhadra — Pattachitra from Raghurajpur"
              className="h-[70vh] w-full bg-museum-black/40 object-cover"
              loading="eager"
            />
            <figcaption className="border-t border-museum-gold/15 bg-museum-black/40 p-8 text-center md:p-10">
              <p className="eyebrow text-museum-gold">The Showpiece</p>
              <h2 className="mt-3 font-display text-2xl text-museum-parchment md:text-4xl">
                Jagannath, Subhadra & Balabhadra
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-museum-parchment/60">
                The Puri trinity rendered in the traditional chitrakar style — mineral
                pigment on cotton patta, the cloth holding the weight of darshan. It
                emerges as you scroll, as if drawn from the archive itself.
              </p>
            </figcaption>
          </figure>
        </ScrollReveal>
      </section>

      {/* ------------------------------------------------------- traditions */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <ScrollReveal className="mb-12 text-center">
          <p className="eyebrow text-museum-gold">The Living Catalogue</p>
          <h2 className="mt-3 font-display text-3xl text-museum-parchment md:text-5xl">
            Traditions That Refuse to End
          </h2>
        </ScrollReveal>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {traditions.map((tradition, index) => (
            <ScrollReveal key={tradition.id} delay={index * 0.08}>
              <Link
                to={`/traditions/${tradition.id}`}
                className="group block h-full rounded-sm hairline p-7 transition-colors hover:border-museum-gold/60"
              >
                <div className="flex items-center justify-between">
                  <Landmark size={22} className="text-museum-gold" />
                  {tradition.gi_tag_number && (
                    <span className="rounded-full border border-museum-gold/50 px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-museum-gold">
                      {tradition.gi_tag_number}
                    </span>
                  )}
                </div>
                <h3 className="mt-5 font-serif text-2xl leading-tight text-museum-parchment group-hover:text-museum-gold">
                  {tradition.title}
                </h3>
                {tradition.native_title && (
                  <p className="mt-1 font-serif text-lg italic text-museum-gold/70">
                    {tradition.native_title}
                  </p>
                )}
                <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-museum-parchment/60">
                  {tradition.description}
                </p>
                <p className="mt-5 text-[10px] uppercase tracking-[0.22em] text-museum-gold/80">
                  {tradition.origin_state} · {tradition.artisan_count} artisans documented →
                </p>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ featured artisans */}
      <section className="border-y border-museum-gold/15 bg-museum-black/40">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <ScrollReveal className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow text-museum-gold">People Before Objects</p>
              <h2 className="mt-3 font-display text-3xl text-museum-parchment md:text-5xl">
                Lineages, Not Lists
              </h2>
            </div>
            <Link
              to="/#map"
              className="text-xs uppercase tracking-[0.22em] text-museum-gold hover:underline"
            >
              Explore the workshop nodes →
            </Link>
          </ScrollReveal>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {artisans.slice(0, 6).map((artisan, index) => (
              <ScrollReveal key={artisan.id} delay={(index % 3) * 0.08}>
                <Link
                  to={`/artisans/${artisan.id}`}
                  className="group block h-full rounded-sm hairline p-6 transition-colors hover:border-museum-gold/60"
                >
                  <div className="flex items-start justify-between">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-full border font-display text-sm"
                      style={{ borderColor: "#C5A059", color: "#C5A059" }}
                    >
                      {artisan.generation_number}
                    </span>
                    <StatusBadge status={artisan.verification_status} />
                  </div>
                  <h3 className="mt-4 font-serif text-2xl text-museum-parchment group-hover:text-museum-gold">
                    {artisan.full_name}
                  </h3>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-museum-parchment/45">
                    {artisan.tradition_title} · {artisan.region_name}
                  </p>
                  <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-museum-parchment/60">
                    {artisan.biography}
                  </p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- fingerprint showcase */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <ScrollReveal className="mb-12 text-center">
          <p className="eyebrow text-museum-gold">The Archive</p>
          <h2 className="mt-3 font-display text-3xl text-museum-parchment md:text-5xl">
            Fingerprinted Works
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-museum-parchment/60">
            Every work carries a perceptual fingerprint — pHash, dHash and
            ORB descriptors — guarded against duplication and signed into a
            passport.
          </p>
        </ScrollReveal>

        <div className="mb-10 rounded-sm hairline p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="eyebrow flex items-center gap-2">
              <SlidersHorizontal size={13} /> Filter the Registry
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-museum-gold hover:underline"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <select
              value={filters.state}
              onChange={(e) => setFilter("state", e.target.value)}
              className="rounded-sm border border-museum-parchment/20 bg-museum-black px-3 py-2.5 text-xs text-museum-parchment/80 outline-none focus:border-museum-gold/70"
            >
              <option value="">All states</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={filters.tradition_id}
              onChange={(e) => setFilter("tradition_id", e.target.value)}
              className="rounded-sm border border-museum-parchment/20 bg-museum-black px-3 py-2.5 text-xs text-museum-parchment/80 outline-none focus:border-museum-gold/70"
            >
              <option value="">All traditions</option>
              {traditions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <select
              value={filters.artisan_id}
              onChange={(e) => setFilter("artisan_id", e.target.value)}
              className="rounded-sm border border-museum-parchment/20 bg-museum-black px-3 py-2.5 text-xs text-museum-parchment/80 outline-none focus:border-museum-gold/70"
            >
              <option value="">All artisans</option>
              {artisans.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
            <select
              value={filters.medium}
              onChange={(e) => setFilter("medium", e.target.value)}
              className="truncate rounded-sm border border-museum-parchment/20 bg-museum-black px-3 py-2.5 text-xs text-museum-parchment/80 outline-none focus:border-museum-gold/70"
            >
              <option value="">All mediums</option>
              {mediums.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={filters.century}
              onChange={(e) => setFilter("century", e.target.value)}
              className="rounded-sm border border-museum-parchment/20 bg-museum-black px-3 py-2.5 text-xs text-museum-parchment/80 outline-none focus:border-museum-gold/70"
            >
              <option value="">All centuries</option>
              {centuries.map((c) => <option key={c} value={String(c)}>{c}th century</option>)}
            </select>
          </div>
        </div>

        {artworks.length === 0 ? (
          <p className="text-center text-sm text-museum-parchment/50">
            No works match the selected filters.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {artworks.map((artwork, index) => (
              <ScrollReveal key={artwork.id} delay={(index % 3) * 0.08}>
                <ArtworkCard
                  artwork={artwork}
                  imageUrl={plateUrlFor(artwork.heritage_id)}
                />
              </ScrollReveal>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- spotlight */}
      <section className="mx-auto max-w-5xl px-6 pb-28">
        <ScrollReveal className="mb-10 text-center">
          <p className="eyebrow text-museum-gold flex items-center justify-center gap-2">
            <ScrollText size={14} /> The Anchor Record
          </p>
          <h2 className="mt-3 font-display text-3xl text-museum-parchment md:text-4xl">
            VR-OD-PAT-2026-000001 — Heritage Passport
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-museum-parchment/60">
            The first registered work of the anchor dataset: Gopinath
            Moharana's Dashavatara Patta, sealed by the registry.
          </p>
        </ScrollReveal>
        {spotlightArtwork && (
          <ScrollReveal>
            <PassportCard
              artwork={spotlightArtwork}
              artisan={spotlightArtisan}
              passport={null}
            />
          </ScrollReveal>
        )}
      </section>

      {/* ------------------------------------------------------------- CTA */}
      <section className="border-t border-museum-gold/15">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <p className="eyebrow text-museum-gold">The Trust Layer</p>
          <h2 className="mt-3 font-display text-3xl leading-snug text-museum-parchment md:text-5xl">
            Verify. Every. Heritage.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-museum-parchment/60">
            Museums, foundations and researchers can cryptographically confirm
            any registered work — zero fees, zero e-commerce, provenance only.
          </p>
          <Link
            to="/verify"
            className="mt-9 inline-flex items-center gap-2 rounded-sm border border-museum-gold/70 px-8 py-3.5 text-xs uppercase tracking-[0.24em] text-museum-gold transition-colors hover:bg-museum-gold hover:text-museum-black"
          >
            <ShieldCheck size={15} /> Verify a Heritage ID
          </Link>
        </div>
      </section>
    </main>
  );
}