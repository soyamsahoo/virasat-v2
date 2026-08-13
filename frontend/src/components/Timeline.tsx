import { useLayoutEffect, useRef } from "react";
import { gsap } from "../lib/gsap";
import { palette } from "../lib/tokens";
import type { ProvenanceEvent } from "../types";

const eventColor: Record<string, string> = {
  created: palette.terracotta,
  registered: palette.gold,
  verified_by_ngo: palette.emerald,
  exhibited: palette.gold,
  transferred: palette.parchment,
  archived: "#8A857A",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Provenance timeline with a gold line that draws itself on scroll. */
export function Timeline({ events }: { events: ProvenanceEvent[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (lineRef.current) {
        const length = lineRef.current.getTotalLength();
        gsap.set(lineRef.current, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(lineRef.current, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: {
            trigger: rootRef.current,
            start: "top 75%",
            end: "bottom 55%",
            scrub: 0.6,
          },
        });
      }
      gsap.utils.toArray<HTMLElement>(".timeline-node").forEach((node) => {
        gsap.fromTo(
          node,
          { autoAlpha: 0, x: -24 },
          {
            autoAlpha: 1, x: 0, duration: 0.8, ease: "power2.out",
            scrollTrigger: { trigger: node, start: "top 88%", once: true },
          },
        );
      });
    }, rootRef);
    return () => ctx.revert();
  }, [events]);

  if (events.length === 0) {
    return (
      <p className="text-sm italic text-museum-parchment/50">
        No provenance events recorded for this work yet.
      </p>
    );
  }

  return (
    <div ref={rootRef} className="relative pl-10">
      <svg className="absolute left-[7px] top-2 h-full w-px overflow-visible" aria-hidden>
        <path
          ref={lineRef}
          d={`M 0.5 0 L 0.5 ${events.length * 118}`}
          stroke={palette.gold}
          strokeWidth={1.5}
          fill="none"
        />
      </svg>
      <ul className="space-y-10">
        {events.map((event) => {
          const color = eventColor[event.event_type] ?? palette.gold;
          return (
            <li key={event.id} className="timeline-node relative">
              <span
                className="absolute -left-10 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-museum-black"
                style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
              />
              <p className="text-[10px] uppercase tracking-[0.24em]" style={{ color }}>
                {event.event_type.replace(/_/g, " ")} · {formatDate(event.event_date)}
              </p>
              <p className="mt-1 font-serif text-lg text-museum-parchment">{event.location_name}</p>
              <p className="mt-1 text-sm leading-relaxed text-museum-parchment/60">
                {event.description}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}