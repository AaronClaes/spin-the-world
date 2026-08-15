// Build the listener (spec §8.2) from KayKit's Adventurers pack (CC0, Kay
// Lousberg). The body is the Rogue: a tunic, a belt and boots read as someone
// who might plausibly be out for a run with headphones on, which a knight in
// plate never did no matter how flat we repainted it.
//
// The body and the clips come from two different versions of the same pack,
// and that is deliberate. Pack 1.x baked the whole 76-clip library into every
// character; 2.0 split the clips into a shared library that no longer ships a
// Cheer. So the mesh comes from 2.0 and the three clips we play come from the
// 1.x knight file, re-pointed bone by bone.
//
// That is not retargeting onto a foreign rig (§4). The two skeletons share all
// 23 deform bones with identical rest translations — 1.x is Rig_Medium plus IK
// helper bones — and every deform bone is keyed directly in all three clips,
// so the 54 IK-helper channels per clip are redundant and get dropped with the
// bones they point at.
//
// The pack's own texture is kept rather than flat-repainted, unlike the knight
// build this replaces. It's a 15 KB atlas of flat gradient swatches, it's the
// same kind of texture the diorama props already use, and it's the only thing
// that separates hair from scalp: the head, hair and face are one primitive
// sharing one material, so a flat repaint would have shaved him bald.
//
// Usage: node scripts/build-runner.mjs  (rewrites public/models/runner.glb
// from assets-src/runner-rogue-original.glb + runner-knight-original.glb)
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  mergeDocuments,
  prune,
  unpartition,
} from "@gltf-transform/functions";

// Cheer is the third: the run used to END on a standing Idle, which reads as
// the runner giving up rather than finishing. It is 1.67s long and the results
// panel is held back 1800ms for the needle lift, so it plays out exactly in
// the gap between the last beat and the overlay.
const KEEP_ANIMATIONS = new Set(["Running_A", "Idle", "Cheer"]);

// The cape has to go. It is the one mesh in this file authored for a camera
// that isn't ours: a full-length sheet hanging off the shoulders, which from
// directly behind — where this game sits for 88 seconds — is a green slab
// covering the tunic, the belt, the boots and both legs. Everything that makes
// the Rogue read as a person in clothes is behind it.
const DROP_NODES = new Set(["Rogue_Cape", "Rogue_Head"]);

// The head comes off the Ranger. The Rogue's own hair is long enough to hang
// past the jaw, which from behind is a curtain the ear cups disappear into;
// the Ranger's is short and swept back, and his skull is ±0.543 wide against
// the Rogue's ±0.582 — the width the headphones were sized for in the first
// place. It has to be the whole head, not the hair: the two heads share zero
// vertices, so there is no common skull to graft a hairstyle onto, and face,
// hair and neck are one primitive anyway. His face comes along with it, which
// costs nothing in a game that only ever sees the back of it.
const HEAD = {
  file: "assets-src/runner-ranger-original.glb",
  node: "Ranger_Head",
  parent: "Rig_Medium",
};

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const url = (name) => new URL(`../${name}`, import.meta.url).pathname;

const doc = await io.read(url("assets-src/runner-rogue-original.glb"));
const clipDonor = await io.read(url("assets-src/runner-knight-original.glb"));
const root = doc.getRoot();

// Everything the Rogue file brought with it. After the merge, anything NOT in
// these sets arrived from the knight and has to leave again once its clips
// have been re-pointed.
for (const node of root.listNodes()) {
  if (DROP_NODES.has(node.getName())) node.dispose();
}

const ownNodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
const ownScenes = new Set(root.listScenes());
const ownAnimations = new Set(root.listAnimations());
const ownMeshes = new Set(root.listMeshes());
const ownMaterials = new Set(root.listMaterials());
const ownSkins = new Set(root.listSkins());

mergeDocuments(doc, clipDonor);

for (const anim of root.listAnimations()) {
  if (ownAnimations.has(anim)) continue;
  if (KEEP_ANIMATIONS.has(anim.getName())) {
    for (const channel of anim.listChannels()) {
      const target = ownNodes.get(channel.getTargetNode()?.getName());
      // no counterpart on Rig_Medium — an IK helper, and redundant
      if (!target) channel.dispose();
      else channel.setTargetNode(target);
    }
    continue;
  }
  // Disposing an animation alone leaves its samplers alive, which keeps the
  // keyframe accessors referenced and un-prunable.
  for (const channel of anim.listChannels()) channel.dispose();
  for (const sampler of anim.listSamplers()) sampler.dispose();
  anim.dispose();
}

// The knight himself — skeleton, meshes, texture and all — has served his
// purpose. Nodes go last so the channel re-pointing above is already done.
for (const scene of root.listScenes())
  if (!ownScenes.has(scene)) scene.dispose();
for (const skin of root.listSkins()) if (!ownSkins.has(skin)) skin.dispose();
for (const mesh of root.listMeshes()) if (!ownMeshes.has(mesh)) mesh.dispose();
for (const mat of root.listMaterials())
  if (!ownMaterials.has(mat)) mat.dispose();
for (const node of root.listNodes()) {
  if (!ownNodes.has(node.getName()) || ownNodes.get(node.getName()) !== node) {
    node.dispose();
  }
}

// Graft the Ranger's head onto the Rogue's skeleton. Every bone's inverse
// bind matrix is identical between the two files — same rig, same rest pose —
// so the only thing standing between them is joint ORDER, which differs per
// character. Remap JOINTS_0 through the bone names and the head binds to the
// body's own skin exactly as its original did.
const preHead = {
  nodes: new Set(root.listNodes()),
  scenes: new Set(root.listScenes()),
  skins: new Set(root.listSkins()),
  meshes: new Set(root.listMeshes()),
};
const headDonor = await io.read(url(HEAD.file));
mergeDocuments(doc, headDonor);

const headNode = root
  .listNodes()
  .find((n) => !preHead.nodes.has(n) && n.getName() === HEAD.node);
const bodySkin = [...preHead.skins][0];
const donorJoints = headNode.getSkin().listJoints();
const bodyIndexOf = new Map(
  bodySkin.listJoints().map((j, i) => [j.getName(), i]),
);
const remap = donorJoints.map((j) => {
  const i = bodyIndexOf.get(j.getName());
  if (i === undefined) throw new Error(`no ${j.getName()} on the body's rig`);
  return i;
});

for (const prim of headNode.getMesh().listPrimitives()) {
  const joints = prim.getAttribute("JOINTS_0");
  const array = joints.getArray();
  for (let i = 0; i < array.length; i++) array[i] = remap[array[i]];
  joints.setArray(array);
}
headNode.setSkin(bodySkin);
ownNodes.get(HEAD.parent).addChild(headNode);

// and the rest of the Ranger goes the way of the knight
for (const scene of root.listScenes())
  if (!preHead.scenes.has(scene) && !ownScenes.has(scene)) scene.dispose();
for (const skin of root.listSkins())
  if (!preHead.skins.has(skin)) skin.dispose();
for (const mesh of root.listMeshes())
  if (!preHead.meshes.has(mesh) && mesh !== headNode.getMesh()) mesh.dispose();
for (const node of root.listNodes())
  if (!preHead.nodes.has(node) && node !== headNode) node.dispose();

await doc.transform(
  dedup(),
  prune({ keepAttributes: false, keepIndices: false, keepLeaves: false }),
  unpartition(),
);
const out = url("public/models/runner.glb");
await io.write(out, doc);
console.log(
  `wrote ${out} — animations: ${root
    .listAnimations()
    .map((a) => `${a.getName()} (${a.listChannels().length} channels)`)
    .join(", ")}\n  meshes: ${root
    .listNodes()
    .filter((n) => n.getMesh())
    .map((n) => n.getName())
    .join(", ")}`,
);
