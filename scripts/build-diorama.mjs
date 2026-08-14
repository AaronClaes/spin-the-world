// Kitbash the meadow diorama: merge CC0 source models (assets-src/) into one
// GLB with one named root node per world-piece prop (spec §8.4), each
// normalized to its miniature size on the record label and standing on y=0.
//
// Sources: KayKit Medieval Hexagon Pack (CC0, Kay Lousberg) and Quaternius
// sheep / flower bushes (CC0). Usage: node scripts/build-diorama.mjs
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  mergeDocuments,
  prune,
  unpartition,
} from "@gltf-transform/functions";

// height = target world-unit height on the label; width = normalize by x
// instead (flat props). pick = take one named node out of a multi-prop file.
const PROPS = [
  { name: "mill", file: "building_windmill_red.gltf", height: 0.52 },
  { name: "cottage", file: "building_home_A_red.gltf", height: 0.3 },
  { name: "oak", file: "tree_single_A.gltf", height: 0.38 },
  { name: "birch", file: "tree_single_B.gltf", height: 0.42 },
  { name: "well", file: "building_well_red.gltf", height: 0.2 },
  { name: "fence", file: "fence_stone_straight.gltf", height: 0.09 },
  { name: "haycart", file: "wheelbarrow.gltf", height: 0.15 },
  { name: "pond", file: "waterlily_A.gltf", width: 0.16 },
  { name: "sheep", file: "sheep.glb", height: 0.15, pick: "Sheep" },
  { name: "flowers", file: "flowers.glb", height: 0.13, pick: "Plant_Flowers" },
];

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const target = new Document();
target.createBuffer();
const mainScene = target.createScene("meadow-diorama");
target.getRoot().setDefaultScene(mainScene);

const findByName = (node, name) => {
  if (node.getName() === name) return node;
  for (const child of node.listChildren()) {
    const hit = findByName(child, name);
    if (hit) return hit;
  }
  return null;
};

for (const prop of PROPS) {
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

  mergeDocuments(target, src);
  const srcScene = target.getRoot().listScenes().at(-1);

  const wrapper = target.createNode(prop.name);
  mainScene.addChild(wrapper);

  let content = srcScene.listChildren();
  if (prop.pick) {
    const picked = content.map((n) => findByName(n, prop.pick)).find(Boolean);
    if (!picked) throw new Error(`${prop.file}: node "${prop.pick}" not found`);
    content = [picked];
  }
  for (const node of content) wrapper.addChild(node);
  srcScene.dispose();

  // Normalize: uniform scale to target size, centred on x/z, base on y=0.
  const b = getBounds(wrapper);
  const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
  const s = prop.width ? prop.width / size[0] : prop.height / size[1];
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  wrapper.setScale([s, s, s]);
  wrapper.setTranslation([-cx * s, -b.min[1] * s, -cz * s]);

  console.log(
    `${prop.name}: scale ${s.toFixed(4)} → ${size.map((v) => (v * s).toFixed(2)).join(" × ")}`,
  );
}

await target.transform(
  dedup(),
  prune({ keepAttributes: false, keepIndices: false, keepLeaves: false }),
  unpartition(),
);
const out = new URL("../public/models/meadow-diorama.glb", import.meta.url)
  .pathname;
await io.write(out, target);
console.log(`wrote ${out}`);
