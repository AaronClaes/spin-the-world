import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Mesh, MeshBasicMaterial } from "three";
import type { Group, Object3D } from "three";
import { DISC_THICKNESS } from "../game/constants";
import { itemLocalAngle, itemRadius } from "../game/geometry";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";
import { usePropClone } from "./dioramaProps";
import { activeFlights, FLIGHT_DURATION } from "./flights";
import { Island } from "./Island";
import { placementFor } from "./islandLayout";

// The tiny world on the label (spec §8.4). Three states per piece, and the
// point of the whole game is watching a piece move through them:
//
//   ghost    — a faint silhouette standing in its final spot from beat 0, so
//              the plan of the world is visible before you've built any of it
//   flight   — caught, arcing in from its groove
//   planted  — solid, with a landing puff, and alive from the moment it lands
//
// Props used to be scattered on a golden-angle spiral and frozen until all ten
// were caught. Both are gone: positions are authored per prop in island.ts,
// and every piece has an idle of its own (sails turn, sheep hop, smoke rises)
// the instant it arrives.

const DISC_TOP = DISC_THICKNESS / 2;
const ARC_HEIGHT = 0.85;

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

// Swap every material on a clone for one flat override. The clone shares its
// materials with the GLB template, so this must assign — never mutate.
function repaint(root: Object3D, material: MeshBasicMaterial) {
  root.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).material = material;
  });
}

// ------------------------------------------------------------ fly-in arc ----

// One pre-cloned prop per world piece; a flight shows and moves its own prop.
// The clone's node transform is the kitbash normalization — position the
// wrapper, never the clone.
function FlightProp({ prop }: { prop: string }) {
  const clone = usePropClone(prop);
  const group = useRef<Group>(null);
  const target = useMemo(() => placementFor(prop), [prop]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const f = activeFlights.find((fl) => fl.prop === prop);
    if (!f || f.startedAt === null) {
      g.visible = false;
      return;
    }
    const { band, totalBeats } = activeRun.record;
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

    const x0 = Math.sin(angle) * r;
    const z0 = Math.cos(angle) * r;
    g.visible = true;
    g.position.set(
      x0 + (target.x - x0) * t,
      DISC_TOP +
        0.015 +
        (target.y - DISC_TOP - 0.015) * t +
        ARC_HEIGHT * 4 * t * (1 - t),
      z0 + (target.z - z0) * t,
    );
    // one full turn on the way in, settling on the rotation it will stand at
    g.rotation.y = target.rot + t * Math.PI * 2;
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

// ---------------------------------------------------------------- ghosts ----

// What the world is going to be. Unlit and barely there, so it reads as a
// plan rather than as a prop you failed to collect — and it breathes, which
// separates it from the solid pieces standing next to it.
const GHOST_OPACITY = 0.05;

function GhostProp({ prop, collected }: { prop: string; collected: boolean }) {
  const clone = usePropClone(prop);
  const group = useRef<Group>(null);
  const spot = useMemo(() => placementFor(prop), [prop]);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#eef7ff",
        transparent: true,
        opacity: GHOST_OPACITY,
        depthWrite: false,
      }),
    [],
  );
  useMemo(() => repaint(clone, material), [clone, material]);

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    // fade out over the flight, so the ghost is gone exactly as the real
    // piece touches down on top of it
    const target = collected ? 0 : GHOST_OPACITY;
    const k = 1 - Math.exp(-(collected ? 3 / FLIGHT_DURATION : 2) * delta);
    material.opacity += (target - material.opacity) * k;
    g.visible = material.opacity > 0.005;
    if (!g.visible) return;
    const breathe = 1 + Math.sin(clock.elapsedTime * 1.6 + spot.x * 4) * 0.014;
    g.scale.setScalar(breathe);
  });

  return (
    <group
      ref={group}
      position={[spot.x, spot.y, spot.z]}
      rotation-y={spot.rot}
    >
      <primitive object={clone} />
    </group>
  );
}

// --------------------------------------------------------------- planted ----

// The cottage came out of the kitbash without a chimney, so it gets one here:
// a stone stub straddling the roof ridge, and four puffs on a loop above it,
// rising and swelling as they thin out. Smoke needs somewhere to come from —
// without the stub the puffs read as bubbles leaving the roof.
const PUFFS = 4;
const PUFF_LIFE = 2.6;

function ChimneySmoke() {
  const puffs = useRef<(Mesh | null)[]>([]);
  const materials = useMemo(
    () =>
      Array.from(
        { length: PUFFS },
        () =>
          new MeshBasicMaterial({
            color: "#f2f6fa",
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
      ),
    [],
  );

  useFrame(({ clock }) => {
    for (let i = 0; i < PUFFS; i++) {
      const m = puffs.current[i];
      if (!m) continue;
      const t =
        ((clock.elapsedTime + (i * PUFF_LIFE) / PUFFS) % PUFF_LIFE) / PUFF_LIFE;
      m.position.set(
        Math.sin(t * 3.4 + i) * 0.02 * t,
        t * 0.13,
        Math.cos(t * 2.7 + i) * 0.018 * t,
      );
      m.scale.setScalar(0.007 + t * 0.015);
      materials[i].opacity = 0.34 * Math.sin(Math.PI * Math.min(1, t * 1.4));
    }
  });

  return (
    <>
      <mesh position-y={0.3}>
        <boxGeometry args={[0.036, 0.11, 0.036]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.85} />
      </mesh>
      <group position-y={0.356}>
        {Array.from({ length: PUFFS }, (_, i) => (
          <mesh
            key={i}
            material={materials[i]}
            ref={(m) => {
              puffs.current[i] = m;
            }}
          >
            <sphereGeometry args={[1, 7, 6]} />
          </mesh>
        ))}
      </group>
    </>
  );
}

// The puff of dust a piece kicks up when it plants.
const DUST_LIFE = 0.5;

function LandingDust({ bornAt }: { bornAt: { current: number | null } }) {
  const ring = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: "#e8d6b4",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );

  useFrame(({ clock }) => {
    const m = ring.current;
    if (!m || bornAt.current === null) return;
    const t = (clock.elapsedTime - bornAt.current) / DUST_LIFE;
    if (t < 0 || t >= 1) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.scale.setScalar(0.04 + t * 0.14);
    material.opacity = 0.65 * (1 - t) ** 2;
  });

  return (
    <mesh
      ref={ring}
      visible={false}
      material={material}
      rotation-x={-Math.PI / 2}
      position-y={0.004}
    >
      <ringGeometry args={[0.55, 1, 20]} />
    </mesh>
  );
}

const ALIVE_HOP = 0.55; // the coordinated hop when the tenth piece lands

function PlantedProp({ prop, alive }: { prop: string; alive: boolean }) {
  const clone = usePropClone(prop);
  const group = useRef<Group>(null);
  const bornAt = useRef<number | null>(null);
  const aliveAt = useRef<number | null>(null);
  const wasAlive = useRef(alive);
  const spot = useMemo(() => placementFor(prop), [prop]);
  // the windmill's sails are their own node in the kitbash — the one part of
  // any prop that can turn on its own
  const sails = useMemo(
    () => clone.getObjectByName("building_windmill_top_fan_red") ?? null,
    [clone],
  );
  const phase = useMemo(() => spot.x * 7.3 + spot.z * 4.1, [spot]);

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const now = clock.elapsedTime;

    // Scale-in starts when the fly-in lands, not when the piece is caught.
    if (bornAt.current === null) bornAt.current = now + FLIGHT_DURATION;
    const t = (now - bornAt.current) / 0.45;
    if (t < 0) {
      g.scale.setScalar(0.0001);
      return;
    }
    g.scale.setScalar(easeOutBack(Math.min(1, t)));

    if (alive !== wasAlive.current) {
      wasAlive.current = alive;
      // the hop ripples out from the middle of the island
      if (alive) aliveAt.current = now + Math.hypot(spot.x, spot.z) * 0.45;
    }

    let y = spot.y;
    let tilt = 0;

    switch (prop) {
      case "mill":
        // sails turn on the record's own time, and pick up when the world wakes
        if (sails) sails.rotation.z += delta * (alive ? 1.5 : 0.85);
        break;
      case "sheep":
        // a hop every couple of seconds, with a look around between
        y += Math.max(0, Math.sin(now * 1.7 + phase)) ** 6 * 0.03;
        g.rotation.y = spot.rot + Math.sin(now * 0.4 + phase) * 0.5;
        break;
      case "oak":
      case "birch":
        tilt = Math.sin(now * 1.05 + phase) * 0.028;
        break;
      case "flowers":
        tilt = Math.sin(now * 2.1 + phase) * 0.055;
        break;
      case "pond":
        // the lily rides the water it's floating on
        y += Math.sin(now * 1.3 + phase) * 0.004;
        g.rotation.y = spot.rot + Math.sin(now * 0.5 + phase) * 0.18;
        break;
      default:
        break;
    }

    // the one-shot completion hop, on top of whatever the prop already does
    if (aliveAt.current !== null) {
      const h = (now - aliveAt.current) / ALIVE_HOP;
      if (h >= 1) aliveAt.current = null;
      else if (h > 0) y += Math.sin(Math.PI * h) * 0.045;
    }
    if (alive) y += Math.sin(now * 2.0 + phase) * 0.006;

    g.position.y = y;
    g.rotation.z = tilt;
  });

  return (
    <group
      ref={group}
      position={[spot.x, spot.y, spot.z]}
      rotation-y={spot.rot}
      scale={0.0001}
    >
      <primitive object={clone} />
      {prop === "cottage" && <ChimneySmoke />}
      <LandingDust bornAt={bornAt} />
    </group>
  );
}

// ------------------------------------------------------------- the world ----

export function Diorama() {
  const collected = useGameStore((s) => s.piecesCollected);
  const props = activeRun.record.worldPieces.map((p) => p.prop);
  const alive = collected.length === props.length;

  return (
    <>
      <Island alive={alive} />
      <Flights />
      {props.map((prop) => (
        <GhostProp
          key={`ghost-${prop}`}
          prop={prop}
          collected={collected.includes(prop)}
        />
      ))}
      {collected.map((prop) => (
        <PlantedProp key={prop} prop={prop} alive={alive} />
      ))}
    </>
  );
}
