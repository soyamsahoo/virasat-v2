import { useEffect, useRef, type ReactNode } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "./gsap";

let activeLenis: Lenis | null = null;

/** Scroll to top instantly — called by the router on navigation. */
export function scrollToTop() {
  activeLenis?.scrollTo(0, { immediate: true });
}

/**
 * Lenis smooth scroll bridged to GSAP's ticker, with ScrollTrigger
 * synchronisation — the canonical integration for editorial scroll.
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.25,
      smoothWheel: true,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    lenisRef.current = lenis;
    activeLenis = lenis;

    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
      activeLenis = null;
    };
  }, []);

  return <>{children}</>;
}
