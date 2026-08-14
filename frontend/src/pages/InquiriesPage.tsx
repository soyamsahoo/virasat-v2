import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, Mail, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { InquiryStatus, InstitutionalInquiry } from "../types";

const FILTERS: { key: InquiryStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contact_made", label: "Contact made" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

const STATUS_META: Record<InquiryStatus, { label: string; cls: string }> = {
  new: { label: "New", cls: "border-museum-gold/60 text-museum-gold" },
  contact_made: { label: "Contact made", cls: "border-[#7FBF94]/60 text-[#7FBF94]" },
  accepted: { label: "Accepted", cls: "border-museum-emerald/70 text-[#9FD8B2]" },
  declined: { label: "Declined", cls: "border-[#C0392B]/60 text-[#E08A80]" },
};

export function InquiriesPage() {
  const [rows, setRows] = useState<InstitutionalInquiry[]>([]);
  const [filter, setFilter] = useState<InquiryStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await api.inquiries.list();
      setRows(all);
    } catch {
      setError("Inquiry registry unreachable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(id: string, status: InquiryStatus) {
    try {
      const updated = await api.inquiries.setStatus(id, status);
      setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
    } catch {
      setError("Status update failed.");
    }
  }

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-28 pt-32">
      <Link to="/" className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-museum-gold hover:underline">
        <ArrowLeft size={13} /> The Archive
      </Link>

      <header className="mt-8">
        <p className="eyebrow text-museum-gold">Institutional & Patronage Hub</p>
        <h1 className="mt-3 font-display text-4xl text-museum-parchment md:text-5xl">
          Patronage Inquiries
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-museum-parchment/60">
          Grants, exhibitions, commissions and research requests initiated by museums,
          foundations and cultural departments — brokered directly to verified artisans,
          with no marketplace and no transaction fees.
        </p>
      </header>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex min-h-10 items-center rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.18em] transition-colors ${
              filter === f.key
                ? "border-museum-gold bg-museum-gold text-museum-black"
                : "border-museum-parchment/25 text-museum-parchment/60 hover:border-museum-gold/70 hover:text-museum-gold"
            }`}
          >
            {f.label} {f.key !== "all" && `(${rows.filter((r) => r.status === f.key).length})`}
          </button>
        ))}
        <button
          onClick={() => void load()}
          className="ml-auto flex min-h-10 items-center gap-1.5 rounded-full border border-museum-parchment/25 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-museum-parchment/60 hover:text-museum-gold"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && <p className="mt-6 rounded-sm border border-[#C0392B]/60 bg-[#2A1010]/60 p-4 text-sm text-[#E08A80]">{error}</p>}

      <div className="mt-8 space-y-5">
        {!loading && visible.length === 0 && (
          <p className="rounded-sm hairline p-8 text-center font-serif italic text-museum-parchment/50">
            No inquiries in this view yet.
          </p>
        )}
        {visible.map((inquiry) => (
          <article key={inquiry.id} className="rounded-sm hairline p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 font-serif text-xl text-museum-parchment">
                  <Building2 size={16} className="text-museum-gold" />
                  {inquiry.institution_name}
                  <span className="rounded-full border border-museum-parchment/20 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-museum-parchment/50">
                    {inquiry.institution_type}
                  </span>
                </p>
                <p className="mt-1 text-xs text-museum-parchment/55">
                  To <Link to={`/artisans/${inquiry.artisan_id}`} className="text-museum-gold hover:underline">{inquiry.artisan_name}</Link>
                  {" · "}{inquiry.inquiry_type} inquiry
                  {" · "}{new Date(inquiry.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${STATUS_META[inquiry.status].cls}`}>
                {STATUS_META[inquiry.status].label}
              </span>
            </div>

            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-museum-parchment/70">
              {inquiry.message}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-museum-parchment/10 pt-4">
              {inquiry.contact_email ? (
                <a href={`mailto:${inquiry.contact_email}`} className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-museum-gold hover:underline">
                  <Mail size={12} /> {inquiry.contact_email}
                </a>
              ) : (
                <span className="text-[11px] text-museum-parchment/40">No contact email provided</span>
              )}
              <div className="flex gap-2">
                {(["contact_made", "accepted", "declined"] as InquiryStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => void update(inquiry.id, s)}
                    disabled={inquiry.status === s}
                    className={`flex min-h-10 items-center rounded-sm border px-3 py-2.5 text-[9px] uppercase tracking-[0.18em] transition-colors disabled:opacity-30 ${
                      inquiry.status === s
                        ? "border-museum-gold bg-museum-gold text-museum-black"
                        : "border-museum-parchment/25 text-museum-parchment/60 hover:border-museum-gold hover:text-museum-gold"
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
