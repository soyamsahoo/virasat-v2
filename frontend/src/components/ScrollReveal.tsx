import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap } from "../lib/gsap";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}

/** Cinematic scroll-triggered reveal using GSAP ScrollTrigger. */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  y = 48,
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const isMobile = window.innerWidth < 768;
    const animation = gsap.fromTo(
      node,
      { autoAlpha: 0, y },
      {
        autoAlpha: 1,
        y: 0,
        duration: isMobile ? 0.9 : 1.1,
        delay: isMobile ? delay * 0.4 : delay,
        ease: "power3.out",
        scrollTrigger: {
          trigger: node,
          // Fire the moment the element's top enters the viewport bottom
          // edge — anything later reads as "I have to scroll a whole screen".
          start: "top 100%",
          once,
        },
      },
    );
    let disposed = false;
    const refresh = () => animation.scrollTrigger?.refresh();
    window.addEventListener("load", refresh, { once: true });
    document.fonts?.ready.then(() => {
      if (!disposed) refresh();
    });
    return () => {
      disposed = true;
      window.removeEventListener("load", refresh);
      animation.scrollTrigger?.kill();
      animation.kill();
    };
  }, [delay, y, once]);

  return (
    <div ref={ref} className={className} style={reduceMotion ? {} : { opacity: 0 }}>
      {children}
    </div>
  );
}
