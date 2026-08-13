import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Color, DynamicDrawUsage, InstancedMesh, Mesh, Object3D } from "three";
import {
  BEATS_PER_REV,
  DISC_THICKNESS,
  RISE_LEAD_BEATS,
} from "../game/constants";
import { clockState } from "../game/clockState";
import { itemLocalAngle, itemRadius } from "../game/geometry";
import type { RunItem } from "../game/items";
import { activeRun } from "../game/runState";

// Items live in disc space — this component renders inside the rotating disc
// group, so positions are static per beat; only rise/sink animation moves.
// They surface out of the vinyl as the needle approaches (spec §6.5).
//
// Resolution feedback (spec §8.1): nothing vanishes at the player. A missed
// note stays in its groove, dims, and sinks back into the vinyl behind you.
// A missed world piece stays surfaced and visibly rides the disc around for
// another pass — the recurrence rule, made visible. Only caught items leave
// instantly (pieces hand over to the fly-in arc), and a lost piece sinks for
// good.

const RISE_DURATION_BEATS = 1;
const SINK_BEATS = 2; // missed/lost items sink back in over this many beats
const DISC_TOP = DISC_THICKNESS / 2;
const RIDE_Y = DISC_TOP + 0.12; // fully risen height
const SUNK_Y = DISC_TOP - 0.14; // fully buried

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInQuad = (t: number) => t * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface ItemVisual {
  s: number; // scale 0..1
  y: number;
  dim: number; // 1 = fresh, lower = missed
}

// Rise for a pending item approaching the needle; null while still buried.
function riseVisual(lead: number): ItemVisual | null {
  if (lead > RISE_LEAD_BEATS) return null;
  const p = easeOutCubic(
    clamp01((RISE_LEAD_BEATS - lead) / RISE_DURATION_BEATS),
  );
  return { s: p, y: DISC_TOP + 0.02 + p * 0.1, dim: 1 };
}

// Sink for a resolved item that stays on the record; null once fully buried.
function sinkVisual(past: number): ItemVisual | null {
  if (past >= SINK_BEATS) return null;
  const t = easeInQuad(clamp01(past / SINK_BEATS));
  return {
    s: 1 - 0.3 * t,
    y: RIDE_Y + (SUNK_Y - RIDE_Y) * t,
    dim: 1 - 0.6 * t,
  };
}

function noteVisual(note: RunItem, beatPos: number): ItemVisual | null {
  if (note.status === "collected") return null; // caught — pickup fx is M5
  if (note.status === "missed") return sinkVisual(beatPos - note.beat);
  return riseVisual(note.beat - beatPos);
}

function pieceVisual(piece: RunItem, beatPos: number): ItemVisual | null {
  if (piece.status === "collected") return null; // the fly-in arc takes over
  if (piece.status === "lost") return sinkVisual(beatPos - piece.beat);
  // Once missed, the piece never re-buries — it rides the disc back around.
  if (piece.misses) return { s: 1, y: RIDE_Y, dim: 1 };
  return riseVisual(piece.beat - beatPos);
}

function laneRadiusAtBeat(lane: number, beat: number): number {
  const { band, totalBeats } = activeRun.record;
  return itemRadius(
    lane as RunItem["lane"],
    beat,
    totalBeats,
    band.startRadius,
    band.endRadius,
    band.laneGap,
  );
}

// A recurred piece keeps its angle (+8 beats = one full revolution) but sits
// one groove-step inward. Ease that radial step in just after the miss so it
// doesn't pop while the piece is right beside the player.
function pieceRadius(piece: RunItem, beatPos: number): number {
  const rNow = laneRadiusAtBeat(piece.lane, piece.beat);
  if (!piece.misses || piece.status !== "pending") return rNow;
  const missedAt = piece.beat - BEATS_PER_REV;
  const t = clamp01((beatPos - missedAt) / 2);
  if (t >= 1) return rNow;
  const rPrev = laneRadiusAtBeat(piece.lane, missedAt);
  return rPrev + (rNow - rPrev) * easeInQuad(t);
}

function Notes() {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  const shade = useRef(new Color());

  useFrame(() => {
    const inst = mesh.current;
    if (!inst) return;
    const notes = activeRun.notes;
    const d = dummy.current;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const v = noteVisual(note, clockState.beatPos);
      if (!v) {
        d.position.set(0, -1, 0);
        d.scale.setScalar(0.0001);
      } else {
        const angle = itemLocalAngle(note.beat);
        const r = laneRadiusAtBeat(note.lane, note.beat);
        d.position.set(Math.sin(angle) * r, v.y, Math.cos(angle) * r);
        d.scale.setScalar(v.s);
        d.rotation.y = clockState.beatPos * 0.8; // slow idle twirl
      }
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      // instance color multiplies albedo — dims missed notes as they sink
      inst.setColorAt(i, shade.current.setScalar(v ? v.dim : 1));
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
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
      const v = pieceVisual(piece, clockState.beatPos);
      if (!v) {
        mesh.visible = false;
        return;
      }
      const angle = itemLocalAngle(piece.beat);
      const r = pieceRadius(piece, clockState.beatPos);
      mesh.visible = true;
      mesh.position.set(Math.sin(angle) * r, v.y + 0.04, Math.cos(angle) * r);
      mesh.scale.setScalar(v.s);
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
