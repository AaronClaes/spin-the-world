import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
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
// them to night, and that got the island as far as "a city block after dark".
// It wasn't a NEON city: one lit sign on an otherwise unlit block. Neon is the
// point of this record, so the lights are put on here, at load, where three.js
// can do things a glTF material can't:
//
//   - per-window colour, by welding the source model's own geometry into
//     panels and lighting the ones that are window-shaped. This is the whole
//     ball game on KayKit's city pack, which samples ONE material for every
//     building, car and bin it ships: there is no `window` material to repaint
//     and no way to make one, but the geometry still knows where the windows
//     are, so use that instead.
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

// Light a mesh's window panes, one colour each, by welding its triangles into
// PANELS — sets joined by shared vertex positions — and asking `pick` what
// colour each one burns in.
//
// Selection is by shape, not by material name. It has to be: Kay's whole city
// samples one material off one gradient atlas, so there is no `window` to look
// up the way Kenney's block had, and a repaint that found the panes would find
// the parapet with them. Welding is what makes shape work at all. A window
// arrives as four unrelated pieces — pane, mullion, sill, lintel — none of
// which mean anything alone; welded, the pane is a flat quad and the wall it
// sits in is a single 2.0 × 2.85 shell, and telling those apart is a size
// comparison. The mullions fall just under the width cut and stay grey, which
// is what gives every lit pane its cross-bar.
//
// The lit panels are COPIED into a new mesh laid a hair proud of the surface
// they came from, rather than repainting in place: the building keeps the
// texture the kitbash gave it and the light goes on top of it.
//
// The first version of this coloured per triangle off the triangle's own
// centroid, and a pane is two triangles whose centroids sit either side of its
// diagonal — so the two halves landed on different floors and different
// lit/unlit rolls, and every window came out as two clashing triangles.
// Welding fixed that too, and holds whatever size the source windows happen to
// be.
const LIFT = 0.004; // source units, along the panel's own normal

function litPanels(
  root: Object3D,
  pick: (size: Vector3, centre: Vector3, up: number) => Color | null,
): void {
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });

  for (const mesh of meshes) {
    // non-indexed so each triangle owns its three vertices and can be lit
    // without bleeding into a neighbour
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry;
    const position = geometry.attributes.position as BufferAttribute;
    const triangles = position.count / 3;

    // union-find: two triangles that share a vertex position are one panel
    const parent = Int32Array.from({ length: triangles }, (_, i) => i);
    const find = (i: number): number => {
      let top = i;
      while (parent[top] !== top) top = parent[top];
      while (parent[i] !== top) [i, parent[i]] = [parent[i], top];
      return top;
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

    // one box and one summed normal per panel, so the pick sees a window
    // rather than a triangle
    const panels = new Map<number, { box: Box3; normal: Vector3 }>();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const cross = new Vector3();
    for (let t = 0; t < triangles; t++) {
      const id = find(t);
      let panel = panels.get(id);
      if (!panel) {
        panel = { box: new Box3().makeEmpty(), normal: new Vector3() };
        panels.set(id, panel);
      }
      a.fromBufferAttribute(position, t * 3);
      b.fromBufferAttribute(position, t * 3 + 1);
      c.fromBufferAttribute(position, t * 3 + 2);
      panel.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      // area-weighted, so a panel's few big triangles outvote its slivers
      panel.normal.add(cross.crossVectors(b.sub(a), c.sub(a)));
    }

    const size = new Vector3();
    const centre = new Vector3();
    const chosen = new Map<number, { color: Color; offset: Vector3 }>();
    for (const [id, panel] of panels) {
      panel.box.getSize(size);
      panel.box.getCenter(centre);
      const normal = panel.normal.clone().normalize();
      const color = pick(size, centre, Math.abs(normal.y));
      if (color) chosen.set(id, { color, offset: normal.multiplyScalar(LIFT) });
    }
    if (!chosen.size) continue;

    const points: number[] = [];
    const colors: number[] = [];
    for (let t = 0; t < triangles; t++) {
      const hit = chosen.get(find(t));
      if (!hit) continue;
      for (let v = 0; v < 3; v++) {
        at.fromBufferAttribute(position, t * 3 + v).add(hit.offset);
        points.push(at.x, at.y, at.z);
        colors.push(hit.color.r, hit.color.g, hit.color.b);
      }
    }

    const lights = new BufferGeometry();
    lights.setAttribute("position", new Float32BufferAttribute(points, 3));
    lights.setAttribute("color", new Float32BufferAttribute(colors, 3));
    // Added as a CHILD of the mesh it was copied from, so it inherits that
    // mesh's transform and the copied positions need no conversion.
    // toneMapped off for the same reason as the glow strips: these colours are
    // pushed past 1.0 so the bloom pass can see them.
    mesh.add(
      new Mesh(
        lights,
        new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      ),
    );
  }
}

// What a window pane measures, in the pack's own units. Absolute rather than a
// fraction of the model, because the whole city is drawn to one scale
// (packScale, build-diorama.mjs) — Kay drew the window once and it is the same
// window on the four-storey and on the corner shop.
const PANE_FLAT = 0.02; // a pane is a quad: no thickness worth the name
const PANE_H = [0.1, 0.6];
const PANE_W = [0.05, 0.5]; // the low end is what excludes the mullions
const DARK_ODDS = 0.22; // how many windows have the light off

function lightWindows(root: Object3D): void {
  litPanels(root, (size, centre, up) => {
    const flat = Math.min(size.x, size.z);
    const wide = Math.max(size.x, size.z);
    const isPane =
      flat < PANE_FLAT &&
      size.y > PANE_H[0] &&
      size.y < PANE_H[1] &&
      wide > PANE_W[0] &&
      wide < PANE_W[1] &&
      up < 0.5; // a floor or a roof is not a window
    if (!isPane) return null;
    // Lit at random out of the palette, which is what a block of flats looks
    // like from outside: everyone's lamp is a different colour and a few of
    // them are out. Deterministic off the pane's own position, so the same
    // window is the same colour every run.
    const h = hash(
      Math.round(centre.x * 90),
      Math.round(centre.y * 90),
      Math.round(centre.z * 90),
    );
    if (h < DARK_ODDS) return DARK;
    // pushed past 1.0 so the bloom pass catches the lit panes; the dark ones
    // stay where they are
    return lit(HUES[Math.floor(h * HUES.length)], 0.1, 1.45);
  });
}

// The horizontal box of everything above `y`, in the prop's own frame.
//
// Kay's tall building is a 2.0-wide block for four fifths of its height and a
// 1.2-wide shaft above that, offset to one side. A band sized off the whole
// bounding box therefore hangs a third of itself in the air beside the shaft,
// which is what the tower's top two rings were doing. Buildings only ever step
// INWARD going up, so "what is above this height" is exactly what a band at
// this height has to wrap — and it gives the band its centre as well as its
// size, which matters here because the setback is not concentric.
function above(root: Object3D, y: number): Box3 {
  const box = new Box3().makeEmpty();
  const at = new Vector3();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      at.fromBufferAttribute(position, i);
      mesh.localToWorld(at); // root is flattened, so this lands in root space
      if (at.y >= y) box.expandByPoint(at);
    }
  });
  return box.isEmpty() ? new Box3().setFromObject(root) : box;
}

// The centroid of everything in the top `band` of a prop, in the prop's own
// frame. Reads a lamp head off the geometry instead of hard-coding an offset
// to it, which is what lets one function light a street lamp whose boom hangs
// left and a pedestrian signal that has no boom at all.
function headOf(root: Object3D, box: Box3, band: number): Vector3 {
  const floor = box.max.y - (box.max.y - box.min.y) * band;
  const sum = new Vector3();
  const at = new Vector3();
  let n = 0;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      at.fromBufferAttribute(position, i);
      mesh.localToWorld(at); // root is flattened, so this lands in root space
      if (at.y >= floor) {
        sum.add(at);
        n++;
      }
    }
  });
  return n ? sum.divideScalar(n) : box.getCenter(new Vector3());
}

// ------------------------------------------------------------------ props ---

const FLOORS = 4; // Kay's tall building has four storeys, so four bands

// The tall one. Its windows light like every other building's, and the colour
// that makes it the tower goes on as fittings: bands round it, a crown, and a
// sign down one corner.
//
// This started out repainting the facade itself, one hue per floor, which
// turned the whole building into a stack of coloured stripes: it stopped being
// a tower and became a swatch. Bands wrapped round it read as a lit building
// because the building is still there behind them.
function dressTower(root: Object3D) {
  lightWindows(root);
  inLocalFrame(root, (size, box) => {
    // An open four-sided tube turned 45°, so its flats sit just off the
    // tower's four walls: a ring of light round the building with no lid and
    // no far wall to double up on.
    //
    // Scaled and centred per axis off `above`, NOT off one radius on the whole
    // model. Kenney's tower was square in plan and concentric all the way up,
    // so a single circumscribing radius fitted every band on it; Kay's is 2.0
    // wide by 1.3 deep and steps in to 1.2 near the top, off to one side.
    // Turned 45°, a unit tube's flats sit at 1/√2 from the axis, so the scale
    // that lands them on the walls is half the width times √2.
    const wrap = (
      hue: string,
      at: number,
      thickness: number,
      opacity: number,
      out: number,
    ) => {
      const y = box.min.y + size.y * at;
      const shaft = above(root, y);
      const span = shaft.getSize(new Vector3());
      const mesh = new Mesh(
        new CylinderGeometry(1, 1, size.y * thickness, 4, 1, true),
        glowMaterial(hue, 0.06, opacity, 1.5, FrontSide),
      );
      mesh.rotation.y = Math.PI / 4;
      mesh.scale.set(
        (span.x / 2) * Math.SQRT2 * 1.05 * out,
        1,
        (span.z / 2) * Math.SQRT2 * 1.05 * out,
      );
      const middle = shaft.getCenter(new Vector3());
      mesh.position.set(middle.x, y, middle.z);
      return mesh;
    };

    for (let i = 0; i < FLOORS; i++) {
      // each band on its own clock, slower the higher it goes
      const at = (i + 0.7) / (FLOORS + 0.6);
      root.add(
        pulsing(
          wrap(HUES[i % HUES.length], at, 0.012, 0.9, 1),
          0.16,
          2.4 - i * 0.22,
          i * 1.7,
        ),
      );
    }

    // a crown, so the tallest thing on the island doesn't just stop
    root.add(
      pulsing(wrap(SIGN_CYAN, 0.985, 0.016, 0.85, 0.98), 0.18, 1.3, 0.4),
    );

    // And a vertical sign running down one corner — the detail that makes a
    // tower read as somebody's tower rather than an office block. Hung off the
    // shaft's corner rather than the model's, for the same reason as the bands.
    const shaft = above(root, box.min.y + size.y * 0.86);
    const spine = new Mesh(
      new BoxGeometry(size.x * 0.05, size.y * 0.44, size.z * 0.12),
      glowMaterial(SIGN_MAGENTA, 0.18, 0.9),
    );
    spine.position.set(
      shaft.max.x + size.x * 0.02,
      box.min.y + size.y * 0.64,
      shaft.max.z + size.z * 0.02,
    );
    root.add(pulsing(spine, 0.3, 2.1, 1.9));
  });
}

// A shop sign over a frontage, and the light it throws on the pavement. Every
// one of Kay's buildings fronts its +z face — the windows are all on one side —
// so a sign always goes on +z and always faces the street the building was
// turned toward in islandLayout.ts.
function shopfront(root: Object3D, hue: string, at: number, phase: number) {
  inLocalFrame(root, (size) => {
    const sign = new Mesh(
      new BoxGeometry(size.x * 0.46, size.y * 0.06, size.z * 0.04),
      glowMaterial(hue, 0.15, 0.9),
    );
    sign.position.set(0, size.y * at, size.z * 0.52);
    root.add(pulsing(sign, 0.34, 2.8, phase));

    const spill = new Mesh(
      new CircleGeometry(size.x * 0.42, 18),
      glowMaterial(hue, 0.1, 0.3),
    );
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0, size.y * 0.006, size.z * 0.72);
    root.add(pulsing(spill, 0.24, 2.8, phase));
  });
}

// The corner block: lit flats over a shopfront, which is what the model is.
function dressBlock(root: Object3D) {
  lightWindows(root);
  shopfront(root, SIGN_CYAN, 0.2, 0.9);
}

// The low one, and the only building on the block whose ground floor is open.
// It comes out of the kitbash a shade brighter than its neighbours (CITY_LIT)
// and gets the warmest sign on the island, low down where an awning is.
function dressShop(root: Object3D) {
  lightWindows(root);
  shopfront(root, "#ffab3d", 0.34, 2.2);
}

// Everything else with windows in it — the mid-rise, the walk-up, the terrace.
// No sign: a street where every building has one is a strip, and these are the
// ones the lit corners are supposed to stand out against.
const dressPlain = lightWindows;

function dressTaxi(root: Object3D) {
  inLocalFrame(root, (size, box) => {
    // Kay models every car nose to +z — the bonnet end is the one with the
    // lower roofline — so the head and tail lamps can be placed off the box.
    const lamp = (hex: string, z: number, gain: number) => {
      const glow = new Mesh(
        new SphereGeometry(size.x * 0.16, 8, 6),
        glowMaterial(hex, 0.2, 0.65, gain),
      );
      glow.position.set(0, box.min.y + size.y * 0.42, z);
      return glow;
    };
    root.add(pulsing(lamp(SIGN_CYAN, box.max.z, 1.9), 0.1, 3.4, 0.2));
    root.add(pulsing(lamp("#ff2f4f", box.min.z, 1.4), 0.14, 2.6, 2.4));

    // The roof light. A taxi is the one car on the island anyone is meant to
    // pick out, and this is the two-pixel detail that says which one it is.
    const dome = new Mesh(
      new BoxGeometry(size.x * 0.34, size.y * 0.09, size.z * 0.09),
      unlitNeon(SIGN_MAGENTA, 0.25, 1.7),
    );
    dome.position.set(0, box.max.y + size.y * 0.04, size.z * 0.02);
    root.add(pulsing(dome, 0.18, 2.9, 1.4));

    // underglow — a flat disc of light on the road under the car
    const under = new Mesh(
      new CircleGeometry(Math.max(size.x, size.z) * 0.46, 20),
      glowMaterial(SIGN_MAGENTA, 0.12, 0.5),
    );
    under.rotation.x = -Math.PI / 2;
    under.position.y = box.min.y + size.y * 0.03;
    root.add(pulsing(under, 0.22, 1.7, 3.1));
  });
}

// A street light and a pedestrian signal are the same problem: a small lit
// head on the end of a post that points somewhere different on each of them.
// `headOf` finds it in the geometry, so neither needs a hard-coded offset.
function lampHead(hex: string, band: number, size: number) {
  return (root: Object3D) => {
    inLocalFrame(root, (extent, box) => {
      const at = headOf(root, box, band);
      const bulb = new Mesh(
        new SphereGeometry(extent.x * size, 8, 6),
        unlitNeon(hex, 0.28, 1.8),
      );
      bulb.position.copy(at);
      root.add(pulsing(bulb, 0.12, 2.2, 1.1));

      // A soft ball of spill around the head, so the lamp lights something.
      // Deliberately tight: at 3.4× the bulb and a third opacity these read as
      // cyan bubbles floating over the block rather than as lamps, because the
      // halo was bigger than the post holding it up.
      const halo = new Mesh(
        new SphereGeometry(extent.x * size * 2.1, 10, 8),
        glowMaterial(hex, 0.05, 0.14),
      );
      halo.position.copy(at);
      root.add(pulsing(halo, 0.2, 2.2, 1.1));
    });
  };
}

// The boom arm hangs off the post's own -x and carries the lenses at its far
// end, which is the one place on the prop a bounding box can find without
// help.
function dressSignal(root: Object3D) {
  inLocalFrame(root, (size, box) => {
    const at = new Vector3(
      box.min.x + size.x * 0.12,
      box.max.y - size.y * 0.14,
      box.getCenter(new Vector3()).z,
    );
    for (const [i, hex] of ["#ff2f4f", "#ffab3d", "#3dff8f"].entries()) {
      const lens = new Mesh(
        new SphereGeometry(size.y * 0.028, 6, 5),
        unlitNeon(hex, 0.2, i === 0 ? 1.7 : 0.6),
      );
      lens.position.set(at.x, at.y - i * size.y * 0.055, at.z);
      root.add(pulsing(lens, 0.15, 2.6 + i, i * 2.1));
    }
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

// One entry per prop that gets lit — world pieces and scenery alike, because
// usePropClone runs this pass on every clone it hands out and a block of flats
// nobody catches still has to have its lights on.
//
// Anything not listed is left as the kitbash built it. The dumpster, the
// cartons, the parked cars and the hydrants are the dark that the neon needs
// to be bright against.
export const DRESSING: Record<string, (o: Object3D) => void> = {
  tower: dressTower,
  block: dressBlock,
  shop: dressShop,
  midrise: dressPlain,
  walkup: dressPlain,
  terrace: dressPlain,
  taxi: dressTaxi,
  lamp: lampHead(SIGN_CYAN, 0.1, 0.22),
  pedsignal: lampHead("#ffab3d", 0.16, 0.3),
  signal: dressSignal,
  watertower: dressWatertower,
};

export function dressProp(prop: string, object: Object3D): Object3D {
  DRESSING[prop]?.(object);
  return object;
}
