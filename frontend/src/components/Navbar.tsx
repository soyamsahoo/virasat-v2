import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X, ShieldCheck } from "lucide-react";

const links = [
  { to: "/", label: "The Archive" },
  { to: "/#map", label: "Explore" },
  { to: "/verify", label: "Verify" },
  { to: "/passport?id=VR-OD-PAT-2026-000001", label: "Passport" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-museum-black/85 backdrop-blur-md border-b border-museum-gold/20 shadow-gold"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="group flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-museum-gold/60 text-museum-gold group-hover:animate-pulse-gold">
            <ShieldCheck size={18} />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg tracking-widest2 text-museum-parchment">
              VIRASAT
            </span>
            <span className="block text-[10px] uppercase tracking-[0.3em] text-museum-gold">
              विरासत · Digital Memory
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((link) =>
            link.to.startsWith("/#") ? (
              <a
                key={link.label}
                href={link.to}
                className="text-xs uppercase tracking-[0.22em] text-museum-parchment/70 transition-colors hover:text-museum-gold"
              >
                {link.label}
              </a>
            ) : (
              <NavLink
                key={link.label}
                to={link.to}
                className={({ isActive }) =>
                  `text-xs uppercase tracking-[0.22em] transition-colors ${
                    isActive ? "text-museum-gold" : "text-museum-parchment/70 hover:text-museum-gold"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ),
          )}
        </div>

        <button
          className="text-museum-parchment md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-museum-gold/20 bg-museum-black/95 px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.to}
                onClick={() => setOpen(false)}
                className="text-sm uppercase tracking-[0.22em] text-museum-parchment/80"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
