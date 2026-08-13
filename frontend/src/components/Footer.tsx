import { Link } from "react-router-dom";
import { ShieldCheck, MapPin, GitBranch } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-museum-gold/20 bg-museum-black">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 md:grid-cols-3">
        <div>
          <p className="font-display text-xl tracking-widest2 text-museum-parchment">
            VIRASAT
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-museum-gold">
            विरासत — Digital Memory System
          </p>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-museum-parchment/60">
            People before objects. An artwork is an artifact; the artisan,
            the lineage, the village and the oral tradition are the living
            core we archive.
          </p>
        </div>

        <div>
          <p className="eyebrow mb-4">Registry</p>
          <ul className="space-y-3 text-sm text-museum-parchment/70">
            <li className="flex items-center gap-2">
              <MapPin size={14} className="text-museum-gold" />
              Raghurajpur Heritage Village, Puri, Odisha — GI Application 88
            </li>
            <li className="flex items-center gap-2">
              <GitBranch size={14} className="text-museum-gold" />
              6-generation artisan lineages under active documentation
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-museum-gold" />
              SHA-256 signed heritage passports
            </li>
          </ul>
        </div>

        <div>
          <p className="eyebrow mb-4">Navigate</p>
          <ul className="space-y-3 text-sm text-museum-parchment/70">
            <li><Link to="/" className="hover:text-museum-gold">The Archive</Link></li>
            <li><Link to="/verify" className="hover:text-museum-gold">Verify a Heritage ID</Link></li>
            <li>
              <Link to="/passport?id=VR-OD-PAT-2026-000001" className="hover:text-museum-gold">
                Sample Heritage Passport
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-museum-parchment/10 py-5 text-center text-[11px] uppercase tracking-[0.25em] text-museum-parchment/40">
        विरासत · A Living Archive of India's Artisan Memory
      </div>
    </footer>
  );
}
