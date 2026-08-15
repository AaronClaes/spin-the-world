import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";
import { clockState } from "../game/clockState";
import { NEEDLE_LEAD_BEATS, RAD_PER_BEAT } from "../game/constants";
import { bandCenter } from "../game/geometry";
import { activeRun } from "../game/runState";
import { DECK_TOP } from "./Turntable";

// The tonearm rides the band (spec §8.3): the stylus sits at world angle
// NEEDLE_LEAD_BEATS ahead of the player, at the band centre evaluated at
// beatPos + lead — it reads the groove the player is about to run. On track
// end it lifts and swings out past the rim, staying raised until a restart.
//
// The needle point travels the +X axis from startRadius to endRadius (world
// angle 90° = +X). The pivot sits on the perpendicular bisector of that
// sweep, so a fixed-length arm covers it with ~2% length error — absorbed by
// stretching the tube, invisibly.
//
// Body construction rule: every joint is socketed — the tube's ends are
// buried inside the bearing housing and the headshell collar, the
// counterweight hangs on a rear stub that enters the housing, the turret
// stands on the deck and the housing sits on the turret. Nothing floats,
// nothing clips.

const PIVOT_X = 3.25;
const PIVOT_Z = -5.8;
const ARM_Y = 0.55; // arm-tube height above the vinyl plane
const REST_RADIUS = 5.85; // where the arm swings to after the lift
const LIFT_TILT = 0.14; // radians about the pivot's horizontal axis

const NEEDLE_ANGLE = NEEDLE_LEAD_BEATS * RAD_PER_BEAT; // 90°

const CREAM = "#ece1cb";
const CHARCOAL = "#3b3f49";
const ORANGE = "#e08a3c";
const STEEL = "#dde1e8";

// ---- headshell ----
//
// The one place on the deck where four parts meet in a space smaller than the
// label, so it's laid out in numbers rather than by eye. Everything below is
// stated in the tilted shell's own frame; the collar it plugs into is NOT
// tilted, which is the whole reason the joint has to be worked out rather than
// nudged until it looks right.
//
// The rule the rest of this file already follows: a joint is a part buried
// inside another part. The cartridge used to be a box pushed back into the
// collar until their surfaces crossed, which is the opposite — an intersection
// reads as two objects failing to be one object, and no amount of angle hides
// it. Now the plate is what enters the collar, and the cartridge hangs off the
// plate clear of it.
const SHELL_TILT = 0.3;

// The stylus tip has to land exactly on the point the arm math aims at — the
// head group's origin, at vinyl height — no matter how the shell is dressed.
// A point this far along the tilted frame's own down-axis lands on head-local
// (0, -STYLUS_DROP, 0) for ANY tilt, which is what keeps the dressing and the
// aim independent: move the shell around all you like, the needle stays put.
const STYLUS_DROP = 0.482;
const TIP_Y = -STYLUS_DROP * Math.cos(SHELL_TILT);
const TIP_Z = STYLUS_DROP * Math.sin(SHELL_TILT);

// What's left to cross once the cartridge and its nose have taken their share:
// the cone stands on its own 0.05, and the cantilever spans whatever gap the
// nose's underside leaves above it. Derived rather than typed, so deepening the
// cartridge doesn't leave a rod hanging in the air behind it.
const NOSE_BOTTOM = -0.31;
const TIP_BASE = TIP_Y + 0.05;
const CANTILEVER_LEN = NOSE_BOTTOM - TIP_BASE;
const CANTILEVER_Y = (NOSE_BOTTOM + TIP_BASE) / 2;

export function Tonearm() {
  const yawGroup = useRef<Group>(null);
  const tiltGroup = useRef<Group>(null);
  const tube = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const lift = useRef(0);

  useFrame((_, delta) => {
    if (
      !yawGroup.current ||
      !tiltGroup.current ||
      !tube.current ||
      !head.current
    )
      return;
    const { totalBeats, band } = activeRun.record;

    const progress = Math.min(
      1,
      Math.max(0, (clockState.beatPos + NEEDLE_LEAD_BEATS) / totalBeats),
    );
    const grooveR = bandCenter(progress, band.startRadius, band.endRadius);

    // Ease the lift in (track end) and back out (restart).
    const target = clockState.ended ? 1 : 0;
    lift.current += (target - lift.current) * (1 - Math.exp(-3 * delta));
    const needleR = grooveR + (REST_RADIUS - grooveR) * lift.current;

    // Aim local +Z at the needle point (needleR, 0) in the XZ plane.
    const dx = Math.sin(NEEDLE_ANGLE) * needleR - PIVOT_X;
    const dz = Math.cos(NEEDLE_ANGLE) * needleR - PIVOT_Z;
    const dist = Math.hypot(dx, dz);
    yawGroup.current.rotation.y = Math.atan2(dx, dz);
    tiltGroup.current.rotation.x = -LIFT_TILT * lift.current;

    // scale acts on the cylinder's LOCAL axes before its rotation-x — the
    // height axis is local Y, which the rotation then points along +Z
    tube.current.scale.y = dist;
    tube.current.position.z = dist / 2;
    head.current.position.z = dist;
  });

  return (
    <group position={[PIVOT_X, 0, PIVOT_Z]}>
      {/* turret: base plate on the deck, cream column, charcoal collar the
          bearing housing rides on */}
      <mesh position-y={DECK_TOP + 0.05}>
        <cylinderGeometry args={[0.5, 0.56, 0.1, 20]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.5} flatShading />
      </mesh>
      <mesh position-y={(DECK_TOP + 0.38) / 2 + 0.05}>
        <cylinderGeometry args={[0.3, 0.34, 0.38 - DECK_TOP - 0.1, 20]} />
        <meshStandardMaterial color={CREAM} roughness={0.5} flatShading />
      </mesh>
      <mesh position-y={0.36}>
        <cylinderGeometry args={[0.34, 0.34, 0.08, 20]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.5} flatShading />
      </mesh>

      <group ref={yawGroup} position-y={ARM_Y}>
        <group ref={tiltGroup}>
          {/* bearing housing — sits on the turret collar, swallows the
              tube's rear end and the counterweight stub */}
          <mesh rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.17, 0.17, 0.55, 14]} />
            <meshStandardMaterial
              color={CHARCOAL}
              roughness={0.5}
              flatShading
            />
          </mesh>

          {/* counterweight on its rear stub */}
          <mesh position-z={-0.5} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.06, 0.06, 0.5, 12]} />
            <meshStandardMaterial color={CREAM} roughness={0.45} flatShading />
          </mesh>
          <mesh position-z={-0.68} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.24, 0.24, 0.36, 14]} />
            <meshStandardMaterial
              color={CHARCOAL}
              roughness={0.5}
              flatShading
            />
          </mesh>
          <mesh position-z={-0.68} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.255, 0.255, 0.08, 14]} />
            <meshStandardMaterial color={ORANGE} roughness={0.45} flatShading />
          </mesh>

          {/* arm tube — unit length along +Z, stretched to the needle point;
              tapers toward the headshell */}
          <mesh ref={tube} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.075, 0.105, 1, 14]} />
            <meshStandardMaterial color={CREAM} roughness={0.45} flatShading />
          </mesh>

          {/* headshell: the collar swallows the tube tip, and everything
              forward of it dips toward the vinyl as one angled unit */}
          <group ref={head}>
            <mesh position-z={-0.09} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.12, 0.12, 0.22, 14]} />
              <meshStandardMaterial
                color={CHARCOAL}
                roughness={0.5}
                flatShading
              />
            </mesh>
            <group rotation-x={SHELL_TILT}>
              {/* The shell plate, and the only part that enters the collar —
                  cream, because it's the arm continuing rather than a fitting
                  bolted to it. Its rear end sits inside both the collar and
                  the tube's mouth: at the tilt, its far corners land 0.106
                  from the collar's axis against a 0.12 bore. */}
              <mesh position={[0, -0.015, 0.12]}>
                <boxGeometry args={[0.2, 0.05, 0.42]} />
                <meshStandardMaterial color={CREAM} roughness={0.45} />
              </mesh>
              {/* the two headshell screws, standing proud of the plate the way
                  the real pair do — the detail that says "a cartridge is
                  mounted here" rather than "this end is orange" */}
              {[0.06, 0.24].map((z) => (
                <mesh key={z} position={[0, 0.02, z]}>
                  <cylinderGeometry args={[0.017, 0.017, 0.06, 8]} />
                  <meshStandardMaterial
                    color={CHARCOAL}
                    roughness={0.5}
                    flatShading
                  />
                </mesh>
              ))}

              {/* Cartridge body, hung under the plate and starting forward of
                  the collar's face — its rear top corners come out at
                  head-local z 0.036 against a collar ending at 0.02, so the
                  two never meet. Its top edge is buried 0.01 into the plate. */}
              <mesh position={[0, -0.14, 0.15]}>
                <boxGeometry args={[0.17, 0.2, 0.2]} />
                <meshStandardMaterial color={ORANGE} roughness={0.45} />
              </mesh>
              {/* the narrower nose under it. Two blocks instead of one is what
                  stops the cartridge reading as a box: the step gives the
                  silhouette a shoulder, and it eats 0.06 of the drop the
                  stylus would otherwise have to cross on its own */}
              <mesh position={[0, -0.27, 0.145]}>
                <boxGeometry args={[0.12, 0.08, 0.14]} />
                <meshStandardMaterial
                  color={CHARCOAL}
                  roughness={0.5}
                  flatShading
                />
              </mesh>

              {/* cantilever and tip — the tip's apex is the aim point itself */}
              <mesh position={[0, CANTILEVER_Y, TIP_Z]}>
                <cylinderGeometry args={[0.014, 0.014, CANTILEVER_LEN, 8]} />
                <meshStandardMaterial color={STEEL} roughness={0.35} />
              </mesh>
              <mesh position={[0, TIP_Y + 0.025, TIP_Z]} rotation-x={Math.PI}>
                <coneGeometry args={[0.028, 0.05, 8]} />
                <meshStandardMaterial color={STEEL} roughness={0.3} />
              </mesh>

              {/* finger lift: a tab off the front corner of the plate, tipped
                  up the way one is so a thumb can find it */}
              <mesh position={[0.13, 0.005, 0.27]} rotation-z={-0.4}>
                <boxGeometry args={[0.11, 0.026, 0.07]} />
                <meshStandardMaterial color={CREAM} roughness={0.45} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
