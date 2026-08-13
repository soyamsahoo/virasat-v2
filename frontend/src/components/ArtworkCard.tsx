import { Link } from "react-router-dom";
import { ScanLine, ZoomIn } from "lucide-react";
import type { Artwork } from "../types";
import { palette } from "../lib/tokens";
import { ArtworkPlate } from "./ArtworkPlate";
import { useDeepZoom } from "./DeepZoomModal";

/** Museum-plate card: archived photograph (or gradient stand-in) with a
 *  deep-zoom inspector on the plate and a passport link below. */
export function ArtworkCard({ artwork }: { artwork: Artwork }) {
  const deepZoom = useDeepZoom();

  return (
    <div className="group block overflow-hidden rounded-sm hairline transition-shadow duration-500 hover:shadow-glow">
      <button
        onClick={() =>
          deepZoom.open({
            src: artwork.primary_image_url || null,
            title: artwork.title,
            subtitle: `${artwork.heritage_id} · ${artwork.artisan_name}`,
          })
        }
        className="block w-full text-left"
        title="Open deep-zoom inspector"
      >
        <ArtworkPlate
          src={artwork.primary_image_url || null}
          title={artwork.heritage_id}
          className="h-56 w-full"
        >
          <span className="absolute left-4 top-3 flex items-center gap-1.5 rounded-full border border-museum-gold/40 bg-museum-black/60 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-museum-gold">
            {artwork.primary_image_url ? <ZoomIn size={11} /> : <ScanLine size={11} />}
            {artwork.primary_image_url ? "Inspect plate" : "Fingerprinted"}
          </span>
        </ArtworkPlate>
      </button>
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
        <Link
          to={`/passport?id=${artwork.heritage_id}`}
          className="mt-3 inline-block text-[10px] uppercase tracking-[0.2em]"
          style={{ color: palette.gold }}
        >
          View passport →
        </Link>
      </div>
    </div>
  );
}