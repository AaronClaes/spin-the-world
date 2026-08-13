import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { DynamicDrawUsage, InstancedMesh, Mesh, Object3D } from "three";
import { DISC_THICKNESS, RISE_LEAD_BEATS } from "../game/constants";
import { clockState } from "../game/clockState";
import { itemLocalAngle, itemRadius } from "../game/geometry";
import type { RunItem } from "../game/items";
import { activeRun } from "../game/runState";

// Items live in disc space — this component renders inside the rotating disc
// group, so positions are static per beat; only the rise animation moves.
// They surface out of the vinyl as the needle approaches (spec §6.5) and
// vanish once resolved (fly-to-diorama arrives in M3).

const RISE_DURATION_BEATS = 1;
const DISC_TOP = DISC_THICKNESS / 2;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// Returns visibility scale 0..1 and rise height for an item at the current beat.
function riseState(item: RunItem, beatPos: number): { s: number; y: number } {
  if (item.status !== "pending") return { s: 0, y: 0 };
  const lead = item.beat - beatPos;
  if (lead > RISE_LEAD_BEATS) return { s: 0, y: 0 };
  const p = easeOutCubic(
    Math.min(1, Math.max(0, (RISE_LEAD_BEATS - lead) / RISE_DURATION_BEATS)),
  );
  return { s: p, y: DISC_TOP + 0.02 + p * 0.1 };
}

function itemXZ(item: RunItem): { x: number; z: number } {
  const { band, totalBeats } = activeRun.record;
  const angle = itemLocalAngle(item.beat);
  const r = itemRadius(
    item.lane,
    item.beat,
    totalBeats,
    band.startRadius,
    band.endRadius,
    band.laneGap,
  );
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

function Notes() {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());

  useFrame(() => {
    const inst = mesh.current;
    if (!inst) return;
    const notes = activeRun.notes;
    const d = dummy.current;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const { s, y } = riseState(note, clockState.beatPos);
      if (s === 0) {
        d.position.set(0, -1, 0);
        d.scale.setScalar(0.0001);
      } else {
        const { x, z } = itemXZ(note);
        d.position.set(x, y, z);
        d.scale.setScalar(s);
        d.rotation.y = clockState.beatPos * 0.8; // slow idle twirl
      }
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, activeRun.notes.length]}
      onUpdate={(self) => self.instanceMatrix.setUsage(DynamicDrawUsage)}
    >
      <octahedronGeometry args={[0.09]} />
      <meshStandardMaterial
        color={activeRun.record.accentColor}
        emissive={activeRun.record.accentColor}
        emissiveIntensity={0.55}
        roughness={0.4}
      />
    </instancedMesh>
  );
}

function Pieces() {
  const refs = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    activeRun.pieces.forEach((piece, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const { s, y } = riseState(piece, clockState.beatPos);
      if (s === 0) {
        mesh.visible = false;
        return;
      }
      const { x, z } = itemXZ(piece);
      mesh.visible = true;
      mesh.position.set(x, y + 0.04, z);
      mesh.scale.setScalar(s);
    });
  });

  return (
    <>
      {activeRun.pieces.map((piece, i) => (
        <mesh
          key={piece.id}
          ref={(m) => {
            refs.current[i] = m;
          }}
          visible={false}
        >
          <boxGeometry args={[0.22, 0.22, 0.22]} />
          <meshStandardMaterial
            color="#e8e9ec"
            emissive="#ffffff"
            emissiveIntensity={0.25}
            roughness={0.5}
          />
        </mesh>
      ))}
    </>
  );
}

export function Items() {
  return (
    <>
      <Notes />
      <Pieces />
    </>
  );
}
