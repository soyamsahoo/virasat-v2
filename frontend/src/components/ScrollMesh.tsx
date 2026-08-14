import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { gsap, ScrollTrigger } from "../lib/gsap";
import { palette } from "../lib/tokens";
import type { ScrollCanvasProps } from "./scroll/ScrollCanvas";

interface ScrollMeshProps {
  /** Plate photograph served from /public (or any CORS-enabled URL). */
  src: string;
  title?: string;
  subtitle?: string;
  /** World-space width of the unrolled cloth. */
  planeWidth?: number;
  /** Total scroll runway in viewport heights (stickied inner frame). */
  scrollHeight?: number;
}

const DEFAULT_PLANE_WIDTH = 6.5;
const DEFAULT_SCROLL_HEIGHT = 300;

/**
 * The Living Cloth — a pinned, scroll-scrubbed WebGL unroll of a
 * Pattachitra plate.
 *
 * The heavy three.js / R3F bundle is lazy-loaded from ./scroll/ScrollCanvas
 * so non-WebGL devices and pages without this section never pay for it.
 * The GSAP ScrollTrigger below writes directly into the shader's
 * shared `uScrollProgress` uniform — no React re-render per frame.
 */
export function ScrollMesh({
  src,
  title,
  subtitle,
  planeWidth = DEFAULT_PLANE_WIDTH,
  scrollHeight = DEFAULT_SCROLL_HEIGHT,
}: ScrollMeshProps) {
  const rootRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rolledCaptionRef = useRef<HTMLDivElement>(null);
  const flatCaptionRef = useRef<HTMLDivElement>(null);

  /* Single mutable uniform shared with the shader material. */
  const progress = useMemo(() => ({ value: 0 }), []);

  /* True if the device can run WebGL — otherwise we skip the 500 kB
   * WebGL chunk entirely and degrade to a static plate. */
  const webgl = useMemo(() => {
    try {
      const probe = document.createElement("canvas");
      return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
    } catch {
      return false;
    }
  }, []);

  /* Lazy Canvas — waits for the WebGL chunk before mounting the scene. */
  const [Scene, setScene] = useState<ComponentType<ScrollCanvasProps> | null>(null);
  useEffect(() => {
    let alive = true;
    if (!webgl) return;
    void import("./scroll/ScrollCanvas").then((module) => {
      if (alive) setScene(() => module.ScrollCanvas);
    });
    return () => {
      alive = false;
    };
  }, [webgl]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const rolled = rolledCaptionRef.current;
    const flat = flatCaptionRef.current;
    if (!container) return;

    const ctx = gsap.context(() => {
      /* The master scrub: while the sticky frame travels through the
       * runway, uScrollProgress sweeps 0 → 1 and the plate unrolls. */
      ScrollTrigger.create({
        trigger: container,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          progress.value = self.progress;
        },
      });

      /* Caption choreography — the rolled state speaks first, then the
       * flat state arrives as the cloth reaches full light. */
      gsap.fromTo(
        rolled,
        { autoAlpha: 1, y: 0 },
        {
          autoAlpha: 0,
          y: -16,
          ease: "none",
          scrollTrigger: {
            trigger: container,
            start: "top 45%",
            end: "top 18%",
            scrub: true,
          },
        },
      );
      gsap.fromTo(
        flat,
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          y: 0,
          ease: "none",
          scrollTrigger: {
            trigger: container,
            start: "top 45%",
            end: "top 18%",
            scrub: true,
          },
        },
      );
    }, rootRef);

    /* gsap.context().revert() kills every ScrollTrigger created inside
     * and reverts inline styles, so unmounting is leak-free. */
    return () => ctx.revert();
  }, [progress]);

  return (
    <section ref={rootRef} className="relative" style={{ height: `${scrollHeight}vh` }}>
      {/* Sticky showcase frame pinned against by the ScrollTrigger */}
      <div
        id="canvas-container"
        ref={containerRef}
        className="sticky top-0 h-screen w-full overflow-hidden"
        style={{
          background:
            "radial-gradient(900px 480px at 50% 42%, rgba(197,160,89,0.14), transparent 65%), radial-gradient(700px 700px at 50% 110%, rgba(139,69,19,0.35), transparent 60%), linear-gradient(160deg, #0D0D0D 0%, #17130C 55%, #0D0D0D 100%)",
        }}
      >
        {Scene ? (
          <Scene src={src} progress={progress} planeWidth={planeWidth} />
        ) : (
          <div className="flex h-full items-center justify-center p-10">
            <img
              src={src}
              alt={title ?? "Pattachitra plate"}
              className="max-h-full max-w-full rounded-sm object-contain opacity-90"
              draggable={false}
            />
          </div>
        )}

        {/* ---------------------------------------------- caption layers */}
        <div
          ref={rolledCaptionRef}
          className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto max-w-xl px-6 text-center"
        >
          <p className="eyebrow text-museum-gold/80">The Sealed Cloth</p>
          <h2 className="mt-2 font-display text-3xl text-museum-parchment md:text-4xl">
            {title ?? "A Patta in its Roll"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-museum-parchment/60">
            Wrapped tight for the journey — the painting sleeps in shade.
            Scroll to unfurl it into museum light.
          </p>
        </div>
        <div
          ref={flatCaptionRef}
          className="pointer-events-none absolute inset-x-0 bottom-10 mx-auto max-w-xl px-6 text-center opacity-0"
        >
          <p className="eyebrow text-museum-gold">Unfurled</p>
          <h2 className="mt-2 font-display text-3xl text-museum-parchment md:text-4xl">
            {title ?? "The Plate Revealed"}
          </h2>
          {subtitle && (
            <p className="mt-3 text-sm leading-relaxed text-museum-parchment/60">{subtitle}</p>
          )}
          <p
            className="mt-4 inline-block text-[10px] uppercase tracking-[0.24em]"
            style={{ color: palette.gold }}
          >
            Scroll up to roll it away — the cloth is never damaged by the archive.
          </p>
        </div>
      </div>
    </section>
  );
}