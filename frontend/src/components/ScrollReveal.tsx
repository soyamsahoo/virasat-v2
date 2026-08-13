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

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const animation = gsap.fromTo(
      node,
      { autoAlpha: 0, y },
      {
        autoAlpha: 1,
        y: 0,
        duration: 1.1,
        delay,
        ease: "power3.out",
        scrollTrigger: {
          trigger: node,
          start: "top 88%",
          once,
        },
      },
    );
    return () => {
      animation.scrollTrigger?.kill();
      animation.kill();
    };
  }, [delay, y, once]);

  return (
    <div ref={ref} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
