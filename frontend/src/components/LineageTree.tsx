import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { LineageMember } from "../types";
import { StatusBadge } from "./StatusBadge";

interface LineageTreeProps {
  lineage: LineageMember[];
  /** id of the artisan whose record this family tree belongs to */
  artisanId: string;
}

/**
 * Compact generational family tree that fits on one screen: the oldest
 * generation sits at the top and the recorded artisan is anchored at the
 * bottom, each generation a single chip row. Nodes pop out on hover.
 */
export function LineageTree({ lineage, artisanId }: LineageTreeProps) {
  const generations = useMemo(() => {
    const groups = new Map<number, LineageMember[]>();
    for (const member of lineage) {
      const list = groups.get(member.generation_number) ?? [];
      list.push(member);
      groups.set(member.generation_number, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [lineage]);

  const nameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const member of lineage) names.set(member.id, member.full_name);
    return names;
  }, [lineage]);

  if (lineage.length === 0) {
    return (
      <p className="text-sm italic text-museum-parchment/50">
        No lineage recorded for this artisan yet.
      </p>
    );
  }

  return (
    <div className="rounded-sm hairline p-4 sm:p-6">
      <p className="eyebrow mb-5">
        Family Lineage · {generations.length} generation{generations.length > 1 ? "s" : ""} · {lineage.length} family member{lineage.length > 1 ? "s" : ""} documented
      </p>

      <ol className="space-y-4">
        {generations.map(([generation, members], index) => {
          const last = index === generations.length - 1;
          return (
            <li key={generation}>
              <div className="flex items-start gap-2.5 sm:gap-3">
                <p className="w-14 shrink-0 pt-2 text-center sm:w-16">
                  <span className="block text-[8px] uppercase tracking-[0.28em] text-museum-gold/70">
                    Gen
                  </span>
                  <span className="block font-display text-base leading-tight text-museum-parchment">
                    {generation}
                  </span>
                </p>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {members.map((member) => {
                    const isSelf = member.id === artisanId;
                    const parentName = member.parent_artisan_id
                      ? nameById.get(member.parent_artisan_id)
                      : null;
                    return (
                      <div
                        key={member.id}
                        className={`group relative box-border rounded-sm border px-3 py-2 transition-all duration-200 will-change-transform hover:z-10 hover:scale-[1.07] hover:border-museum-gold/70 hover:bg-museum-black hover:shadow-[0_0_20px_rgba(197,160,89,0.22)] active:scale-95 ${
                          isSelf
                            ? "border-museum-gold/70 bg-museum-gold/10"
                            : "border-museum-parchment/10 bg-museum-black/40"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <p className={`min-w-0 truncate font-serif text-sm leading-snug ${isSelf ? "text-museum-gold" : "text-museum-parchment"}`}>
                            {member.full_name}
                          </p>
                          <span className="ml-auto shrink-0">
                            <StatusBadge status={member.verification_status} compact />
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="truncate text-[8px] uppercase tracking-[0.16em] text-museum-parchment/45">
                            {isSelf
                              ? "This artisan"
                              : parentName
                                ? `Child of ${parentName}`
                                : "Family ancestor"}
                          </p>
                          {!isSelf && (
                            <Link
                              to={`/artisans/${member.id}`}
                              className="shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-museum-gold opacity-60 transition-opacity group-hover:opacity-100 hover:underline"
                            >
                              Record→
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {!last && (
                <div className="flex justify-center py-0.5 text-museum-gold/45">
                  <ChevronDown size={13} strokeWidth={1.5} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t border-museum-parchment/10 pt-3 text-[9px] uppercase tracking-[0.2em] text-museum-parchment/40">
        {lineage.length > 1
          ? "Full branch of the family root · siblings and descendants included"
          : "Recorded lineage of this artisan"}
      </p>
    </div>
  );
}