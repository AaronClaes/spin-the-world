// Kitbash a record's diorama: merge CC0 source models (assets-src/) into one
// GLB with one named root node per world-piece prop (spec §8.4), each
// normalized to its miniature size on the record label and standing on y=0.
//
// Sources:
//   meadow  — KayKit Medieval Hexagon Pack (CC0, Kay Lousberg), plus
//             Quaternius sheep / flower bushes (CC0)
//   harbour — Quaternius (CC0) throughout; the lighthouse is built in code
//             (src/scene/procProps.ts) rather than sourced, so it can turn its
//             beam
//
// Usage: node scripts/build-diorama.mjs [meadow|harbour]   (default: both)
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
// pick = take one named node out of a multi-prop file.
// simplify = collapse to this fraction of the triangles first — these render
// about 130px tall, so a dense source model is paying for detail nobody sees.
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
  harbour: [
    { name: "boathouse", file: "harbour-boathouse.glb", span: 0.34 },
    // the jetty is the one prop allowed to sprawl — it's the path out to the
    // moored boat, so it wants to read as a run of planks
    { name: "dock", file: "harbour-dock.glb", span: 0.42 },
    { name: "sailboat", file: "harbour-sailboat.glb", span: 0.3 },
    { name: "crate", file: "harbour-crate.glb", height: 0.11 },
    { name: "barrel", file: "harbour-barrel.glb", height: 0.13 },
    { name: "rocks", file: "harbour-rocks.glb", span: 0.18 },
    { name: "palm", file: "harbour-palm.glb", height: 0.34, simplify: 0.5 },
    { name: "anchor", file: "harbour-anchor.glb", span: 0.17 },
    // 22k triangles of gold coins for a prop that renders about 20px tall
    {
      name: "chest",
      file: "harbour-chest.glb",
      span: 0.19,
      simplify: 0.08,
      error: 0.09,
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
    wrapper.setTranslation([-cx * s, -b.min[1] * s, -cz * s]);

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
