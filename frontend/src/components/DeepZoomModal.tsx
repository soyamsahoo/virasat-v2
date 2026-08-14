import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";

interface DeepZoomTarget {
  src?: string | null;
  title: string;
  subtitle?: string;
}

interface DeepZoomApi {
  open: (target: DeepZoomTarget) => void;
}

const DeepZoomContext = createContext<DeepZoomApi>({ open: () => undefined });

export function useDeepZoom() {
  return useContext(DeepZoomContext);
}

const MIN_SCALE = 1;
const MAX_SCALE = 10;

function DeepZoomDialog({ target, onClose }: { target: DeepZoomTarget; onClose: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const clampOffset = useCallback(
    (next: { x: number; y: number }, s = scale) => {
      const vp = viewportRef.current;
      if (!vp || !natural) return next;
      const scaledW = natural.w * s;
      const scaledH = natural.h * s;
      const maxX = Math.max(0, (scaledW - vp.clientWidth) / 2);
      const maxY = Math.max(0, (scaledH - vp.clientHeight) / 2);
      return { x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) };
    },
    [natural, scale],
  );

  const zoomTo = useCallback(
    (factor: number, cursor?: { x: number; y: number }) => {
      setScale((current) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current * factor));
        if (!cursor || !viewportRef.current || !natural) return next;
        const vp = viewportRef.current;
        const cx = (cursor.x - vp.clientWidth / 2) / vp.clientWidth;
        const cy = (cursor.y - vp.clientHeight / 2) / vp.clientHeight;
        setOffset((o) => clampOffset({ x: o.x + cx * natural.w * (next - current), y: o.y + cy * natural.h * (next - current) }, next));
        return next;
      });
    },
    [clampOffset, natural],
  );

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      dragRef.current = null;
      return;
    }
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0) {
        const factor = dist / pinchRef.current.dist;
        pinchRef.current = {
          dist,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
        if (factor !== 1) zoomTo(factor, pinchRef.current.mid);
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    setOffset(clampOffset({ x: drag.ox + (e.clientX - drag.startX), y: drag.oy + (e.clientY - drag.startY) }));
  }

  function onPointerUp(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-museum-black/97 backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-museum-gold/20 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-museum-gold">Deep Zoom Inspector</p>
          <p className="truncate font-serif text-lg text-museum-parchment">{target.title}</p>
          {target.subtitle && (
            <p className="truncate text-[10px] uppercase tracking-[0.2em] text-museum-parchment/45">
              {target.subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => zoomTo(1 / 1.5)}
            className="rounded-sm border border-museum-parchment/25 p-3 text-museum-parchment/80 hover:border-museum-gold hover:text-museum-gold"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <span className="hidden min-w-[52px] text-center font-display text-xs tracking-widest text-museum-gold sm:block">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => zoomTo(1.5)}
            className="rounded-sm border border-museum-parchment/25 p-3 text-museum-parchment/80 hover:border-museum-gold hover:text-museum-gold"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={reset}
            className="rounded-sm border border-museum-parchment/25 p-3 text-museum-parchment/80 hover:border-museum-gold hover:text-museum-gold"
            aria-label="Reset zoom"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="hidden rounded-sm border border-museum-parchment/25 p-3 text-museum-parchment/80 hover:border-museum-gold hover:text-museum-gold sm:block"
            aria-label="Toggle fullscreen"
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="ml-1 rounded-sm bg-museum-gold p-3 text-museum-black hover:opacity-90"
            aria-label="Close inspector"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          zoomTo(e.deltaY < 0 ? 1.2 : 1 / 1.2, { x: e.clientX, y: e.clientY });
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 cursor-grab active:cursor-grabbing"
          style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})` }}
        >
          {target.src ? (
            <img
              ref={imageRef}
              src={target.src}
              alt={target.title}
              draggable={false}
              className="max-h-[80dvh] max-w-full"
              style={{ imageRendering: scale >= 4 ? "pixelated" : undefined }}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            />
          ) : (
            <div className="flex h-[50vh] w-[70vw] items-center justify-center border border-museum-gold/30 font-serif text-lg italic text-museum-parchment/50">
              No archived photograph — plate stand-in
            </div>
          )}
        </div>
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-museum-parchment/15 bg-museum-black/70 px-4 py-1.5 text-[9px] uppercase tracking-[0.24em] text-museum-parchment/50 backdrop-blur">
          Drag to pan · Pinch or + / − to zoom up to 1000%
        </p>
      </div>
    </div>
  );
}

export function DeepZoomProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DeepZoomTarget | null>(null);
  const open = useCallback((t: DeepZoomTarget) => setTarget(t), []);

  return (
    <DeepZoomContext.Provider value={{ open }}>
      {children}
      {target &&
        createPortal(
          <DeepZoomDialog target={target} onClose={() => setTarget(null)} />,
          document.body,
        )}
    </DeepZoomContext.Provider>
  );
}