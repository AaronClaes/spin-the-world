import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { DISC_RADIUS, DISC_THICKNESS, LABEL_RADIUS } from "../game/constants";
import { loadProgress } from "../game/persistence";
import { RECORDS } from "../records";
import type { RecordDef } from "../records/types";
import { GrooveRings } from "./Disc";
import { usePropClone } from "./dioramaProps";
import { Island } from "./Island";
import { type IslandDef, islandFor, placementFor } from "./islandLayout";

// The studio wall as a real place (spec §8.7): records hang framed like
// plaques. An uncompleted record hangs as its sleeve; a completed one is the
// ACTUAL vinyl — tiny world planted on the label, alive, slowly turning in
// its frame. It lives far below the game scene so the two never interleave;
// the camera rig flies between the two poses on needle drop / back-to-wall.

export const WALL_Y = -60;
export const WALL_CAM_POS: [number, number, number] = [0, WALL_Y, 5.2];
export const WALL_LOOK_AT: [number, number, number] = [0, WALL_Y - 0.12, 0];

const FRAME_SIZE = 1.72;
const FRAME_STEP = 2.34; // frame size + gap
const SIDE_MARGIN = 1.7; // wall left of the first frame / right of the last
const SLOTS = 3; // the row is always three plaques wide — records fill it
// from the left and the rest hang as empty frames, so pressing another record
// doesn't reflow the wall
const ROMAN = ["I", "II", "III"];
const ROW_Y = 0.12; // DOM title above, input hints below the plaques
const MINI = 0.145; // disc radius 5 → 0.72, nearly filling the frame

// the frames stay darker than the lit wall — framed things read as objects
// sitting on a wall, not as holes cut into it
const WOOD = "#4a3520";
const BACKING = "#1e160f";
const DISC_TOP = DISC_THICKNESS / 2;

function Frame({
  children,
  plaque,
}: {
  children?: React.ReactNode;
  plaque: React.ReactNode;
}) {
  return (
    <>
      {/* wood box with a recessed dark backing — the border is the wood
          showing around the backing */}
      <mesh>
        <boxGeometry args={[FRAME_SIZE, FRAME_SIZE, 0.09]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} />
      </mesh>
      <mesh position-z={0.048}>
        <planeGeometry args={[FRAME_SIZE - 0.2, FRAME_SIZE - 0.2]} />
        <meshStandardMaterial color={BACKING} roughness={0.9} />
      </mesh>
      <group position-z={0.06}>{children}</group>
      <Html
        center
        transform
        position={[0, -FRAME_SIZE / 2 - 0.3, 0]}
        distanceFactor={3.4}
        wrapperClass="plaque-html"
      >
        {plaque}
      </Html>
    </>
  );
}

// One planted prop on the hanging record — the same authored island spot as
// the game diorama, with the alive-world bob.
function WallProp({
  prop,
  island,
  model,
  index,
}: {
  prop: string;
  island: IslandDef;
  model: string;
  index: number;
}) {
  const clone = usePropClone(prop, model);
  const group = useRef<Group>(null);
  const spot = placementFor(island, prop);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.position.y =
      spot.y + Math.sin(clock.elapsedTime * 2.2 + index * 1.3) * 0.015;
  });

  return (
    <group
      ref={group}
      position={[spot.x, spot.y, spot.z]}
      rotation-y={spot.rot}
    >
      <primitive object={clone} />
    </group>
  );
}

// The completed record, hanging: the game disc's exact materials at trophy
// scale, label facing out, turning slowly with its world alive on it.
function HangingRecord({ record }: { record: RecordDef }) {
  const spin = useRef<Group>(null);
  const props = record.worldPieces.map((p) => p.prop);
  const island = islandFor(record.id);

  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.22;
  });

  return (
    // rotate the disc's spindle axis (+Y) out of the wall toward the camera,
    // leaning its top off the wall like a plate on a mount — the tiny world
    // reads in 3/4 view and the vinyl catches the lamp. Proud of the frame
    // (z) so the tilted rim clears the backing.
    <group position-z={0.1} rotation-x={Math.PI / 2 + 0.12} scale={MINI}>
      <group ref={spin}>
        <mesh>
          <cylinderGeometry
            args={[DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 96]}
          />
          <meshStandardMaterial
            color="#16181d"
            roughness={0.28}
            metalness={0.2}
          />
        </mesh>
        <GrooveRings />
        <mesh position-y={DISC_TOP + 0.003}>
          <cylinderGeometry args={[LABEL_RADIUS, LABEL_RADIUS, 0.012, 48]} />
          <meshStandardMaterial color="#c98a3d" roughness={0.7} />
        </mesh>
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0.05, DISC_TOP + 0.011, 0.03]}
        >
          <ringGeometry args={[LABEL_RADIUS - 0.1, LABEL_RADIUS - 0.06, 48]} />
          <meshStandardMaterial color="#8a5a22" roughness={0.75} />
        </mesh>
        {/* the tiny world, planted and alive */}
        <Island island={island} alive />
        {props.map((prop, i) => (
          <WallProp
            key={prop}
            prop={prop}
            island={island}
            model={record.dioramaModel}
            index={i}
          />
        ))}
      </group>
    </group>
  );
}

// The uncompleted record hangs as its sleeve — kraft square with a round
// cutout showing the vinyl and label, matching the old wall's look.
function Sleeve() {
  const inner = FRAME_SIZE - 0.28;
  return (
    <group>
      <mesh>
        <planeGeometry args={[inner, inner]} />
        <meshStandardMaterial color="#b6935f" roughness={0.85} />
      </mesh>
      <mesh position-z={0.005}>
        <circleGeometry args={[inner * 0.33, 48]} />
        <meshStandardMaterial color="#16181d" roughness={0.4} />
      </mesh>
      <mesh position-z={0.01}>
        <circleGeometry args={[inner * 0.14, 32]} />
        <meshStandardMaterial color="#c98a3d" roughness={0.7} />
      </mesh>
    </group>
  );
}

function RecordFrame({
  record,
  onStart,
}: {
  record: RecordDef;
  onStart: (record: RecordDef) => void;
}) {
  const progress = loadProgress(record.id);
  const [hover, setHover] = useState(false);
  const group = useRef<Group>(null);

  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : "auto";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hover]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const k = 1 - Math.exp(-12 * delta);
    const s = hover ? 1.06 : 1;
    group.current.scale.x += (s - group.current.scale.x) * k;
    group.current.scale.y = group.current.scale.x;
    group.current.scale.z = group.current.scale.x;
  });

  return (
    <group>
      <group
        ref={group}
        onClick={() => onStart(record)}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        {/* picture light — every pressed record gets one; the empty frames
            stay in the room's ambient dark */}
        <pointLight position={[0.5, 0.7, 1.9]} intensity={6} color="#ffe2b0" />
        <Frame
          plaque={
            <div className="plaque">
              <div className="plaque-title">{record.title}</div>
              <div
                className="plaque-stars"
                aria-label={`${progress.stars} of 3 stars`}
              >
                {[0, 1, 2].map((i) => (
                  <span key={i} className={i < progress.stars ? "" : "off"}>
                    ★
                  </span>
                ))}
              </div>
              {progress.highScore > 0 && (
                <div className="plaque-score">
                  best {progress.highScore.toLocaleString()}
                </div>
              )}
            </div>
          }
        >
          {progress.completed ? <HangingRecord record={record} /> : <Sleeve />}
        </Frame>
      </group>
    </group>
  );
}

export function WallScene({
  onStart,
}: {
  onStart: (record: RecordDef) => void;
}) {
  const size = useThree((s) => s.size);

  // fit the three-frame row: visible width at the wall camera distance is
  // 2·D·tan(fov/2)·aspect. SIDE_MARGIN is counted as part of the row, so the
  // frames scale down to leave wall showing either side rather than running
  // to the screen edges — and keep shrinking on narrow viewports.
  const visW = 2 * 5.2 * Math.tan((42 / 2) * (Math.PI / 180));
  const rowW =
    FRAME_SIZE * SLOTS +
    (FRAME_STEP - FRAME_SIZE) * (SLOTS - 1) +
    SIDE_MARGIN * 2;
  const fit = Math.min(1, (visW * (size.width / size.height)) / rowW);

  return (
    <group position={[0, WALL_Y, 0]}>
      {/* the wall itself — occludes the game scene entirely */}
      <mesh position-z={-0.06}>
        <planeGeometry args={[40, 24]} />
        {/* warm greige rather than brown — the amber lamp does the colouring,
            so a saturated wall just turns the whole room orange */}
        <meshStandardMaterial color="#4c463d" roughness={0.95} />
      </mesh>
      {/* the desk lamp's warm pool of light */}
      <pointLight position={[0, 1.6, 3.2]} intensity={15} color="#ffc98a" />
      {/* a low bounce that lifts the wall under the frames — the room reads
          lit rather than lost, without flattening the lamp's falloff */}
      <pointLight position={[0, -1.4, 3]} intensity={5} color="#e0b083" />

      <group scale={fit} position-y={ROW_Y}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const record = RECORDS[i];
          return (
            <group
              key={record?.id ?? `empty-${i}`}
              position-x={(i - (SLOTS - 1) / 2) * FRAME_STEP}
            >
              {record ? (
                <RecordFrame record={record} onStart={onStart} />
              ) : (
                <Frame
                  plaque={
                    <div className="plaque">
                      <div className="plaque-title dim">
                        vol. {ROMAN[i]} — still being pressed
                      </div>
                    </div>
                  }
                />
              )}
            </group>
          );
        })}
      </group>
    </group>
  );
}
