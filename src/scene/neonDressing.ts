import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type Side,
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
//   - per-window colour, by welding the source model's own window quads into
//     panels and writing vertex colours onto them. A glTF material is one
//     colour for every window it touches; the geometry knows where the
//     windows are, so use that.
//   - additive strips, rings and underglow, which can only ever brighten what
//     is behind them (see the lighthouse beam for why that matters over
//     near-black vinyl).
//   - colours past 1.0 on materials taken off tone mapping, which is the only
//     thing that gets a saturated hue through the bloom threshold at all.
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

// How a neon colour actually gets to glow.
//
// The bloom pass thresholds on Rec.709 luma, which is 72% green: #ff2d8e is
// luma 0.38 and #2de0ff is 0.74, against a play threshold of 0.92. Neither
// blooms at ANY opacity — no amount of turning it up helps, because the hue
// itself can't reach the bar.
//
// Two ways past that, and this uses both:
//   lift  — lerp the hue toward white. Cheap, and it's what a real tube looks
//           like up close, but too much of it turns the colour to paste.
//   gain  — scale the colour past 1.0 and take the material off the renderer's
//           tone mapping, so the pixel reaches the composer as HDR. That's
//           what actually clears the threshold, and the bloom it throws is in
//           the hue rather than white. The core clips toward white when the
//           ToneMapping pass lands at the end of the stack, which is exactly
//           how neon photographs: white core, coloured halo.
const lit = (hex: string, lift: number, gain = 1) =>
  new Color(hex).lerp(WHITE, lift).multiplyScalar(gain);

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

// A surface that IS the light — a lamp lens, a headlight, an awning lit from
// underneath. Opaque, so it keeps its shape, but off the light rig and pushed
// past 1.0 so it blooms.
const unlitNeon = (hex: string, lift: number, gain: number) =>
  new MeshBasicMaterial({ color: lit(hex, lift, gain), toneMapped: false });

// A strip, ring or spill: additive and never writing depth, so it brightens
// whatever it crosses instead of cutting a hole in it.
//
// `side` matters more than it looks. Additive layers stack, so a closed box
// wrapped round a tower contributes its near wall, its far wall and its top
// and bottom all to the same pixel and saturates to white however low the
// gain goes. Anything that wraps something wants an open shell and FrontSide,
// so exactly one wall is in front of the camera.
function glowMaterial(
  hex: string,
  lift: number,
  opacity: number,
  gain = 1.45,
  side: Side = DoubleSide,
) {
  return new MeshBasicMaterial({
    color: lit(hex, lift, gain),
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    side,
    // r3f tone-maps the renderer AND runs a ToneMapping pass; without this the
    // renderer would roll the gain off before the bloom ever saw it
    toneMapped: false,
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

// Repaint the mesh carrying `matName` as unlit, one colour per PANEL, where a
// panel is a set of triangles joined by shared vertices.
//
// The first version of this coloured per triangle off the triangle's own
// centroid, and a window is two triangles whose centroids sit either side of
// its diagonal — so the two halves landed on different floors and different
// lit/unlit rolls, and every pane came out as two clashing triangles. Welding
// the triangles into panels first is the fix, and it holds whatever size the
// source model's windows happen to be.
function paintPanels(
  root: Object3D,
  matName: string,
  pick: (centre: Vector3, box: Box3) => Color,
): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    if ((mesh.material as MeshBasicMaterial)?.name !== matName) return;

    // non-indexed so each triangle owns its three vertices and can be given a
    // colour without bleeding into a neighbour
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    const position = geometry.attributes.position as BufferAttribute;
    const box = new Box3().setFromBufferAttribute(position);
    const triangles = position.count / 3;

    // union-find: two triangles that share a vertex position are the same panel
    const parent = Int32Array.from({ length: triangles }, (_, i) => i);
    const find = (i: number): number => {
      let root = i;
      while (parent[root] !== root) root = parent[root];
      while (parent[i] !== root) [i, parent[i]] = [parent[i], root];
      return root;
    };
    const corners = new Map<string, number>();
    const at = new Vector3();
    for (let t = 0; t < triangles; t++) {
      for (let v = 0; v < 3; v++) {
        at.fromBufferAttribute(position, t * 3 + v);
        const key = `${Math.round(at.x * 1e4)},${Math.round(at.y * 1e4)},${Math.round(at.z * 1e4)}`;
        const other = corners.get(key);
        if (other === undefined) corners.set(key, t);
        else {
          const a = find(other);
          const b = find(t);
          if (a !== b) parent[b] = a;
        }
      }
    }

    // one centre, and so one colour, per panel
    const centres = new Map<number, { sum: Vector3; n: number }>();
    for (let t = 0; t < triangles; t++) {
      const panel = find(t);
      let entry = centres.get(panel);
      if (!entry) {
        entry = { sum: new Vector3(), n: 0 };
        centres.set(panel, entry);
      }
      for (let v = 0; v < 3; v++)
        entry.sum.add(at.fromBufferAttribute(position, t * 3 + v));
      entry.n += 3;
    }
    const paint = new Map<number, Color>();
    for (const [panel, { sum, n }] of centres)
      paint.set(panel, pick(sum.divideScalar(n), box));

    const colors = new Float32Array(position.count * 3);
    for (let t = 0; t < triangles; t++) {
      const c = paint.get(find(t)) as Color;
      for (let v = 0; v < 3; v++) {
        colors[(t * 3 + v) * 3] = c.r;
        colors[(t * 3 + v) * 3 + 1] = c.g;
        colors[(t * 3 + v) * 3 + 2] = c.b;
      }
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    mesh.geometry = geometry;
    // toneMapped off for the same reason as the glow strips: the colours below
    // are pushed past 1.0 so the bloom pass can see them
    mesh.material = new MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    });
  });
}

// ------------------------------------------------------------------ props ---

const FLOORS = 6;

// The tower's glass is left as the night repaint made it — dark, reflecting
// the dusk — and the colour goes on as light fittings instead.
//
// This started out repainting the curtain wall itself, one hue per floor.
// Kenney's tower is nearly all glass, so that turned the whole building into
// a stack of coloured stripes: the tower stopped being a tower and became a
// swatch. Bands wrapped round it read as a lit building because the building
// is still there behind them.
function dressTower(root: Object3D) {
  inLocalFrame(root, (size) => {
    // An open four-sided tube turned 45°, so its flats sit just off the
    // tower's four walls: a ring of light round the building with no lid and
    // no far wall to double up on.
    const ring = (size.x / 2) * Math.SQRT2 * 1.03;
    for (let i = 0; i < FLOORS; i++) {
      const band = new Mesh(
        new CylinderGeometry(ring, ring, size.y * 0.012, 4, 1, true),
        glowMaterial(HUES[i % HUES.length], 0.06, 0.9, 1.5, FrontSide),
      );
      band.rotation.y = Math.PI / 4;
      band.position.y = size.y * ((i + 0.7) / (FLOORS + 0.6));
      // each band on its own clock, slower the higher it goes
      root.add(pulsing(band, 0.16, 2.4 - i * 0.22, i * 1.7));
    }

    // a crown, so the tallest thing on the island doesn't just stop
    const crown = new Mesh(
      new CylinderGeometry(
        ring * 0.98,
        ring * 0.98,
        size.y * 0.016,
        4,
        1,
        true,
      ),
      glowMaterial(SIGN_CYAN, 0.06, 0.85, 1.5, FrontSide),
    );
    crown.rotation.y = Math.PI / 4;
    crown.position.y = size.y * 0.985;
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
    if (h < 0.16) return DARK;
    // pushed past 1.0 so the bloom pass catches the lit panes; the dark ones
    // stay where they are
    return lit(HUES[Math.floor(h * HUES.length)], 0.1, 1.45);
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
      mesh.material = unlitNeon(SIGN_CYAN, 0.3, 1.9); // headlights, brightest
      pulsing(mesh, 0.1, 3.4, 0.2);
    } else if (name === "TailLights") {
      mesh.material = unlitNeon("#ff2f4f", 0.2, 1.5);
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
      mesh.material = unlitNeon(SIGN_CYAN, 0.28, 1.8);
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
      mesh.material = unlitNeon(SIGN_MAGENTA, 0.16, 1.35);
      pulsing(mesh, 0.16, 3.1, 2.2);
    } else if (name === "Beige") {
      mesh.material = unlitNeon(SIGN_CYAN, 0.16, 1.35);
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
