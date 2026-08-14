import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";
import { songProgress } from "../game/clock";
import { clockState } from "../game/clockState";
import { DISC_THICKNESS } from "../game/constants";
import { bandCenter, laneRadius } from "../game/geometry";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";

// Lane readability (the spec's own risk table: "widen laneGap or tilt the
// camera if lanes are ambiguous" — this is the third mitigation). Two cues,
// both in world space so they track the drifting band and the inward
// migration reads as the road spiraling in, not the runner sliding:
//
// - Rails: three thin arcs at the current lane radii, fading in behind the
//   player and out past the needle — the grooves the needle is reading catch
//   light. The committed lane glows in the record's accent colour.
// - Puck: an accent ring under the runner that snaps INSTANTLY to the
//   committed lane while the body lerps after it — collection resolves
//   against the committed integer lane (spec §6.4), and so does the puck.

const DISC_TOP = DISC_THICKNESS / 2;

// Arc window in world angle around the player (0 = at the runner; positive =
// ahead, toward the needle at +π/2 and the rise point at +π).
const ARC_BEHIND = -1.1;
const ARC_AHEAD = 2.5;

const RAIL_DIM = new Color("#9aa3b8");

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Unit-radius arc, scaled to each lane's radius per frame. Vertex alpha
// carries the fade along the arc; RingGeometry lies in the XY plane, and
// after rotation-x = -π/2 a vertex at geometry angle φ sits at world angle
// θ = φ + π/2, so the ramp is computed in θ directly.
function makeRailGeometry() {
  const geometry = new RingGeometry(
    0.992,
    1.008,
    96,
    1,
    ARC_BEHIND - Math.PI / 2,
    ARC_AHEAD - ARC_BEHIND,
  );
  const pos = geometry.getAttribute("position");
  const rgba = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const theta = Math.atan2(pos.getY(i), pos.getX(i)) + Math.PI / 2;
    const alpha =
      smooth(ARC_BEHIND, ARC_BEHIND + 0.6, theta) *
      (1 - smooth(ARC_AHEAD - 0.8, ARC_AHEAD, theta));
    rgba.set([1, 1, 1, alpha], i * 4);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(rgba, 4));
  return geometry;
}

function Rails() {
  const meshes = useRef<(Mesh | null)[]>([null, null, null]);
  const activation = useRef([0, 1, 0]); // runs start in the centre lane
  const geometry = useMemo(makeRailGeometry, []);
  const accent = useMemo(() => new Color(activeRun.record.accentColor), []);

  useFrame((_, delta) => {
    const { band, totalBeats } = activeRun.record;
    const committed = useGameStore.getState().lane;
    const vis = clockState.wall || clockState.ended ? 0 : 1;
    const progress = songProgress(clockState.beatPos, totalBeats);
    const center = bandCenter(progress, band.startRadius, band.endRadius);
    const k = 1 - Math.exp(-10 * delta);

    for (let lane = 0; lane < 3; lane++) {
      const mesh = meshes.current[lane];
      if (!mesh) continue;
      const a = activation.current;
      a[lane] += ((lane === committed ? 1 : 0) - a[lane]) * k;
      mesh.scale.setScalar(laneRadius(lane, center, band.laneGap));
      const m = mesh.material as MeshBasicMaterial;
      m.opacity += (vis * (0.14 + 0.56 * a[lane]) - m.opacity) * k;
      m.color.lerpColors(RAIL_DIM, accent, a[lane]);
      mesh.visible = m.opacity > 0.005;
    }
  });

  return (
    <group>
      {[0, 1, 2].map((lane) => (
        <mesh
          key={lane}
          ref={(el) => {
            meshes.current[lane] = el;
          }}
          geometry={geometry}
          rotation-x={-Math.PI / 2}
          position-y={DISC_TOP + 0.006}
          visible={false}
        >
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Puck() {
  const mesh = useRef<Mesh>(null);
  const prevLane = useRef(1);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const { band, totalBeats } = activeRun.record;
    const lane = useGameStore.getState().lane;
    const progress = songProgress(clockState.beatPos, totalBeats);
    const center = bandCenter(progress, band.startRadius, band.endRadius);
    m.position.set(0, DISC_TOP + 0.012, laneRadius(lane, center, band.laneGap));

    // pop on commit — the puck is already in the new groove while the body
    // is still crossing, which is exactly the point
    if (lane !== prevLane.current) {
      prevLane.current = lane;
      m.scale.setScalar(1.45);
    }
    const k = 1 - Math.exp(-9 * delta);
    m.scale.setScalar(m.scale.x + (1 - m.scale.x) * k);

    const mat = m.material as MeshBasicMaterial;
    const vis =
      clockState.playing && !clockState.ended && !clockState.wall ? 0.9 : 0;
    mat.opacity += (vis - mat.opacity) * k;
    m.visible = mat.opacity > 0.005;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} visible={false}>
      <ringGeometry args={[0.17, 0.235, 40]} />
      <meshBasicMaterial
        color={activeRun.record.accentColor}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
}

export function LaneGuides() {
  return (
    <>
      <Rails />
      <Puck />
    </>
  );
}
