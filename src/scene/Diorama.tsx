import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { DISC_THICKNESS, LABEL_RADIUS } from "../game/constants";
import { itemLocalAngle, itemRadius } from "../game/geometry";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";
import { usePropClone } from "./dioramaProps";
import { activeFlights, FLIGHT_DURATION } from "./flights";

// The tiny world on the label (spec §8.4): real kitbashed props now — each
// collected piece flies in from its groove with an arc and plants itself with
// an overshoot. On full completion the world comes alive: everything bobs
// and the whole meadow slowly breathes with the music.

const GOLDEN_ANGLE = 2.399963;
const DISC_TOP = DISC_THICKNESS / 2;
const ARC_HEIGHT = 0.85;
const GRASS_RADIUS = LABEL_RADIUS - 0.12; // label paper stays visible as a rim

export function slotPosition(index: number, count: number): [number, number] {
  const angle = index * GOLDEN_ANGLE;
  const r = 0.28 + 0.55 * Math.sqrt((index + 0.5) / count);
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

// One pre-cloned prop per world piece; a flight shows and moves its own prop.
// The clone's node transform is the kitbash normalization — position the
// wrapper, never the clone.
function FlightProp({ prop }: { prop: string }) {
  const clone = usePropClone(prop);
  const group = useRef<Group>(null);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const f = activeFlights.find((fl) => fl.prop === prop);
    if (!f || f.startedAt === null) {
      g.visible = false;
      return;
    }
    const { band, totalBeats, worldPieces } = activeRun.record;
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
    const slot = worldPieces.findIndex((p) => p.prop === prop);
    const [sx, sz] = slotPosition(slot, worldPieces.length);

    const x0 = Math.sin(angle) * r;
    const z0 = Math.cos(angle) * r;
    g.visible = true;
    g.position.set(
      x0 + (sx - x0) * t,
      DISC_TOP + 0.015 + ARC_HEIGHT * 4 * t * (1 - t),
      z0 + (sz - z0) * t,
    );
    g.rotation.y = t * Math.PI * 2 + slot * GOLDEN_ANGLE;
  });

  return (
    <group ref={group} visible={false}>
      <primitive object={clone} />
    </group>
  );
}

function Flights() {
  const props = activeRun.record.worldPieces.map((p) => p.prop);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    for (let i = activeFlights.length - 1; i >= 0; i--) {
      const f = activeFlights[i];
      if (f.startedAt === null) f.startedAt = now;
      if (now - f.startedAt >= FLIGHT_DURATION) activeFlights.splice(i, 1);
    }
  });

  return (
    <>
      {props.map((prop) => (
        <FlightProp key={prop} prop={prop} />
      ))}
    </>
  );
}

// ------------------------------------------------------------ the world ----

function PlantedProp({
  prop,
  index,
  count,
  alive,
}: {
  prop: string;
  index: number;
  count: number;
  alive: boolean;
}) {
  const clone = usePropClone(prop);
  const group = useRef<Group>(null);
  const bornAt = useRef<number | null>(null);
  const [x, z] = slotPosition(index, count);
  const baseY = DISC_TOP + 0.014; // standing on the grass

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    // Scale-in starts when the fly-in lands, not when the piece is caught.
    if (bornAt.current === null)
      bornAt.current = clock.elapsedTime + FLIGHT_DURATION;
    const t = (clock.elapsedTime - bornAt.current) / 0.45;
    if (t < 0) {
      group.current.scale.setScalar(0.0001);
      return;
    }
    group.current.scale.setScalar(easeOutBack(Math.min(1, t)));

    if (alive) {
      group.current.position.y =
        baseY + Math.sin(clock.elapsedTime * 2.2 + index * 1.3) * 0.018;
      group.current.rotation.y += delta * 0.25;
    } else {
      group.current.position.y = baseY;
      group.current.rotation.y = index * GOLDEN_ANGLE;
    }
  });

  return (
    <group
      ref={group}
      position={[x, baseY, z]}
      rotation-y={index * GOLDEN_ANGLE}
      scale={0.0001}
    >
      <primitive object={clone} />
      {/* the pond prop is a waterlily — give it water to float on */}
      {prop === "pond" && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
          <circleGeometry args={[0.16, 24]} />
          <meshStandardMaterial color="#3f6fa8" roughness={0.25} />
        </mesh>
      )}
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
      {/* meadow ground — the label's base terrain, there from beat 0.
          Sits just above the label cylinder's top face (DISC_TOP + 0.009). */}
      <mesh rotation-x={-Math.PI / 2} position-y={DISC_TOP + 0.012}>
        <circleGeometry args={[GRASS_RADIUS, 48]} />
        <meshStandardMaterial color="#6d9c52" roughness={0.9} />
      </mesh>
      {collected.map((prop) => (
        <PlantedProp
          key={prop}
          prop={prop}
          index={props.indexOf(prop)}
          count={props.length}
          alive={alive}
        />
      ))}
    </>
  );
}
