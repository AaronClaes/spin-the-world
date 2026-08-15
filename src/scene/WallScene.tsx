import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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
// Art direction. The room is built in the game's own material language, not a
// photographic one, because it's the same world seen from the other end of the
// evening: standard materials at metalness 0, one flat colour each, roughness
// doing all the work, and every shadow and highlight PAINTED as a gradient
// rather than computed (Turntable.tsx does the same for the platter's contact
// shadow). Its palette is the turntable's — cream, charcoal, orange — so a
// frame on this wall is made of the same plastic as the machine you play on.
//
// This room used to be lit like a photograph, with an area light per frame and
// a clearcoat on the vinyl, and it looked expensive and foreign. Two things
// went with it and are worth not putting back: the reflections were the loudest
// signal that the wall belonged to a different game, and the area lights cost
// 105 kB gzip in RectAreaLight's lookup tables.
//
// The consistency problem that rig was solving solved itself. Three frames lit
// by three travelling lights read the same because the lights matched; three
// MATTE frames lit by one shared directional read the same because there's no
// specular to disagree about. The room's lights live in Scene.tsx's rig with
// the game's — ambient, hemisphere, key — and the warm pool on the wall behind
// them is painted (WallSurface), which is why nothing in the middle of the room
// has to cast it.

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
// leans forward at the bottom and back at the top — sits wholly inside it. It
// is NOT glazed: a pane catching the room in a diagonal band was the single
// most photographic thing in here, and the game has no reflections anywhere.
const FRONT_Z = 0.15; // front face of the moulding
const MOULD_DEPTH = 0.26;
const BEVEL = 0.016;
const BACK_Z = -0.148;
const MAT_Z = -0.135;
const RECORD_Z = 0;

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

// The turntable's colourway, straight off Turntable.tsx: charcoal body, cream
// panel, orange trim. It's the same three colours the machine in the game is
// moulded from, which is most of why the two halves now read as one object
// rather than a toy photographed next to a painting. It also solves the mount
// board on its own — the game already puts a black record on a cream deck, so
// a cream mount is the silhouette the player has been looking at all along.
const CHARCOAL = "#3b3f49"; // the deck's body
const WOOD = "#41404a"; // the frame, a shade off charcoal so the two read apart
const PANEL = "#ece1cb"; // the deck's cream, on the lamp shade
const MAT = "#9c8b70"; // mount board — the same cream several steps down. Full
// cream turned the mount into the brightest object in the room and the record
// into a hole cut in it; the board's job is to hold the disc's silhouette, not
// to win the frame, and at cream it also cleared the bloom threshold and threw
// a halo round the disc
const SLIPMAT = "#c97f3a"; // the ring the platter shows around the vinyl
const BACKING = "#2a2731";
// Painted shadows use the game's shadow colour, not black — Turntable.tsx
// grounds the platter with this and a flat black blob next to it looks like a
// hole rather than a shadow.
const SHADOW = "#241c10";

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
//
// Three stops read up the wall, not two out from a hot spot, because that's
// the shape the sky dome uses (SkyWorld.tsx) and a radial pool with a bright
// centre is a photographic cue — a lens looking at a lamp. This is the same
// gradient the game paints behind the record, in a room's colours.
const wallFrag = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uLow;
  uniform vec2 uScale;
  varying vec2 vUv;
  void main() {
    float h = (vUv.y - 0.5) * uScale.y;
    vec3 c = h > 0.0
      ? mix(uMid, uTop, smoothstep(0.0, 1.0, h))
      : mix(uMid, uLow, smoothstep(0.0, 1.0, -h));
    // and a wide, gentle warm rise behind the row, so the frames sit in
    // something rather than on a flat field
    float d = length(vec2((vUv.x - 0.5) * uScale.x, h - 0.35));
    gl_FragColor = vec4(c + vec3(0.055, 0.040, 0.024) * (1.0 - smoothstep(0.0, 1.4, d)), 1.0);
  }
`;

// The wall plane is 40×24 but the wall camera only ever sees about 7.6×4.3 of
// it, so the gradient has to run out over a few units or the whole visible
// field is one flat tone. This is that distance, not the plane's.
const POOL_R = 3.6;

function WallSurface() {
  const uniforms = useMemo(
    () => ({
      // warm through the middle where the row hangs, cooling and dropping
      // both ways — the same three-stop move the sky dome makes, in a room's
      // colours, and the cool ends are what keep a brown wall from reading as
      // mud next to a game that's mostly blue and cream
      uTop: { value: new Color("#4c4051") },
      uMid: { value: new Color("#6e5a4a") },
      uLow: { value: new Color("#2e2634") },
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

// The lamp over each frame. It is now purely a prop: it emits nothing, and the
// room's actual light comes from the shared rig in Scene.tsx. That's the honest
// trade for matching the game — the game has no area lights and no metal, so
// the fitting is moulded orange plastic with an unlit strip glowing under it,
// the same trick the lighthouse's lamp room uses (procProps.ts). What the lamp
// "casts" on the wall is a painted gradient, and what it "lays" on the vinyl is
// another one (SHEEN, below).
const LAMP_Y = FRAME_SIZE / 2 + 0.2;
const LAMP_W = 0.9;
const LAMP_Z = 0.3;

const STRUT_FOOT_Y = FRAME_SIZE / 2 - 0.02;
const STRUT_FOOT_Z = FRONT_Z - 0.06;
const STRUT_LEN = Math.hypot(LAMP_Y - STRUT_FOOT_Y, LAMP_Z - STRUT_FOOT_Z);

function PictureLight() {
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
          <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
        </mesh>
      ))}
      {/* the shade, a tube lying across the top of the frame. Cream, not
          orange: the deck wears orange on a button and a slipmat edge and
          nowhere else, and three orange bars across the top of the wall spend
          the whole accent before you reach the records. */}
      <mesh position={[0, LAMP_Y, LAMP_Z]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.05, 0.05, LAMP_W, 16]} />
        <meshStandardMaterial color={PANEL} roughness={0.6} />
      </mesh>
      {/* the lit strip under it — unlit and past the wall bloom threshold, so
          the fitting reads as switched on rather than as painted plastic */}
      <mesh position={[0, LAMP_Y - 0.046, LAMP_Z + 0.014]} rotation-x={-0.85}>
        <planeGeometry args={[LAMP_W - 0.08, 0.032]} />
        <meshBasicMaterial
          color="#ffe6a0"
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ----------------------------------------------------------------- frame ----

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
        color={SHADOW}
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
        color={SHADOW}
        strength={0.42}
        boxX={0.66}
        boxY={0.66}
        feather={0.42}
        power={0.9}
      />

      <mesh geometry={MOULD_GEO} position-z={FRONT_Z - MOULD_DEPTH - BEVEL}>
        <meshStandardMaterial color={WOOD} roughness={0.62} />
      </mesh>
      <mesh geometry={LIP_GEO} position-z={FRONT_Z - 0.05 - 0.009}>
        <meshStandardMaterial color={CHARCOAL} roughness={0.55} />
      </mesh>

      <group position-z={RECORD_Z}>{children}</group>

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

// One planted prop on the hanging record, standing on the same authored island
// spot as the game diorama. It used to bob, matching the completion bob the
// game disc had — both are gone: the record is already turning, and a town
// floating up and down on top of a rotating disc reads as scenery that forgot
// to be attached to anything.
function WallProp({
  prop,
  island,
  model,
}: {
  prop: string;
  island: IslandDef;
  model: string;
}) {
  const clone = usePropClone(prop, model);
  const spot = placementFor(island, prop);

  return (
    <group position={[spot.x, spot.y, spot.z]} rotation-y={spot.rot}>
      <primitive object={clone} />
    </group>
  );
}

// The completed record, hanging: the game disc at trophy scale, label facing
// out, turning slowly with its world alive on it.
function HangingRecord({
  record,
  spinning,
}: {
  record: RecordDef;
  spinning: boolean;
}) {
  const spin = useRef<Group>(null);
  const rate = useRef(0);
  const props = record.worldPieces.map((p) => p.prop);
  const island = islandFor(record.id);

  // Only the selected record turns, and it spins up and coasts down rather
  // than snapping — which makes the wall's motion say the same thing the wall's
  // sound says. The one that's moving is the one you're hearing.
  useFrame((_, delta) => {
    rate.current +=
      ((spinning ? 0.22 : 0) - rate.current) * (1 - Math.exp(-2.2 * delta));
    if (spin.current) spin.current.rotation.y += delta * rate.current;
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
        color={SHADOW}
        strength={0.62}
        boxX={0.44}
        boxY={0.44}
        feather={0.34}
        power={1.3}
      />
      {/* rotate the disc's spindle axis (+Y) out of the wall toward the
          camera, then lean it back on its mount (see LEAN) */}
      <group rotation-x={Math.PI / 2 - LEAN} scale={MINI}>
        {/* The orange ring around the record, which is the platter's slipmat
            quoted back. A square trim line inset from the rabbet was here
            first and it turned every frame into a television: a bezel round a
            bright panel. The game already draws exactly one orange ring in
            exactly this relationship to exactly this disc (Turntable.tsx), so
            the wall draws the same one and the two halves rhyme rather than
            merely matching. It lives inside the leaned group, not flat on the
            mount — a flat ring behind a tilted disc sits visibly off-centre,
            because it isn't in the same plane as the thing it surrounds. */}
        <mesh rotation-x={-Math.PI / 2} position-y={-DISC_THICKNESS / 2 - 0.01}>
          <ringGeometry args={[5.02, 5.32, 64]} />
          <meshStandardMaterial color={SLIPMAT} roughness={0.85} />
        </mesh>
        <group ref={spin}>
          <mesh>
            <cylinderGeometry
              args={[DISC_RADIUS, DISC_RADIUS, DISC_THICKNESS, 96]}
            />
            {/* The game disc's colour, but matte where the game's is faintly
                glossy — and that difference is load-bearing, not a slip. The
                game has ONE disc; the wall has three, side by side, and a
                shared directional light puts its specular at a different place
                on each of them because each sits at a different x from the
                camera. At the game's roughness the left record read black, the
                middle brown and the right one tan, which is the exact
                complaint the per-frame area lights were built to answer. Take
                the gloss away and one light shades all three identically, for
                free, in a room where nothing else reflects either. */}
            <meshStandardMaterial
              color="#16181d"
              roughness={0.82}
              metalness={0}
            />
          </mesh>
          <GrooveRings color="#252932" roughness={0.8} />
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
          {props.map((prop) => (
            <WallProp
              key={prop}
              prop={prop}
              island={island}
              model={record.dioramaModel}
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
// rather than rearranging the frame.
//
// Deliberately unprinted. It used to carry the record's accent across the
// foot, on the argument that the three sleeves have to be told apart from
// across the room — but the plaque under each frame already names the record
// and colour-codes its difficulty, so the band was answering a question that
// was never asked. What it did instead was put three saturated horizontal bars
// in a lamp-lit room of browns, and a saturated bar under a light reads as a
// light. Kraft on a wall of kraft is the point: nothing here is finished yet.
const SLEEVE = MINI_R * 2.06;

function Sleeve() {
  return (
    <>
      <Soft
        w={SLEEVE * 1.45}
        h={SLEEVE * 1.45}
        y={-0.075}
        z={MAT_Z - RECORD_Z + 0.004}
        color={SHADOW}
        strength={0.62}
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
        {/* the printed panel inset from the jacket's edge */}
        <mesh position-z={0.001}>
          <planeGeometry args={[SLEEVE - 0.11, SLEEVE - 0.11]} />
          <meshStandardMaterial color="#5b4a36" roughness={0.95} />
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

// ------------------------------------------------------------------ hover --

// Which frame the pointer is on, held outside React on purpose. Nothing about
// hover needs a re-render — it moves a scale and a cursor — and re-rendering
// the frame re-applies every prop on the picture lamp underneath it.
const hoverState: { id: string | null } = { id: null };

function takeHover(id: string) {
  hoverState.id = id;
  document.body.style.cursor = "pointer";
}

// Guarded, because an `out` for the frame you just left can arrive after the
// `over` for the one you just reached.
function releaseHover(id?: string) {
  if (id !== undefined && hoverState.id !== id) return;
  hoverState.id = null;
  document.body.style.cursor = "auto";
}

// r3f only re-tests what's under the pointer while the canvas is receiving
// pointermove, so the instant the pointer stops producing them — it crossed
// onto one of the DOM overlays, or left the window entirely — no `pointerout`
// is ever fired and whatever was hovered stays hovered, scaled up, forever.
// r3f does not clear its own hover set on the canvas's pointerleave; that was
// measured, not assumed. The unmount clear matters just as much: without it
// the cursor stays a pointer for the whole run after you click a record.
function useHoverRelease() {
  const canvas = useThree((s) => s.gl.domElement);
  useEffect(() => {
    const clear = () => releaseHover();
    canvas.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);
    return () => {
      canvas.removeEventListener("pointerleave", clear);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [canvas]);
}

// ----------------------------------------------------------------- plaques --

function RecordFrame({
  record,
  selected,
  onSelect,
}: {
  record: RecordDef;
  selected: boolean;
  onSelect: (record: RecordDef) => void;
}) {
  const progress = loadProgress(record.id);
  const group = useRef<Group>(null);

  // Selection and hover both lift the frame off the wall, and they add: the
  // selected record sits proud of the row whether or not you're pointing at
  // it, and still answers the pointer when you come back to it.
  useFrame((_, delta) => {
    if (!group.current) return;
    const k = 1 - Math.exp(-12 * delta);
    const s =
      1 + (selected ? 0.06 : 0) + (hoverState.id === record.id ? 0.04 : 0);
    group.current.scale.x += (s - group.current.scale.x) * k;
    group.current.scale.y = group.current.scale.x;
    group.current.scale.z = group.current.scale.x;
  });

  return (
    <group ref={group}>
      {/* One invisible pane carries every pointer handler, and none of the
          frame's real geometry carries any. This is not a convenience: hung on
          the group, `pointerout` fired every time the ray crossed from one
          child mesh to the next — moulding to mount to glass — and r3f
          delivers that `out` AFTER the `over` for the mesh you moved onto, so
          sweeping across a frame left hover reading false more often than
          true. The frame sat at 1.013 instead of 1.05 and jittered, which is
          the "flickering light" as well: the lamp is inside this group and
          the wobble moved it. One event object, one crossing, one out. */}
      <mesh
        position-z={FRONT_Z + 0.02}
        onPointerOver={() => takeHover(record.id)}
        onPointerOut={() => releaseHover(record.id)}
        // A click only selects. Nothing here leaves the wall — the camera
        // stays put and the pointer stays on the frame, so hover is left
        // alone: it's still true, and releasing it would drop the frame back
        // out of its hover lift with the pointer sitting on top of it.
        onClick={() => onSelect(record)}
      >
        <planeGeometry args={[FRAME_SIZE, FRAME_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <PictureLight />
      <Frame
        lit
        plaque={
          <div className={`plaque${selected ? " selected" : ""}`}>
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
          <HangingRecord record={record} spinning={selected} />
        ) : (
          <Sleeve />
        )}
      </Frame>
    </group>
  );
}

export function WallScene({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (record: RecordDef) => void;
}) {
  const size = useThree((s) => s.size);
  useHoverRelease();

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
      {/* No light lives here. A warm bounce used to, low and central, and it
          was the last thing in the room whose contribution depended on which
          frame you were looking at — nearer the middle one than the outer two.
          The rig in Scene.tsx covers the whole wall evenly, which is the point
          of it. */}

      <group scale={fit} position-y={ROW_Y}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const record = RECORDS[i];
          return (
            <group
              key={record?.id ?? `empty-${i}`}
              position-x={(i - (SLOTS - 1) / 2) * FRAME_STEP}
            >
              {record ? (
                <RecordFrame
                  record={record}
                  selected={record.id === selectedId}
                  onSelect={onSelect}
                />
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
