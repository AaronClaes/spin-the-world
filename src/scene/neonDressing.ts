import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  SphereGeometry,
  Vector3,
} from "three";

// Neon, added on top of the kitbash.
//
// The city props are CC0 daylight models. `recolor` in build-diorama.mjs takes
// them to night — dark walls, a warm emissive in the glass — and that got the
// island as far as "a city block after dark". It wasn't a NEON city: one lit
// sign on an otherwise unlit block. Neon is the point of this record, so the
// lights are put on here, at load, where three.js can do things a glTF
// material can't:
//
//   - per-floor and per-window colour, by writing vertex colours onto the
//     window quads the source model already has and swapping the material to
//     an unlit one. A glTF material is one colour for every window it touches;
//     the geometry knows where the windows are, so use that.
//   - additive strips, rings and underglow, which can only ever brighten what
//     is behind them (see the lighthouse beam for why that matters over
//     near-black vinyl).
//
// Everything lit here is registered for the slow pulse in Diorama.tsx, so no
// two lights on the island breathe together.
//
// IMPORTANT: usePropClone hands out `template.clone(true)`, which SHARES
// geometry and materials with drei's GLTF cache. Everything below clones
// geometry before writing to it and assigns fresh materials — mutating in
// place would repaint every copy of the prop in every record, permanently.

const WHITE = new Color("#ffffff");

// Pulled off the reference: magenta and cyan carry it, violet and pink fill
// in, and one warm amber keeps the whole thing from reading as two colours.
const HUES = ["#ff2d8e", "#2de0ff", "#b45cff", "#ff7ae0", "#ffab3d"];
// An unlit panel. Not black — a window with the light off still catches the
// sky, and pure black next to a lit pane reads as a hole in the building.
const DARK = new Color("#1a1826");

const SIGN_MAGENTA = "#ff2d8e";
const SIGN_CYAN = "#2de0ff";

// Bloom thresholds on luminance, which is mostly green — a saturated magenta
// can't reach the threshold at any brightness. Lifting a hue toward white
// keeps the colour while getting the pixel bright enough to bloom, which is
// also what a real tube looks like: white core, coloured spill.
const lit = (hex: string, lift: number) => new Color(hex).lerp(WHITE, lift);

// deterministic — the same window is the same colour every run
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// ------------------------------------------------------------- the pulse ---

// Any mesh tagged here breathes; Diorama.tsx collects them off the clone and
// drives them. Stored on the mesh rather than in a list so the tag survives
// the clone and the Diorama needs no per-prop knowledge.
export interface NeonPulse {
  base: Color; // the colour at full burn
  depth: number; // how far down it dips
  speed: number;
  phase: number;
}

function pulsing(mesh: Mesh, depth: number, speed: number, phase: number) {
  const material = mesh.material as MeshBasicMaterial;
  (mesh.userData as { neon?: NeonPulse }).neon = {
    base: material.color.clone(),
    depth,
    speed,
    phase,
  };
  return mesh;
}

// ------------------------------------------------------------- primitives ---

// A strip, ring or glow: unlit, additive, and never writing depth, so it
// brightens whatever it crosses instead of cutting a hole in it.
function glowMaterial(hex: string, lift: number, opacity: number) {
  return new MeshBasicMaterial({
    color: lit(hex, lift),
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}

// Bounds in the prop root's OWN frame, which is the frame anything added as
// its child will be positioned in.
//
// Box3.setFromObject walks world matrices, and a cloned prop's root carries
// the normalising scale the build script baked in (a water tower is 9.4 units
// tall in the source and 0.3 on the island). Measured naively, every added
// light landed at thirty times the height it was meant to. Flattening the
// root's transform for the measurement is the fix; `fn` runs inside that
// window so anything else that needs local-space bounds gets them too.
function inLocalFrame<T>(
  root: Object3D,
  fn: (size: Vector3, box: Box3) => T,
): T {
  const position = root.position.clone();
  const quaternion = root.quaternion.clone();
  const scale = root.scale.clone();
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const box = new Box3().setFromObject(root);
  const result = fn(box.getSize(new Vector3()), box);

  root.position.copy(position);
  root.quaternion.copy(quaternion);
  root.scale.copy(scale);
  root.updateMatrixWorld(true);
  return result;
}

// Repaint the mesh carrying `matName` as unlit, with a colour chosen per
// triangle. `pick` gets the triangle's centroid and the mesh's own bounds;
// quantising the centroid inside `pick` is what keeps a quad's two triangles
// the same colour.
function paintPanels(
  root: Object3D,
  matName: string,
  pick: (c: Vector3, box: Box3) => Color,
): Mesh | null {
  let painted: Mesh | null = null;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as MeshBasicMaterial;
    if (material?.name !== matName) return;

    // non-indexed so no vertex is shared between two windows — a shared
    // corner would blend two hues across both of them
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    const position = geometry.attributes.position as BufferAttribute;
    const box = new Box3().setFromBufferAttribute(position);

    const colors = new Float32Array(position.count * 3);
    const a = new Vector3();
    const centroid = new Vector3();
    for (let t = 0; t < position.count; t += 3) {
      centroid.set(0, 0, 0);
      for (let v = 0; v < 3; v++)
        centroid.add(a.fromBufferAttribute(position, t + v));
      centroid.divideScalar(3);
      const paint = pick(centroid, box);
      for (let v = 0; v < 3; v++) {
        colors[(t + v) * 3] = paint.r;
        colors[(t + v) * 3 + 1] = paint.g;
        colors[(t + v) * 3 + 2] = paint.b;
      }
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    mesh.geometry = geometry;
    mesh.material = new MeshBasicMaterial({ vertexColors: true });
    painted = mesh;
  });
  return painted;
}

// ------------------------------------------------------------------ props ---

const FLOORS = 8;

function dressTower(root: Object3D) {
  // Every floor its own colour, taken from the window quads the model already
  // has — banding the outside would have been a stack of stripes bolted to a
  // dark box; this is the building's own glass, lit.
  //
  // The floor picks the hue, the panel decides whether it's on. Lighting every
  // panel of every floor made a candy-striped monolith: a tower reads as a
  // tower because some of it is dark.
  paintPanels(root, "window", (c, box) => {
    const h = Math.max(1e-6, box.max.y - box.min.y);
    const floor = Math.floor(((c.y - box.min.y) / h) * FLOORS);
    const panel = hash(Math.round(c.x * 260), floor, Math.round(c.z * 260));
    if (panel < 0.42) return DARK;
    // barely lifted: these panels are large, and at the lift that suits a
    // thin tube they came out pastel, which read as a painted building
    return lit(HUES[floor % HUES.length], 0.08);
  });

  inLocalFrame(root, (size) => {
    // a crown, so the tallest thing on the island doesn't just stop
    const crown = new Mesh(
      new BoxGeometry(size.x * 1.05, size.y * 0.016, size.z * 1.05),
      glowMaterial(SIGN_CYAN, 0.12, 0.8),
    );
    crown.position.y = size.y * 0.99;
    root.add(pulsing(crown, 0.18, 1.3, 0.4));

    // and a vertical sign running down one corner — the detail that makes a
    // tower read as somebody's tower rather than an office block
    const spine = new Mesh(
      new BoxGeometry(size.x * 0.05, size.y * 0.44, size.z * 0.12),
      glowMaterial(SIGN_MAGENTA, 0.18, 0.9),
    );
    spine.position.set(size.x * 0.52, size.y * 0.64, size.z * 0.52);
    root.add(pulsing(spine, 0.3, 2.1, 1.9));
  });
}

function dressBlock(root: Object3D) {
  // Windows lit at random out of the palette, which is what a residential
  // block looks like from outside: everyone's lamp is a different colour, and
  // a few of them are out.
  paintPanels(root, "window", (c) => {
    const h = hash(
      Math.round(c.x * 90),
      Math.round(c.y * 90),
      Math.round(c.z * 90),
    );
    if (h < 0.14) return DARK;
    return lit(HUES[Math.floor(h * HUES.length)], 0.1);
  });

  inLocalFrame(root, (size) => {
    // a shop sign over the street frontage
    const sign = new Mesh(
      new BoxGeometry(size.x * 0.48, size.y * 0.07, size.z * 0.05),
      glowMaterial(SIGN_CYAN, 0.15, 0.9),
    );
    sign.position.set(0, size.y * 0.22, size.z * 0.52);
    root.add(pulsing(sign, 0.34, 2.8, 0.9));
  });
}

function dressTaxi(root: Object3D) {
  // headlights and tail lights are their own materials in the source, so they
  // just need taking off the light rig
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const name = (mesh.material as MeshBasicMaterial)?.name;
    if (name === "Headlights") {
      mesh.material = new MeshBasicMaterial({ color: lit(SIGN_CYAN, 0.3) });
      pulsing(mesh, 0.1, 3.4, 0.2);
    } else if (name === "TailLights") {
      mesh.material = new MeshBasicMaterial({ color: lit("#ff2f4f", 0.3) });
      pulsing(mesh, 0.14, 2.6, 2.4);
    }
  });

  // underglow — a flat disc of light on the road under the car
  inLocalFrame(root, (size) => {
    const under = new Mesh(
      new CircleGeometry(Math.max(size.x, size.z) * 0.46, 20),
      glowMaterial(SIGN_MAGENTA, 0.12, 0.5),
    );
    under.rotation.x = -Math.PI / 2;
    under.position.y = size.y * 0.03;
    root.add(pulsing(under, 0.22, 1.7, 3.1));
  });
}

function dressLamp(root: Object3D) {
  const heads: Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && (mesh.material as MeshBasicMaterial)?.name === "Light") {
      mesh.material = new MeshBasicMaterial({ color: lit(SIGN_CYAN, 0.28) });
      heads.push(pulsing(mesh, 0.12, 2.2, 1.1));
    }
  });
  if (!heads.length) return;
  // a soft ball of spill around the head, so the lamp lights something
  inLocalFrame(root, (size) => {
    const at = new Box3().setFromObject(heads[0]).getCenter(new Vector3());
    const halo = new Mesh(
      new SphereGeometry(Math.max(size.x, size.z) * 0.34, 10, 8),
      glowMaterial(SIGN_CYAN, 0.05, 0.3),
    );
    halo.position.copy(at);
    root.add(pulsing(halo, 0.2, 2.2, 1.1));
  });
}

function dressStall(root: Object3D) {
  // The awning arrives as red-and-white canvas in two materials, one per
  // stripe. Taking both off the light rig turns the whole canopy into the
  // stall's sign — which is what a night-market awning is: the brightest
  // thing on the stall, lighting the person under it.
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const name = (mesh.material as MeshBasicMaterial)?.name;
    if (name === "RoofTiles_Red") {
      mesh.material = new MeshBasicMaterial({ color: lit(SIGN_MAGENTA, 0.16) });
      pulsing(mesh, 0.16, 3.1, 2.2);
    } else if (name === "Beige") {
      mesh.material = new MeshBasicMaterial({ color: lit(SIGN_CYAN, 0.16) });
      pulsing(mesh, 0.16, 3.1, 3.9);
    }
  });

  // and a puddle of its own light on the pavement in front
  inLocalFrame(root, (size) => {
    const spill = new Mesh(
      new CircleGeometry(Math.max(size.x, size.z) * 0.7, 18),
      glowMaterial(SIGN_MAGENTA, 0.1, 0.34),
    );
    spill.rotation.x = -Math.PI / 2;
    spill.position.y = size.y * 0.012;
    root.add(pulsing(spill, 0.24, 3.1, 2.2));
  });
}

function dressWatertower(root: Object3D) {
  // a lit band around the tank, the way a water tower carries a town name.
  // Sized off the widest point rather than the tank, or it sits inside the
  // tank and lights nothing.
  inLocalFrame(root, (size) => {
    const r = Math.max(size.x, size.z) * 0.62;
    const band = new Mesh(
      new CylinderGeometry(r, r, size.y * 0.05, 12, 1, true),
      glowMaterial(SIGN_CYAN, 0.1, 0.5),
    );
    band.position.y = size.y * 0.84;
    root.add(pulsing(band, 0.26, 1.9, 0.7));
  });
}

// One entry per prop that gets lit. Anything not listed is left as the
// kitbash built it — the dumpster and the hydrant are the dark that the neon
// needs to be bright against.
export const DRESSING: Record<string, (o: Object3D) => void> = {
  tower: dressTower,
  block: dressBlock,
  taxi: dressTaxi,
  lamp: dressLamp,
  stall: dressStall,
  watertower: dressWatertower,
};

export function dressProp(prop: string, object: Object3D): Object3D {
  DRESSING[prop]?.(object);
  return object;
}
