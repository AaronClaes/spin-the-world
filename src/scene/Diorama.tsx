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
import { type IslandDef, islandFor, placementFor } from "./islandLayout";
import type { NeonPulse } from "./neonDressing";
import { BEAM_NODE, TUBES_NODE } from "./procProps";

// The tiny world on the label (spec §8.4). Three states per piece, and the
// point of the whole game is watching a piece move through them:
//
//   ghost    — a faint silhouette standing in its final spot from beat 0, so
//              the plan of the world is visible before you've built any of it
//   flight   — caught, arcing in from its groove
//   planted  — solid, with a landing puff, and alive from the moment it lands
//
// Props used to be scattered on a golden-angle spiral and frozen until all ten
// were caught. Both are gone: positions are authored per prop per record in
// islandLayout.ts, and every piece has an idle of its own (sails turn, sheep
// hop, the lighthouse sweeps) the instant it arrives.

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
function FlightProp({ prop, island }: { prop: string; island: IslandDef }) {
  const clone = usePropClone(prop, activeRun.record.dioramaModel);
  const group = useRef<Group>(null);
  const target = useMemo(() => placementFor(island, prop), [island, prop]);

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

function Flights({ island }: { island: IslandDef }) {
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
        <FlightProp key={prop} prop={prop} island={island} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- ghosts ----

// What the world is going to be. Unlit and barely there, so it reads as a
// plan rather than as a prop you failed to collect — and it breathes, which
// separates it from the solid pieces standing next to it.
const GHOST_OPACITY = 0.05;

function GhostProp({
  prop,
  island,
  collected,
}: {
  prop: string;
  island: IslandDef;
  collected: boolean;
}) {
  const clone = usePropClone(prop, activeRun.record.dioramaModel);
  const group = useRef<Group>(null);
  const spot = useMemo(() => placementFor(island, prop), [island, prop]);
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

// Brightness of one bank of the neon sign's tubes. Four banks, each on its own
// clock, because tubes that pulse in unison read as a dimmer being turned
// rather than as neon. Bank 2 is the one with the failing starter — it sits
// steady and then breaks into a stutter, and that single detail is most of
// what makes the sign read as a sign at 60 pixels tall.
function tubeGlow(bank: number, t: number, alive: boolean): number {
  const speed = alive ? 1.6 : 1;
  switch (bank) {
    case 0:
      return 0.72 + 0.28 * Math.sin(t * 3.1 * speed);
    case 1:
      return 0.68 + 0.32 * Math.sin(t * 4.7 * speed + 1.7);
    case 2:
      return (t * 0.45 * speed) % 1 > 0.86
        ? Math.sin(t * 52) > 0
          ? 1
          : 0.12
        : 0.85;
    default:
      return 0.55 + 0.45 * Math.sin(t * 2.2 * speed + 3.4);
  }
}

function PlantedProp({
  prop,
  island,
  alive,
}: {
  prop: string;
  island: IslandDef;
  alive: boolean;
}) {
  const clone = usePropClone(prop, activeRun.record.dioramaModel);
  const group = useRef<Group>(null);
  const bornAt = useRef<number | null>(null);
  const aliveAt = useRef<number | null>(null);
  const wasAlive = useRef(alive);
  const spot = useMemo(() => placementFor(island, prop), [island, prop]);
  // Parts that turn under their own power: the windmill's sails are their own
  // node in the kitbash, the lighthouse's beam is its own node in the
  // procedural build. Everything else moves as one piece.
  const sails = useMemo(
    () => clone.getObjectByName("building_windmill_top_fan_red") ?? null,
    [clone],
  );
  const beam = useMemo(() => clone.getObjectByName(BEAM_NODE) ?? null, [clone]);
  const tubes = useMemo(
    () => clone.getObjectByName(TUBES_NODE) ?? null,
    [clone],
  );
  // Everything the neon dressing lit, whatever prop it belongs to. Collected
  // by traversal rather than by name because the lit parts are a mix of added
  // strips and the source model's own window quads.
  const neon = useMemo(() => {
    const out: { mesh: Mesh; pulse: NeonPulse }[] = [];
    clone.traverse((o) => {
      const pulse = (o.userData as { neon?: NeonPulse }).neon;
      if (pulse) out.push({ mesh: o as Mesh, pulse });
    });
    return out;
  }, [clone]);
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

    // The city's lights breathe. Each one has its own speed and phase, so a
    // block of forty windows never dims as one panel — and the whole island
    // burns a little harder once the world is alive.
    for (const { mesh, pulse } of neon) {
      const k =
        1 -
        pulse.depth * (0.5 + 0.5 * Math.sin(now * pulse.speed + pulse.phase));
      (mesh.material as MeshBasicMaterial).color
        .copy(pulse.base)
        .multiplyScalar(alive ? k * 1.15 : k);
    }

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

      // ---- harbour ----
      case "lighthouse":
        // the harbour's answer to the windmill: one slow sweep, quickening
        // when the world wakes up
        if (beam) beam.rotation.y += delta * (alive ? 0.85 : 0.55);
        break;
      case "sailboat":
        // moored, so it rocks on its line rather than sailing anywhere
        y += Math.sin(now * 1.15 + phase) * 0.006;
        tilt = Math.sin(now * 0.9 + phase) * 0.05;
        g.rotation.y = spot.rot + Math.sin(now * 0.35 + phase) * 0.13;
        break;
      case "palm":
        // fronds catch more wind than a temperate tree does
        tilt = Math.sin(now * 1.25 + phase) * 0.045;
        break;
      case "barrel":
        // it never quite settled after being rolled off the boat
        tilt = Math.sin(now * 1.9 + phase) * 0.02;
        break;

      // ---- neon ----
      case "neonsign":
        // the city's answer to the sails and the beam. Each mesh carries its
        // bank and its relative burn in userData, set where the sign is built.
        if (tubes)
          for (const child of tubes.children) {
            const m = (child as Mesh).material as MeshBasicMaterial;
            m.opacity =
              tubeGlow(child.userData.bank as number, now, alive) *
              (child.userData.gain as number);
          }
        break;
      case "taxi":
        // parked with the engine running — too small a movement to see as
        // motion, which is exactly what an idling engine looks like
        y += Math.sin(now * 9.4 + phase) * 0.0016;
        break;
      case "stall":
        // the awning catches what wind gets down between the buildings
        tilt = Math.sin(now * 2.6 + phase) * 0.022;
        break;
      default:
        break;
    }

    // The one-shot completion hop, on top of whatever the prop already does —
    // staggered outward from the spindle so the finished world reads as a wave
    // rather than a twitch. Deliberately the ONLY thing completion adds to a
    // prop's height: a permanent sine used to ride here as well, and every
    // building in the world drifting up and down together doesn't read as
    // liveliness, it reads as everything having come unmoored from the ground.
    // What being alive does to a prop is make its own motion louder — the
    // sails and the beam speed up, the tubes burn harder — and that's enough.
    if (aliveAt.current !== null) {
      const h = (now - aliveAt.current) / ALIVE_HOP;
      if (h >= 1) aliveAt.current = null;
      else if (h > 0) y += Math.sin(Math.PI * h) * 0.045;
    }

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
  const allCollected = useGameStore((s) => s.piecesCollected);
  const record = activeRun.record;
  const props = record.worldPieces.map((p) => p.prop);
  const island = islandFor(record.id);
  // A piece can only be planted if it belongs to this record's world. The
  // store is cleared when a record is picked, so this should never filter
  // anything out — but if the two ever drift, dropping a stray prop beats
  // throwing inside the Canvas, which blanks the entire scene.
  const collected = allCollected.filter((prop) => props.includes(prop));
  const alive = collected.length === props.length;

  return (
    <>
      <Island island={island} alive={alive} />
      <Flights island={island} />
      {props.map((prop) => (
        <GhostProp
          key={`ghost-${prop}`}
          prop={prop}
          island={island}
          collected={collected.includes(prop)}
        />
      ))}
      {collected.map((prop) => (
        <PlantedProp key={prop} prop={prop} island={island} alive={alive} />
      ))}
    </>
  );
}
