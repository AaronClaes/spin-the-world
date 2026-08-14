import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Color, DynamicDrawUsage, InstancedMesh, Group, Object3D } from "three";
import type { Mesh, MeshBasicMaterial } from "three";
import {
  BEATS_PER_REV,
  DISC_THICKNESS,
  RISE_LEAD_BEATS,
} from "../game/constants";
import { clockState } from "../game/clockState";
import { itemLocalAngle, itemRadius } from "../game/geometry";
import type { RunItem } from "../game/items";
import { activeRun } from "../game/runState";
import { usePropClone } from "./dioramaProps";
import { lastCatchColor, noteColor } from "./notePalette";

// Items live in disc space — this component renders inside the rotating disc
// group, so positions are static per beat; only rise/sink animation moves.
// They surface out of the vinyl as the needle approaches (spec §6.5).
//
// World pieces in the groove are the actual diorama prop, miniature, riding
// on an accent-colour ring — you can see the windmill you're about to catch
// (or the one you missed circling back around). Notes stay one InstancedMesh.
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
const RIDE_Y = DISC_TOP + 0.12; // fully risen height (notes — centred geometry)
const SUNK_Y = DISC_TOP - 0.14; // fully buried (notes)
const PIECE_RIDE_Y = DISC_TOP + 0.015; // props stand on their base
const PIECE_SUNK_Y = DISC_TOP - 0.55; // deep enough for the tallest prop

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInQuad = (t: number) => t * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface ItemVisual {
  s: number; // scale 0..1
  y: number;
  dim: number; // 1 = fresh, lower = missed (notes only — instance colour)
}

// Rise for a pending item approaching the needle; null while still buried.
function riseVisual(
  lead: number,
  rideY: number,
  sunkY: number,
): ItemVisual | null {
  if (lead > RISE_LEAD_BEATS) return null;
  const p = easeOutCubic(
    clamp01((RISE_LEAD_BEATS - lead) / RISE_DURATION_BEATS),
  );
  return { s: p, y: sunkY + (rideY - sunkY) * p, dim: 1 };
}

// Sink for a resolved item that stays on the record; null once fully buried.
function sinkVisual(
  past: number,
  rideY: number,
  sunkY: number,
): ItemVisual | null {
  if (past >= SINK_BEATS) return null;
  const t = easeInQuad(clamp01(past / SINK_BEATS));
  return {
    s: 1 - 0.3 * t,
    y: rideY + (sunkY - rideY) * t,
    dim: 1 - 0.6 * t,
  };
}

function noteVisual(note: RunItem, beatPos: number): ItemVisual | null {
  if (note.status === "collected") return null; // caught — pickup fx is M5
  if (note.status === "missed")
    return sinkVisual(beatPos - note.beat, RIDE_Y, SUNK_Y);
  return riseVisual(note.beat - beatPos, RIDE_Y, SUNK_Y);
}

function pieceVisual(piece: RunItem, beatPos: number): ItemVisual | null {
  if (piece.status === "collected") return null; // the fly-in arc takes over
  if (piece.status === "lost")
    return sinkVisual(beatPos - piece.beat, PIECE_RIDE_Y, PIECE_SUNK_Y);
  // Once missed, the piece never re-buries — it rides the disc back around.
  if (piece.misses) return { s: 1, y: PIECE_RIDE_Y, dim: 1 };
  return riseVisual(piece.beat - beatPos, PIECE_RIDE_Y, PIECE_SUNK_Y);
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
      // instance colour carries both the note's palette deal and the miss
      // dimming; the material is white so this IS the note's colour
      inst.setColorAt(
        i,
        shade.current
          .copy(noteColor(note.beat, note.lane))
          .multiplyScalar(v ? v.dim : 1),
      );
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
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={0.55}
        roughness={0.4}
        onUpdate={(m) => {
          // stock three multiplies instance colour into the diffuse only —
          // tint the glow too, or every note would shine the same white
          m.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\n" +
                "#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor;\n#endif",
            );
          };
        }}
      />
    </instancedMesh>
  );
}

// One world piece riding its groove: the real prop (cloned from the diorama
// GLB — its node transform is the kitbash normalization, so we position a
// wrapper and never touch the clone) over a soft accent ring.
function GroovePiece({ piece }: { piece: RunItem }) {
  const clone = usePropClone(piece.prop as string);
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    // the ring keeps the afterglow of the last note caught
    if (ring.current)
      (ring.current.material as MeshBasicMaterial).color.lerp(
        lastCatchColor,
        1 - Math.exp(-8 * delta),
      );
    const v = pieceVisual(piece, clockState.beatPos);
    if (!v) {
      g.visible = false;
      return;
    }
    const angle = itemLocalAngle(piece.beat);
    const r = pieceRadius(piece, clockState.beatPos);
    g.visible = true;
    g.position.set(Math.sin(angle) * r, v.y, Math.cos(angle) * r);
    g.scale.setScalar(Math.max(v.s, 0.0001));
  });

  return (
    <group ref={group} visible={false}>
      <primitive object={clone} />
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.006}>
        <ringGeometry args={[0.2, 0.27, 32]} />
        <meshBasicMaterial
          color={activeRun.record.accentColor}
          transparent
          opacity={0.45}
        />
      </mesh>
    </group>
  );
}

export function Items() {
  return (
    <>
      <Notes />
      {activeRun.pieces.map((piece) => (
        <GroovePiece key={piece.id} piece={piece} />
      ))}
    </>
  );
}
