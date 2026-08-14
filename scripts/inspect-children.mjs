// Per-top-level-child bboxes — for picking one piece out of a multi-prop file.
import { NodeIO, getBounds } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const walk = (node, depth) => {
  const b = getBounds(node);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(2));
  console.log(
    `${"  ".repeat(depth)}${node.getName()} size ${JSON.stringify(size)} min ${JSON.stringify(b.min.map((v) => +v.toFixed(2)))} t ${JSON.stringify(node.getTranslation().map((v) => +v.toFixed(2)))} s ${JSON.stringify(node.getScale().map((v) => +v.toFixed(3)))}`,
  );
  if (depth < 2) for (const c of node.listChildren()) walk(c, depth + 1);
};
for (const n of scene.listChildren()) walk(n, 0);
