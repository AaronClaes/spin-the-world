import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import { Color, MeshBasicMaterial } from "three";
import { clockState } from "../game/clockState";
import {
  DISC_THICKNESS,
  NEEDLE_LEAD_BEATS,
  RAD_PER_BEAT,
} from "../game/constants";
import { bandCenter } from "../game/geometry";
import { activeRun } from "../game/runState";
import { NOTE_PALETTE } from "./notePalette";

// The stylus visibly plays the record: a tiny glint marks the contact point,
// and on every beat a little music note pops off the groove, flicked in the
// direction the vinyl is moving under the needle, rising and fading. Beat-
// locked spawning means the effect pulses with the music for free.
//
// Notes are primitive-built (head + stem + flag / beamed pair), each spawn
// dealt a colour from the collectible notes' candy palette — hashed on the
// spawn counter, independent of what the player catches. Unlit so they read
// as flat cartoon marks against both the black vinyl and the pale sky. A
// fixed pool is recycled — nothing allocates per frame.

const DISC_TOP = DISC_THICKNESS / 2;
const NEEDLE_ANGLE = NEEDLE_LEAD_BEATS * RAD_PER_BEAT; // 90° — needle on +X

// what the glint mixes toward, so a palette colour still reads as glowing
const GLINT_HEAT = new Color("#fff8e4");

const POOL = 6;
const LIFE = 1.5; // seconds a note lives
const RISE = 0.75; // world units/second upward
const DRIFT_Z = 0.95; // tangential flick — the groove moves toward +Z here

// deterministic per-spawn variation — no Math.random, replays identically
const jitter = (n: number, salt: number) => {
  const x = Math.sin(n * 113.9 + salt * 271.3) * 34567.89;
  return x - Math.floor(x) - 0.5;
};

type Slot = {
  age: number;
  active: boolean;
  seed: number;
};

function needleRadius() {
  const { totalBeats, band } = activeRun.record;
  const progress = Math.min(
    1,
    Math.max(0, (clockState.beatPos + NEEDLE_LEAD_BEATS) / totalBeats),
  );
  return bandCenter(progress, band.startRadius, band.endRadius);
}

// One pooled note. Even slots are a single eighth note, odd slots a beamed
// pair — spawning cycles the pool, so the shapes alternate.
function Note({
  beamed,
  groupRef,
  material,
}: {
  beamed: boolean;
  groupRef: (g: Group | null) => void;
  material: MeshBasicMaterial;
}) {
  const heads = beamed ? [0, 0.24] : [0];
  return (
    <group ref={groupRef} visible={false}>
      {heads.map((x) => (
        <group key={x} position-x={x}>
          <mesh scale={[1, 0.78, 1]}>
            <sphereGeometry args={[0.1, 10, 8]} />
            <primitive object={material} attach="material" />
          </mesh>
          <mesh position={[0.085, 0.19, 0]}>
            <boxGeometry args={[0.03, 0.38, 0.03]} />
            <primitive object={material} attach="material" />
          </mesh>
        </group>
      ))}
      {beamed ? (
        <mesh position={[0.205, 0.36, 0]} rotation-z={-0.12}>
          <boxGeometry args={[0.3, 0.07, 0.03]} />
          <primitive object={material} attach="material" />
        </mesh>
      ) : (
        <mesh position={[0.14, 0.3, 0]} rotation-z={-0.5}>
          <boxGeometry args={[0.12, 0.05, 0.03]} />
          <primitive object={material} attach="material" />
        </mesh>
      )}
    </group>
  );
}

// The colour the NEXT spawn will use. Dealt one ahead so the contact glint
// can wear it — the ball under the stylus is a preview of the note about to
// pop out, and flicks to the following colour the instant one leaves.
const dealColor = (seed: number, previous: number) => {
  const c = Math.floor((jitter(seed, 5) + 0.5) * NOTE_PALETTE.length);
  // nudge so two notes in a row never share a colour
  return c === previous ? (c + 1) % NOTE_PALETTE.length : c;
};

export function NeedleNotes() {
  const notes = useRef<(Group | null)[]>([]);
  const glint = useRef<Mesh>(null);
  const prevBeat = useRef(-1);
  const spawned = useRef(0);
  // seed 1 is what the first spawn will get (spawned is incremented first)
  const nextColor = useRef(dealColor(1, -1));

  const slots = useMemo<Slot[]>(
    () =>
      Array.from({ length: POOL }, () => ({
        age: 0,
        active: false,
        seed: 0,
      })),
    [],
  );
  const materials = useMemo(
    () =>
      Array.from(
        { length: POOL },
        () =>
          new MeshBasicMaterial({ color: NOTE_PALETTE[0], transparent: true }),
      ),
    [],
  );
  // kept off white so it still reads as a hot contact point rather than a
  // floating bead of paint
  const glintMaterial = useMemo(
    () => new MeshBasicMaterial({ color: "#fff3cf" }),
    [],
  );

  useFrame(({ camera }, delta) => {
    const touching =
      clockState.playing && !clockState.ended && !clockState.wall;
    const nx = Math.sin(NEEDLE_ANGLE) * needleRadius();
    const nz = Math.cos(NEEDLE_ANGLE) * needleRadius();

    // contact glint — swells on each pulse, and wears the next note's colour
    if (glint.current) {
      glint.current.visible = touching;
      glint.current.position.set(nx, DISC_TOP + 0.02, nz);
      const frac = clockState.beatPos - Math.floor(clockState.beatPos);
      glint.current.scale.setScalar(1 + 0.5 * Math.exp(-frac * 5));
      glintMaterial.color
        .set(NOTE_PALETTE[nextColor.current])
        .lerp(GLINT_HEAT, 0.35);
    }

    // beat edge → spawn (prevBeat resets when a restart rewinds beatPos)
    const beat = Math.floor(clockState.beatPos);
    if (beat < prevBeat.current) prevBeat.current = -1;
    if (touching && beat > prevBeat.current) {
      prevBeat.current = beat;
      const i = spawned.current % POOL;
      spawned.current += 1;
      const slot = slots[i];
      const g = notes.current[i];
      if (g) {
        slot.active = true;
        slot.age = 0;
        slot.seed = spawned.current;
        // the colour the glint has been advertising, then deal the next one
        const c = nextColor.current;
        materials[i].color.set(NOTE_PALETTE[c]);
        nextColor.current = dealColor(spawned.current + 1, c);
        // spawn a touch along the groove's travel so the arm doesn't hide it
        g.position.set(nx, DISC_TOP + 0.06, nz + 0.2);
        g.visible = true;
      }
    }

    // animate the pool
    for (let i = 0; i < POOL; i++) {
      const slot = slots[i];
      const g = notes.current[i];
      if (!g || !slot.active) continue;
      slot.age += delta;
      if (slot.age >= LIFE) {
        slot.active = false;
        g.visible = false;
        continue;
      }
      g.position.y += RISE * delta;
      g.position.z += DRIFT_Z * delta;
      g.position.x += jitter(slot.seed, 3) * 0.5 * delta;
      // cartoon marks always face the viewer — an edge-on note is a bare
      // sliver of stem; the per-seed tilt keeps them jaunty
      g.quaternion.copy(camera.quaternion);
      g.rotateZ(-0.1 + jitter(slot.seed, 2) * 0.4);
      // born small at the stylus, growing all the way out — the classic
      // music-note-particle read: size ∝ distance from the source
      const t = slot.age / LIFE;
      const fadeIn = Math.min(1, slot.age / 0.12);
      g.scale.setScalar(0.25 + 1.05 * t);
      materials[i].opacity = fadeIn * (t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1);
    }
  });

  return (
    <group>
      <mesh ref={glint} visible={false} material={glintMaterial}>
        <sphereGeometry args={[0.05, 10, 8]} />
      </mesh>
      {Array.from({ length: POOL }, (_, i) => (
        <Note
          key={i}
          beamed={i % 2 === 1}
          material={materials[i]}
          groupRef={(g) => {
            notes.current[i] = g;
          }}
        />
      ))}
    </group>
  );
}
