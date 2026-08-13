import { useCallback, useEffect, useRef, useState } from "react";
import { ScanSearch } from "lucide-react";
import type { SimilarArtwork } from "../types";
import { palette } from "../lib/tokens";

interface KeypointMatchInspectorProps {
  leftImage: string | null;
  leftLabel: string;
  match: SimilarArtwork;
}

interface ImageMetrics {
  visW: number;
  visH: number;
  offX: number;
  offY: number;
  natW: number;
  natH: number;
}

/** Split-screen ORB keypoint alignment viewer.
 *
 * Draws the matched keypoint pairs as a circuit overlay between the two
 * plates: each pair is one line whose endpoints live in the uploaded image
 * (left) and the registered archive plate (right) pixel spaces, projected
 * onto the rendered boxes.
 */
export function KeypointMatchInspector({ leftImage, leftLabel, match }: KeypointMatchInspectorProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<{ left?: ImageMetrics; right?: ImageMetrics }>({});
  const pairs = match.keypoint_pairs ?? [];
  const gap = 8;

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const nodes = wrap.querySelectorAll<HTMLElement>("[data-plate]");
    const next: { left?: ImageMetrics; right?: ImageMetrics } = {};
    nodes.forEach((node) => {
      const key = node.dataset.plate as "left" | "right";
      const img = node.querySelector<HTMLImageElement>("img");
      const boxW = node.clientWidth;
      const boxH = node.clientHeight;
      if (!img || img.naturalWidth === 0) return;
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      const scale = Math.min(boxW / natW, boxH / natH);
      const visW = natW * scale;
      const visH = natH * scale;
      next[key] = { visW, visH, offX: (boxW - visW) / 2, offY: (boxH - visH) / 2, natW, natH };
    });
    setMetrics(next);
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, leftImage, match.artwork_image_url]);

  const leftW = wrapRef.current?.querySelector('[data-plate="left"]')?.clientWidth ?? 0;

  return (
    <div className="rounded-sm hairline p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-2 text-museum-gold">
          <ScanSearch size={14} /> Visual Match Inspector
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-museum-gold/50 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-museum-gold">
            {Math.round(match.orb_match_score * 100)}% structural
          </span>
          {match.orb_verified && (
            <span className="rounded-full border border-museum-emerald/70 bg-museum-emerald/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#7FBF94]">
              ORB + RANSAC verified
            </span>
          )}
        </div>
      </div>

      <div ref={wrapRef} className="relative flex" style={{ gap }}>
        <div data-plate="left" className="relative h-56 flex-1 overflow-hidden rounded-sm border border-museum-parchment/15">
          {leftImage ? (
            <img src={leftImage} alt="Uploaded artwork" className="h-full w-full object-contain" draggable={false} />
          ) : (
            <div className="flex h-full items-center justify-center font-serif text-sm italic text-museum-parchment/45">
              Uploaded image unavailable
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-sm bg-museum-black/70 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-museum-gold">
            {leftLabel}
          </span>
        </div>

        <div data-plate="right" className="relative h-56 flex-1 overflow-hidden rounded-sm border border-museum-parchment/15">
          {match.artwork_image_url ? (
            <img src={match.artwork_image_url} alt={match.title} className="h-full w-full object-contain" draggable={false} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <span className="font-serif text-lg text-museum-parchment/80">{match.title}</span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-museum-parchment/40">
                {match.heritage_id} · {match.artisan_name}
              </span>
            </div>
          )}
          <span className="absolute right-2 top-2 rounded-sm bg-museum-black/70 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-museum-gold">
            Registered plate
          </span>
        </div>

        {pairs.length > 0 && metrics.left && metrics.right && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ overflow: "visible" }}
          >
            {pairs.map((p, i) => {
              const x1 = metrics.left!.offX + (p.x1 * metrics.left!.visW) / metrics.left!.natW;
              const y1 = metrics.left!.offY + (p.y1 * metrics.left!.visH) / metrics.left!.natH;
              const x2 = leftW + gap + metrics.right!.offX + (p.x2 * metrics.right!.visW) / metrics.right!.natW;
              const y2 = metrics.right!.offY + (p.y2 * metrics.right!.visH) / metrics.right!.natH;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={palette.gold}
                  strokeWidth={0.9}
                  strokeOpacity={0.75}
                />
              );
            })}
            {pairs.map((p, i) => {
              const x1 = metrics.left!.offX + (p.x1 * metrics.left!.visW) / metrics.left!.natW;
              const y1 = metrics.left!.offY + (p.y1 * metrics.left!.visH) / metrics.left!.natH;
              const x2 = leftW + gap + metrics.right!.offX + (p.x2 * metrics.right!.visW) / metrics.right!.natW;
              const y2 = metrics.right!.offY + (p.y2 * metrics.right!.visH) / metrics.right!.natH;
              return (
                <g key={`dot-${i}`}>
                  <circle cx={x1} cy={y1} r={2.6} fill={palette.goldSoft} />
                  <circle cx={x2} cy={y2} r={2.6} fill={palette.goldSoft} />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.18em] text-museum-parchment/55">
        <span>
          ORB matches <b className="text-museum-gold">{pairs.length}</b> visual alignments
        </span>
        <span>
          pHash distance <b className="text-museum-gold">{match.phash_distance}</b>
        </span>
        <span>
          dHash distance <b className="text-museum-gold">{match.dhash_distance}</b>
        </span>
        <span>
          Candidate <b className="text-museum-gold">{match.heritage_id}</b> · {match.artisan_name}
        </span>
      </div>
    </div>
  );
}
