import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Landmark, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { gsap } from "../lib/gsap";
import { mapLevels, palette, type MapLevel } from "../lib/tokens";
import type { Artisan, Region } from "../types";
import { StatusBadge } from "./StatusBadge";

const MAP_STYLE_URL =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ??
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const levelSequence: MapLevel[] = ["overview", "state", "village"];

export function MapExplorer() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [level, setLevel] = useState<MapLevel>("overview");
  const [selected, setSelected] = useState<Artisan | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ringsRef = useRef<(SVGCircleElement | null)[]>([]);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    void api.regions.list().then(setRegions).catch(() => setRegions([]));
    void api.artisans.list().then(setArtisans).catch(() => setArtisans([]));
  }, []);

  // ------------------------------------------------- MapLibre (OSM tiles)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    void (async () => {
      // Free, token-free basemap. If the style (or the network) is
      // unavailable, fall back to the animated vector illustration below.
      try {
        const response = await fetch(MAP_STYLE_URL);
        if (!response.ok) throw new Error(`style http ${response.status}`);
      } catch {
        if (!disposed) setMapFailed(true);
        return;
      }
      const module = await import("maplibre-gl");
      if (disposed || !containerRef.current) return;
      const map = new module.default.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: mapLevels.overview.center,
        zoom: mapLevels.overview.zoom,
        attributionControl: { compact: true },
      });
      map.addControl(new module.default.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.loaded()) map.once("load", () => paintMap(map));
    else paintMap(map);
  }, [regions, artisans, mapFailed]);

  function paintMap(map: maplibregl.Map) {
    for (const layer of ["virasat-regions", "virasat-region-label", "virasat-lineage"]) {
      if (map.getLayer(layer)) map.removeLayer(layer);
    }
    if (map.getSource("virasat-regions")) map.removeSource("virasat-regions");
    if (map.getSource("virasat-lineage")) map.removeSource("virasat-lineage");

    const regionGeo = {
      type: "FeatureCollection" as const,
      features: regions.map((region) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [region.longitude, region.latitude] as [number, number],
        },
        properties: { village: region.village, id: region.id },
      })),
    };
    map.addSource("virasat-regions", { type: "geojson", data: regionGeo });
    map.addLayer({
      id: "virasat-regions",
      type: "circle",
      source: "virasat-regions",
      paint: {
        "circle-radius": 9,
        "circle-color": palette.gold,
        "circle-stroke-width": 2,
        "circle-stroke-color": palette.black,
      },
    });
    map.addLayer({
      id: "virasat-region-label",
      type: "symbol",
      source: "virasat-regions",
      layout: {
        "text-field": ["get", "village"],
        "text-size": 11,
        "text-offset": [0, 1.6],
        "text-allow-overlap": false,
      },
      paint: { "text-color": palette.parchment },
    });

    const lineageGeo = {
      type: "FeatureCollection" as const,
      features: artisans.map((artisan) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [85.8239, 19.8924] as [number, number],
        },
        properties: { name: artisan.full_name, id: artisan.id },
      })),
    };
    map.addSource("virasat-lineage", { type: "geojson", data: lineageGeo });
    map.addLayer({
      id: "virasat-lineage",
      type: "circle",
      source: "virasat-lineage",
      paint: {
        "circle-radius": 4,
        "circle-color": palette.terracotta,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": palette.gold,
      },
    });
  }

  // ----------------------------------------------------- Zoom state machine
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = mapLevels[level];
    map.flyTo({
      center: target.center,
      zoom: target.zoom,
      speed: 0.65,
      curve: 1.6,
      essential: true,
    });
  }, [level]);

  function drillTo(next: MapLevel) {
    gsap.to(".map-svg-ring", {
      opacity: 0.35,
      scale: level === "overview" ? 0.6 : level === "state" ? 1 : 1.25,
      duration: 1.2,
      ease: "power2.inOut",
    });
    setLevel(next);
  }

  function selectArtisan(artisan: Artisan) {
    setSelected(artisan);
    if (mapRef.current) {
      setLevel("village");
    }
  }

  // ------------------------- SVG illustration while loading / on failure
  const useFallback = mapFailed;

  return (
    <section id="map" className="relative mx-auto max-w-7xl px-6 py-28">
      <div className="mb-14 text-center">
        <p className="eyebrow">Geographic Drilldown</p>
        <h2 className="mt-3 font-display text-3xl tracking-wide text-museum-parchment md:text-5xl">
          From the Nation to the Workshop
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-museum-parchment/60">
          Three zoom levels carry the visitor from the national overview to
          the state cluster — and at last to the lanes of Raghurajpur, each
          node a family that has painted for generations.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* -------------------------------------------------------- map */}
        <div className="relative lg:col-span-2">
          <div className="relative h-[420px] overflow-hidden rounded-sm hairline bg-[#101010] md:h-[520px]">
            {useFallback ? (
              <svg viewBox="0 0 700 480" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
                {[70, 130, 195, 260].map((r, i) => (
                  <circle
                    key={r}
                    ref={(node) => { ringsRef.current[i] = node; }}
                    className="map-svg-ring"
                    cx="350" cy="240" r={r}
                    fill="none"
                    stroke={palette.gold}
                    strokeOpacity={0.28 - i * 0.05}
                    strokeWidth={1}
                    strokeDasharray="2 7"
                  />
                ))}
                {[80, 160, 240, 320, 400].map((y) => (
                  <line
                    key={y}
                    className="map-svg-vein"
                    x1="30" x2="670" y1={y} y2={y}
                    stroke={palette.gold} strokeOpacity={0.14}
                    strokeWidth={1} strokeDasharray="4 10"
                  />
                ))}
                <circle cx="350" cy="240" r="26" fill={palette.black} stroke={palette.gold} strokeWidth="1.5" />
                <circle cx="350" cy="240" r="7" fill={palette.gold} className="animate-pulse-gold" />
                <text x="350" y="290" textAnchor="middle" fill={palette.parchment} fontSize="13" letterSpacing="3">
                  RAGHURAJPUR · 19.8924°N 85.8239°E
                </text>
                <text x="350" y="310" textAnchor="middle" fill={palette.gold} fontSize="10" letterSpacing="2">
                  GI APPLICATION 88 · ODISHA PATTACHITRA
                </text>
                <text x="350" y="332" textAnchor="middle" fill={palette.parchment} fontSize="9" letterSpacing="1.5" opacity="0.55">
                  MAP TILES OFFLINE — VECTOR ILLUSTRATION ACTIVE
                </text>
              </svg>
            ) : (
              <div ref={containerRef} className="absolute inset-0" />
            )}

            <div className="absolute left-4 top-4 rounded-sm border border-museum-gold/40 bg-museum-black/80 px-4 py-2 backdrop-blur">
              <p className="text-[10px] uppercase tracking-[0.24em] text-museum-gold">Level</p>
              <p className="font-serif text-sm text-museum-parchment">{mapLevels[level].label}</p>
            </div>

            <div className="absolute bottom-4 left-4 flex gap-2">
              {levelSequence.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => drillTo(lvl)}
                  className={`rounded-sm border px-4 py-2 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                    level === lvl
                      ? "border-museum-gold bg-museum-gold text-museum-black"
                      : "border-museum-parchment/25 bg-museum-black/70 text-museum-parchment/75 hover:border-museum-gold/70 hover:text-museum-gold"
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- panel */}
        <div className="flex flex-col gap-6">
          <div className="rounded-sm hairline p-5">
            <p className="eyebrow mb-4 flex items-center gap-2">
              <Landmark size={14} /> Heritage Villages
            </p>
            <ul className="space-y-3">
              {regions.length === 0 && (
                <li className="text-sm text-museum-parchment/50">Loading regions…</li>
              )}
              {regions.map((region) => (
                <li key={region.id}>
                  <button
                    onClick={() => drillTo(region.district === "Puri" ? "state" : "village")}
                    className="group flex w-full items-start justify-between gap-3 rounded-sm border border-museum-parchment/10 p-3 text-left transition-colors hover:border-museum-gold/60"
                  >
                    <span>
                      <span className="block font-serif text-base text-museum-parchment">
                        {region.village}
                      </span>
                      <span className="block text-[10px] uppercase tracking-[0.18em] text-museum-parchment/45">
                        {region.district} · {region.state}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-museum-gold/80">
                      {region.artisan_count}
                      <ChevronRight size={14} className="transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-sm hairline p-5">
            <p className="eyebrow mb-4">Workshop Nodes</p>
            <ul className="space-y-2">
              {artisans.map((artisan) => (
                <li key={artisan.id}>
                  <button
                    onClick={() => selectArtisan(artisan)}
                    className={`flex w-full items-center justify-between gap-2 rounded-sm border p-3 text-left transition-colors ${
                      selected?.id === artisan.id
                        ? "border-museum-gold bg-museum-gold/10"
                        : "border-museum-parchment/10 hover:border-museum-gold/50"
                    }`}
                  >
                    <span>
                      <span className="block text-sm text-museum-parchment">{artisan.full_name}</span>
                      <span className="block text-[10px] uppercase tracking-[0.16em] text-museum-parchment/45">
                        Generation {artisan.generation_number} · {artisan.tradition_title}
                      </span>
                    </span>
                    <StatusBadge status={artisan.verification_status} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {selected && (
            <div className="rounded-sm border border-museum-gold/40 bg-museum-emerald/25 p-5">
              <p className="eyebrow">Selected Workshop</p>
              <p className="mt-2 font-serif text-2xl text-museum-parchment">{selected.full_name}</p>
              <p className="mt-1 text-xs text-museum-parchment/60">{selected.region_name}</p>
              <Link
                to={`/artisans/${selected.id}`}
                className="mt-4 inline-block text-xs uppercase tracking-[0.22em] text-museum-gold hover:underline"
              >
                Open the lineage record →
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}