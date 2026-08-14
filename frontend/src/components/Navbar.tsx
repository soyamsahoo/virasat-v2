import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X, ShieldCheck } from "lucide-react";

const links = [
  { to: "/", label: "The Archive" },
  { to: "/#map", label: "Explore" },
  { to: "/verify", label: "Verify" },
  { to: "/passport?id=VR-OD-PAT-2026-000001", label: "Passport" },
  { to: "/agent", label: "Field Agent" },
  { to: "/dashboard/inquiries", label: "Patronage" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-museum-black/85 backdrop-blur-md border-b border-museum-gold/20 shadow-gold"
          : "bg-transparent border-b border-transparent"
      }`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="group flex min-h-11 items-center gap-3">
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
          className="-mr-2 flex h-11 w-11 items-center justify-center text-museum-parchment md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X size={26} /> : <Menu size={26} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-museum-gold/20 bg-museum-black/95 px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {links.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center text-sm uppercase tracking-[0.22em] text-museum-parchment/80"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}