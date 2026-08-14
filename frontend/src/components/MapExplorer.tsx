import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Landmark, ChevronRight, Image as ImageIcon, MapPin } from "lucide-react";
import { api } from "../lib/api";
import { gsap } from "../lib/gsap";
import { plateUrlFor } from "../lib/plates";
import { palette } from "../lib/tokens";
import type { Artisan, Artwork } from "../types";
import { StatusBadge } from "./StatusBadge";

const MAP_STYLE_URL =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ??
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

type CategoryKey = "painting" | "textile" | "metal";

interface CraftVillage {
  id: string;
  name: string;
  district: string;
  category: CategoryKey;
  coordinates: [number, number]; // [lng, lat]
  artforms: string[];
  description: string;
}

const CATEGORIES: Record<CategoryKey, { label: string; color: string; dot: string }> = {
  painting: { label: "Painting & Sculpture", color: palette.gold, dot: "#E8D9B8" },
  textile: { label: "Textile & Appliqué", color: palette.terracotta, dot: "#C97B3D" },
  metal: { label: "Metalwork & Tribal Craft", color: palette.emerald, dot: "#3E8A5A" },
};

/** The Craft Atlas: Odisha's mapped heritage-cluster villages.
 *  Coordinates are representative pin placements for the demo atlas. */
const CRAFT_VILLAGES: CraftVillage[] = [
  {
    id: "raghurajpur",
    name: "Raghurajpur",
    district: "Puri",
    category: "painting",
    coordinates: [85.8239, 19.8924],
    artforms: ["Pattachitra", "Palm-leaf etchings", "Papier-mâché masks"],
    description:
      "Famous for Pattachitra paintings, palm-leaf etchings, and papier-mâché masks — the GI-tagged home of the chitrakars.",
  },
  {
    id: "nayakpatna",
    name: "Nayak Patna",
    district: "Puri",
    category: "painting",
    coordinates: [85.804, 19.889],
    artforms: ["Traditional painting", "Designing", "Pottery"],
    description:
      "Located close to Raghurajpur, specialising in traditional painting, designing, and pottery.",
  },
  {
    id: "baulagadia",
    name: "Baulagadia",
    district: "Puri",
    category: "painting",
    coordinates: [85.871, 19.913],
    artforms: ["Stone carving"],
    description:
      "Renowned across the state for its intricate and historic stone-carving art.",
  },
  {
    id: "pipili",
    name: "Pipili",
    district: "Puri",
    category: "textile",
    coordinates: [85.8337, 20.1095],
    artforms: ["Appliqué", "Patchwork fabric art"],
    description:
      "A world-famous heritage town completely dedicated to vibrant appliqué and patchwork fabric art.",
  },
  {
    id: "nuapatna",
    name: "Maniabandha & Nuapatna",
    district: "Cuttack",
    category: "textile",
    coordinates: [85.66, 20.34],
    artforms: ["Khandua silk", "Ikat handloom"],
    description:
      "Historic single-origin weaving hubs famous for Khandua Silk and Ikat handloom sarees.",
  },
  {
    id: "maniabandha",
    name: "Maniabandha Cluster",
    district: "Cuttack",
    category: "textile",
    coordinates: [85.723, 20.405],
    artforms: ["Khandua silk", "Ikat handloom"],
    description:
      "The adjoining loom-cluster of the Khandua-Ikat belt, weaving for generations on single-origin handlooms.",
  },
  {
    id: "gopalpur",
    name: "Gopalpur",
    district: "Jajpur",
    category: "textile",
    coordinates: [86.23, 20.92],
    artforms: ["Tussar silk weaving"],
    description:
      "A dedicated artisan village specialising in authentic Tussar silk weaving.",
  },
  {
    id: "sadeibarani",
    name: "Sadeibarani",
    district: "Dhenkanal",
    category: "metal",
    coordinates: [85.605, 20.785],
    artforms: ["Dhokra brass casting"],
    description:
      "A dedicated tribal craft village famous for ancient Dhokra metal casting using the lost-wax technique.",
  },
  {
    id: "kantabania",
    name: "Kantabania",
    district: "Balasore",
    category: "metal",
    coordinates: [86.9, 21.29],
    artforms: ["Paddy craft"],
    description:
      "A unique cluster known for traditional paddy craft — ornaments and idols carved from unhusked rice grains.",
  },
];

interface WorkshopNode {
  id: string;
  full_name: string;
  generation_number: number;
  verification_status: "pending" | "field_verified" | "master_verified" | "flagged";
  craft: string;
  artisan_id?: string;
}

/** Mock workshop nodes — fictional sample records so every heritage village
 *  on the atlas has live clickable workshops (real Raghurajpur lineage data
 *  streams from the API when reachable). */
const MOCK_WORKSHOPS: Record<string, WorkshopNode[]> = {
  raghurajpur: [
    { id: "mock-w-1", full_name: "Master Chitrakar, Dasavatara House", generation_number: 6, verification_status: "master_verified", craft: "Pattachitra" },
    { id: "mock-w-2", full_name: "Radha-Krishna Workshop", generation_number: 4, verification_status: "field_verified", craft: "Pattachitra" },
    { id: "mock-w-3", full_name: "Palm-Leaf Etching Atelier", generation_number: 3, verification_status: "pending", craft: "Talapatra etching" },
  ],
  nayakpatna: [
    { id: "mock-w-np1", full_name: "Nayak Pottery & Design House", generation_number: 4, verification_status: "field_verified", craft: "Pottery · design" },
    { id: "mock-w-np2", full_name: "Heritage Painting Studio", generation_number: 3, verification_status: "pending", craft: "Traditional painting" },
  ],
  baulagadia: [
    { id: "mock-w-bg1", full_name: "Baulagadia Stone Studio", generation_number: 5, verification_status: "field_verified", craft: "Stone carving" },
    { id: "mock-w-bg2", full_name: "Temple Sculpture Workshop", generation_number: 3, verification_status: "pending", craft: "Iconic carving" },
  ],
  pipili: [
    { id: "mock-w-pl1", full_name: "Pipili Appliqué House", generation_number: 5, verification_status: "master_verified", craft: "Chandua appliqué" },
    { id: "mock-w-pl2", full_name: "Patchwork Craft Collective", generation_number: 2, verification_status: "pending", craft: "Patchwork fabric" },
  ],
  nuapatna: [
    { id: "mock-w-np3", full_name: "Khandua Loom House", generation_number: 4, verification_status: "field_verified", craft: "Khandua silk" },
    { id: "mock-w-np4", full_name: "Ikat Handloom Cooperative", generation_number: 3, verification_status: "pending", craft: "Ikat sarees" },
  ],
  maniabandha: [
    { id: "mock-w-mb1", full_name: "Single-Origin Weave Studio", generation_number: 4, verification_status: "field_verified", craft: "Khandua-Ikat" },
  ],
  gopalpur: [
    { id: "mock-w-gp1", full_name: "Tussar Silk Weavers' Cluster", generation_number: 4, verification_status: "field_verified", craft: "Tussar weaving" },
    { id: "mock-w-gp2", full_name: "Natural Dye Workshop", generation_number: 2, verification_status: "pending", craft: "Vegetable dyeing" },
  ],
  sadeibarani: [
    { id: "mock-w-sd1", full_name: "Dhokra Lost-Wax Foundry", generation_number: 5, verification_status: "master_verified", craft: "Dhokra brass" },
    { id: "mock-w-sd2", full_name: "Tribal Metal Craft House", generation_number: 3, verification_status: "pending", craft: "Brass casting" },
  ],
  kantabania: [
    { id: "mock-w-kb1", full_name: "Paddy Craft Atelier", generation_number: 3, verification_status: "field_verified", craft: "Rice-grain ornament" },
    { id: "mock-w-kb2", full_name: "Grain Idol Studio", generation_number: 2, verification_status: "pending", craft: "Unhusked-rice idols" },
  ],
};

export function MapExplorer() {
  const navigate = useNavigate();
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | "all">("all");
  const [selectedVillage, setSelectedVillage] = useState<CraftVillage | null>(null);
  const [workshopNodes, setWorkshopNodes] = useState<WorkshopNode[]>([]);
  const [activeWorkshop, setActiveWorkshop] = useState<WorkshopNode | null>(null);

  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    void api.artisans.list().then(setArtisans).catch(() => setArtisans([]));
  }, []);

  /* ------------------------------------------------ MapLibre (OSM tiles) */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    void (async () => {
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
        center: [85.4, 20.4],
        zoom: 7.2,
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
  }, [artisans, artworks, workshopNodes, selectedVillage, activeCategory, mapFailed]);

  const villageFilter =
    activeCategory === "all"
      ? undefined
      : ["==", ["get", "category"], activeCategory] as maplibregl.FilterSpecification;

  function paintMap(map: maplibregl.Map) {
    for (const layer of [
      "virasat-villages", "virasat-village-label",
      "virasat-workshops", "virasat-workshop-label",
      "virasat-artworks",
    ]) {
      if (map.getLayer(layer)) map.removeLayer(layer);
    }
    for (const source of ["virasat-villages", "virasat-workshops", "virasat-artworks"]) {
      if (map.getSource(source)) map.removeSource(source);
    }

    /* ---------------------------------------------------- heritage pins */
    const villageGeo = {
      type: "FeatureCollection" as const,
      features: CRAFT_VILLAGES.map((v) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: v.coordinates },
        properties: { id: v.id, name: v.name, category: v.category },
      })),
    };
    map.addSource("virasat-villages", { type: "geojson", data: villageGeo });
    map.addLayer({
      id: "virasat-villages",
      type: "circle",
      source: "virasat-villages",
      filter: villageFilter,
      paint: {
        "circle-radius": [
          "case", ["==", ["get", "id"], selectedVillage?.id ?? ""], 15, 10,
        ],
        "circle-color": [
          "match", ["get", "category"],
          "painting", CATEGORIES.painting.color,
          "textile", CATEGORIES.textile.color,
          "metal", CATEGORIES.metal.color,
          palette.muted,
        ],
        "circle-stroke-width": 2.5,
        "circle-stroke-color": palette.parchment,
        "circle-opacity": 0.92,
      },
    });
    map.addLayer({
      id: "virasat-village-label",
      type: "symbol",
      source: "virasat-villages",
      filter: villageFilter,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": [
          "case", ["==", ["get", "id"], selectedVillage?.id ?? ""],
          palette.gold, palette.parchment,
        ],
        "text-halo-color": palette.black,
        "text-halo-width": 1.2,
      },
    });

    /* -------------------------------------------------- workshop nodes */
    if (workshopNodes.length > 0 && selectedVillage) {
      const fan = workshopNodes.map((node, index) => {
        const ring = 0.001;
        const angle = (index / Math.max(workshopNodes.length, 1)) * Math.PI * 2;
        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [
              selectedVillage.coordinates[0] + Math.cos(angle) * ring,
              selectedVillage.coordinates[1] + Math.sin(angle) * ring,
            ] as [number, number],
          },
          properties: { id: node.id, name: node.full_name },
        };
      });
      map.addSource("virasat-workshops", {
        type: "geojson",
        data: { type: "FeatureCollection" as const, features: fan },
      });
      map.addLayer({
        id: "virasat-workshops",
        type: "circle",
        source: "virasat-workshops",
        paint: {
          "circle-radius": ["case", ["==", ["get", "id"], activeWorkshop?.id ?? ""], 7, 5],
          "circle-color": palette.terracotta,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": palette.gold,
        },
      });
      map.addLayer({
        id: "virasat-workshop-label",
        type: "symbol",
        source: "virasat-workshops",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 9,
          "text-offset": [0, 1.6],
          "text-anchor": "top",
          "text-allow-overlap": false,
        },
        paint: { "text-color": palette.goldSoft, "text-halo-color": palette.black, "text-halo-width": 1.1 },
      });
    }

    /* -------------------------------------------------------- plates ring */
    if (artworks.length > 0 && selectedVillage) {
      const ringGeo = {
        type: "FeatureCollection" as const,
        features: artworks.map((artwork, index) => {
          const angle = (index / Math.max(artworks.length, 1)) * Math.PI * 2;
          const radius = 0.0016;
          return {
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [
                selectedVillage.coordinates[0] + Math.cos(angle) * radius,
                selectedVillage.coordinates[1] + Math.sin(angle) * radius,
              ] as [number, number],
            },
            properties: { heritage_id: artwork.heritage_id, title: artwork.title },
          };
        }),
      };
      map.addSource("virasat-artworks", { type: "geojson", data: ringGeo });
      map.addLayer({
        id: "virasat-artworks",
        type: "circle",
        source: "virasat-artworks",
        paint: {
          "circle-radius": 7,
          "circle-color": palette.gold,
          "circle-stroke-width": 2,
          "circle-stroke-color": palette.black,
        },
      });
    }

    for (const layer of ["virasat-villages", "virasat-workshops", "virasat-artworks"]) {
      if (!map.getLayer(layer)) continue;
      map.on("mouseenter", layer, () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", layer, () => map.getCanvas().style.cursor = "");
    }
  }

  /* ------------------------------------------------------------ handlers */
  function selectVillage(village: CraftVillage) {
    setSelectedVillage(village);
    setActiveWorkshop(null);
    setArtworks([]);
    const realNodes = artisans
      .filter((a) => a.region_name.toLowerCase().includes(village.name.toLowerCase().split(" & ")[0]))
      .map<WorkshopNode>((a) => ({
        id: a.id,
        full_name: a.full_name,
        generation_number: a.generation_number,
        verification_status: a.verification_status,
        craft: village.artforms[0],
        artisan_id: a.id,
      }));
    const nodes = realNodes.length > 0 ? realNodes : (MOCK_WORKSHOPS[village.id] ?? []);
    setWorkshopNodes(nodes);
    mapRef.current?.flyTo({
      center: village.coordinates,
      zoom: village.id === "raghurajpur" ? 12.6 : 9.8,
      speed: 0.7,
      curve: 1.4,
      essential: true,
    });
  }

  function selectWorkshop(node: WorkshopNode) {
    setActiveWorkshop(node);
    if (node.artisan_id) {
      void api.artisans.artworks(node.artisan_id).then(setArtworks).catch(() => setArtworks([]));
    } else {
      setArtworks([]);
    }
  }

  /* ---------------------------------------------------- map interactions */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    const onVillage = (event: maplibregl.MapLayerMouseEvent) => {
      const props = event.features?.[0]?.properties as { id?: string } | undefined;
      const village = CRAFT_VILLAGES.find((v) => v.id === props?.id);
      if (village) selectVillage(village);
    };
    const onWorkshop = (event: maplibregl.MapLayerMouseEvent) => {
      const props = event.features?.[0]?.properties as { id?: string } | undefined;
      const node = workshopNodes.find((n) => n.id === props?.id);
      if (node) selectWorkshop(node);
    };
    const onArtwork = (event: maplibregl.MapLayerMouseEvent) => {
      const props = (event.features?.[0]?.properties ?? {}) as {
        heritage_id?: string; title?: string;
      };
      if (!props.heritage_id) return;
      const heritageId = props.heritage_id;
      void import("maplibre-gl").then((m) => {
        const node = document.createElement("div");
        node.innerHTML = `
          <p style="font-family:Georgia,serif;font-size:14px;color:#0D0D0D">${props.title ?? ""}</p>
          <a href="/passport?id=${heritageId}"
             style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#8B4513">
            Open the heritage passport →
          </a>`;
        node.querySelector("a")?.addEventListener("click", (clickEvent) => {
          clickEvent.preventDefault();
          void navigate(`/passport?id=${encodeURIComponent(heritageId)}`);
        });
        new m.default.Popup({ closeButton: false, offset: 12 })
          .setLngLat((event.lngLat ?? { lng: 0, lat: 0 }) as { lng: number; lat: number })
          .setDOMContent(node)
          .addTo(map);
      });
    };
    map.on("click", "virasat-villages", onVillage);
    map.on("click", "virasat-workshops", onWorkshop);
    map.on("click", "virasat-artworks", onArtwork);
    return () => {
      map.off("click", "virasat-villages", onVillage as never);
      map.off("click", "virasat-workshops", onWorkshop as never);
      map.off("click", "virasat-artworks", onArtwork as never);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef.current, workshopNodes]);

  const visibleVillages = useMemo(
    () => CRAFT_VILLAGES.filter((v) => activeCategory === "all" || v.category === activeCategory),
    [activeCategory],
  );

  function svgPin(v: CraftVillage) {
    const x = 40 + ((v.coordinates[0] - 83.9) / 3.1) * 620;
    const y = 40 + ((21.4 - v.coordinates[1]) / 1.7) * 400;
    const selected = selectedVillage?.id === v.id;
    return (
      <g
        key={v.id}
        onClick={() => selectVillage(v)}
        className="cursor-pointer"
      >
        <circle cx={x} cy={y} r={selected ? 14 : 9} fill={CATEGORIES[v.category].color} opacity="0.95" />
        <circle cx={x} cy={y} r={selected ? 18 : 13} fill="none" stroke={palette.parchment} strokeWidth="1" opacity="0.6" />
        <text x={x} y={y + 22} textAnchor="middle" fill={selected ? palette.gold : palette.parchment} fontSize="10" letterSpacing="1">
          {v.name.toUpperCase()}
        </text>
      </g>
    );
  }

  return (
    <section id="map" className="relative mx-auto max-w-7xl px-6 py-28">
      <div className="mb-14 text-center">
        <p className="eyebrow">The Craft Atlas</p>
        <h2 className="mt-3 font-display text-3xl tracking-wide text-museum-parchment md:text-5xl">
          Heritage Villages of Odisha
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-museum-parchment/60">
          Nine mapped craft clusters — painting, textile and metalwork villages
          with live workshop nodes. Click any pin to fly into its record.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => { setActiveCategory("all"); gsap.to(ringRef.current, { opacity: 0.4, duration: 0.6 }); }}
            className={`rounded-full border px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors ${
              activeCategory === "all"
                ? "border-museum-gold bg-museum-gold text-museum-black"
                : "border-museum-parchment/25 text-museum-parchment/70 hover:border-museum-gold/70 hover:text-museum-gold"
            }`}
          >
            All clusters
          </button>
          {(Object.keys(CATEGORIES) as CategoryKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                activeCategory === key
                  ? "border-museum-gold bg-museum-gold/15 text-museum-gold"
                  : "border-museum-parchment/25 text-museum-parchment/70 hover:border-museum-gold/70 hover:text-museum-gold"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: CATEGORIES[key].color }} />
              {CATEGORIES[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* -------------------------------------------------------- map */}
        <div className="relative lg:col-span-2">
          <div className="relative h-[480px] overflow-hidden rounded-sm hairline bg-[#101010] md:h-[560px]">
            {mapFailed ? (
              <svg viewBox="0 0 700 480" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
                {[70, 140, 210, 280].map((r, i) => (
                  <circle
                    key={r}
                    ref={i === 0 ? ringRef : undefined}
                    className="map-svg-ring"
                    cx="350" cy="240" r={r}
                    fill="none"
                    stroke={palette.gold}
                    strokeOpacity={0.25 - i * 0.05}
                    strokeWidth={1}
                    strokeDasharray="2 7"
                  />
                ))}
                {CRAFT_VILLAGES.map(svgPin)}
                <text x="350" y="452" textAnchor="middle" fill={palette.parchment} fontSize="10" letterSpacing="2" opacity="0.6">
                  MAP TILES OFFLINE — CRAFT ATLAS ILLUSTRATION ACTIVE · CLICK A PIN
                </text>
              </svg>
            ) : (
              <div ref={containerRef} className="absolute inset-0" />
            )}

            <div className="absolute left-4 top-4 rounded-sm border border-museum-gold/40 bg-museum-black/80 px-4 py-2 backdrop-blur">
              <p className="text-[10px] uppercase tracking-[0.24em] text-museum-gold">Craft Atlas</p>
              <p className="font-serif text-sm text-museum-parchment">
                {selectedVillage ? selectedVillage.name : "9 heritage villages · Odisha"}
              </p>
            </div>

            <div className="absolute bottom-4 left-4 hidden flex-col gap-1.5 rounded-sm border border-museum-parchment/10 bg-museum-black/70 p-3 backdrop-blur sm:flex">
              {(Object.keys(CATEGORIES) as CategoryKey[]).map((key) => (
                <span key={key} className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-museum-parchment/70">
                  <span className="h-2 w-2 rounded-full" style={{ background: CATEGORIES[key].color }} />
                  {CATEGORIES[key].label}
                </span>
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
              {visibleVillages.map((village) => (
                <li key={village.id}>
                  <button
                    onClick={() => selectVillage(village)}
                    className={`group flex w-full items-start justify-between gap-3 rounded-sm border p-3 text-left transition-colors ${
                      selectedVillage?.id === village.id
                        ? "border-museum-gold/70 bg-museum-gold/10"
                        : "border-museum-parchment/10 hover:border-museum-gold/60"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: CATEGORIES[village.category].color }}
                      />
                      <span>
                        <span className="block font-serif text-base text-museum-parchment">
                          {village.name}
                        </span>
                        <span className="block text-[10px] uppercase tracking-[0.18em] text-museum-parchment/45">
                          {village.district} · Odisha
                        </span>
                      </span>
                    </span>
                    <ChevronRight size={14} className="mt-1 shrink-0 text-museum-gold/80 transition-transform group-hover:translate-x-1" />
                  </button>
                </li>
              ))}
              {visibleVillages.length === 0 && (
                <li className="text-sm text-museum-parchment/50">No villages in this cluster.</li>
              )}
            </ul>
          </div>

          {selectedVillage && (
            <div className="rounded-sm border border-museum-gold/40 bg-museum-black/50 p-5">
              <p className="eyebrow flex items-center gap-2">
                <MapPin size={13} /> {CATEGORIES[selectedVillage.category].label}
              </p>
              <h3 className="mt-2 font-serif text-2xl text-museum-parchment">{selectedVillage.name}</h3>
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-museum-parchment/45">
                {selectedVillage.district} District · Odisha
              </p>
              <p className="mt-3 text-sm leading-relaxed text-museum-parchment/70">
                {selectedVillage.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedVillage.artforms.map((art) => (
                  <span
                    key={art}
                    className="rounded-full border border-museum-gold/40 px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-museum-gold"
                  >
                    {art}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedVillage && (
            <div className="rounded-sm hairline p-5">
              <p className="eyebrow mb-4">Workshop Nodes</p>
              {workshopNodes.length === 0 ? (
                <p className="text-sm text-museum-parchment/50">Loading workshops…</p>
              ) : (
                <ul className="space-y-2">
                  {workshopNodes.map((node) => (
                    <li key={node.id}>
                      <button
                        onClick={() => selectWorkshop(node)}
                        className={`flex w-full items-center justify-between gap-2 rounded-sm border p-3 text-left transition-colors ${
                          activeWorkshop?.id === node.id
                            ? "border-museum-gold bg-museum-gold/10"
                            : "border-museum-parchment/10 hover:border-museum-gold/50"
                        }`}
                      >
                        <span>
                          <span className="block text-sm text-museum-parchment">{node.full_name}</span>
                          <span className="block text-[10px] uppercase tracking-[0.16em] text-museum-parchment/45">
                            Generation {node.generation_number} · {node.craft}
                          </span>
                        </span>
                        <StatusBadge status={node.verification_status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedVillage && activeWorkshop && (
            <div className="rounded-sm hairline p-5">
              <p className="eyebrow mb-4 flex items-center gap-2">
                <ImageIcon size={14} /> Registered Plates
              </p>
              {artworks.length > 0 ? (
                <ul className="space-y-3">
                  {artworks.map((artwork) => (
                    <li key={artwork.id}>
                      <Link
                        to={`/passport?id=${artwork.heritage_id}`}
                        className="group flex items-center gap-3 rounded-sm border border-museum-parchment/10 p-2.5 transition-colors hover:border-museum-gold/60"
                      >
                        <img
                          src={(plateUrlFor(artwork.heritage_id) ?? artwork.primary_image_url) || undefined}
                          alt={artwork.title}
                          className="h-12 w-10 shrink-0 rounded-sm object-cover"
                          loading="lazy"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-museum-parchment group-hover:text-museum-gold">
                            {artwork.title}
                          </span>
                          <span className="block text-[10px] uppercase tracking-[0.16em] text-museum-parchment/45">
                            {artwork.heritage_id} · {artwork.creation_year}
                          </span>
                        </span>
                        <ChevronRight size={14} className="ml-auto shrink-0 text-museum-gold/80 transition-transform group-hover:translate-x-1" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : activeWorkshop.artisan_id ? (
                <p className="text-sm text-museum-parchment/50">Loading plates…</p>
              ) : (
                <div>
                  <p className="text-sm leading-relaxed text-museum-parchment/60">
                    No plates registered to this cluster yet — field documentation is
                    pending for {selectedVillage.name}.
                  </p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-museum-gold/80">
                    Craft: {selectedVillage.artforms.join(" · ")}
                  </p>
                </div>
              )}
            </div>
          )}

          {!selectedVillage && (
            <div className="rounded-sm border border-dashed border-museum-parchment/20 p-5 text-center">
              <p className="text-sm text-museum-parchment/50">
                Select a pin on the map or a village from the list to explore its
                workshops and registered plates.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}