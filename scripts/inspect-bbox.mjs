// Print scene bbox and top-level structure per source model.
import { NodeIO, getBounds } from "@gltf-transform/core";
import { KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const scene =
    doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
  const anims = doc.getRoot().listAnimations().length;
  const skins = doc.getRoot().listSkins().length;
  const roots = scene.listChildren().map((n) => n.getName());
  console.log(
    `${file}\n  size ${JSON.stringify(size)} min ${JSON.stringify(b.min.map((v) => +v.toFixed(2)))} anims ${anims} skins ${skins}\n  roots: ${roots.join(", ")}`,
  );
}
