import { Link } from "react-router-dom";
import { Layers, ScanLine } from "lucide-react";
import type { Artwork } from "../types";
import { palette } from "../lib/tokens";

/** Museum-plate card with a graceful gradient stand-in for the artwork. */
export function ArtworkCard({ artwork }: { artwork: Artwork }) {
  return (
    <Link
      to={`/passport?id=${artwork.heritage_id}`}
      className="group block overflow-hidden rounded-sm hairline transition-shadow duration-500 hover:shadow-glow"
    >
      <div
        className="relative flex h-56 items-center justify-center overflow-hidden"
        style={{
          background:
            "radial-gradient(420px 260px at 30% 20%, rgba(197,160,89,0.28), transparent 60%), linear-gradient(160deg, #1c160e 0%, #2a2013 55%, #17130c 100%)",
        }}
      >
        <Layers
          size={84}
          strokeWidth={0.7}
          className="text-museum-gold/50 transition-transform duration-700 group-hover:scale-110"
        />
        <span className="absolute bottom-3 right-4 font-display text-[11px] tracking-widest2 text-museum-gold/90">
          {artwork.heritage_id}
        </span>
        <span className="absolute left-4 top-3 flex items-center gap-1.5 rounded-full border border-museum-gold/40 bg-museum-black/60 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-museum-gold">
          <ScanLine size={11} /> Fingerprinted
        </span>
      </div>
      <div className="border-t border-museum-parchment/10 p-5">
        <p className="text-[10px] uppercase tracking-[0.24em] text-museum-gold/80">
          {artwork.creation_year} · {artwork.tradition_title || "Pattachitra"}
        </p>
        <h3 className="mt-1.5 font-serif text-xl text-museum-parchment group-hover:text-museum-gold">
          {artwork.title}
        </h3>
        <p className="mt-1 text-xs text-museum-parchment/50">
          {artwork.artisan_name} — {artwork.medium?.split(",")[0] ?? "Cotton Patta"}
          {artwork.dimensions ? ` · ${artwork.dimensions}` : ""}
        </p>
        <p
          className="mt-3 text-[10px] uppercase tracking-[0.2em]"
          style={{ color: palette.gold }}
        >
          View passport →
        </p>
      </div>
    </Link>
  );
}
