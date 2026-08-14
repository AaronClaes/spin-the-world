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

          {/* headshell: collar swallows the tube tip, then the shell +
              cartridge + stylus dip toward the vinyl as one angled unit */}
          <group ref={head}>
            <mesh position-z={-0.09} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.12, 0.12, 0.22, 14]} />
              <meshStandardMaterial
                color={CHARCOAL}
                roughness={0.5}
                flatShading
              />
            </mesh>
            <group rotation-x={0.3}>
              <mesh position={[0, -0.02, 0.16]}>
                <boxGeometry args={[0.2, 0.14, 0.44]} />
                <meshStandardMaterial color={ORANGE} roughness={0.45} />
              </mesh>
              <mesh position={[0, -0.13, 0.16]}>
                <boxGeometry args={[0.15, 0.09, 0.3]} />
                <meshStandardMaterial color={CHARCOAL} roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.26, 0.24]} rotation-x={Math.PI}>
                <coneGeometry args={[0.035, 0.2, 8]} />
                <meshStandardMaterial color="#dde1e8" roughness={0.3} />
              </mesh>
              {/* finger lift */}
              <mesh position={[0.14, 0.02, 0.04]} rotation-z={Math.PI / 2}>
                <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
                <meshStandardMaterial color={CREAM} roughness={0.45} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
