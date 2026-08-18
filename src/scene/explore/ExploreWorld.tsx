import { useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { useControls } from "leva";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { RecordDef } from "../../records/types";
import { islandFor } from "../islandLayout";
import { ExplorePlate } from "./ExplorePlate";
import { ExploreProps } from "./ExploreProps";
import { ExploreRunner } from "./ExploreRunner";
import {
  type CamPose,
  DEFAULT_SCALE,
  establishingPose,
  SPAWN_CLEARANCE,
  spawnTile,
} from "./scale";

// Walking around a record you've finished.
//
// The world is the record's own IslandDef, unmodified — same tiles, same
// spots, same scenery, same prop sizes. The only thing this mode introduces is
// SCALE, and it's a slider rather than a constant on purpose: how big an island
// should feel is a judgement you can only make from inside it, and rebuilding
// the app between guesses is how that judgement never gets made.

// The cut, and the reason it's a component rather than an effect.
//
// EcctrlCameraControls takes ownership of the camera the frame it mounts, and
// aims it at its own default target — the origin. Mounted while the camera is
// still hanging in front of the studio wall, that means it snaps to looking
// straight up at the underside of the turntable from sixty units below, and
// holds it there until our own setLookAt lands. Measured at 233ms, and no
// amount of effect-ordering closes it reliably: the flush competes with a
// megabyte of chunk for the same main thread.
//
// So the character and its controls don't exist yet. This mounts with the
// terrain, puts the camera on the establishing shot itself, and only then lets
// the runner in — by which point the controls find a camera already looking at
// the island, and their default target IS the island. The frame that used to be
// wrong is now the frame the whole arrival is built around.
function Arrival({
  pose,
  onArrived,
}: {
  pose: CamPose;
  onArrived: () => void;
}) {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    onArrived();
  }, [camera, pose, onArrived]);
  return null;
}

function ExploreScene({
  record,
  scale,
  onReady,
}: {
  record: RecordDef;
  scale: number;
  onReady: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const island = useMemo(() => islandFor(record.id), [record.id]);
  const spawn = useMemo(() => {
    const at = spawnTile(island);
    // Clear of the tile rather than flush with it: Ecctrl floats its body on a
    // spring, and spawning inside the collider is the one way to start the run
    // underneath the floor. Only just clear, though — the capsule's own half
    // height plus a hand's width. Every centimetre above that is a fall, and a
    // fall is the only part of arriving that can go wrong.
    return [at.x * scale, at.y * scale + SPAWN_CLEARANCE, at.z * scale] as [
      number,
      number,
      number,
    ];
  }, [island, scale]);

  const establish = useMemo(
    () => establishingPose(spawn, island.radius, scale),
    [spawn, island.radius, scale],
  );

  // Camera's on the shot, so the room can come down and the runner can arrive.
  const arrive = useCallback(() => {
    setArmed(true);
    onReady();
  }, [onReady]);

  return (
    /* Fixed, not "vary". A varying step is clamped to half a second, and half
       a second of gravity moves a falling capsule further than a tile is thick
       — so one long frame while the chunk parses could tunnel the runner into
       the terrain and have the solver fire him a hundred and eighty units
       straight up. Seen once in six entries, which is exactly the kind of odds
       that finds a judge. Fixed steps turn a stalled frame into substeps. */
    <Physics timeStep={1 / 60}>
      {/* The one shadow-caster. The game's rig never needed shadows — nothing
          on a 200px plate casts one worth having — so rather than teach four
          shared lights about two modes, explore brings its own sun and sizes
          its shadow camera to the island it's actually lighting. */}
      <directionalLight
        position={[0.4 * scale, 0.9 * scale, 0.55 * scale]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={4 * scale}
        shadow-camera-left={-1.6 * scale}
        shadow-camera-right={1.6 * scale}
        shadow-camera-top={1.6 * scale}
        shadow-camera-bottom={-1.6 * scale}
        shadow-bias={-0.0006}
      />
      <ExplorePlate island={island} scale={scale} />
      <ExploreProps
        island={island}
        model={record.dioramaModel}
        scale={scale}
      />
      {/* One commit apart, deliberately — see Arrival. */}
      {armed ? (
        <ExploreRunner spawn={spawn} from={establish} />
      ) : (
        <Arrival pose={establish} onArrived={arrive} />
      )}
    </Physics>
  );
}

export function ExploreWorld({
  record,
  onReady,
}: {
  record: RecordDef;
  onReady: () => void;
}) {
  // Stepped, and the whole world is keyed on it: changing scale rebuilds every
  // collider and the hull under every tile, which is not something to do on a
  // continuous drag.
  const { scale } = useControls("explore", {
    scale: { value: DEFAULT_SCALE, min: 8, max: 60, step: 2 },
  });

  return (
    <ExploreScene key={scale} record={record} scale={scale} onReady={onReady} />
  );
}
