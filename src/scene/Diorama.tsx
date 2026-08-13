import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Group, Mesh } from "three";
import { DISC_THICKNESS } from "../game/constants";
import { itemLocalAngle, itemRadius } from "../game/geometry";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";
import { activeFlights, FLIGHT_DURATION } from "./flights";

// M3 diorama: still grey boxes (real props are the art pass), but pieces now
// fly in from the groove with an arc (spec §8.4), the box scales in with an
// overshoot when the flight lands, and on full completion the whole label
// gently comes alive — boxes bob and slowly turn.

const GOLDEN_ANGLE = 2.399963;
const DISC_TOP = DISC_THICKNESS / 2;
const ARC_HEIGHT = 0.85;
const MAX_VISIBLE_FLIGHTS = 4;

function slotPosition(index: number, count: number): [number, number] {
  const angle = index * GOLDEN_ANGLE;
  const r = 0.3 + 0.6 * Math.sqrt((index + 0.5) / count);
  return [Math.sin(angle) * r, Math.cos(angle) * r];
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

// ------------------------------------------------------------ fly-in arc ----

// A small pool of meshes animated imperatively — flights are transient and
// at most a couple overlap (a same-frame double catch of recurred pieces).
function Flights() {
  const pool = useRef<(Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    const { band, totalBeats, worldPieces } = activeRun.record;

    for (let i = activeFlights.length - 1; i >= 0; i--) {
      const f = activeFlights[i];
      if (f.startedAt === null) f.startedAt = now;
      if (now - f.startedAt >= FLIGHT_DURATION) activeFlights.splice(i, 1);
    }

    for (let i = 0; i < MAX_VISIBLE_FLIGHTS; i++) {
      const mesh = pool.current[i];
      if (!mesh) continue;
      const f = activeFlights[i];
      if (!f || f.startedAt === null) {
        mesh.visible = false;
        continue;
      }

      const t = easeInOutQuad(
        Math.min(1, (clock.elapsedTime - f.startedAt) / FLIGHT_DURATION),
      );
      const angle = itemLocalAngle(f.beat);
      const r = itemRadius(
        f.lane,
        f.beat,
        totalBeats,
        band.startRadius,
        band.endRadius,
        band.laneGap,
      );
      const slot = worldPieces.findIndex((p) => p.prop === f.prop);
      const [sx, sz] = slotPosition(slot, worldPieces.length);

      const x0 = Math.sin(angle) * r;
      const z0 = Math.cos(angle) * r;
      mesh.visible = true;
      mesh.position.set(
        x0 + (sx - x0) * t,
        DISC_TOP + 0.16 + ARC_HEIGHT * 4 * t * (1 - t),
        z0 + (sz - z0) * t,
      );
      mesh.rotation.y = t * Math.PI * 2;
      mesh.scale.setScalar(1 - 0.35 * t); // shrinks toward miniature scale
    }
  });

  return (
    <>
      {Array.from({ length: MAX_VISIBLE_FLIGHTS }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            pool.current[i] = m;
          }}
          visible={false}
        >
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshStandardMaterial
            color="#e8e9ec"
            emissive="#ffffff"
            emissiveIntensity={0.3}
            roughness={0.5}
          />
        </mesh>
      ))}
    </>
  );
}

// ------------------------------------------------------------ label boxes ----

function PieceBox({
  index,
  count,
  alive,
}: {
  index: number;
  count: number;
  alive: boolean;
}) {
  const group = useRef<Group>(null);
  const bornAt = useRef<number | null>(null);
  const [x, z] = slotPosition(index, count);
  const height = 0.12 + (index % 3) * 0.05;
  const baseY = DISC_TOP + height / 2 + 0.01;

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    // Scale-in starts when the fly-in lands, not when the piece is caught.
    if (bornAt.current === null)
      bornAt.current = clock.elapsedTime + FLIGHT_DURATION;
    const t = (clock.elapsedTime - bornAt.current) / 0.45;
    if (t < 0) {
      group.current.scale.setScalar(0);
      return;
    }
    group.current.scale.setScalar(easeOutBack(Math.min(1, t)));

    if (alive) {
      group.current.position.y =
        baseY + Math.sin(clock.elapsedTime * 2.2 + index * 1.3) * 0.025;
      group.current.rotation.y += delta * 0.5;
    } else {
      group.current.position.y = baseY;
    }
  });

  return (
    <group ref={group} position={[x, baseY, z]} scale={0}>
      <mesh rotation-y={index * GOLDEN_ANGLE}>
        <boxGeometry args={[0.16, height, 0.16]} />
        <meshStandardMaterial color="#b9bec7" roughness={0.7} />
      </mesh>
    </group>
  );
}

export function Diorama() {
  const collected = useGameStore((s) => s.piecesCollected);
  const props = activeRun.record.worldPieces.map((p) => p.prop);
  const alive = collected.length === props.length;

  return (
    <>
      <Flights />
      {collected.map((prop) => (
        <PieceBox
          key={prop}
          index={props.indexOf(prop)}
          count={props.length}
          alive={alive}
        />
      ))}
    </>
  );
}
