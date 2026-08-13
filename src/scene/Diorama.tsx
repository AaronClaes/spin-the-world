import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Group } from "three";
import { DISC_THICKNESS } from "../game/constants";
import { activeRun } from "../game/runState";
import { useGameStore } from "../game/store";

// M2 grey-box diorama: one box per collected piece, on the label, spinning
// with the record. Slots are deterministic per prop (index in worldPieces),
// laid out on a golden-angle spiral inside the label radius. Real props and
// the fly-in arc arrive in M3/M4.

const GOLDEN_ANGLE = 2.399963;

function slotPosition(index: number, count: number): [number, number] {
  const angle = index * GOLDEN_ANGLE;
  const r = 0.3 + 0.6 * Math.sqrt((index + 0.5) / count);
  return [Math.sin(angle) * r, Math.cos(angle) * r];
}

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

function PieceBox({ index, count }: { index: number; count: number }) {
  const group = useRef<Group>(null);
  const bornAt = useRef<number | null>(null);
  const [x, z] = slotPosition(index, count);
  const height = 0.12 + (index % 3) * 0.05;

  useFrame(({ clock }) => {
    if (!group.current) return;
    if (bornAt.current === null) bornAt.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - bornAt.current) / 0.45);
    group.current.scale.setScalar(easeOutBack(t));
  });

  return (
    <group
      ref={group}
      position={[x, DISC_THICKNESS / 2 + height / 2 + 0.01, z]}
      scale={0}
    >
      <mesh rotation-y={index * GOLDEN_ANGLE}>
        <boxGeometry args={[0.16, height, 0.16]} />
        <meshStandardMaterial color="#b9bec7" roughness={0.7} />
      </mesh>
    </group>
  );
}

export function Diorama() {
  const collected = useGameStore((s) => s.piecesCollected);
  const props = activeRun.record.worldPieces.map((p) => p.prop);

  return (
    <>
      {collected.map((prop) => (
        <PieceBox key={prop} index={props.indexOf(prop)} count={props.length} />
      ))}
    </>
  );
}
