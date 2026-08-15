import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, InstancedMesh, Mesh, Object3D } from "three";
import type { MeshBasicMaterial } from "three";
import {
  CAP_H,
  HEX_R,
  ISLAND_BASE,
  ISLAND_RADIUS,
  TILES,
  tileTop,
  type TileKind,
} from "./islandLayout";

// The terrain plate under the tiny world. Two instanced meshes and nothing
// else: soil prisms for the body, a coloured lip for the top of each tile.
// The lip is a shallow prism rather than a flat cap so tile edges catch the
// key light — that's what makes a hex plate read as tiles instead of a
// painted pattern.

const SOIL = "#8a6440";

const CAP: Record<TileKind, Color> = {
  grass: new Color("#5f9c44"),
  hill: new Color("#6cab4f"),
  path: new Color("#b8925e"),
  water: new Color("#3f83bd"),
};

// water gets a second tone to shimmer between
const WATER_LIT = new Color("#6fb6e0");
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

const SHADOW_R = ISLAND_RADIUS + 0.11;

function ContactRing({ y }: { y: number }) {
  const uniforms = useMemo(
    () => ({
      uInner: { value: (ISLAND_RADIUS - 0.02) / SHADOW_R },
      uStrength: { value: 0.42 },
    }),
    [],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={y}>
      <planeGeometry args={[SHADOW_R * 2, SHADOW_R * 2]} />
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

function CompletionSweep({ alive }: { alive: boolean }) {
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
    m.scale.setScalar(0.06 + t * (ISLAND_RADIUS + 0.06));
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

// -------------------------------------------------------------- the plate --

export function Island({ alive }: { alive: boolean }) {
  const caps = useRef<InstancedMesh>(null);
  const aliveMix = useRef(0);
  const waterTiles = useMemo(
    () => TILES.map((t, i) => ({ t, i })).filter(({ t }) => t.kind === "water"),
    [],
  );
  const baseColors = useMemo(
    () =>
      TILES.map((t) => {
        const c = CAP[t.kind].clone();
        if (t.kind === "grass" || t.kind === "hill")
          c.offsetHSL(jitter(t.q, t.r) * 0.02, 0, jitter(t.r, t.q) * 0.05);
        return c;
      }),
    [],
  );
  const scratch = useMemo(() => new Color(), []);

  const layoutBody = (inst: InstancedMesh) => {
    const d = new Object3D();
    TILES.forEach((t, i) => {
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
    TILES.forEach((t, i) => {
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
      scratch.copy(CAP.water).lerp(WATER_LIT, 0.25 + s * 0.45);
      if (aliveMix.current > 0.01)
        scratch.lerp(ALIVE_TINT, aliveMix.current * 0.08);
      inst.setColorAt(i, scratch);
    }
    // the land only needs repainting while the alive tint is still moving
    if (aliveMix.current > 0.01 && aliveMix.current < 0.995) {
      TILES.forEach((tile, i) => {
        if (tile.kind === "water") return;
        scratch.copy(baseColors[i]).lerp(ALIVE_TINT, aliveMix.current * 0.1);
        inst.setColorAt(i, scratch);
      });
    }
    inst.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <ContactRing y={ISLAND_BASE + 0.001} />
      <instancedMesh
        args={[undefined, undefined, TILES.length]}
        onUpdate={layoutBody}
      >
        <cylinderGeometry args={[HEX_R, HEX_R, 1, 6]} />
        <meshStandardMaterial color={SOIL} roughness={0.95} />
      </instancedMesh>
      <instancedMesh
        ref={caps}
        args={[undefined, undefined, TILES.length]}
        onUpdate={layoutCaps}
      >
        <cylinderGeometry args={[HEX_R, HEX_R, CAP_H, 6]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
      <CompletionSweep alive={alive} />
    </>
  );
}
