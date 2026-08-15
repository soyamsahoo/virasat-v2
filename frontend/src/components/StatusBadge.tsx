import { statusMeta } from "../lib/tokens";
import type { VerificationStatus } from "../types";

export function StatusBadge({ status, compact = false }: { status: VerificationStatus; compact?: boolean }) {
  const meta = statusMeta[status] ?? statusMeta.pending;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border uppercase tracking-[0.2em] ${
        compact ? "px-2 py-0.5 text-[8px] gap-1" : "px-3 py-1 text-[10px]"
      }`}
      style={{ borderColor: meta.color, color: meta.color }}
    >
      <span
        className={`rounded-full ${compact ? "h-1 w-1" : "h-1.5 w-1.5"}`}
        style={{ backgroundColor: meta.dot, boxShadow: `0 0 8px ${meta.dot}` }}
      />
      {meta.label}
    </span>
  );
}
