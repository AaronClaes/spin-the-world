import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { DISC_RADIUS, DISC_THICKNESS, LABEL_RADIUS } from "../game/constants";
import { loadProgress } from "../game/persistence";
import { meadow } from "../records/meadow";
import { GrooveRings } from "./Disc";
import { slotPosition } from "./Diorama";
import { usePropClone } from "./dioramaProps";

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
const ROW_Y = 0.12; // DOM title above, hints + credits below the plaques
const MINI = 0.145; // disc radius 5 → 0.72, nearly filling the frame

const WOOD = "#46331f";
const BACKING = "#17110d";
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

// One planted prop on the hanging record — same slot spiral as the game
// diorama, with the alive-world bob.
function WallProp({
  prop,
  index,
  count,
}: {
  prop: string;
  index: number;
  count: number;
}) {
  const clone = usePropClone(prop);
  const group = useRef<Group>(null);
  const [x, z] = slotPosition(index, count);
  const baseY = DISC_TOP + 0.014;

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.position.y =
      baseY + Math.sin(clock.elapsedTime * 2.2 + index * 1.3) * 0.015;
  });

  return (
    <group ref={group} position={[x, baseY, z]} rotation-y={index * 2.399963}>
      <primitive object={clone} />
      {prop === "pond" && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
          <circleGeometry args={[0.16, 24]} />
          <meshStandardMaterial color="#3f6fa8" roughness={0.25} />
        </mesh>
      )}
    </group>
  );
}

// The completed record, hanging: the game disc's exact materials at trophy
// scale, label facing out, turning slowly with its world alive on it.
function HangingRecord() {
  const spin = useRef<Group>(null);
  const props = meadow.worldPieces.map((p) => p.prop);

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
        <mesh rotation-x={-Math.PI / 2} position-y={DISC_TOP + 0.012}>
          <circleGeometry args={[LABEL_RADIUS - 0.12, 48]} />
          <meshStandardMaterial color="#6d9c52" roughness={0.9} />
        </mesh>
        {props.map((prop, i) => (
          <WallProp key={prop} prop={prop} index={i} count={props.length} />
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

function MeadowFrame({ onStart }: { onStart: () => void }) {
  const progress = loadProgress(meadow.id);
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
    <group position-x={-FRAME_STEP}>
      <group
        ref={group}
        onClick={onStart}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        {/* picture light for the one record that matters */}
        <pointLight position={[0.5, 0.7, 1.9]} intensity={5} color="#ffe2b0" />
        <Frame
          plaque={
            <div className="plaque">
              <div className="plaque-title">{meadow.title}</div>
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
          {progress.completed ? <HangingRecord /> : <Sleeve />}
        </Frame>
      </group>
    </group>
  );
}

export function WallScene({ onStart }: { onStart: () => void }) {
  const size = useThree((s) => s.size);

  // fit the three-frame row on narrow viewports: visible width at the wall
  // camera distance is 2·D·tan(fov/2)·aspect
  const visW = 2 * 5.2 * Math.tan((42 / 2) * (Math.PI / 180));
  const rowW = FRAME_SIZE * 3 + (FRAME_STEP - FRAME_SIZE) * 2 + 0.6;
  const fit = Math.min(1, (visW * (size.width / size.height)) / rowW);

  return (
    <group position={[0, WALL_Y, 0]}>
      {/* the wall itself — occludes the game scene entirely */}
      <mesh position-z={-0.06}>
        <planeGeometry args={[40, 24]} />
        <meshStandardMaterial color="#211913" roughness={0.95} />
      </mesh>
      {/* the desk lamp's warm pool of light */}
      <pointLight position={[0, 1.6, 3.2]} intensity={14} color="#ffc98a" />

      <group scale={fit} position-y={ROW_Y}>
        <MeadowFrame onStart={onStart} />
        {["II", "III"].map((n, i) => (
          <group key={n} position-x={i * FRAME_STEP}>
            <Frame
              plaque={
                <div className="plaque">
                  <div className="plaque-title dim">
                    vol. {n} — still being pressed
                  </div>
                </div>
              }
            />
          </group>
        ))}
      </group>
    </group>
  );
}
