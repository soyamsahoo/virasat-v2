import { statusMeta } from "../lib/tokens";
import type { VerificationStatus } from "../types";

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const meta = statusMeta[status] ?? statusMeta.pending;
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
      style={{ borderColor: meta.color, color: meta.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.dot, boxShadow: `0 0 8px ${meta.dot}` }}
      />
      {meta.label}
    </span>
  );
}
