import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedMesh,
  Mesh,
  Object3D,
} from "three";
import type { MeshBasicMaterial } from "three";
import {
  CAP_H,
  HEX_R,
  ISLAND_BASE,
  type IslandDef,
  type Tile,
  tileTop,
} from "./islandLayout";

// The terrain plate under the tiny world. Two instanced meshes and nothing
// else: soil prisms for the body, a coloured lip for the top of each tile.
// The lip is a shallow prism rather than a flat cap so tile edges catch the
// key light — that's what makes a hex plate read as tiles instead of a
// painted pattern.
//
// The layout and palette come in as an IslandDef — one per record — and the
// instance counts are baked at construction, so this component is remounted
// (keyed on the record) rather than updated when the shelf selection changes.

const SOIL = "#8a6440";

// the whole plate warms a shade when the world comes alive (spec §8.4)
const ALIVE_TINT = new Color("#ffe9b0");

// per-tile green variation, so 31 identical hexes don't read as a gradientless
// slab. Deterministic — the island looks the same every run.
const jitter = (q: number, r: number) => {
  const x = Math.sin(q * 91.7 + r * 47.3) * 12345.678;
  return x - Math.floor(x) - 0.5;
};

// ----------------------------------------------------------- contact ring --

// Nothing casts real shadows here, so the plate gets a soft dark ring bleeding
// outward onto the label paper. Without it the island floats a millimetre
// above its own label.
const ringVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFrag = /* glsl */ `
  uniform float uInner;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    gl_FragColor = vec4(0.20, 0.13, 0.06,
                        (1.0 - smoothstep(uInner, 1.0, d)) * uStrength);
  }
`;

function ContactRing({ y, radius }: { y: number; radius: number }) {
  const shadowR = radius + 0.11;
  const uniforms = useMemo(
    () => ({
      uInner: { value: (radius - 0.02) / shadowR },
      uStrength: { value: 0.42 },
    }),
    [radius, shadowR],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={y}>
      <planeGeometry args={[shadowR * 2, shadowR * 2]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={ringVert}
        fragmentShader={ringFrag}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// ------------------------------------------------------- completion sweep --

// The one-shot flourish when the tenth piece lands: a bright ring runs out
// across the plate. The camera stays where it is — the world does the moving.
const SWEEP_SECS = 1.1;

function CompletionSweep({
  alive,
  radius,
}: {
  alive: boolean;
  radius: number;
}) {
  const ring = useRef<Mesh>(null);
  const startedAt = useRef<number | null>(null);
  const wasAlive = useRef(alive);

  useFrame(({ clock }) => {
    const m = ring.current;
    if (!m) return;
    if (alive !== wasAlive.current) {
      wasAlive.current = alive;
      startedAt.current = alive ? clock.elapsedTime : null;
    }
    if (startedAt.current === null) {
      m.visible = false;
      return;
    }
    const t = (clock.elapsedTime - startedAt.current) / SWEEP_SECS;
    if (t >= 1) {
      m.visible = false;
      startedAt.current = null;
      return;
    }
    m.visible = true;
    m.scale.setScalar(0.06 + t * (radius + 0.06));
    (m.material as MeshBasicMaterial).opacity = 0.75 * (1 - t) ** 1.5;
  });

  return (
    <mesh
      ref={ring}
      visible={false}
      rotation-x={-Math.PI / 2}
      position-y={tileTop("hill") + 0.03}
    >
      <ringGeometry args={[0.72, 1, 40]} />
      <meshBasicMaterial
        color="#fff3c8"
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
}

// ------------------------------------------------------------- lit kerbs --

// A thin band of light around the top edge of every tile of a lit kind. One
// open-ended six-sided cylinder per tile, sharing the caps' geometry
// parameters so the hexes line up exactly, and additive so it can only
// brighten — over near-black vinyl ordinary transparency would drag these to
// grey, which is the same trap the lighthouse beam fell into.
//
// Instanced and coloured per instance, so a whole street plan costs one draw
// call. The whole set breathes on one clock: these are the ground, not
// individual fittings, and they should feel like one circuit.
// Sat level with the cap the band came out dashed: where a lit tile meets a
// taller one, the neighbour's cap swallowed half the ring. It rides just
// proud of the tile top and a hair wider than the cap instead.
const KERB_H = 0.01;
const KERB_R = HEX_R * 1.004;

function LitKerbs({ island, alive }: { island: IslandDef; alive: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const lit = useMemo(
    () =>
      island.glow
        ? island.tiles
            .map((t) => ({ t, color: island.glow?.[t.kind] }))
            .filter((e): e is { t: Tile; color: string } => !!e.color)
        : [],
    [island],
  );

  const layout = (inst: InstancedMesh) => {
    const d = new Object3D();
    lit.forEach(({ t, color }, i) => {
      d.position.set(t.x, tileTop(t.kind) + KERB_H * 0.32, t.z);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      inst.setColorAt(i, new Color(color));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
  };

  useFrame(({ clock }) => {
    if (!material.current) return;
    const t = clock.elapsedTime;
    material.current.opacity =
      (alive ? 0.95 : 0.78) * (0.86 + 0.14 * Math.sin(t * 1.25));
  });

  if (!lit.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, lit.length]}
      onUpdate={layout}
      renderOrder={2}
    >
      <cylinderGeometry args={[KERB_R, KERB_R, KERB_H, 6, 1, true]} />
      <meshBasicMaterial
        ref={material}
        transparent
        opacity={0.78}
        blending={AdditiveBlending}
        depthWrite={false}
        side={DoubleSide}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

// -------------------------------------------------------------- the plate --

export function Island({
  island,
  alive,
}: {
  island: IslandDef;
  alive: boolean;
}) {
  const { tiles, radius, palette } = island;
  const caps = useRef<InstancedMesh>(null);
  const aliveMix = useRef(0);
  const water = useMemo(() => new Color(palette.water), [palette.water]);
  const waterLit = useMemo(() => new Color(island.waterLit), [island.waterLit]);
  const waterTiles = useMemo(
    () => tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.kind === "water"),
    [tiles],
  );
  const baseColors = useMemo(
    () =>
      tiles.map((t) => {
        const c = new Color(palette[t.kind]);
        // per-tile variation, so 31 identical hexes don't read as a
        // gradientless slab — only on the ground cover, never on water or
        // the worked surfaces
        if (t.kind === "grass" || t.kind === "hill" || t.kind === "sand")
          c.offsetHSL(jitter(t.q, t.r) * 0.02, 0, jitter(t.r, t.q) * 0.05);
        return c;
      }),
    [tiles, palette],
  );
  const scratch = useMemo(() => new Color(), []);

  const layoutBody = (inst: InstancedMesh) => {
    const d = new Object3D();
    tiles.forEach((t, i) => {
      // the soil column runs from the label up to the underside of the lip;
      // the pond's lip nearly touches the label, so the column can vanish
      const capBottom = tileTop(t.kind) - CAP_H;
      const h = Math.max(0.004, capBottom - ISLAND_BASE);
      d.position.set(t.x, ISLAND_BASE + h / 2, t.z);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
  };

  const layoutCaps = (inst: InstancedMesh) => {
    const d = new Object3D();
    tiles.forEach((t, i) => {
      d.position.set(t.x, tileTop(t.kind) - CAP_H / 2, t.z);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      inst.setColorAt(i, baseColors[i]);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
  };

  useFrame(({ clock }, delta) => {
    const inst = caps.current;
    if (!inst?.instanceColor) return;
    aliveMix.current +=
      ((alive ? 1 : 0) - aliveMix.current) * (1 - Math.exp(-2 * delta));

    const t = clock.elapsedTime;
    for (const { t: tile, i } of waterTiles) {
      const s = 0.5 + 0.5 * Math.sin(t * 1.3 + tile.q * 2.1 + tile.r * 1.4);
      scratch.copy(water).lerp(waterLit, 0.25 + s * 0.45);
      if (aliveMix.current > 0.01)
        scratch.lerp(ALIVE_TINT, aliveMix.current * 0.08);
      inst.setColorAt(i, scratch);
    }
    // the land only needs repainting while the alive tint is still moving
    if (aliveMix.current > 0.01 && aliveMix.current < 0.995) {
      tiles.forEach((tile, i) => {
        if (tile.kind === "water") return;
        scratch.copy(baseColors[i]).lerp(ALIVE_TINT, aliveMix.current * 0.1);
        inst.setColorAt(i, scratch);
      });
    }
    inst.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <ContactRing y={ISLAND_BASE + 0.001} radius={radius} />
      <instancedMesh
        args={[undefined, undefined, tiles.length]}
        onUpdate={layoutBody}
      >
        <cylinderGeometry args={[HEX_R, HEX_R, 1, 6]} />
        <meshStandardMaterial color={SOIL} roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={caps}
        args={[undefined, undefined, tiles.length]}
        onUpdate={layoutCaps}
      >
        <cylinderGeometry args={[HEX_R, HEX_R, CAP_H, 6]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
      <LitKerbs island={island} alive={alive} />
      <CompletionSweep alive={alive} radius={radius} />
    </>
  );
}
