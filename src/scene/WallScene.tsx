import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  NormalBlending,
  Path,
  Shape,
  Vector2,
} from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
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
//
// Lighting note. Every shaped light in this room belongs to a frame — an area
// light under each picture lamp — and the only thing left in the middle of the
// wall is a dim bounce with nothing to reflect in. That's not decoration, it's
// the fix for a real bug: the room used to be lit by two bright point lights at
// the centre of the wall, so the middle record wore a big specular blob, the
// right one wore half of one, and the left one wore none. A light that belongs
// to the frame travels with it, and three frames lit by their own lamp read as
// three of the same object. The wall's warm pool is painted into the wall
// material instead (WallSurface), which is what freed the real lights up to be
// chosen for the records alone.
//
// RectAreaLight needs its lookup textures built before the first frame that
// uses one. Module scope, not an effect: an effect runs after the first
// render, and the first render is the one that would be wrong.
RectAreaLightUniformsLib.init();

export const WALL_Y = -60;
export const WALL_CAM_POS: [number, number, number] = [0, WALL_Y, 5.2];
export const WALL_LOOK_AT: [number, number, number] = [0, WALL_Y - 0.12, 0];

const FRAME_SIZE = 1.9; // outer edge of the moulding
// A slim rail. The wide one this replaced read as off-the-shelf pine: the
// proportion that says "gallery" is a narrow face with depth behind it, not
// a broad one — and the width freed up goes to the mount board, which is
// what actually makes a framed record look framed rather than mounted.
const MOULDING = 0.13; // rail width, so the opening is FRAME_SIZE - 2×
const OPENING = FRAME_SIZE - MOULDING * 2;
const FRAME_STEP = 2.45; // frame size + gap
const SIDE_MARGIN = 1.5; // wall left of the first frame / right of the last
const SLOTS = 3; // the row is always three plaques wide — records fill it
// from the left and the rest hang as empty frames, so pressing another record
// doesn't reflow the wall
const ROMAN = ["I", "II", "III"];
const ROW_Y = 0.14; // DOM title above, input hints below the plaques
const MINI = 0.14; // disc radius 5 → 0.7, leaving a margin of mount board

// A shadowbox, in local z. The moulding is deep enough that the record — which
// leans forward at the bottom and back at the top — sits wholly inside it,
// behind the glass. A framed record that pokes out through its own glazing is
// the one thing that would give the whole illusion away.
const FRONT_Z = 0.15; // front face of the moulding
const MOULD_DEPTH = 0.26;
const BEVEL = 0.016;
const BACK_Z = -0.148;
const MAT_Z = -0.135;
const RECORD_Z = 0;
const GLASS_Z = 0.125;

// How far the record leans in its mount. The sign matters more than the size:
// leaning the TOP back turns the disc into a mirror angled upward, which is
// where the picture lamp is, so the lamp lands as a bright band across the
// upper third instead of reflecting the floor. It also means the camera looks
// slightly DOWN into the tiny world rather than up at it, which is the right
// way round for a diorama. The shadowbox is deep enough to swallow the
// ±0.11 of travel this costs, which is most of why it's as deep as it is.
const LEAN = 0.16;

const WALL_W = 40;
const WALL_H = 24;
const WALL_Z = -0.35; // far enough back that the deepest frame clears it

// Dark walnut with a brass fillet at the rabbet. The wood is deliberately
// darker and less saturated than the wall behind it: a frame reads as premium
// when it's the quietest thing in the picture and the one warm line inside it
// does the talking.
const WOOD = "#2c231c"; // reads as walnut once the lamp is on it, not as pine
const MAT = "#4f463a"; // mount board — a warm stone card, deliberately many
// stops lighter than the vinyl: black board behind a black record and the disc
// loses its own silhouette, which is the one shape the frame is there for
const BRASS = "#b18a4c";
const BACKING = "#0d0a08";

const DISC_TOP = DISC_THICKNESS / 2;
const MINI_R = DISC_RADIUS * MINI;

// --------------------------------------------------------------- geometry --

// A rectangular ring, extruded with a bevel on both contours — a moulding
// profile rather than a slab. The bevel is the whole point: it gives the rail
// four surfaces at four angles, so a single light rakes across it and the
// frame has a top, a face and a sight edge instead of one flat tone.
function ringGeometry(outer: number, inner: number, depth: number, bevel = 0) {
  const o = outer / 2;
  const i = inner / 2;
  const shape = new Shape();
  shape.moveTo(-o, -o);
  shape.lineTo(o, -o);
  shape.lineTo(o, o);
  shape.lineTo(-o, o);
  shape.closePath();
  // wound the other way round, which is what makes it a hole
  const hole = new Path();
  hole.moveTo(-i, -i);
  hole.lineTo(-i, i);
  hole.lineTo(i, i);
  hole.lineTo(i, -i);
  hole.closePath();
  shape.holes.push(hole);
  return new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
}

// A stepped profile rather than one flat rail: the face is set back from a
// narrow raised outer lip. One rectangle of wood reads as a box round the
// picture; two, at different depths, read as a moulding.
const MOULD_GEO = ringGeometry(FRAME_SIZE - 0.04, OPENING, MOULD_DEPTH, BEVEL);
const LIP_GEO = ringGeometry(FRAME_SIZE, FRAME_SIZE - 0.09, 0.05, 0.009);
// the brass fillet: a thin band lying on the mount, inset from the rabbet, the
// way a framer separates the work from the board
const FILLET_GEO = ringGeometry(OPENING - 0.03, OPENING - 0.075, 0.01, 0.003);

// --------------------------------------------------------------- soft quads --

const quadVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A soft rounded-box blob: a flat core of half-extent uBox falling to nothing
// uFeather further out, in a square [-1,1] space. One shader covers every soft
// edge on this wall — the shadow a frame throws, the lamp's pool above it, the
// shadow the record throws on its own mount, the specular streak lying across
// the vinyl. They're the same shape in different colours, and nothing here
// casts a real shadow, so all of it is painted.
const softFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform vec2 uBox;
  uniform float uFeather;
  uniform float uPower;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(max(abs(p) - uBox, 0.0));
    float a = pow(1.0 - smoothstep(0.0, uFeather, d), uPower);
    gl_FragColor = vec4(uColor, a * uStrength);
  }
`;

function Soft({
  w,
  h,
  z,
  x = 0,
  y = 0,
  color,
  strength,
  boxX,
  boxY,
  feather,
  power = 1,
  additive = false,
}: {
  w: number;
  h: number;
  z: number;
  x?: number;
  y?: number;
  color: string;
  strength: number;
  boxX: number;
  boxY: number;
  feather: number;
  power?: number;
  additive?: boolean;
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(color) },
      uStrength: { value: strength },
      uBox: { value: new Vector2(boxX, boxY) },
      uFeather: { value: feather },
      uPower: { value: power },
    }),
    [color, strength, boxX, boxY, feather, power],
  );
  return (
    <mesh position={[x, y, z]}>
      <planeGeometry args={[w, h]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={quadVert}
        fragmentShader={softFrag}
        transparent
        depthWrite={false}
        blending={additive ? AdditiveBlending : NormalBlending}
      />
    </mesh>
  );
}

// ------------------------------------------------------------- the wall ----

// The room's warm pool, painted rather than lit. A point light at the middle
// of the wall gives you this gradient for free, but it also puts a hard
// specular on whatever hangs nearest it, which is how the three records ended
// up looking like three different objects. Paint the pool, and every real
// light in the room can be chosen for the frames alone.
const wallFrag = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform vec2 uScale;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - vec2(0.5, 0.47)) * uScale;
    float k = 1.0 - smoothstep(0.0, 1.0, length(p));
    vec3 c = mix(uEdge, uCore, k);
    // plaster grain. A two-colour gradient stretched over forty units bands
    // badly on an 8-bit target, and a per-pixel dither is cheaper than a
    // texture and never tiles.
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(127.1, 311.7))) * 43758.5453);
    gl_FragColor = vec4(c + (n - 0.5) * 0.016, 1.0);
  }
`;

const POOL_R = 9.5; // where the wall gradient reaches its edge colour

function WallSurface() {
  const uniforms = useMemo(
    () => ({
      uCore: { value: new Color("#4e493f") },
      uEdge: { value: new Color("#151312") },
      uScale: { value: new Vector2(WALL_W / POOL_R, WALL_H / POOL_R) },
    }),
    [],
  );
  return (
    <mesh position-z={WALL_Z}>
      <planeGeometry args={[WALL_W, WALL_H]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={quadVert}
        fragmentShader={wallFrag}
      />
    </mesh>
  );
}

// ---------------------------------------------------------- picture light --

// The brass lamp over each frame, and the light it actually emits. The lamp
// is why the highlight on the vinyl is a soft horizontal bar rather than a
// round dot: a RectAreaLight reflects as its own shape, so a wide, shallow
// one reads as a strip light in a lacquered surface. A point light in the
// same place reflects as a point, which is the "cheap" look — it's the wrong
// shape for the fitting the room is supposed to contain.
const LAMP_Y = FRAME_SIZE / 2 + 0.2;
const LAMP_W = 0.9;
// Where the fitting hangs, and — separately — where its light comes from. The
// two don't match on purpose. A lamp tucked against the wall only grazes a
// flat picture, and a record is as flat as pictures get, so the emitter sits
// well out in the room; but drawing the arm that would need means a foot of
// brass pole crossing the frame head-on. The fixture stays bracketed to the
// frame where it reads as a fitting, and the light comes from where light
// works. Nobody audits the two against each other.
const LAMP_Z = 0.3;
const EMIT_Z = 1.15;
const LAMP_AIM_Y = -0.2; // the point on the frame face the lamp looks at

const STRUT_FOOT_Y = FRAME_SIZE / 2 - 0.02;
const STRUT_FOOT_Z = FRONT_Z - 0.06;
const STRUT_LEN = Math.hypot(LAMP_Y - STRUT_FOOT_Y, LAMP_Z - STRUT_FOOT_Z);

function PictureLight() {
  const dy = LAMP_Y - LAMP_AIM_Y;
  return (
    <group>
      {/* Two struts up off the top rail. An arm running all the way back to
          the wall is the other way to mount one of these, but the wall is a
          foot behind the frame and the vanishing point is at screen centre,
          so that arm draws as a long hook falling across the top of the
          picture. Bracketed to the frame it's two short lines, and it's a
          real fitting either way. */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[
            s * 0.22,
            (STRUT_FOOT_Y + LAMP_Y) / 2,
            (STRUT_FOOT_Z + LAMP_Z) / 2,
          ]}
          rotation-x={Math.atan2(LAMP_Z - STRUT_FOOT_Z, LAMP_Y - STRUT_FOOT_Y)}
        >
          <boxGeometry args={[0.022, STRUT_LEN, 0.02]} />
          <meshStandardMaterial
            color={BRASS}
            roughness={0.4}
            metalness={0.85}
          />
        </mesh>
      ))}
      {/* the shade, a brass tube lying across the top of the frame */}
      <mesh position={[0, LAMP_Y, LAMP_Z]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.05, 0.05, LAMP_W, 16]} />
        <meshStandardMaterial color={BRASS} roughness={0.32} metalness={0.9} />
      </mesh>
      {/* the lit strip under it — unlit and past the wall bloom threshold, so
          the fitting reads as switched on rather than as painted brass */}
      <mesh position={[0, LAMP_Y - 0.046, LAMP_Z + 0.014]} rotation-x={-0.85}>
        <planeGeometry args={[LAMP_W - 0.08, 0.032]} />
        <meshBasicMaterial
          color="#ffcf95"
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>

      <rectAreaLight
        position={[0, LAMP_Y, EMIT_Z]}
        rotation-x={-Math.atan2(dy, EMIT_Z)}
        width={LAMP_W}
        height={0.1}
        intensity={21}
        color="#ffd9a8"
      />
    </group>
  );
}

// ----------------------------------------------------------------- frame ----

// Glazing. Not a transmissive material — just the one thing glass actually
// does on camera, which is catch the room in a diagonal band across the top
// corner. Additive, so it can only ever lighten what's behind it.
const glassFrag = /* glsl */ `
  varying vec2 vUv;
  void main() {
    // kept up in the top-left corner: run it corner to corner and it saws the
    // tiny world on the label in half, which is the one thing in the frame
    // anybody is looking at
    float t = vUv.x + (1.0 - vUv.y);
    float wide = smoothstep(0.08, 0.26, t) * (1.0 - smoothstep(0.26, 0.56, t));
    float thin = smoothstep(0.58, 0.63, t) * (1.0 - smoothstep(0.63, 0.72, t));
    gl_FragColor = vec4(0.80, 0.86, 1.0, wide * 0.008 + thin * 0.02);
  }
`;
const GLASS_UNIFORMS = {};

function Frame({
  children,
  plaque,
  lit,
}: {
  children?: React.ReactNode;
  plaque: React.ReactNode;
  lit: boolean;
}) {
  return (
    <>
      {/* what the frame throws on the wall, and what its lamp spills above
          it. Both painted — see Soft. */}
      <Soft
        w={FRAME_SIZE * 1.9}
        h={FRAME_SIZE * 1.9}
        y={-0.06}
        z={WALL_Z + 0.004}
        color="#0a0705"
        strength={0.5}
        boxX={0.5}
        boxY={0.5}
        feather={0.42}
        power={1.4}
      />
      {lit && (
        <Soft
          w={FRAME_SIZE * 2.1}
          h={FRAME_SIZE * 1.5}
          y={FRAME_SIZE * 0.5}
          z={WALL_Z + 0.008}
          color="#ffb877"
          strength={0.2}
          boxX={0.12}
          boxY={0.02}
          feather={0.8}
          power={1.6}
          additive
        />
      )}

      {/* backing board, mount board, moulding, brass fillet */}
      <mesh position-z={BACK_Z}>
        <planeGeometry args={[OPENING + 0.04, OPENING + 0.04]} />
        <meshStandardMaterial color={BACKING} roughness={0.95} />
      </mesh>
      <mesh position-z={MAT_Z}>
        <planeGeometry args={[OPENING, OPENING]} />
        <meshStandardMaterial color={MAT} roughness={0.92} />
      </mesh>
      {/* the rabbet's own shadow, so the mount sinks into the frame rather
          than being pasted across the back of it */}
      <Soft
        w={OPENING}
        h={OPENING}
        z={MAT_Z + 0.002}
        color="#000000"
        strength={0.55}
        boxX={0.62}
        boxY={0.62}
        feather={0.45}
        power={0.8}
      />

      <mesh geometry={FILLET_GEO} position-z={MAT_Z + 0.002}>
        <meshStandardMaterial color={BRASS} roughness={0.42} metalness={0.85} />
      </mesh>
      <mesh geometry={MOULD_GEO} position-z={FRONT_Z - MOULD_DEPTH - BEVEL}>
        <meshStandardMaterial color={WOOD} roughness={0.52} metalness={0.06} />
      </mesh>
      <mesh geometry={LIP_GEO} position-z={FRONT_Z - 0.05 - 0.009}>
        <meshStandardMaterial color={WOOD} roughness={0.44} metalness={0.06} />
      </mesh>

      <group position-z={RECORD_Z}>{children}</group>

      <mesh position-z={GLASS_Z}>
        <planeGeometry args={[OPENING, OPENING]} />
        <shaderMaterial
          uniforms={GLASS_UNIFORMS}
          vertexShader={quadVert}
          fragmentShader={glassFrag}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <Html
        center
        transform
        position={[0, -FRAME_SIZE / 2 - 0.42, 0]}
        distanceFactor={3.4}
        wrapperClass="plaque-html"
      >
        {plaque}
      </Html>
    </>
  );
}

// ------------------------------------------------------- the hanging record --

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

// The completed record, hanging: the game disc at trophy scale, label facing
// out, turning slowly with its world alive on it.
function HangingRecord({ record }: { record: RecordDef }) {
  const spin = useRef<Group>(null);
  const props = record.worldPieces.map((p) => p.prop);
  const island = islandFor(record.id);

  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.22;
  });

  return (
    <>
      {/* the shadow the record casts on its mount, offset the way the lamp
          above it would throw one */}
      <Soft
        w={MINI_R * 2.9}
        h={MINI_R * 2.9}
        y={-0.075}
        z={MAT_Z - RECORD_Z + 0.004}
        color="#000000"
        strength={0.75}
        boxX={0.44}
        boxY={0.44}
        feather={0.34}
        power={1.3}
      />
      {/* rotate the disc's spindle axis (+Y) out of the wall toward the
          camera, then lean it back on its mount (see LEAN) */}
      <group rotation-x={Math.PI / 2 - LEAN} scale={MINI}>
        <group ref={spin}>
          <mesh>
            <cylinderGeometry
              args={[DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 96]}
            />
            {/* A polished dielectric, and deliberately NOT a clearcoat one:
                three's rect-area BRDF has no clearcoat term, so a clearcoat
                over a rough base gets ignored and all that's left is the
                base's broad sheen — which is how this disc spent an
                afternoon looking like a beer mat. The tightness has to live
                in `roughness`, and then the lamp reflects as the bar it
                actually is. Metalness stays 0: vinyl is black plastic, and
                metal would tint the highlight with the body colour. */}
            <meshStandardMaterial
              color="#0a0c10"
              roughness={0.13}
              metalness={0}
            />
          </mesh>
          <GrooveRings color="#191c22" roughness={0.26} />
          <mesh position-y={DISC_TOP + 0.003}>
            <cylinderGeometry args={[LABEL_RADIUS, LABEL_RADIUS, 0.012, 48]} />
            <meshStandardMaterial color="#c98a3d" roughness={0.7} />
          </mesh>
          <mesh
            rotation-x={-Math.PI / 2}
            position={[0.05, DISC_TOP + 0.011, 0.03]}
          >
            <ringGeometry
              args={[LABEL_RADIUS - 0.1, LABEL_RADIUS - 0.06, 48]}
            />
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
    </>
  );
}

// The uncompleted record hangs as its sleeve: a kraft jacket, die-cut so the
// vinyl and label show through. Sized and leaned exactly like the record it
// replaces, so finishing a run swaps one object for another in the same mount
// rather than rearranging the frame. The only colour on it is the record's own
// accent, printed across the foot — the three sleeves have to be told apart
// from across the room, and there's no diorama on them yet to do it.
const SLEEVE = MINI_R * 2.06;

function Sleeve({ record }: { record: RecordDef }) {
  return (
    <>
      <Soft
        w={SLEEVE * 1.45}
        h={SLEEVE * 1.45}
        y={-0.075}
        z={MAT_Z - RECORD_Z + 0.004}
        color="#000000"
        strength={0.75}
        boxX={0.44}
        boxY={0.44}
        feather={0.34}
        power={1.3}
      />
      <group rotation-x={-LEAN}>
        <mesh>
          <planeGeometry args={[SLEEVE, SLEEVE]} />
          <meshStandardMaterial color="#6b5942" roughness={0.95} />
        </mesh>
        {/* printed panel, then the accent band across the foot */}
        <mesh position-z={0.001}>
          <planeGeometry args={[SLEEVE - 0.11, SLEEVE - 0.11]} />
          <meshStandardMaterial color="#5b4a36" roughness={0.95} />
        </mesh>
        <mesh position={[0, -SLEEVE * 0.36, 0.002]}>
          <planeGeometry args={[SLEEVE - 0.11, 0.045]} />
          <meshStandardMaterial color={record.accentColor} roughness={0.85} />
        </mesh>
        {/* the die cut, and what shows through it */}
        <mesh position-z={0.004}>
          <circleGeometry args={[SLEEVE * 0.3, 48]} />
          <meshStandardMaterial
            color="#0a0c10"
            roughness={0.13}
            metalness={0}
          />
        </mesh>
        <mesh position-z={0.006}>
          <circleGeometry args={[SLEEVE * 0.125, 32]} />
          <meshStandardMaterial color="#c98a3d" roughness={0.7} />
        </mesh>
      </group>
    </>
  );
}

// ----------------------------------------------------------------- plaques --

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
    const s = hover ? 1.05 : 1;
    group.current.scale.x += (s - group.current.scale.x) * k;
    group.current.scale.y = group.current.scale.x;
    group.current.scale.z = group.current.scale.x;
  });

  return (
    <group
      ref={group}
      onClick={() => onStart(record)}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
      <PictureLight />
      <Frame
        lit
        plaque={
          <div className="plaque">
            <div className="plaque-title">{record.title}</div>
            <div className={`plaque-badge ${record.difficulty}`}>
              {record.difficulty}
            </div>
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
        {progress.completed ? (
          <HangingRecord record={record} />
        ) : (
          <Sleeve record={record} />
        )}
      </Frame>
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
      <WallSurface />
      {/* the room's own light. Everything shaped lives on a frame; this is
          only the bounce that keeps the mouldings' outer faces from going to
          pure black, and it has to be soft and placed low so it can't put a
          second highlight on any record. */}
      <pointLight position={[0, -1.9, 3.4]} intensity={3.4} color="#c98f5e" />

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
                  lit={false}
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
