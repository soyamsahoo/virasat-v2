import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import { Download, ShieldCheck } from "lucide-react";
import type { Artisan, Artwork, HeritagePassport } from "../types";
import { api } from "../lib/api";
import { palette } from "../lib/tokens";

interface PassportCardProps {
  artwork: Artwork;
  artisan: Artisan | null;
  passport: HeritagePassport | null;
}

/** Museum-document preview of a heritage passport with embedded QR. */
export function PassportCard({ artwork, artisan, passport }: PassportCardProps) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const verifyUrl = `${window.location.origin}/verify?id=${encodeURIComponent(artwork.heritage_id)}`;

  useEffect(() => {
    if (!qrRef.current) return;
    void QRCode.toCanvas(qrRef.current, verifyUrl, {
      width: 132,
      margin: 1,
      color: { dark: "#0D0D0D", light: "#F5F2EB" },
    });
  }, [verifyUrl]);

  const issued = passport?.issued_at
    ? new Date(passport.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "Not yet issued";

  return (
    <div className="passport-paper rounded-sm text-museum-black shadow-gold">
      <div className="border-[3px] border-[#C5A059] p-1">
        <div className="border border-[#D9CDB2] p-6 md:p-8">
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-[0.4em] text-[#8B4513]">
              India's Digital Memory System
            </p>
            <h3 className="mt-2 font-display text-2xl tracking-[0.3em] text-[#0D0D0D]">
              HERITAGE PASSPORT
            </h3>
            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[#8B4513]">
              विरासत · Provenance Registry
            </p>
            <p className="mt-3 font-display text-sm tracking-[0.24em] text-[#C5A059]">
              {artwork.heritage_id}
            </p>
          </div>

          <div className="mt-6 border-y border-[#D9CDB2] py-5">
            <p className="font-serif text-2xl leading-snug">{artwork.title}</p>
            <p className="mt-1 text-xs text-[#5C5A52]">
              {artwork.creation_year || "—"} · {artwork.medium || "Cotton Patta"}
              {artwork.dimensions ? ` · ${artwork.dimensions}` : ""}
            </p>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
            {[
              ["Artisan", artisan?.full_name ?? artwork.artisan_name],
              ["Pehchan Card", artisan?.pehchan_card_id ?? "—"],
              ["Generation", artisan ? `Generation ${artisan.generation_number}` : "—"],
              ["Region", artisan?.region_name ?? "—"],
              ["Tradition", artwork.tradition_title || "—"],
              ["Issued", issued],
            ].map(([label, value]) => (
              <div key={label as string} className="border-b border-[#EBE4D0] pb-2">
                <dt className="text-[9px] uppercase tracking-[0.22em] text-[#8B4513]">{label}</dt>
                <dd className="mt-0.5 font-medium leading-snug">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-col items-center gap-5 md:flex-row">
            <div className="bg-[#F5F2EB] p-2" style={{ border: `1px solid ${palette.gold}` }}>
              <canvas ref={qrRef} aria-label="Verification QR code" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <p className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#1B3B2B] md:justify-start">
                <ShieldCheck size={14} /> {passport ? "Registered & cryptographically signed" : "Awaiting passport issuance"}
              </p>
              <p className="mt-2 break-all text-[10px] leading-relaxed text-[#5C5A52]">
                SHA-256 {passport?.cryptographic_hash.slice(0, 36) ?? "—"}…
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3 md:justify-start">
                <Link
                  to={`/verify?id=${encodeURIComponent(artwork.heritage_id)}`}
                  className="flex min-h-11 items-center rounded-sm bg-[#0D0D0D] px-5 py-2.5 text-[10px] uppercase tracking-[0.22em] text-[#F5F2EB] transition-opacity hover:opacity-85"
                >
                  Verify this passport
                </Link>
                {passport?.pdf_passport_url && (
                  <a
                    href={passport.pdf_passport_url.startsWith("http")
                      ? passport.pdf_passport_url
                      : api.passports.pdfUrl(artwork.heritage_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center gap-1.5 rounded-sm border border-[#0D0D0D] px-5 py-2.5 text-[10px] uppercase tracking-[0.22em] text-[#0D0D0D] transition-colors hover:bg-[#0D0D0D] hover:text-[#F5F2EB]"
                  >
                    <Download size={12} /> PDF certificate
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}