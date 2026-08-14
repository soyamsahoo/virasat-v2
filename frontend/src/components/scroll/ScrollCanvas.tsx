import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import vertexShader from "./vertex.glsl?raw";
import fragmentShader from "./fragment.glsl?raw";

export interface ScrollCanvasProps {
  src: string;
  planeWidth: number;
  /** Shared mutable uniform — GSAP writes into this object directly. */
  progress: { value: number };
}

/** Anchor plate aspect ratio (532×375) — drives the default framing. */
export const DEFAULT_ASPECT = 532 / 375;
/** Fallback TAU for runtime-friendly math inside this module. */
const TAU = Math.PI * 2;
const CAMERA_FOV = 32;

/** Museum-gradient stand-in plate used while the photograph loads (or if
 *  it ever fails) — the scroll never renders an empty black void. */
function makeFallbackTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1064;
  canvas.height = 750;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 1064, 750);
    grad.addColorStop(0, "#2A2013");
    grad.addColorStop(0.5, "#1C160E");
    grad.addColorStop(1, "#17130C");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1064, 750);
    ctx.strokeStyle = "rgba(197,160,89,0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, 1016, 702);
    ctx.fillStyle = "rgba(197,160,89,0.9)";
    ctx.font = "600 44px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("VIRASAT", 532, 360);
    ctx.fillText("· विरासत ·", 532, 428);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The ShaderMaterial cloth. The only animated state is the shared
 *  `uScrollProgress` uniform, mutated by GSAP outside the Canvas, so
 *  scrubbing never triggers a React re-render. */
function ScrollScene({ src, progress, planeWidth }: ScrollCanvasProps) {
  const [plate, setPlate] = useState<THREE.Texture | null>(null);
  const fallback = useMemo(() => makeFallbackTexture(), []);
  const active = plate ?? fallback;

  /* Load the plate once; keep the fallback stand-in on any network error. */
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(
      src,
      (tex) => {
        if (!alive) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        setPlate(tex);
      },
      undefined,
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [src]);

  /* Wrapped height = planeWidth × aspect; the coil radius must equal
   * height / TAU so the painting wraps 1:1 around the roll. */
  const aspect = useMemo(() => {
    const image = plate?.image as HTMLImageElement | undefined;
    return image?.width && image?.height ? image.width / image.height : DEFAULT_ASPECT;
  }, [plate]);
  const radius = useMemo(() => (planeWidth * aspect) / TAU, [planeWidth, aspect]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        uniforms: {
          uTexture: { value: active },
          uScrollProgress: { value: progress },
          uRadius: { value: radius },
          uAspect: { value: aspect },
        },
      }),
    [],
  );
  useEffect(() => {
    material.uniforms.uTexture.value = active;
  }, [material, active]);
  useEffect(() => {
    material.uniforms.uRadius.value = radius;
  }, [material, radius]);
  useEffect(() => {
    material.uniforms.uAspect.value = aspect;
  }, [material, aspect]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} scale={[1, aspect, 1]}>
      <planeGeometry args={[planeWidth, planeWidth, 64, 64]} />
    </mesh>
  );
}

export function ScrollCanvas({ src, progress, planeWidth }: ScrollCanvasProps) {
  /* Frame the artwork: distance = halfHeight / tan(fov/2) + margin. */
  const cameraDistance =
    (DEFAULT_ASPECT * planeWidth) / 2 / Math.tan((CAMERA_FOV / 2) * (Math.PI / 180)) + 4.2;

  return (
    <Canvas
      flat
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, cameraDistance], fov: CAMERA_FOV }}
      className="!absolute inset-0"
    >
      <ScrollScene src={src} progress={progress} planeWidth={planeWidth} />
    </Canvas>
  );
}