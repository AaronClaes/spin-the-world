// Kitbash a record's diorama: merge CC0 source models (assets-src/) into one
// GLB with one named root node per world-piece prop (spec §8.4), each
// normalized to its miniature size on the record label and standing on y=0.
//
// Sources:
//   meadow  — KayKit Medieval Hexagon Pack (CC0, Kay Lousberg), plus
//             Quaternius sheep / flower bushes (CC0)
//   harbour — Kenney Pirate Kit (CC0) throughout, world pieces and scenery
//             alike, so the whole island shades off one 512² atlas
//   neon    — Kenney city buildings + Quaternius street furniture (both CC0),
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

// Exactly one of height / width / span sets the target world-unit size:
//   height — normalize by y, for things that read by how tall they are
//   width  — normalize by x
//   span   — normalize by the LONGER horizontal axis, which is what flat,
//            sprawling props need: an anchor lying on its side is 10× wider
//            than it is tall, so sizing it by height puts a 1.4-unit prop on
//            a 0.92-unit island
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
// Every CC0 city pack is lit for daylight, and a grey-and-white office block
// on a night island reads as a daytime model someone forgot to turn off. This
// is also the only way to get lit windows: the walls go dark and the window
// material picks up an emissive factor, so the building lights itself.
// The night repaint for Kenney's city kit. Walls and trim go to dark slate;
// the glass picks up an emissive factor so the block lights its own windows,
// which is the whole difference between an office building and a city block
// after dark.
const NIGHT = {
  _defaultMat: { base: [0.15, 0.14, 0.2] },
  border: { base: [0.09, 0.09, 0.12] },
  door: { base: [0.07, 0.07, 0.1] },
  // Base stays dark and the emissive does the lighting. Pushing the base up
  // instead made a building that was bright all over rather than one with lit
  // windows — the walls have to stay dark for the glass to read as glass.
  window: { base: [0.34, 0.24, 0.11], emissive: [0.8, 0.5, 0.14] },
};

// The tower is nearly all glass in the source — `window` and `trim` are two
// sheets of curtain wall, not a pane and a moulding. Lit like the block's
// windows it came out as one cream slab with no windows in it at all, so it
// goes the other way: dark blue glass reflecting the dusk, and the colour
// arrives as the neon rings the dressing wraps round it
// (src/scene/neonDressing.ts). Darker than it looks like it should be, on
// purpose — with any emissive at all it was the palest large surface on the
// island and pulled the eye off its own lights.
const NIGHT_TOWER = {
  ...NIGHT,
  window: { base: [0.11, 0.13, 0.21], emissive: [0.02, 0.04, 0.09] },
  trim: { base: [0.08, 0.09, 0.15], emissive: [0.02, 0.04, 0.1] },
};

const RECORDS = {
  meadow: [
    { name: "mill", file: "building_windmill_red.gltf", height: 0.44 },
    { name: "cottage", file: "building_home_A_red.gltf", height: 0.3 },
    { name: "oak", file: "tree_single_A.gltf", height: 0.3 },
    { name: "birch", file: "tree_single_B.gltf", height: 0.33 },
    { name: "well", file: "building_well_red.gltf", height: 0.2 },
    { name: "fence", file: "fence_stone_straight.gltf", height: 0.09 },
    { name: "haycart", file: "wheelbarrow.gltf", height: 0.15 },
    { name: "pond", file: "waterlily_A.gltf", width: 0.16 },
    { name: "sheep", file: "sheep.glb", height: 0.15, pick: "Sheep" },
    {
      name: "flowers",
      file: "flowers.glb",
      height: 0.13,
      pick: "Plant_Flowers",
    },
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
    // A square platform on pilings, not a run of planks — so it reads as the
    // head of the pier, and the boardwalk tiles behind it do the walking.
    {
      name: "dock",
      file: "kenney-pirate/structure-platform-dock.glb",
      span: 0.32,
      sink: 0.055,
    },
    { name: "ship", file: "kenney-pirate/ship-pirate-small.glb", height: 0.36 },
    { name: "crate", file: "kenney-pirate/crate.glb", height: 0.09 },
    { name: "barrel", file: "kenney-pirate/barrel.glb", height: 0.1 },
    { name: "chest", file: "kenney-pirate/chest.glb", span: 0.15 },
    { name: "rocks", file: "kenney-pirate/rocks-a.glb", span: 0.2 },
    {
      name: "palm",
      file: "kenney-pirate/palm-detailed-straight.glb",
      height: 0.3,
    },
    { name: "cannon", file: "kenney-pirate/cannon-mobile.glb", span: 0.15 },

    // -- scenery: placed by the island, repeated, never collected --
    { name: "rock-shore", file: "kenney-pirate/rocks-sand-b.glb", span: 0.13 },
    { name: "rock-small", file: "kenney-pirate/rocks-b.glb", span: 0.085 },
    { name: "tuft", file: "kenney-pirate/grass-patch.glb", height: 0.05 },
    { name: "plant", file: "kenney-pirate/grass-plant.glb", height: 0.045 },
    { name: "palm-small", file: "kenney-pirate/palm-bend.glb", height: 0.2 },
    { name: "rowboat", file: "kenney-pirate/boat-row-small.glb", span: 0.12 },
    { name: "bottle", file: "kenney-pirate/bottle.glb", height: 0.035 },
    { name: "flag", file: "kenney-pirate/flag-pirate.glb", height: 0.12 },
    // Ground decals — a few millimetres thick, laid on the tile cap to break
    // up a flat hex. The island lifts them clear of it (dy) so they don't
    // z-fight the surface they're dressing.
    { name: "sand-patch", file: "kenney-pirate/patch-sand.glb", span: 0.22 },
    { name: "scrub-patch", file: "kenney-pirate/patch-grass.glb", span: 0.17 },
  ],
  neon: [
    // Kenney's buildings share material names, so one night palette does both
    {
      name: "tower",
      file: "neon-tower.glb",
      height: 0.42,
      recolor: NIGHT_TOWER,
    },
    {
      name: "block",
      file: "neon-block.glb",
      span: 0.3,
      simplify: 0.6,
      recolor: NIGHT,
    },
    {
      // Both of these are textured off a shared atlas, so there's no material
      // to repaint by name — the base factor multiplies the whole texture
      // instead, which is exactly what "the sun went down" does to a prop.
      // Left alone the tank was the palest thing on a night island.
      name: "watertower",
      file: "neon-watertower.glb",
      height: 0.3,
      recolor: { "Atlas.049": { base: [0.42, 0.42, 0.52] } },
    },
    {
      name: "signal",
      file: "neon-signal.glb",
      height: 0.22,
      recolor: { "Atlas.052": { base: [0.55, 0.55, 0.62] } },
    },
    {
      name: "lamp",
      file: "neon-lamp.glb",
      height: 0.2,
      recolor: {
        Grey: { base: [0.13, 0.13, 0.17] },
        Light: { base: [0.8, 0.7, 0.45], emissive: [0.85, 0.66, 0.34] },
      },
    },
    {
      // sourced as a medieval market stand, which is what a search for
      // "street food" gets you in CC0. The repaint is what makes it a noodle
      // bar: dark frame, hot awning, and a counter that lights itself.
      name: "stall",
      file: "neon-stall.glb",
      height: 0.16,
      recolor: {
        RoofTiles_Red: { base: [0.62, 0.1, 0.12] },
        Beige: { base: [0.5, 0.34, 0.14], emissive: [0.75, 0.45, 0.13] },
        Wood: { base: [0.1, 0.09, 0.12] },
        Wood_Side: { base: [0.14, 0.12, 0.16] },
      },
    },
    {
      // 3.3k triangles of car for a prop that renders about 25px long
      name: "taxi",
      file: "neon-taxi.glb",
      span: 0.2,
      simplify: 0.4,
      recolor: {
        Headlights: { emissive: [0.9, 0.75, 0.45] },
        TailLights: { emissive: [0.8, 0.08, 0.06] },
      },
    },
    { name: "dumpster", file: "neon-dumpster.glb", span: 0.11 },
    // a thousand triangles for a red dot 20px tall
    {
      name: "hydrant",
      file: "neon-hydrant.glb",
      height: 0.055,
      simplify: 0.3,
      error: 0.08,
    },
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

async function build(record, props) {
  const target = new Document();
  target.createBuffer();
  const mainScene = target.createScene(`${record}-diorama`);
  target.getRoot().setDefaultScene(mainScene);

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
    const s = prop.span
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

    console.log(
      `  ${prop.name}: scale ${s.toFixed(4)} → ${size
        .map((v) => (v * s).toFixed(2))
        .join(" × ")}`,
    );
  }

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
