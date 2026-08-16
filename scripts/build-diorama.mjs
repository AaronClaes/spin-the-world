// Kitbash a record's diorama: merge CC0 source models (assets-src/) into one
// GLB with one named root node per world-piece prop (spec §8.4), each
// normalized to its miniature size on the record label and standing on y=0.
//
// Sources:
//   meadow  — KayKit Medieval Hexagon Pack 1.0 (CC0, Kay Lousberg) for the
//             village and its scenery, plus one Quaternius sheep (CC0),
//             because neither pack in use here has an animal
//   harbour — Kenney Pirate Kit (CC0) throughout, world pieces and scenery
//             alike, so the whole island shades off one 512² atlas
//   neon    — KayKit City Builder Bits 1.0 (CC0, Kay Lousberg) throughout,
//             repainted for night by `recolor`; the sign is built in code so
//             its tubes can flicker
//
// Usage: node scripts/build-diorama.mjs [meadow|harbour|neon]  (default: all)
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  mergeDocuments,
  prune,
  simplify,
  unpartition,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

// Exactly one of height / width / span / packScale sets the size:
//   height — normalize by y, for things that read by how tall they are
//   width  — normalize by x
//   span   — normalize by the LONGER horizontal axis, which is what flat,
//            sprawling props need: an anchor lying on its side is 10× wider
//            than it is tall, so sizing it by height puts a 1.4-unit prop on
//            a 0.92-unit island
//   packScale — don't normalize at all. Multiply the source by a fixed factor,
//            the SAME factor for every prop in the record, and let the artist's
//            own proportions through untouched.
//
// packScale is the other three taken to their conclusion. Every per-prop size
// here is a guess at what a thing should measure next to its neighbours — and
// the pack already answers that, because one artist drew all of it to one
// scale. Choosing 21 numbers by hand is 21 chances to disagree with them; the
// city is one number (a 2.95-unit building becomes 0.42 on the label) and the
// hydrant, the bench and the fire escape land wherever Kay put them.
//
// The other two records stay on per-prop sizing: they were authored that way,
// they look right, and a diorama does legitimately compress scale — the
// harbour's hero ship is deliberately small for its island. Use packScale on a
// record built from one pack in one pass, where "in proportion" is the goal
// rather than something to be traded against composition.
// ownScale = exempt this prop from the proportion check below — it is
// deliberately not drawn at its pack's own scale, or it comes from elsewhere.
// sink = world units to bury below y=0, for the props that are NOT meant to
// stand on the ground. Everything here is based on y=0 by default, which is
// right for a barrel and wrong for a pier: a dock model is a deck plus the
// pilings that hold it over the water, so standing it on the seabed put the
// deck a boat-and-a-half above the boat moored at it. Sinking it is what
// "driven into the harbour floor" actually means.
// pick = take one named node out of a multi-prop file.
// simplify = collapse to this fraction of the triangles first — these render
// about 130px tall, so a dense source model is paying for detail nobody sees.
// recolor = repaint a source material by name, { base } and/or { emissive }.
// Every CC0 city pack is lit for daylight, and a brick walk-up with its
// afternoon in it reads, on a night island, as a daytime model someone forgot
// to turn off.

// -------------------------------------------------------- the city, dark ---

// One factor for the whole city (see packScale above). Kay's tallest building
// is 2.95 units; 0.142 lands it at 0.42 on the label, which is the height the
// record's old skyscraper stood at, so the skyline keeps its silhouette while
// everything under it moves into proportion.
const CITY = 0.142;

// Kay's whole city samples one material off one 1024² gradient atlas:
// `citybits_texture`, on every building, every car, every bin. There is no
// `window` material to light the way Kenney's block had, and no way to reach
// one from here — the panes and the parapet share a swatch, so any repaint
// that finds the windows finds the cornice too.
//
// What there IS: recolor runs per SOURCE FILE, before the merge, so each prop
// carries its own instance of that material. The night can be mixed per prop
// even though it can't be mixed per surface. That turns out to be the more
// useful axis anyway — a city at night isn't uniformly dark, it's dark
// buildings with a few bright things standing in front of them.
//
// The windows come back in src/scene/neonDressing.ts, which finds them by
// shape rather than by material: a window is a small side-facing panel and a
// wall is a big one, and the geometry knows the difference.

// Dark and cool, and pitched so the pale window swatch stays the lightest
// thing on the facade — that gap is what reads as glass once the light is off.
const CITY_NIGHT = { citybits_texture: { base: [0.34, 0.32, 0.47] } };

// One shade up, for the low building on the corner. Its ground floor is a
// shopfront with an awning, and a shop that's open is the one building on the
// block with its lights on.
const CITY_LIT = { citybits_texture: { base: [0.62, 0.55, 0.62] } };

// Street furniture that is meant to be SEEN at night rather than to recede:
// the hydrant, the taxi, the signal. Barely knocked down at all — these are
// the record's small bright accents against a block of dark brick.
const CITY_ACCENT = { citybits_texture: { base: [0.78, 0.72, 0.76] } };

const RECORDS = {
  // KayKit's Medieval Hexagon pack, same treatment as the harbour: one pack,
  // one atlas, world pieces and scenery out of the same box. The village was
  // already mostly this — what went was a Quaternius flower clump that read as
  // a pale smudge at label scale, replaced by the pack's watermill, which is
  // both a second building for a village that only had one and a second thing
  // on the island that MOVES: its wheel is a separate node, exactly like the
  // windmill's sails, so the two landmarks answer each other across the pond.
  //
  // The sheep is the one model here from anywhere else. Neither KayKit's free
  // pack nor Kenney's nature kit has an animal, and a meadow with nothing
  // alive on it is a worse trade than a mildly rounder silhouette.
  meadow: [
    // -- the ten world pieces, in chart order (records/meadow.ts) --
    {
      name: "mill",
      file: "kaykit-hexagon/building_windmill_red.gltf",
      height: 0.44,
    },
    {
      name: "cottage",
      file: "kaykit-hexagon/building_home_A_red.gltf",
      height: 0.3,
    },
    { name: "oak", file: "kaykit-hexagon/tree_single_A.gltf", height: 0.3 },
    { name: "birch", file: "kaykit-hexagon/tree_single_B.gltf", height: 0.33 },
    {
      name: "well",
      file: "kaykit-hexagon/building_well_red.gltf",
      height: 0.2,
    },
    {
      name: "fence",
      file: "kaykit-hexagon/fence_stone_straight.gltf",
      height: 0.09,
    },
    // span, NOT height. A wheelbarrow is 0.51 long and 0.19 tall in the pack's
    // own units, so normalizing it by height blew its length out to 0.41 —
    // longer than the cottage is wide, and far enough through the rail fence
    // beside it to come out the other side. 0.165 is the length the pack draws
    // it at relative to that cottage, which is the only definition of "the
    // right size" that means anything.
    { name: "haycart", file: "kaykit-hexagon/wheelbarrow.gltf", span: 0.165 },
    // Deliberately ~3× the pack's own scale, hence ownScale. It is one lily
    // pad standing in for a whole pond; drawn at the scale the pack drew it,
    // it would be 0.05 across and invisible from the play camera.
    {
      name: "pond",
      file: "kaykit-hexagon/waterlily_A.gltf",
      width: 0.16,
      ownScale: true,
    },
    // a different pack entirely, so it has no business being compared
    {
      name: "sheep",
      file: "sheep.glb",
      height: 0.15,
      pick: "Sheep",
      ownScale: true,
    },
    {
      name: "watermill",
      file: "kaykit-hexagon/building_watermill_red.gltf",
      height: 0.34,
    },

    // -- scenery: placed by the island, repeated, never collected --
    // Three sizes of copse rather than one tree repeated: the pack ships them
    // pre-clustered, and a stand of trees is the cheapest way to turn an empty
    // grass hex into somewhere.
    {
      name: "copse-l",
      file: "kaykit-hexagon/trees_B_large.gltf",
      span: 0.34,
    },
    {
      name: "copse-m",
      file: "kaykit-hexagon/trees_A_medium.gltf",
      span: 0.3,
    },
    { name: "copse-s", file: "kaykit-hexagon/trees_A_small.gltf", span: 0.24 },
    {
      name: "stump",
      file: "kaykit-hexagon/tree_single_A_cut.gltf",
      height: 0.07,
    },
    { name: "boulder", file: "kaykit-hexagon/rock_single_C.gltf", span: 0.1 },
    { name: "stone", file: "kaykit-hexagon/rock_single_A.gltf", span: 0.09 },
    // The track's fence, laid in runs the way the harbour lays its jetty —
    // one section is a gate to nowhere, five in a line is a lane.
    {
      name: "railing",
      file: "kaykit-hexagon/fence_wood_straight.gltf",
      span: 0.17,
    },
    { name: "crate", file: "kaykit-hexagon/crate_A_small.gltf", height: 0.05 },
    { name: "sack", file: "kaykit-hexagon/sack.gltf", span: 0.06 },
    { name: "barrel", file: "kaykit-hexagon/barrel.gltf", height: 0.07 },
    { name: "bucket", file: "kaykit-hexagon/bucket_water.gltf", height: 0.04 },
    { name: "lumber", file: "kaykit-hexagon/resource_lumber.gltf", span: 0.22 },
    { name: "lily", file: "kaykit-hexagon/waterlily_B.gltf", width: 0.11 },
    { name: "reed", file: "kaykit-hexagon/waterplant_A.gltf", height: 0.05 },
  ],
  // One pack, end to end. The harbour used to be three: Quaternius "FirstAge"
  // village props (untextured, flat-colour materials), a Quaternius pirate set
  // (textured off its own atlas), and a lighthouse built from primitives. Read
  // together they didn't look like one place — the palm and the chest were
  // lit and shaded by different rules than the crate standing next to them.
  //
  // Everything below is Kenney's Pirate Kit: one material, one 512² colormap,
  // and a period that matches what this record has always been about — wooden
  // boats, plank jetties, a fort tower over the bay. The lighthouse is gone
  // with it; a modern navigation light was the one thing on the island from
  // the wrong century, and it was the only prop with no source model at all.
  //
  // The second half of the list is scenery: props the island places itself,
  // several times each, that are never collected (scene/islandLayout.ts). They
  // are ordinary named nodes in the same GLB — the distinction lives entirely
  // in who asks for them.
  harbour: [
    // -- the ten world pieces, in chart order (records/harbour.ts) --
    {
      name: "watchtower",
      file: "kenney-pirate/tower-complete-small.glb",
      height: 0.34,
    },
    // A plank-roofed shed on posts. Kenney's thatched `structure-roof` was
    // the obvious pick and the wrong one: its roof samples within a shade of
    // the sand tiles it stands on, so a 0.26 prop read as a dune.
    { name: "hut", file: "kenney-pirate/structure-fence.glb", span: 0.22 },
    // One SECTION of pier, not the whole pier. At 0.32 a single platform
    // filled its tile and its planks came out coarser than everything around
    // them — the model reads at the size the pack drew it for, and this pack
    // draws a plank about a barrel wide. Sized down to a section, the island
    // lays three of them end to end instead (scene/islandLayout.ts), which is
    // also what a jetty actually is: something long and narrow you can put a
    // boat alongside.
    {
      name: "dock",
      file: "kenney-pirate/structure-platform-dock.glb",
      span: 0.2,
      sink: 0.034,
    },
    { name: "ship", file: "kenney-pirate/ship-pirate-small.glb", height: 0.36 },
    // Kenney draws a barrel 1.6× the height of a crate; at 0.09 against the
    // barrel's 0.10 they were nearly equal, which is the wheelbarrow mistake
    // in miniature. 0.063 is the crate the barrel beside it belongs to.
    { name: "crate", file: "kenney-pirate/crate.glb", height: 0.063 },
    { name: "barrel", file: "kenney-pirate/barrel.glb", height: 0.1 },
    // Small, because it is now sitting IN something rather than on the beach
    // on its own — at 0.15 it was a shed with a lid.
    { name: "chest", file: "kenney-pirate/chest.glb", span: 0.1 },
    { name: "rocks", file: "kenney-pirate/rocks-a.glb", span: 0.2 },
    {
      name: "palm",
      file: "kenney-pirate/palm-detailed-straight.glb",
      height: 0.3,
    },
    { name: "cannon", file: "kenney-pirate/cannon-mobile.glb", span: 0.15 },

    // -- scenery: placed by the island, repeated, never collected --
    // The ring of spoil around a dug pit. Scenery rather than part of the
    // chest, so it is already there at beat 0: the hole is dug and empty for
    // the whole run, and catching hp07 is what puts something in it.
    { name: "hole", file: "kenney-pirate/hole.glb", span: 0.2 },
    // Ground dressing, exempt from the proportion check AS A CLASS rather
    // than one straggler at a time — tagging them individually as each
    // tripped the threshold just moved the median and tripped the next one.
    // The check is about objects, and none of these are objects.
    //
    // A pack draws scatter at the size it wants scatter to
    // READ at, not at the size it would be as an object you could pick up, so
    // this whole group sits below its pack's object scale on purpose — the
    // three furthest out carry ownScale to say so out loud.
    {
      name: "rock-shore",
      file: "kenney-pirate/rocks-sand-b.glb",
      span: 0.13,
      ownScale: true,
    },
    {
      name: "rock-small",
      file: "kenney-pirate/rocks-b.glb",
      span: 0.085,
      ownScale: true,
    },
    {
      name: "tuft",
      file: "kenney-pirate/grass-patch.glb",
      height: 0.05,
      ownScale: true,
    },
    { name: "plant", file: "kenney-pirate/grass-plant.glb", height: 0.045 },
    { name: "palm-small", file: "kenney-pirate/palm-bend.glb", height: 0.2 },
    { name: "rowboat", file: "kenney-pirate/boat-row-small.glb", span: 0.12 },
    { name: "bottle", file: "kenney-pirate/bottle.glb", height: 0.035 },
    { name: "flag", file: "kenney-pirate/flag-pirate.glb", height: 0.12 },
    // Ground decals — a few millimetres thick, laid on the tile cap to break
    // up a flat hex. The island lifts them clear of it (dy) so they don't
    // z-fight the surface they're dressing.
    {
      name: "sand-patch",
      file: "kenney-pirate/patch-sand.glb",
      span: 0.22,
      ownScale: true,
    },
    {
      name: "scrub-patch",
      file: "kenney-pirate/patch-grass.glb",
      span: 0.17,
      ownScale: true,
    },
  ],
  // KayKit's City Builder Bits, one pack for the whole record — same move as
  // the harbour and the meadow, and the one this island needed most. What was
  // here before was two Kenney office blocks standing next to seven Quaternius
  // street props: two artists, two atlases, two ideas of how thick a pole is.
  // Nothing was wrong with any single model and the block never read as a
  // block.
  //
  // The pack is also the reason every prop below is sized by packScale rather
  // than by hand. Kay draws a four-storey walk-up at 2.95 units and a fire
  // hydrant at 0.225 — thirteen to one — and those thirteen are the whole
  // difference between a city and a set of city-shaped objects. One factor
  // keeps it: 0.142, so the tallest building lands at 0.42 on a 0.92 island,
  // which is where the old tower was.
  neon: [
    // -- the ten world pieces, in chart order (records/neon.ts) --
    // the tall one, and the only 4-storey in the pack — the skyline is this
    // building and everything else deferring to it
    {
      name: "tower",
      file: "kaykit-city/building_H_withoutBase.gltf",
      packScale: CITY,
      recolor: CITY_NIGHT,
    },
    // the wide corner block, with a shopfront under three floors of flats
    {
      name: "block",
      file: "kaykit-city/building_G_withoutBase.gltf",
      packScale: CITY,
      recolor: CITY_NIGHT,
    },
    // the low one on the corner, awning out over the pavement
    {
      name: "shop",
      file: "kaykit-city/building_A_withoutBase.gltf",
      packScale: CITY,
      recolor: CITY_LIT,
    },
    // the narrow mid-rise that closes the skyline on a nearly clean run
    {
      name: "midrise",
      file: "kaykit-city/building_C_withoutBase.gltf",
      packScale: CITY,
      recolor: CITY_NIGHT,
    },
    { name: "lamp", file: "kaykit-city/streetlight.gltf", packScale: CITY },
    {
      name: "signal",
      file: "kaykit-city/trafficlight_C.gltf",
      packScale: CITY,
      recolor: CITY_ACCENT,
    },
    // 1256 triangles of car for a prop that renders about 25px long
    {
      name: "taxi",
      file: "kaykit-city/car_taxi.gltf",
      packScale: CITY,
      simplify: 0.45,
      recolor: CITY_ACCENT,
    },
    // The rooftop tank — the New York detail Kay ships and nobody expects on
    // a hex island. It lands on the roof of a SCENERY building rather than a
    // collected one (islandLayout.ts), so there is no run in which it arrives
    // to find nothing underneath it.
    {
      name: "watertower",
      file: "kaykit-city/watertower.gltf",
      packScale: CITY,
      recolor: CITY_NIGHT,
    },
    { name: "dumpster", file: "kaykit-city/dumpster.gltf", packScale: CITY },

    // -- scenery: the block the ten pieces are dropped into (islandLayout.ts) --
    // Three more buildings, so the street has two sides. These are never
    // caught and never missing, which is what lets the water tower stand on
    // one of them.
    {
      name: "walkup",
      file: "kaykit-city/building_B_withoutBase.gltf",
      packScale: CITY,
      recolor: CITY_NIGHT,
    },
    {
      name: "terrace",
      file: "kaykit-city/building_E_withoutBase.gltf",
      packScale: CITY,
      recolor: CITY_NIGHT,
    },
    // Parked traffic. The taxi is the one with the light on it; these are the
    // cars it is stuck behind, so they stay dark.
    {
      name: "sedan",
      file: "kaykit-city/car_sedan.gltf",
      packScale: CITY,
      simplify: 0.45,
      recolor: CITY_NIGHT,
    },
    {
      name: "hatchback",
      file: "kaykit-city/car_hatchback.gltf",
      packScale: CITY,
      simplify: 0.45,
      recolor: CITY_NIGHT,
    },
    // the small pedestrian signal, for the corners the boom arm doesn't reach
    {
      name: "pedsignal",
      file: "kaykit-city/trafficlight_A.gltf",
      packScale: CITY,
      simplify: 0.5,
      recolor: CITY_ACCENT,
    },
    // 180 triangles for a red speck 3cm tall — but it is the red speck that
    // says "kerb" rather than "verge", and there are three of them
    {
      name: "hydrant",
      file: "kaykit-city/firehydrant.gltf",
      packScale: CITY,
      simplify: 0.4,
      error: 0.08,
      recolor: CITY_ACCENT,
    },
    { name: "bench", file: "kaykit-city/bench.gltf", packScale: CITY },
    { name: "planter", file: "kaykit-city/bush.gltf", packScale: CITY },
    { name: "carton", file: "kaykit-city/box_A.gltf", packScale: CITY },
  ],
};

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
await MeshoptSimplifier.ready;

const findByName = (node, name) => {
  if (node.getName() === name) return node;
  for (const child of node.listChildren()) {
    const hit = findByName(child, name);
    if (hit) return hit;
  }
  return null;
};

// Props drawn by one artist for one pack are already in proportion with each
// other. That is the whole reason to source a record from a single pack — and
// it means the scale factor this script applies should come out roughly the
// SAME for every prop in the record. When one is an outlier, the size chosen
// for it disagrees with the pack, and the prop will look wrong next to its
// neighbours no matter how reasonable the number looked in isolation.
//
// That is exactly how the meadow ended up with a wheelbarrow longer than its
// cottage is wide: sized by `height` at a plausible-sounding 0.15, which for a
// prop 2.7× longer than it is tall meant 2.5× everything around it. Nothing
// about `height: 0.15` looks wrong until you compare it.
//
// A warning, not an error — `ownScale` marks the props that are deliberately
// off-pack, and a new record may be mid-authoring.
// Grouped BY PACK — the directory a prop's source sits in — because the claim
// only holds within one artist's set.
//
// The bar is deliberately low. A first version warned at 1.6× and lit up half
// the harbour, which is a record that looks right: a diorama COMPRESSES scale
// on purpose, shrinking the hero ship so it fits the island and drawing the
// grass tufts large so they read at all from the play camera. Enforcing a
// pack's own proportions across a whole record fights the art direction, and
// a check you learn to ignore is worse than no check.
//
// So: print the spread every time, which is what actually makes an outlier
// obvious, and only warn past the point where it is almost certainly a units
// mistake rather than a choice. The wheelbarrow that prompted this was 2.5×.
const SCALE_TOLERANCE = 2.2;

function checkProportions(scales) {
  const packs = new Map();
  for (const p of scales) {
    if (p.ownScale) continue;
    const pack = p.file.includes("/") ? p.file.split("/")[0] : "(loose)";
    if (!packs.has(pack)) packs.set(pack, []);
    packs.get(pack).push(p);
  }
  for (const [pack, group] of packs) {
    // "(loose)" is every source that predates the per-pack directories — on
    // neon that's Kenney buildings next to Quaternius street furniture, which
    // were never in proportion with each other. No provenance, no claim.
    if (pack === "(loose)" || group.length < 3) continue;
    const sorted = group.map((p) => p.s).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const ratios = group.map((p) => ({ ...p, ratio: p.s / median }));
    const lo = Math.min(...ratios.map((p) => p.ratio));
    const hi = Math.max(...ratios.map((p) => p.ratio));
    console.log(
      `  ${pack}: ${group.length} props, ${lo.toFixed(2)}–${hi.toFixed(2)}× ` +
        `the pack's median scale`,
    );
    for (const p of ratios) {
      if (p.ratio > SCALE_TOLERANCE || p.ratio < 1 / SCALE_TOLERANCE) {
        console.warn(
          `  ! ${p.name}: ${p.ratio.toFixed(2)}× its pack's median. That is ` +
            `usually the wrong axis — sizing a long prop by \`height\` blows ` +
            `its length out. Use span, or set ownScale if it's deliberate.`,
        );
      }
    }
  }
}

async function build(record, props) {
  const target = new Document();
  target.createBuffer();
  const mainScene = target.createScene(`${record}-diorama`);
  target.getRoot().setDefaultScene(mainScene);
  const scales = [];

  for (const prop of props) {
    const src = await io.read(
      new URL(`../assets-src/${prop.file}`, import.meta.url).pathname,
    );

    // Static miniatures: drop rigs, keep the bind-pose mesh. Channels and
    // samplers must go explicitly or their accessors survive pruning.
    for (const anim of src.getRoot().listAnimations()) {
      for (const channel of anim.listChannels()) channel.dispose();
      for (const sampler of anim.listSamplers()) sampler.dispose();
      anim.dispose();
    }
    for (const node of src.getRoot().listNodes()) node.setSkin(null);
    for (const skin of src.getRoot().listSkins()) skin.dispose();

    // Repaint before the merge, while material names are still this file's
    // own — after mergeDocuments several props can carry the same name.
    if (prop.recolor) {
      const seen = new Set();
      for (const mat of src.getRoot().listMaterials()) {
        const rule = prop.recolor[mat.getName()];
        if (!rule) continue;
        seen.add(mat.getName());
        if (rule.base) mat.setBaseColorFactor([...rule.base, 1]);
        if (rule.emissive) mat.setEmissiveFactor(rule.emissive);
      }
      const missed = Object.keys(prop.recolor).filter((n) => !seen.has(n));
      // a renamed source material would silently leave the prop in daylight
      if (missed.length)
        console.warn(
          `  ! ${prop.name}: no material named ${missed.join(", ")}`,
        );
    }

    // Simplify before the merge so the ratio applies to this prop alone —
    // run on the merged document it would be measured against every mesh.
    // `ratio` is only a target: `error` is the hard limit, and the default
    // 0.001 is tight enough that a dense mesh barely moves. These props are
    // ~20px on screen, so a 4% error budget is invisible and does the work.
    if (prop.simplify) {
      await src.transform(
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: prop.simplify,
          error: prop.error ?? 0.04,
        }),
      );
    }

    mergeDocuments(target, src);
    const srcScene = target.getRoot().listScenes().at(-1);

    const wrapper = target.createNode(prop.name);
    mainScene.addChild(wrapper);

    let content = srcScene.listChildren();
    if (prop.pick) {
      const picked = content.map((n) => findByName(n, prop.pick)).find(Boolean);
      if (!picked)
        throw new Error(`${prop.file}: node "${prop.pick}" not found`);
      content = [picked];
    }
    for (const node of content) wrapper.addChild(node);
    srcScene.dispose();

    // Normalize: uniform scale to target size, centred on x/z, base on y=0.
    const b = getBounds(wrapper);
    const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
    const s = prop.packScale
      ? prop.packScale
      : prop.span
        ? prop.span / Math.max(size[0], size[2])
        : prop.width
          ? prop.width / size[0]
          : prop.height / size[1];
    const cx = (b.min[0] + b.max[0]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    wrapper.setScale([s, s, s]);
    wrapper.setTranslation([
      -cx * s,
      -b.min[1] * s - (prop.sink ?? 0),
      -cz * s,
    ]);

    scales.push({
      name: prop.name,
      file: prop.file,
      s,
      ownScale: !!prop.ownScale,
    });
    console.log(
      `  ${prop.name}: scale ${s.toFixed(4)} → ${size
        .map((v) => (v * s).toFixed(2))
        .join(" × ")}`,
    );
  }

  checkProportions(scales);

  await target.transform(
    dedup(),
    prune({ keepAttributes: false, keepIndices: false, keepLeaves: false }),
    unpartition(),
  );
  const out = new URL(`../public/models/${record}-diorama.glb`, import.meta.url)
    .pathname;
  await io.write(out, target);
  console.log(`wrote ${out}`);
}

const only = process.argv[2];
for (const [record, props] of Object.entries(RECORDS)) {
  if (only && only !== record) continue;
  console.log(`${record}:`);
  await build(record, props);
}
