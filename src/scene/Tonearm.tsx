import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";
import { clockState } from "../game/clockState";
import { NEEDLE_LEAD_BEATS, RAD_PER_BEAT } from "../game/constants";
import { bandCenter } from "../game/geometry";
import { activeRun } from "../game/runState";

// The tonearm rides the band (spec §8.3): the stylus sits at world angle
// NEEDLE_LEAD_BEATS ahead of the player, at the band centre evaluated at
// beatPos + lead — it reads the groove the player is about to run. On track
// end it lifts and swings out past the rim.
//
// The needle point travels the +X axis from startRadius to endRadius (world
// angle 90° = +X). The pivot sits on the perpendicular bisector of that
// sweep, so a fixed-length arm covers it with ~2% length error — absorbed by
// stretching the tube, invisibly.

const PIVOT_X = 3.25;
const PIVOT_Z = -5.8;
const ARM_Y = 0.55; // tube height above the table plane
const REST_RADIUS = 5.5; // where the arm swings to after the lift
const LIFT_TILT = 0.14; // radians about the pivot's horizontal axis

const NEEDLE_ANGLE = NEEDLE_LEAD_BEATS * RAD_PER_BEAT; // 90°

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
      {/* chunky toy-machine proportions in light metals: at gameplay
          distance a realistic thin arm dissolves into disconnected blobs
          against the daylight sky — cartoony thickness makes the pivot,
          tube and headshell read as ONE machine */}
      <mesh position-y={0.26}>
        <cylinderGeometry args={[0.2, 0.26, 0.52, 24]} />
        <meshStandardMaterial
          color="#c3c9d4"
          roughness={0.45}
          metalness={0.3}
        />
      </mesh>

      <group ref={yawGroup} position-y={ARM_Y}>
        <group ref={tiltGroup}>
          {/* counterweight behind the pivot */}
          <mesh position-z={-0.46} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.19, 0.19, 0.3, 20]} />
            <meshStandardMaterial
              color="#9aa1ad"
              roughness={0.35}
              metalness={0.5}
            />
          </mesh>

          {/* arm tube — unit length along +Z, stretched to the needle point */}
          <mesh ref={tube} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.09, 0.09, 1, 12]} />
            <meshStandardMaterial
              color="#d5dae2"
              roughness={0.3}
              metalness={0.5}
            />
          </mesh>

          {/* headshell + stylus, dipping toward the vinyl */}
          <group ref={head}>
            <mesh position-y={-0.09} rotation-x={0.35}>
              <boxGeometry args={[0.17, 0.13, 0.42]} />
              <meshStandardMaterial
                color="#c9873d"
                roughness={0.4}
                metalness={0.4}
              />
            </mesh>
            <mesh position-y={-0.3} rotation-x={Math.PI}>
              <coneGeometry args={[0.04, 0.26, 8]} />
              <meshStandardMaterial color="#dde1e8" roughness={0.3} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
