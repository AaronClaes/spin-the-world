// Build the listener (spec §8.2) from KayKit's Adventurers pack (CC0, Kay
// Lousberg): the Rogue's body, the Ranger's head, three clips off two other
// files, and a repaint that turns the costume into a sweatshirt, jeans and
// trainers. Someone out for a run with headphones on — which is what the game
// is about, and which no amount of repainting a knight in plate would give.
//
// Four source files for one character wants explaining. Pack 1.x baked the
// whole 76-clip library into every character; 2.0 split the clips into a
// shared library, dropped some of them, and reanimated others. So each clip
// comes from whichever version animates it best: the run from 2.0, where the
// arms actually alternate, and the cheer from 1.x, which is the only version
// that has one.
//
// That is not retargeting onto a foreign rig (§4). All of it is one skeleton:
// the two versions share all 23 deform bones with identical rest translations
// (1.x is Rig_Medium plus IK helper bones), every deform bone is keyed
// directly in all three clips, and the 54 IK-helper channels per 1.x clip are
// redundant and get dropped with the bones they point at.
//
// The head alone keeps the pack's texture, because hair, face and neck are one
// primitive sharing one material there — flat-repaint it and he goes bald. The
// atlas is 13 KB of flat gradient swatches, the same kind the diorama props
// already use, so it costs nothing and breaks no style rule.
//
// Usage: node scripts/build-runner.mjs  (rewrites public/models/runner.glb
// from the runner-*.glb files in assets-src/)
import { NodeIO } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  mergeDocuments,
  prune,
  unpartition,
} from "@gltf-transform/functions";

// Which clip comes out of which file, and what it's called once it's here.
//
// Cheer is why the 1.x knight is still in the list at all: the run used to END
// on a standing Idle, which reads as the runner giving up rather than
// finishing, and 2.0's free animation set doesn't ship a Cheer. It's 1.67s
// against the 1800ms the results panel is already held back for the needle
// lift, so it plays out exactly in the gap before the overlay.
//
// Running_A is why 2.0's library is here. 1.x's run swings both arms the same
// way at once, and barely: measured in engine, the hands travel 0.081 model
// units against the feet's 0.600, and the two hands correlate at +0.79 rather
// than the −1 alternating limbs give. 2.0's reanimated version is a real run —
// hands at −0.91, travelling 0.58. Its longer stride is what STRIDE_SPEED in
// Runner.tsx had to be rescaled for.
// Walk and the three jump clips are here for explore mode, not for the run:
// a character controller needs a slow gait and an airborne state, and the
// groove needs neither. They cost ~60 KB in a file the game already preloads,
// which is cheaper than a second character GLB that has to stay in sync with
// this one's repaint.
const CLIPS = [
  [
    "assets-src/runner-movement-2.0.glb",
    new Map([
      ["Running_A", "Running_A"],
      ["Walking_A", "Walking_A"],
      ["Jump_Start", "Jump_Start"],
      ["Jump_Idle", "Jump_Idle"],
      ["Jump_Land", "Jump_Land"],
    ]),
  ],
  [
    "assets-src/runner-knight-original.glb",
    new Map([
      ["Idle", "Idle"],
      ["Cheer", "Cheer"],
    ]),
  ],
];

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

// Repaint the body out of costume and into clothes. The pack's atlas is a grid
// of swatches, so every part of the character is identifiable by which swatch
// its triangles sample: the belt is one rectangle of UV space, the bracers are
// another, the boots another. Splitting each mesh along those lines and giving
// each group a flat colour is both the repaint AND the way the adventurer gear
// leaves — a belt painted the same grey as the sweatshirt over it stops being
// a belt and becomes a fold, with no hole where it used to be. Nothing is
// deleted, which matters: these are shells laid over the body, and cutting
// them out would open it up.
//
// Head is exempt — it keeps the Ranger's texture, because hair and skin share
// a primitive there (see above).
const SKIN = "#f2c19d"; // the hands; the head's own atlas skin is ~#f8ccab
const TOP = "#848b98"; // heather-grey sweatshirt
const JEANS = "#414a63"; // dark denim — legs need to stay visible on vinyl
const SHOE = "#dfe3e8";
const SOLE = "#aab0b9";
const WATCH = "#2b2f36";

// [u0, u1, v0, v1] of the swatch, the part it belongs to, and optionally the
// only mesh it applies to — the metal swatch is a wrist strap on the arms and
// a belt buckle on the body, and those two want different answers.
const REPAINT = [
  { uv: [0.0, 0.12, 0.1, 0.22], color: SKIN, part: "hands" },
  { uv: [0.0, 0.12, 0.28, 0.47], color: TOP, part: "sweatshirt" },
  { uv: [0.14, 0.21, 0.3, 0.43], color: TOP, part: "sweatshirt yoke" },
  { uv: [0.62, 0.73, 0.05, 0.23], color: TOP, part: "belt and shoulders" },
  { uv: [0.75, 0.87, 0.05, 0.23], color: TOP, part: "straps and pouches" },
  { uv: [0.38, 0.48, 0.02, 0.2], color: TOP, part: "buckle", mesh: "Body" },
  { uv: [0.38, 0.48, 0.02, 0.2], color: WATCH, part: "watch", mesh: "Arm" },
  {
    uv: [0.88, 0.97, 0.34, 0.45],
    color: JEANS,
    part: "trousers",
    mesh: "Body",
  },
  { uv: [0.88, 0.97, 0.57, 0.71], color: SKIN, part: "bracers → forearms" },
  // The legs are cut by HEIGHT rather than by swatch, because the boot is one
  // swatch from sole to knee and a knee-high white boot is not what anyone
  // means by trainers. The mesh hands us the seams: the vertex rings sit at
  // 0.169 and 0.186 with a gap above, so a cut at 0.18 lands on a ring rather
  // than through a face, and the boot shaft above it — flared cuff and all —
  // reads as the fold at the bottom of a trouser leg.
  { mesh: "Leg", y: [-9, 0.045], color: SOLE, part: "soles" },
  { mesh: "Leg", y: [0.045, 0.18], color: SHOE, part: "trainers" },
  { mesh: "Leg", y: [0.18, 9], color: JEANS, part: "trouser legs" },
];

const hexToLinear = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [16, 8, 0].map((s) => (((n >> s) & 255) / 255) ** 2.2).concat(1);
};

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const url = (name) => new URL(`../${name}`, import.meta.url).pathname;

const doc = await io.read(url("assets-src/runner-rogue-original.glb"));
const root = doc.getRoot();

for (const node of root.listNodes()) {
  if (DROP_NODES.has(node.getName())) node.dispose();
}

// Everything the Rogue file brought with it. After each merge, anything NOT in
// these sets arrived from a donor and has to leave again once the clips it
// came for have been re-pointed.
const ownNodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
const ownScenes = new Set(root.listScenes());
const ownAnimations = new Set(root.listAnimations());
const ownMeshes = new Set(root.listMeshes());
const ownMaterials = new Set(root.listMaterials());
const ownSkins = new Set(root.listSkins());

for (const [file, wanted] of CLIPS) {
  mergeDocuments(doc, await io.read(url(file)));

  for (const anim of root.listAnimations()) {
    if (ownAnimations.has(anim)) continue;
    const keep = wanted.get(anim.getName());
    if (keep) {
      anim.setName(keep);
      ownAnimations.add(anim);
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

  // The donor's own body — skeleton, meshes, texture and all — has served its
  // purpose. Nodes go last so the channel re-pointing above is already done.
  for (const scene of root.listScenes())
    if (!ownScenes.has(scene)) scene.dispose();
  for (const skin of root.listSkins()) if (!ownSkins.has(skin)) skin.dispose();
  for (const mesh of root.listMeshes())
    if (!ownMeshes.has(mesh)) mesh.dispose();
  for (const mat of root.listMaterials())
    if (!ownMaterials.has(mat)) mat.dispose();
  for (const node of root.listNodes()) {
    if (
      !ownNodes.has(node.getName()) ||
      ownNodes.get(node.getName()) !== node
    ) {
      node.dispose();
    }
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

// Split every body mesh along swatch boundaries and paint the pieces. The
// triangles keep pointing at the same POSITION/JOINTS/WEIGHTS accessors — only
// the index buffer is new — so the split costs nothing in vertex data and the
// skinning is untouched.
const flat = new Map();
const material = (hex) => {
  if (!flat.has(hex)) {
    flat.set(
      hex,
      doc
        .createMaterial(`flat${hex}`)
        .setBaseColorFactor(hexToLinear(hex))
        .setMetallicFactor(0)
        .setRoughnessFactor(0.9),
    );
  }
  return flat.get(hex);
};

const buffer = root.listBuffers()[0];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || node === headNode) continue;

  for (const prim of mesh.listPrimitives()) {
    const uv = prim.getAttribute("TEXCOORD_0").getArray();
    const pos = prim.getAttribute("POSITION").getArray();
    const indices = prim.getIndices().getArray();
    const groups = new Map();
    let unmatched = 0;

    for (let t = 0; t < indices.length; t += 3) {
      let u = 0;
      let v = 0;
      let y = 0;
      for (const k of [0, 1, 2]) {
        u += uv[indices[t + k] * 2] / 3;
        v += uv[indices[t + k] * 2 + 1] / 3;
        y += pos[indices[t + k] * 3 + 1] / 3;
      }
      const rule = REPAINT.find(
        (r) =>
          (!r.uv ||
            (u >= r.uv[0] && u <= r.uv[1] && v >= r.uv[2] && v <= r.uv[3])) &&
          (!r.y || (y >= r.y[0] && y < r.y[1])) &&
          (!r.mesh || node.getName().includes(r.mesh)),
      );
      if (!rule) {
        unmatched++;
        continue;
      }
      if (!groups.has(rule.color)) groups.set(rule.color, []);
      groups.get(rule.color).push(indices[t], indices[t + 1], indices[t + 2]);
    }
    if (unmatched) {
      throw new Error(
        `${node.getName()}: ${unmatched} triangles match no swatch — the atlas layout moved`,
      );
    }

    for (const [hex, list] of groups) {
      const split = doc
        .createPrimitive()
        .setMaterial(material(hex))
        .setIndices(
          doc
            .createAccessor()
            .setType("SCALAR")
            .setArray(new Uint16Array(list))
            .setBuffer(buffer),
        );
      for (const name of prim.listSemantics()) {
        split.setAttribute(name, prim.getAttribute(name));
      }
      mesh.addPrimitive(split);
    }
    mesh.removePrimitive(prim);
    prim.dispose();
  }
}

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
