import { useId } from "react";
import type { VerificationOutcome } from "../types";
import { palette } from "../lib/tokens";

interface VerificationSealProps {
  outcome: VerificationOutcome;
  size?: number;
}

const ringColor: Record<VerificationOutcome, string> = {
  verified: palette.emerald,
  tampered: "#7A1F1F",
  not_registered: palette.terracotta,
};

const ringSoft: Record<VerificationOutcome, string> = {
  verified: "#3E8A5A",
  tampered: "#C0392B",
  not_registered: "#C97B3D",
};

/** Antique gold seal with circular text — the verification badge. */
export function VerificationSeal({ outcome, size = 168 }: VerificationSealProps) {
  const pathId = useId();
  const ring = ringColor[outcome];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={`Verification outcome: ${outcome}`}
      className="animate-pulse-gold"
    >
      <defs>
        <path id={pathId} d="M 100,100 m -64,0 a 64,64 0 1,1 128,0 a 64,64 0 1,1 -128,0" />
      </defs>
      <circle cx="100" cy="100" r="96" fill={palette.black} />
      <circle
        cx="100" cy="100" r="94"
        fill="none" stroke={palette.gold} strokeWidth="1.5"
      />
      <circle cx="100" cy="100" r="72" fill="none" stroke={ringSoft[outcome]} strokeWidth="1" />
      <circle
        cx="100" cy="100" r="72" fill="none"
        stroke={ring} strokeWidth="7" strokeOpacity="0.85"
      />
      <text fontSize="15.5" letterSpacing="4" fill={palette.gold} fontWeight="600">
        <textPath href={`#${pathId}`}>
          विरासत · VIRASAT · PROVENANCE REGISTRY · विरासत · VIRASAT ·
        </textPath>
      </text>
      <text x="100" y="104" textAnchor="middle" fontSize="15" fill={palette.parchment} fontWeight="700">
        {outcome === "verified" ? "VERIFIED" : outcome === "tampered" ? "TAMPERED" : "UNREGISTERED"}
      </text>
      <text x="100" y="124" textAnchor="middle" fontSize="9.5" fill={palette.gold} letterSpacing="2">
        {outcome === "verified" ? "SHA-256 MATCH" : outcome === "tampered" ? "DIGEST MISMATCH" : "NO PASSPORT"}
      </text>
    </svg>
  );
}
