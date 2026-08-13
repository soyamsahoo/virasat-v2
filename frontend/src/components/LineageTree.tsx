import { Link } from "react-router-dom";
import { statusMeta } from "../lib/tokens";
import type { LineageMember } from "../types";
import { StatusBadge } from "./StatusBadge";

/**
 * Generational lineage chain: the artisan's own record at the top,
 * ancestors descending column by column (up to 4 generations).
 */
export function LineageTree({ lineage }: { lineage: LineageMember[] }) {
  if (lineage.length === 0) {
    return (
      <p className="text-sm italic text-museum-parchment/50">
        No lineage recorded for this artisan yet.
      </p>
    );
  }

  const root = lineage[lineage.length - 1];

  return (
    <div className="rounded-sm hairline p-6 md:p-8">
      <p className="eyebrow mb-8">Family Lineage · {lineage.length} generation{lineage.length > 1 ? "s" : ""} documented</p>

      <div className="flex flex-col gap-0">
        {lineage.map((member, index) => {
          const isRoot = member.id === root.id;
          return (
            <div key={member.id}>
              {index > 0 && (
                <div className="mx-auto h-10 w-px bg-gradient-to-b from-museum-gold/70 to-museum-gold/25" />
              )}
              <div className="flex items-center gap-4">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-display text-[11px]"
                  style={{
                    borderColor: statusMeta[member.verification_status]?.color ?? "#C5A059",
                    color: statusMeta[member.verification_status]?.color ?? "#C5A059",
                  }}
                >
                  {member.generation_number}
                </span>
                <div
                  className={`flex-1 rounded-sm border p-4 ${
                    isRoot
                      ? "border-museum-gold/70 bg-museum-gold/10"
                      : "border-museum-parchment/10 bg-museum-black/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-serif text-lg text-museum-parchment">
                        {member.full_name}
                        {isRoot && (
                          <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-museum-gold">
                            This artisan
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-museum-parchment/45">
                        {isRoot ? "Self" : member.parent_artisan_id ? "Parent of the record below" : "Ancestor"} ·
                        Generation {member.generation_number}
                      </p>
                    </div>
                    {!isRoot && (
                      <Link to={`/artisans/${member.id}`} className="text-[10px] uppercase tracking-[0.2em] text-museum-gold hover:underline">
                        Open record →
                      </Link>
                    )}
                  </div>
                  {!isRoot && (
                    <div className="mt-2">
                      <StatusBadge status={member.verification_status} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}