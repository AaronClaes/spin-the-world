import { Physics } from "@react-three/rapier";
import { useControls } from "leva";
import { useMemo } from "react";
import type { RecordDef } from "../../records/types";
import { islandFor } from "../islandLayout";
import { ExplorePlate } from "./ExplorePlate";
import { ExploreProps } from "./ExploreProps";
import { ExploreRunner } from "./ExploreRunner";
import { DEFAULT_SCALE, spawnTile } from "./scale";

// Walking around a record you've finished.
//
// The world is the record's own IslandDef, unmodified — same tiles, same
// spots, same scenery, same prop sizes. The only thing this mode introduces is
// SCALE, and it's a slider rather than a constant on purpose: how big an island
// should feel is a judgement you can only make from inside it, and rebuilding
// the app between guesses is how that judgement never gets made.

function ExploreScene({
  record,
  scale,
}: {
  record: RecordDef;
  scale: number;
}) {
  const island = useMemo(() => islandFor(record.id), [record.id]);
  const spawn = useMemo(() => {
    const at = spawnTile(island);
    // Dropped a little above the tile rather than exactly on it: Ecctrl floats
    // its body on a spring, and spawning flush inside the collider is the one
    // way to start the run inside the floor.
    return [at.x * scale, at.y * scale + 2, at.z * scale] as [
      number,
      number,
      number,
    ];
  }, [island, scale]);

  return (
    <Physics timeStep="vary">
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
      <ExploreRunner
        spawn={spawn}
        islandRadius={island.radius}
        scale={scale}
      />
    </Physics>
  );
}

export function ExploreWorld({ record }: { record: RecordDef }) {
  // Stepped, and the whole world is keyed on it: changing scale rebuilds every
  // collider and the hull under every tile, which is not something to do on a
  // continuous drag.
  const { scale } = useControls("explore", {
    scale: { value: DEFAULT_SCALE, min: 8, max: 60, step: 2 },
  });

  return <ExploreScene key={scale} record={record} scale={scale} />;
}
