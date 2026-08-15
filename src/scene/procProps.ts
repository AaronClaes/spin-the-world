import {
  AdditiveBlending,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from "three";

// World pieces built from primitives instead of kitbashed from a GLB.
//
// Only one so far, and it earns it: the harbour's lighthouse is the piece the
// whole island is composed around, and the thing that makes it worth looking
// at is the turning beam — which a downloaded mesh can't do. Building it here
// also means the lamp can be emissive enough for the bloom pass to catch it,
// and the red/white banding can be sized for a prop that renders about 60px
// tall rather than inherited from whatever a source model happened to use.
//
// Same contract as a kitbashed prop: centred on x/z, standing on y=0, already
// at its miniature size. usePropClone falls through to this registry when the
// record's diorama GLB has no node of that name.

const STONE = "#8d8880";
const BAND_RED = "#c8402f";
const BAND_WHITE = "#f2f0ea";
const IRON = "#2e3138";
const ROOF = "#8f2f26";
const LAMP = "#ffe6a0";

// The node the Diorama looks up to turn the light. Kept in sync with the
// switch in Diorama.tsx.
export const BEAM_NODE = "lighthouse_beam";

const BASE_H = 0.035;
const TOWER_H = 0.305;
const BANDS = 4;
const R_BOTTOM = 0.052;
const R_TOP = 0.036;

function lighthouse(): Object3D {
  const root = new Group();
  root.name = "lighthouse";

  const solid = (color: string) =>
    new MeshStandardMaterial({ color, roughness: 0.8 });

  // footing — a stone drum wider than the tower, so it sits on the rock
  // instead of balancing on it
  const base = new Mesh(
    new CylinderGeometry(0.058, 0.066, BASE_H, 12),
    solid(STONE),
  );
  base.position.y = BASE_H / 2;
  root.add(base);

  // the tower, as stacked bands. Each band is its own tapered section so the
  // silhouette narrows continuously rather than stepping.
  const bandH = TOWER_H / BANDS;
  const radiusAt = (t: number) => R_BOTTOM + (R_TOP - R_BOTTOM) * t;
  for (let i = 0; i < BANDS; i++) {
    const y0 = BASE_H + i * bandH;
    const band = new Mesh(
      new CylinderGeometry(
        radiusAt((i + 1) / BANDS),
        radiusAt(i / BANDS),
        bandH,
        12,
      ),
      solid(i % 2 === 0 ? BAND_RED : BAND_WHITE),
    );
    band.position.y = y0 + bandH / 2;
    root.add(band);
  }

  const galleryY = BASE_H + TOWER_H;

  // the walkway ring around the lantern — a dark line that separates the
  // banded tower from the glass, and the detail that makes it read as a
  // lighthouse rather than a barber's pole
  const gallery = new Mesh(
    new CylinderGeometry(0.05, 0.05, 0.012, 12),
    solid(IRON),
  );
  gallery.position.y = galleryY + 0.006;
  root.add(gallery);

  // the lamp room. Unlit and bright — at the daylight bloom threshold this is
  // the one thing on the island that glows.
  const lantern = new Mesh(
    new CylinderGeometry(0.032, 0.032, 0.045, 12),
    new MeshBasicMaterial({ color: LAMP }),
  );
  lantern.position.y = galleryY + 0.035;
  root.add(lantern);

  const roof = new Mesh(new ConeGeometry(0.042, 0.05, 12), solid(ROOF));
  roof.position.y = galleryY + 0.082;
  root.add(roof);

  const finial = new Mesh(new SphereGeometry(0.008, 8, 6), solid(IRON));
  finial.position.y = galleryY + 0.112;
  root.add(finial);

  // The beam. A cone laid on its side with its apex at the lamp, so it opens
  // outward across the island.
  //
  // It has to be ADDITIVE. Drawn as ordinary transparency it composites toward
  // its own colour over whatever is behind it, and behind it is near-black
  // vinyl — so a pale yellow cone at 11% came out as a dark grey wedge and
  // read as a plank bolted to the tower. Additive can only ever brighten, so
  // over the disc it's a faint glow and over the island it warms the tiles,
  // which is what light does. Kept short, too: a searchlight the length of the
  // island is a shape, a flare that hugs the lamp is a light.
  const beam = new Group();
  beam.name = BEAM_NODE;
  beam.position.y = galleryY + 0.035;

  const cone = new Mesh(
    new ConeGeometry(0.045, 0.26, 12, 1, true),
    new MeshBasicMaterial({
      color: LAMP,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  // cone points +Y by default: lay it down and push it out so the apex sits
  // at the lamp rather than at the island's centre
  cone.rotation.z = Math.PI / 2;
  cone.position.x = 0.13;
  beam.add(cone);
  root.add(beam);

  return root;
}

export const PROC_PROPS: Record<string, () => Object3D> = {
  lighthouse,
};
