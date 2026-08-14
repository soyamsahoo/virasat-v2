import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import type { LineageMember } from "../types";
import { StatusBadge } from "./StatusBadge";

interface LineageTreeProps {
  lineage: LineageMember[];
  /** id of the artisan whose record this family tree belongs to */
  artisanId: string;
}

/** Generational family tree: one column per generation, oldest left,
 *  the recorded artisan highlighted with a gold frame. */
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
    <div className="rounded-sm hairline p-6 md:p-8">
      <p className="eyebrow mb-8">
        Family Lineage · {generations.length} generation{generations.length > 1 ? "s" : ""} · {lineage.length} family member{lineage.length > 1 ? "s" : ""} documented
      </p>

      <div className="flex items-start overflow-x-auto pb-3">
        {generations.map(([generation, members], index) => {
          const last = index === generations.length - 1;
          return (
            <Fragment key={generation}>
              <div className="w-48 shrink-0 sm:w-56">
                <div className="border-b border-museum-gold/30 pb-2 text-center">
                  <p className="text-[9px] uppercase tracking-[0.3em] text-museum-gold">
                    Generation
                  </p>
                  <p className="mt-0.5 font-display text-lg text-museum-parchment">
                    {generation}
                  </p>
                </div>
                <div className="flex flex-col justify-center gap-3 py-5">
                  {members.map((member) => {
                    const isSelf = member.id === artisanId;
                    const parentName = member.parent_artisan_id
                      ? nameById.get(member.parent_artisan_id)
                      : null;
                    return (
                      <div
                        key={member.id}
                        className={`rounded-sm border p-4 ${
                          isSelf
                            ? "border-museum-gold/70 bg-museum-gold/10"
                            : "border-museum-parchment/10 bg-museum-black/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`truncate font-serif text-base leading-snug ${isSelf ? "text-museum-gold" : "text-museum-parchment"}`}>
                              {member.full_name}
                            </p>
                            <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-museum-parchment/45">
                              {isSelf
                                ? "This artisan"
                                : parentName
                                  ? `Child of ${parentName}`
                                  : "Family ancestor"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <StatusBadge status={member.verification_status} />
                          {!isSelf && (
                            <Link
                              to={`/artisans/${member.id}`}
                              className="text-[9px] uppercase tracking-[0.18em] text-museum-gold hover:underline"
                            >
                              Record →
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {!last && (
                <div className="mx-1 mt-9 flex w-8 shrink-0 items-center justify-center sm:mx-2 sm:w-10">
                  <div className="h-px w-full border-t border-dashed border-museum-gold/50" />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <p className="mt-4 border-t border-museum-parchment/10 pt-3 text-[9px] uppercase tracking-[0.2em] text-museum-parchment/40">
        {lineage.length > 1
          ? "Full branch of the family root · siblings and descendants included"
          : "Recorded lineage of this artisan"}
      </p>
    </div>
  );
}