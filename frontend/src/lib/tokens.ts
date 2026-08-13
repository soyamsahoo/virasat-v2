/** Design tokens shared across components and the map engine. */
export const palette = {
  black: "#0D0D0D",
  parchment: "#F5F2EB",
  gold: "#C5A059",
  goldSoft: "#E8D9B8",
  terracotta: "#8B4513",
  emerald: "#1B3B2B",
  muted: "#A8A29A",
  hairline: "rgba(245,242,235,0.14)",
} as const;

export const fonts = {
  display: '"Cinzel", serif',
  serif: '"Cormorant Garamond", serif',
  sans: '"Plus Jakarta Sans", sans-serif',
} as const;

/** Mapbox GL zoom state machine — India → Odisha → Raghurajpur → workshop. */
export const mapLevels = {
  overview: { zoom: 4.5, center: [79.09, 21.15] as [number, number], label: "India — National Overview" },
  state: { zoom: 7.5, center: [85.35, 20.1] as [number, number], label: "Odisha — State Cluster" },
  village: { zoom: 14.0, center: [85.8239, 19.8924] as [number, number], label: "Raghurajpur — Heritage Village" },
} as const;

export type MapLevel = keyof typeof mapLevels;

export const statusMeta: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  pending: { label: "Pending", color: palette.terracotta, dot: "#C97B3D" },
  field_verified: { label: "Field Verified", color: palette.gold, dot: palette.gold },
  master_verified: { label: "Master Verified", color: palette.emerald, dot: "#3E8A5A" },
  flagged: { label: "Flagged", color: "#7A1F1F", dot: "#C0392B" },
};
