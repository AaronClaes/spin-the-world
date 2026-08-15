// Merge the CC0 Quaternius cloud models (assets-src/) into one GLB with one
// named root node per shape, each normalized to unit width and centred on the
// origin — SkyWorld instances them, so the transform has to be predictable.
//
// Clouds are centred rather than stood on y=0 like the diorama props: they
// float, and instancing wants the pivot in the middle of the shape.
//
// Sources: Quaternius clouds via poly.pizza (CC0). Usage:
//   node scripts/build-clouds.mjs
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  mergeDocuments,
  prune,
  unpartition,
} from "@gltf-transform/functions";

// Quaternius' pack also has a swirl-with-a-hole cloud (cloud-5 in the
// download). It reads as a floating croissant against this sky, so it never
// made it into the build.
const SHAPES = ["cloud-1", "cloud-2", "cloud-3", "cloud-4"];

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const target = new Document();
target.createBuffer();
const mainScene = target.createScene("clouds");
target.getRoot().setDefaultScene(mainScene);

for (const [i, file] of SHAPES.entries()) {
  const src = await io.read(
    new URL(`../assets-src/${file}.glb`, import.meta.url).pathname,
  );

  mergeDocuments(target, src);
  const srcScene = target.getRoot().listScenes().at(-1);

  const wrapper = target.createNode(`cloud${i}`);
  mainScene.addChild(wrapper);
  for (const node of srcScene.listChildren()) wrapper.addChild(node);
  srcScene.dispose();

  // unit width, centred on all three axes
  const b = getBounds(wrapper);
  const size = [0, 1, 2].map((a) => b.max[a] - b.min[a]);
  const s = 1 / size[0];
  const centre = [0, 1, 2].map((a) => (b.min[a] + b.max[a]) / 2);
  wrapper.setScale([s, s, s]);
  wrapper.setTranslation(centre.map((c) => -c * s));

  console.log(
    `cloud${i} (${file}): scale ${s.toFixed(4)} → ${size
      .map((v) => (v * s).toFixed(2))
      .join(" × ")}`,
  );
}

await target.transform(
  dedup(),
  prune({ keepAttributes: false, keepIndices: false, keepLeaves: false }),
  unpartition(),
);
const out = new URL("../public/models/clouds.glb", import.meta.url).pathname;
await io.write(out, target);
console.log(`wrote ${out}`);
