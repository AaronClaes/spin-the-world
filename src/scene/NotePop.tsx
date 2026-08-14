import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import { Shape, ShapeGeometry } from "three";
import { DISC_THICKNESS } from "../game/constants";
import { itemRadius } from "../game/geometry";
import type { RunItem } from "../game/items";
import { activeRun } from "../game/runState";

// Catching a note answers with a Mario-coin moment, kept quiet (spec §8.1:
// feedback, not fireworks): the coin ghost hops up off the groove, spinning,
// and winks out at the top of its hop while a few soft four-pointed star
// sparkles twinkle around the catch. Combo scales it gently — longer chains
// sparkle a little more, never louder.
//
// Same module pattern as flights.ts: the collection loop pushes, this
// component adopts pops into a fixed pool and retires them. World space —
// the catch happens at the player, angle 0, and the effect stays there.

const DISC_TOP = DISC_THICKNESS / 2;
const CATCH_Y = DISC_TOP + 0.12; // notes are caught at their riding height

const POOL = 8;
const LIFE = 0.55; // coin hop duration
const STAR_LIFE = 0.34; // each sparkle's twinkle
const MAX_STARS = 6;

interface Pop {
  lane: RunItem["lane"];
  beat: number;
  combo: number;
  startedAt: number | null; // clock.elapsedTime, stamped on adoption
}

const pendingPops: Pop[] = [];

export function launchNotePop(item: RunItem, combo: number) {
  pendingPops.push({
    lane: item.lane,
    beat: item.beat,
    combo,
    startedAt: null,
  });
}

export function clearNotePops() {
  pendingPops.length = 0;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// deterministic per-star variation, keyed on the catch beat
const jitter = (n: number, salt: number) => {
  const x = Math.sin(n * 157.3 + salt * 313.7) * 45123.71;
  return x - Math.floor(x) - 0.5;
};

// Mario's twinkle: a squashed four-pointed star
function makeStarGeometry() {
  const s = new Shape();
  const R = 1;
  const r = 0.22;
  s.moveTo(0, R);
  s.lineTo(r, r);
  s.lineTo(R, 0);
  s.lineTo(r, -r);
  s.lineTo(0, -R);
  s.lineTo(-r, -r);
  s.lineTo(-R, 0);
  s.lineTo(-r, r);
  s.closePath();
  return new ShapeGeometry(s);
}

interface Slot {
  pop: Pop | null;
}

export function NotePop() {
  const coins = useRef<(Mesh | null)[]>([]);
  const bursts = useRef<(Group | null)[]>([]);
  const starGeometry = useMemo(makeStarGeometry, []);
  const slots = useMemo<Slot[]>(
    () => Array.from({ length: POOL }, () => ({ pop: null })),
    [],
  );

  useFrame(({ camera, clock }) => {
    const now = clock.elapsedTime;

    // adopt pending pops into free slots
    while (pendingPops.length > 0) {
      const free = slots.findIndex((s) => !s.pop);
      if (free === -1) break; // pool saturated — drop, it's only sparkle
      const pop = pendingPops.shift() as Pop;
      pop.startedAt = now;
      slots[free].pop = pop;
      const { band, totalBeats } = activeRun.record;
      const r = itemRadius(
        pop.lane,
        pop.beat,
        totalBeats,
        band.startRadius,
        band.endRadius,
        band.laneGap,
      );
      coins.current[free]?.position.set(0, CATCH_Y, r);
      bursts.current[free]?.position.set(0, CATCH_Y, r);
    }

    for (let i = 0; i < POOL; i++) {
      const slot = slots[i];
      const coin = coins.current[i];
      const burst = bursts.current[i];
      if (!coin || !burst) continue;
      const pop = slot.pop;
      if (!pop || pop.startedAt === null) {
        coin.visible = false;
        burst.visible = false;
        continue;
      }
      const age = now - pop.startedAt;
      if (age >= LIFE) {
        slot.pop = null;
        coin.visible = false;
        burst.visible = false;
        continue;
      }
      const t = age / LIFE;

      // the coin ghost: hop up, spin, wink out near the top
      coin.visible = true;
      coin.position.y = CATCH_Y + 0.5 * easeOutCubic(t);
      coin.rotation.y = t * 9;
      coin.scale.setScalar(t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35);

      // the twinkles: staggered, each scaling in and out around the catch
      burst.visible = true;
      const stars = 3 + Math.min(3, Math.floor(pop.combo / 4));
      const size = 1 + Math.min(0.3, pop.combo * 0.02);
      for (let k = 0; k < MAX_STARS; k++) {
        const star = burst.children[k] as Mesh;
        if (k >= stars) {
          star.visible = false;
          continue;
        }
        const delay = k * 0.05;
        const u = (age - delay) / STAR_LIFE;
        if (u < 0 || u >= 1) {
          star.visible = false;
          continue;
        }
        star.visible = true;
        const seed = pop.beat + k * 7;
        star.position.set(
          jitter(seed, 1) * 0.5,
          0.1 + jitter(seed, 2) * 0.35 + u * 0.18,
          jitter(seed, 3) * 0.4,
        );
        // twinkle: in fast, out soft; billboarded, alternating tilt
        star.quaternion.copy(camera.quaternion);
        star.rotateZ(k * 0.7 + u * 0.5);
        star.scale.setScalar(0.085 * size * Math.sin(Math.PI * u));
      }
    }
  });

  return (
    <group>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i}>
          <mesh
            visible={false}
            ref={(m) => {
              coins.current[i] = m;
            }}
          >
            <octahedronGeometry args={[0.09]} />
            <meshStandardMaterial
              color={activeRun.record.accentColor}
              emissive={activeRun.record.accentColor}
              emissiveIntensity={0.55}
              roughness={0.4}
            />
          </mesh>
          <group
            visible={false}
            ref={(g) => {
              bursts.current[i] = g;
            }}
          >
            {Array.from({ length: MAX_STARS }, (_, k) => (
              <mesh key={k} visible={false} geometry={starGeometry}>
                <meshBasicMaterial color="#fff4cf" transparent opacity={0.95} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}
