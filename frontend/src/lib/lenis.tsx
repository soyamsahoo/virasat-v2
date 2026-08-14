import { useEffect, useRef, type ReactNode } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "./gsap";

let activeLenis: Lenis | null = null;

/** Scroll to top instantly — called by the router on navigation. */
export function scrollToTop() {
  if (activeLenis) {
    activeLenis.scrollTo(0, { immediate: true });
  } else {
    window.scrollTo({ top: 0, left: 0 });
  }
}

/**
 * Lenis smooth scroll bridged to GSAP's ticker, with ScrollTrigger
 * synchronisation — the canonical integration for editorial scroll.
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // Fall back to native scrolling for reduced-motion users.
      return;
    }
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

    const onVisibility = () => {
      if (document.hidden) {
        lenis.stop();
      } else {
        lenis.start();
        lenis.raf(performance.now());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Re-measure trigger positions once the page has truly settled. Fonts and
    // lazy images load after ScrollTrigger's initial measurement, pushing
    // content down — without this, reveals fire a full screen late on phones.
    const refreshTriggers = () => ScrollTrigger.refresh();
    window.addEventListener("load", refreshTriggers, { once: true });
    document.fonts?.ready.then(() => {
      if (lenisRef.current) refreshTriggers();
    });

    return () => {
      window.removeEventListener("load", refreshTriggers);
      document.removeEventListener("visibilitychange", onVisibility);
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
      activeLenis = null;
    };
  }, []);

  return <>{children}</>;
}
