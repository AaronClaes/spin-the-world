// Rework the KayKit knight into the headphones listener (spec §8.2):
// drop the weapon/armor accessory meshes and every animation except the two
// we play, and repaint the body with flat colours (no texture) so the figure
// reads as a small casual listener rather than a knight. The oversized
// headphones themselves are added at runtime, parented to the head bone.
//
// Usage: node scripts/build-runner.mjs  (rewrites public/models/runner.glb
// from assets-src/runner-knight-original.glb)
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, unpartition } from "@gltf-transform/functions";

const KEEP_ANIMATIONS = new Set(["Running_A", "Idle"]);

const DROP_NODES = new Set([
  "1H_Sword",
  "2H_Sword",
  "1H_Sword_Offhand",
  "Badge_Shield",
  "Rectangle_Shield",
  "Round_Shield",
  "Spike_Shield",
  "Knight_Helmet",
  "Knight_Cape",
]);

// Flat repaint, one colour per body mesh. Outfit sits in the record's night
// palette; the accent lives in the runtime headphones, not the clothes.
const REPAINT = {
  Knight_Head: "#e2af85", // skin — bare head, the headphones sell the rest
  Knight_Body: "#4a5680", // indigo jacket
  Knight_ArmLeft: "#4a5680",
  Knight_ArmRight: "#4a5680",
  Knight_LegLeft: "#343a54", // darker trousers
  Knight_LegRight: "#343a54",
};

const hexToLinear = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [16, 8, 0].map((s) => (((n >> s) & 255) / 255) ** 2.2).concat(1);
};

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const src = new URL("../assets-src/runner-knight-original.glb", import.meta.url)
  .pathname;
const doc = await io.read(src);
const root = doc.getRoot();

for (const anim of root.listAnimations()) {
  if (KEEP_ANIMATIONS.has(anim.getName())) continue;
  // Disposing the animation alone leaves its samplers alive, which keeps the
  // keyframe accessors referenced and un-prunable.
  for (const channel of anim.listChannels()) channel.dispose();
  for (const sampler of anim.listSamplers()) sampler.dispose();
  anim.dispose();
}

for (const node of root.listNodes()) {
  if (DROP_NODES.has(node.getName())) node.dispose();
}

const materials = Object.fromEntries(
  Object.entries(REPAINT).map(([name, hex]) => [
    name,
    doc
      .createMaterial(`flat_${name}`)
      .setBaseColorFactor(hexToLinear(hex))
      .setMetallicFactor(0)
      .setRoughnessFactor(0.9),
  ]),
);

for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  const mat = materials[node.getName()];
  if (!mesh || !mat) continue;
  for (const prim of mesh.listPrimitives()) prim.setMaterial(mat);
}

await doc.transform(
  dedup(),
  prune({ keepAttributes: false, keepIndices: false, keepLeaves: false }),
  unpartition(),
);
const out = new URL("../public/models/runner.glb", import.meta.url).pathname;
await io.write(out, doc);
console.log(
  `wrote ${out} — animations kept: ${root
    .listAnimations()
    .map((a) => a.getName())
    .join(", ")}`,
);
