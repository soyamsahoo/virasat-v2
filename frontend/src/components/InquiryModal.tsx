import { useState, type FormEvent } from "react";
import { Handshake, X } from "lucide-react";
import { api } from "../lib/api";
import type { InquiryType } from "../types";

interface InquiryModalProps {
  artisanId: string;
  artisanName: string;
  initialType?: InquiryType;
  onClose: () => void;
}

const TYPES: { key: InquiryType; label: string; hint: string }[] = [
  { key: "patronage", label: "Patronage", hint: "Long-term support relationship" },
  { key: "grant", label: "Grant", hint: "Funding support for the craft or workshop" },
  { key: "exhibition", label: "Exhibition", hint: "Museum / gallery showcase invitation" },
  { key: "commission", label: "Commission", hint: "Direct commissioned artwork" },
  { key: "research", label: "Research", hint: "Academic or documentation partnership" },
  { key: "collaboration", label: "Collaboration", hint: "Institutional project participation" },
];

/** Zero-commerce patronage contact form — VIRASAT only brokers the connection. */
export function InquiryModal({
  artisanId,
  artisanName,
  initialType,
  onClose,
}: InquiryModalProps) {
  const [institution_name, setInstitutionName] = useState("");
  const [institution_type, setInstitutionType] = useState("Museum");
  const [inquiry_type, setInquiryType] = useState<InquiryType>(initialType ?? "patronage");
  const [contact_email, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.inquiries.create({
        artisan_id: artisanId,
        institution_name,
        institution_type,
        inquiry_type,
        message,
        contact_email: contact_email || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inquiry could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-museum-black/85 p-4 backdrop-blur-sm"
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-sm hairline bg-[#14100A] p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow flex items-center gap-2 text-museum-gold">
              <Handshake size={14} /> Institutional Patronage
            </p>
            <h2 className="mt-2 font-display text-2xl text-museum-parchment">
              Initiate an inquiry with {artisanName}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-sm border border-museum-parchment/25 p-3 text-museum-parchment/70 hover:text-museum-gold" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="mt-8 rounded-sm border border-museum-emerald/60 bg-museum-emerald/15 p-6 text-center">
            <p className="font-display text-xl text-[#9FD8B2]">Inquiry dispatched</p>
            <p className="mt-2 text-sm text-museum-parchment/65">
              {institution_name} has been connected to {artisanName}'s portfolio. No fees, no marketplace —
              direct patronage only.
            </p>
            <button onClick={onClose} className="mt-5 rounded-sm bg-museum-gold px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-museum-black">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-museum-parchment/55">Institution *</span>
                <input value={institution_name} onChange={(e) => setInstitutionName(e.target.value)} required
                  placeholder="e.g. National Museum, New Delhi"
                  className="w-full rounded-sm border border-museum-parchment/20 bg-museum-black/60 px-4 py-3 text-base text-museum-parchment placeholder:text-museum-parchment/30 focus:border-museum-gold focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-museum-parchment/55">Institution type</span>
                <select value={institution_type} onChange={(e) => setInstitutionType(e.target.value)}
                  className="w-full rounded-sm border border-museum-parchment/20 bg-museum-black/60 px-4 py-3 text-base text-museum-parchment focus:border-museum-gold focus:outline-none">
                  {["Museum", "Art foundation", "Gallery", "Research institute", "Government body", "Cultural department", "Other"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-museum-parchment/55">Inquiry type *</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setInquiryType(t.key)}
                    title={t.hint}
                    className={`rounded-sm border px-3 py-2.5 text-left transition-colors ${
                      inquiry_type === t.key
                        ? "border-museum-gold bg-museum-gold/15 text-museum-gold"
                        : "border-museum-parchment/15 text-museum-parchment/60 hover:border-museum-gold/50"
                    }`}
                  >
                    <span className="block text-[11px] uppercase tracking-[0.14em]">{t.label}</span>
                    <span className="mt-0.5 block text-[9px] leading-tight text-museum-parchment/40">{t.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-museum-parchment/55">Contact email</span>
              <input type="email" value={contact_email} onChange={(e) => setContactEmail(e.target.value)}
                placeholder="curator@institution.org"
                className="w-full rounded-sm border border-museum-parchment/20 bg-museum-black/60 px-4 py-3 text-base text-museum-parchment placeholder:text-museum-parchment/30 focus:border-museum-gold focus:outline-none" />
            </label>

            <label className="block">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-museum-parchment/55">Message * (min 10 chars)</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} rows={4}
                placeholder="Scope of the grant / exhibition / commission, timelines, and what the artisan would receive…"
                className="w-full resize-y rounded-sm border border-museum-parchment/20 bg-museum-black/60 px-4 py-3 text-base text-museum-parchment placeholder:text-museum-parchment/30 focus:border-museum-gold focus:outline-none" />
            </label>

            {error && <p className="text-xs text-[#E05C4B]">{error}</p>}

            <button
              disabled={busy || message.trim().length < 10 || !institution_name.trim()}
              className="w-full rounded-sm bg-museum-gold py-3.5 text-xs uppercase tracking-[0.24em] text-museum-black transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Dispatching…" : "Send inquiry"}
            </button>
            <p className="text-center text-[9px] uppercase tracking-[0.2em] text-museum-parchment/35">
              Direct institutional contact — VIRASAT does not take commissions or transaction fees
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
