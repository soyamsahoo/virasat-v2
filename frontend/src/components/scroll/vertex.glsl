/* VIRASAT scroll-unroll vertex shader.
 *
 * The cloth is a 64x64 PlaneGeometry. Each vertex carries a position in
 * the flat plane (x along the scroll axis, y along the cloth) and a uv.
 * We warp every vertex into a cylinder when rolled, then mix() it back
 * into its flat slot as the user scrolls.
 */
uniform float uScrollProgress; // 0.0 = tightly rolled, 1.0 = fully flat
uniform float uRadius;         // coil radius = wrap length / TAU
uniform float uAspect;         // plate aspect (w/h) — the mesh is scaled
                               // by this on Y, so rolled Y is pre-divided
                               // to keep the coil cross-section circular

varying vec2 vUv;

#define TAU 6.283185307179586

void main() {
  vUv = uv;

  // ------------------------------------------------------------------
  // Cylinder wrap (rolled state, uScrollProgress = 0):
  //
  // A circle of radius r is parametrised as (r·sinθ, r·cosθ) in the
  // (y, z) plane. The plane's full height must land exactly on the
  // circle once, so the circumference equals the cloth height H and
  // the radius is r = H / TAU (classic unroll: 2πr = H).
  //
  // θ derives from the vertical texture coordinate: θ = (1 - v) · TAU.
  // v = 1 (top row of the patta) sits at θ = 0, v = 0 (bottom row)
  // sits at θ = 2π, so each texel row gets exactly one angular slot
  // around the coil and the painting never stretches.
  // ------------------------------------------------------------------
  float angle = (1.0 - vUv.y) * TAU;

  // Rolled position: the axis runs along x (unchanged), y rises and
  // falls with sin(θ), z sweeps the depth.
  //   z = -r·cosθ  →  θ = 0   ⇒ z = -r (seam pressed against the back)
  //                   θ = π   ⇒ z = +r (front face of the coil, camera)
  //
  // The mesh is scaled by uAspect on Y (to stretch the cloth to its
  // real plate ratio), which would squash the coil into an ellipse —
  // dividing the rolled Y by uAspect first keeps the cross-section a
  // perfect circle in world space while the flat state is unaffected.
  vec3 rolled = vec3(
    position.x,
    (uRadius * sin(angle)) / uAspect,
    -uRadius * cos(angle)
  );

  // Flat position is simply the plane resting at z = 0.
  vec3 flat = vec3(position.x, position.y, 0.0);

  // Smooth the progress so the scrub lingers in the fully rolled and
  // fully flat states instead of easing straight through both extremes.
  float e = uScrollProgress * uScrollProgress * (3.0 - 2.0 * uScrollProgress);

  // mix() interpolates vertex-by-vertex: at e = 0 every vertex sits on
  // the cylinder, at e = 1 every vertex lies in the flat plane.
  vec3 displaced = mix(rolled, flat, e);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}