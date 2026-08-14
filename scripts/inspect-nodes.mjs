// Dump the node tree of a GLB — names, mesh/skin flags, parent chains.
// Usage: node scripts/inspect-nodes.mjs <file.glb>
import { NodeIO } from "@gltf-transform/core";

const io = new NodeIO();
const doc = await io.read(process.argv[2]);

for (const scene of doc.getRoot().listScenes()) {
  const walk = (node, depth) => {
    const flags = [
      node.getMesh() ? "mesh" : null,
      node.getSkin() ? "skinned" : null,
    ]
      .filter(Boolean)
      .join(",");
    console.log(
      "  ".repeat(depth) + node.getName() + (flags ? `  [${flags}]` : ""),
    );
    for (const child of node.listChildren()) walk(child, depth + 1);
  };
  for (const node of scene.listChildren()) walk(node, 0);
}
