/* VIRASAT scroll-unroll fragment shader.
 *
 * With the vertices wrapped into a cylinder there are no rasterised
 * normals to light by, so the shading is computed analytically from the
 * same angular mapping the vertex shader uses. The coiled cloth lives
 * in warm lamplight with a natural ambient occlusion on its hidden
 * face; unrolling returns the plate to full museum-grade colour.
 */
uniform sampler2D uTexture;      // the Pattachitra plate
uniform float uScrollProgress;   // 0.0 rolled → 1.0 flat

varying vec2 vUv;

#define TAU 6.283185307179586

void main() {
  vec4 texel = texture2D(uTexture, vUv);

  // Smooth the progress exactly like the vertex shader so the lighting
  // and the geometry stay in lockstep during the scrub.
  float e = uScrollProgress * uScrollProgress * (3.0 - 2.0 * uScrollProgress);

  // Same angular slot as the vertex shader: θ = (1 - v) · TAU.
  float angle = (1.0 - vUv.y) * TAU;

  // The coil's outward normal is the derivative of the wrap
  // (r·sinθ, -r·cosθ) ⇒ (cosθ, sinθ), so normal.z = sinθ. Rows on the
  // camera-facing arc (0 < θ < π) take the light; rows folded behind
  // the front arc (θ > π, the lower band of the painting) face into
  // the roll and fall into shadow — a natural cloth-fall AO.
  float facing = clamp(sin(angle), 0.0, 1.0);

  // Ambient occlusion: when rolled, the hidden face drops to ~28 %
  // brightness; as the cloth flattens, every texel reaches 100 %.
  float shade = mix(0.28 + 0.72 * facing, 1.0, e);

  vec3 colour = texel.rgb * shade;

  // Museum lamplight while coiled — a warm, golden glow that narrows to
  // the lit face, so the rolled cloth reads as lit cloth, not as a pale
  // plastic tube. True colour returns only at full unroll.
  vec3 lamplight = vec3(0.88, 0.75, 0.58) * (0.75 + 0.25 * facing);
  colour = mix(colour * lamplight, colour, e);

  // Soft edge vignette while coiled so the visible band of the wrapped
  // cloth melts away into the showcase darkness.
  float vig = smoothstep(0.0, 0.8, length(vUv - 0.5) * 2.0);
  colour *= 1.0 - vig * (0.45 * (1.0 - e));

  gl_FragColor = vec4(colour, texel.a);
}