import { useLayoutEffect, useRef } from "react";
import { gsap } from "../lib/gsap";

interface HeroStats {
  traditions: number;
  artisans: number;
  artworks: number;
  passports: number;
}

export function Hero({ stats }: { stats: HeroStats }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".hero-line",
        { yPercent: 130 },
        { yPercent: 0, duration: 1.3, stagger: 0.14, ease: "power4.out", delay: 0.15 },
      );
      gsap.fromTo(
        ".hero-fade",
        { autoAlpha: 0, y: 26 },
        { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.16, delay: 0.95, ease: "power3.out" },
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6 pb-16 pt-28"
    >
      <div className="pointer-events-none absolute inset-0 bg-museum-radial" />

      <div className="relative mx-auto w-full max-w-6xl">
        <p className="hero-fade eyebrow mb-6 text-museum-gold/90">
          India's Digital Memory System · Provenance Registry · Cultural Archive
        </p>

        <h1 className="font-display leading-[1.04]">
          <span className="block overflow-hidden">
            <span className="hero-line block text-[clamp(2.1rem,9vw,4.6rem)] tracking-[0.28em] text-museum-parchment sm:tracking-widest2">
              VIRASAT
            </span>
          </span>
          <span className="block overflow-hidden">
            <span className="hero-line block font-serif text-[clamp(1.6rem,4vw,3.4rem)] italic tracking-wide text-museum-parment text-museum-parchment/85">
              विरासत — the inheritance we hold
            </span>
          </span>
        </h1>

        <p className="hero-fade mt-8 max-w-2xl text-base leading-relaxed text-museum-parchment/65 md:text-lg">
          Not an e-commerce platform, not a marketplace — a living archive.
          We record the artisan before the artwork: family lineage, village
          history, oral tradition, and every work that carries the memory
          of a people, guarded by a cryptographic heritage passport.
        </p>

        <div className="hero-fade mt-12 flex flex-wrap gap-8 border-t border-museum-gold/20 pt-8 md:gap-14">
          {[
            { value: stats.traditions, label: "Traditions" },
            { value: stats.artisans, label: "Artisans" },
            { value: stats.artworks, label: "Fingerprinted Works" },
            { value: stats.passports, label: "Heritage Passports" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-gold-gradient font-display text-4xl md:text-5xl">
                {stat.value.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.28em] text-museum-parchment/55">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="hero-fade mt-14 flex items-center gap-4 text-museum-gold/80">
          <a
            href="#map"
            className="rounded-sm border border-museum-gold/60 px-7 py-3 text-xs uppercase tracking-[0.24em] transition-colors hover:bg-museum-gold hover:text-museum-black"
          >
            Enter the Archive
          </a>
          <span className="hidden text-[10px] uppercase tracking-[0.24em] text-museum-parchment/40 md:block">
            Begin in Raghurajpur — GI Application 88
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2">
        <div className="h-12 w-px animate-pulse-gold bg-gradient-to-b from-museum-gold/80 to-transparent" />
      </div>
    </section>
  );
}