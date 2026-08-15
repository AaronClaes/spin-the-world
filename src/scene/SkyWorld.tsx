import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type {
  Box3,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  ShaderMaterial,
} from "three";
import {
  BackSide,
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { clockState } from "../game/clockState";
import { activeRun } from "../game/runState";
import { DAYLIGHT, skyFor } from "../records/sky";

// The place the record floats in (spec §9: free atmosphere). The sky used to
// be a single flat Color on scene.background — no gradient, no parallax, so
// nearly half the frame was one dead field of blue.
//
// Two pieces, both unlit and both cheap: a gradient dome, and one instanced
// field of chunky cartoon clouds. The clouds sit BELOW and around the deck,
// not above it — at the play pose the camera pitches ~24° down with a 21°
// half-fov, which puts the horizon just off the top of the screen. Everything
// you can see up there is far away and beneath you, so that is where the
// weather goes.
//
// Both fade to the wall colour on the dive, so the flight up out of the
// studio reads as breaking into daylight rather than a cut.

// The play camera only ever sees the band from just under the horizon down to
// about 45° below it, so MID→LOW is the gradient that actually ships: pale
// haze along the top of the frame, deepening as you look further down. TOP is
// only glimpsed on the dive.
// The dome gradient and the cloud tint now come off the record (records/sky.ts)
// and are lerped toward per frame, so picking a different record crossfades the
// weather rather than cutting it. Only the wall colour is fixed — the studio is
// the same room whichever record is on the turntable.
const SKY_WALL = new Color("#171019"); // matches Scene's WALL_BG

const CLOUD_LIT = new Color("#f4f9ff"); // right at the bloom threshold — they glow a hair
const CLOUD_SHADE = new Color("#b8d4ec"); // undersides — the cartoon two-tone
const CLOUD_HAZE = new Color("#a8d8f2"); // distant puffs sink toward the sky

// ------------------------------------------------------------------- dome --

const DOME_RADIUS = 700;

// A three-stop vertical gradient by direction from the world origin. The
// camera never travels far enough relative to the radius for origin-relative
// vs eye-relative to differ.
const domeVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const domeFrag = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uLow;
  uniform vec3 uWall;
  uniform float uDay;
  varying vec3 vDir;
  void main() {
    float h = normalize(vDir).y;
    vec3 sky = h > 0.0
      ? mix(uMid, uTop, smoothstep(0.0, 0.62, h))
      : mix(uMid, uLow, smoothstep(0.0, 0.8, -h));
    gl_FragColor = vec4(mix(uWall, sky, uDay), 1.0);
    // the same two chunks every built-in material ends on — without them the
    // dome would be the one surface in the scene skipping tone mapping
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function SkyDome() {
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      // seeded from the daylight sky and then lerped every frame; the values
      // are mutated in place, so these Colors must not be shared
      uTop: { value: new Color(DAYLIGHT.top) },
      uMid: { value: new Color(DAYLIGHT.mid) },
      uLow: { value: new Color(DAYLIGHT.low) },
      uWall: { value: SKY_WALL },
      uDay: { value: 0 },
    }),
    [],
  );
  const target = useMemo(() => new Color(), []);

  useFrame((_, delta) => {
    if (!mat.current) return;
    const u = mat.current.uniforms;
    u.uDay.value +=
      ((clockState.wall ? 0 : 1) - u.uDay.value) * (1 - Math.exp(-3.5 * delta));

    const sky = skyFor(activeRun.record);
    const k = 1 - Math.exp(-2.5 * delta);
    (u.uTop.value as Color).lerp(target.set(sky.top), k);
    (u.uMid.value as Color).lerp(target.set(sky.mid), k);
    (u.uLow.value as Color).lerp(target.set(sky.low), k);
  });

  return (
    // drawn first with depth writes off — the standard skybox slot, so every
    // bit of real geometry lands on top of it regardless of distance
    <mesh renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[DOME_RADIUS, 32, 20]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={domeVert}
        fragmentShader={domeFrag}
        side={BackSide}
        depthWrite={false}
        toneMapped
      />
    </mesh>
  );
}

// ----------------------------------------------------------------- clouds --

// Five CC0 Quaternius cloud shapes, merged and normalized to unit width by
// scripts/build-clouds.mjs, instanced one mesh per shape.
//
// Two populations. FIELD is the weather you fly over — scattered, close
// enough to have shape and parallax. BANK is a far ring of big flat clouds
// that draws a soft line across the top of the frame: the horizon is just
// off-screen, so this is what stands in for it.
const CLOUDS_URL = "/models/clouds.glb";
const SHAPE_IDS = [0, 1, 2, 3];
const SHAPES = SHAPE_IDS.length;
const FIELD_COUNT = 30;
const BANK_COUNT = 20;

// Clouds get placed by the angle they'll be SEEN at, not by a raw depth.
// Scattering them in a radius/height box put half the field behind the deck
// and the rest off the top of the screen; picking a depression angle first
// and solving for y guarantees every cloud lands in the strip of sky the
// camera actually frames. EYE is the play camera's height (CameraRig).
const EYE = 3.1;
const cloudY = (radius: number, degrees: number) =>
  EYE - radius * Math.tan((degrees * Math.PI) / 180);

// deterministic hash-noise — same trick as the dust motes, so the weather is
// the same every run and can be tuned by eye
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 78.233 + salt * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// The models are one flat white; the form comes from a vertical ramp baked
// into vertex colours — lit on top, shaded underneath. Stored as a RATIO of
// the lit colour, not the colour itself, because the three colour sources
// multiply: vertexColour × instanceColour (the haze) × materialColour (the
// wall fade). Bake the absolute colour here and hazing a cloud would darken
// it twice.
function shadeByHeight(geometry: BufferGeometry) {
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox as Box3;
  const span = Math.max(1e-6, box.max.y - box.min.y);
  const ratio = [
    CLOUD_SHADE.r / CLOUD_LIT.r,
    CLOUD_SHADE.g / CLOUD_LIT.g,
    CLOUD_SHADE.b / CLOUD_LIT.b,
  ];

  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const h = (pos.getY(i) - box.min.y) / span; // 0 underside … 1 top
    const t = (1 - h) ** 1.6 * 0.75; // weighted to the very bottom
    for (let c = 0; c < 3; c++) colors[i * 3 + c] = 1 + (ratio[c] - 1) * t;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
}

interface Shape {
  geometry: BufferGeometry;
  matrices: Matrix4[];
  colors: Color[];
}

function Clouds() {
  const group = useRef<Group>(null);
  const { scene } = useGLTF(CLOUDS_URL);
  const tint = useMemo(() => new Color(), []);

  const material = useMemo(
    () =>
      // DoubleSide because these are unlit shells: a cloud whose far face is
      // culled shows as a hole when you catch it at the wrong angle
      new MeshBasicMaterial({
        color: SKY_WALL.clone(),
        vertexColors: true,
        side: DoubleSide,
      }),
    [],
  );

  const meshes = useMemo(() => {
    scene.updateMatrixWorld(true);

    const shapes: Shape[] = [];
    for (const s of SHAPE_IDS) {
      const node = scene.getObjectByName(`cloud${s}`);
      if (!node) throw new Error(`clouds GLB has no node "cloud${s}"`);
      let source: Mesh | null = null;
      node.traverse((o) => {
        if (!source && (o as Mesh).isMesh) source = o as Mesh;
      });
      if (!source) throw new Error(`cloud${s} has no mesh`);
      // bake the build script's normalization into the geometry so an
      // instance matrix is purely placement
      const geometry = (source as Mesh).geometry.clone();
      geometry.applyMatrix4((source as Mesh).matrixWorld);
      shadeByHeight(geometry);
      shapes.push({ geometry, matrices: [], colors: [] });
    }

    const d = new Object3D();
    const cloud = (
      n: number,
      radius: number,
      width: number,
      degrees: number,
      flat: number,
      haze: number,
    ) => {
      const angle = rand(n, 1) * Math.PI * 2;
      // Face the broad side inward. Two of the five shapes are barely thicker
      // than a plank, so left free to rotate with the drifting group they
      // would eventually turn edge-on and vanish; a y of `angle` points each
      // cloud's thin axis along the line of sight from the centre.
      d.rotation.set(
        (rand(n, 8) - 0.5) * 0.24,
        angle + (rand(n, 9) < 0.5 ? 0 : Math.PI),
        (rand(n, 10) - 0.5) * 0.16,
      );
      d.position.set(
        Math.sin(angle) * radius,
        cloudY(radius, degrees),
        Math.cos(angle) * radius,
      );
      d.scale.set(width, width * flat, width);
      d.updateMatrix();

      const shape = shapes[n % SHAPES];
      shape.matrices.push(d.matrix.clone());
      shape.colors.push(CLOUD_LIT.clone().lerp(CLOUD_HAZE, haze));
    };

    for (let n = 0; n < FIELD_COUNT; n++) {
      // depth spread wide (the parallax), depression angle kept inside the
      // frame — 4° is a whisker under the horizon, 26° is where the deck
      // starts occluding
      const radius = 70 + rand(n, 2) * 230;
      cloud(
        n,
        radius,
        14 + radius * 0.2,
        4 + rand(n, 3) * 22,
        1,
        Math.min(1, Math.max(0, (radius - 90) / 180)) * 0.45,
      );
    }

    for (let n = 0; n < BANK_COUNT; n++) {
      const seed = 500 + n;
      const radius = 290 + rand(seed, 2) * 90;
      // squashed and hazed hard, pinned to a shallow 2–4°: at this distance
      // it wants to read as a line of weather along the top of the frame,
      // not as individual clouds
      cloud(
        seed,
        radius,
        96 + rand(seed, 4) * 48,
        2 + rand(seed, 3) * 2,
        0.5,
        0.58,
      );
    }

    return shapes.map((shape) => {
      const inst = new InstancedMesh(
        shape.geometry,
        material,
        shape.matrices.length,
      );
      shape.matrices.forEach((m, i) => inst.setMatrixAt(i, m));
      shape.colors.forEach((c, i) => inst.setColorAt(i, c));
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      // instance offsets are invisible to the bounding sphere, so leaving
      // culling on would pop whole shapes out of the sky
      inst.frustumCulled = false;
      return inst;
    });
  }, [scene, material]);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    // a drift slow enough to be felt rather than watched
    group.current.rotation.y -= delta * 0.006;
    group.current.position.y = Math.sin(clock.elapsedTime * 0.09) * 0.6;
    // material colour multiplies the instance colours, so daylight's white is
    // a no-op and dimming it to the room colour sinks the field into the dark
    // on the wall — the cloud shading lives in the instance colours, not here.
    // A record with a night sky tints the whole field through this one lerp.
    material.color.lerp(
      clockState.wall ? SKY_WALL : tint.set(skyFor(activeRun.record).cloud),
      1 - Math.exp(-3.5 * delta),
    );
  });

  return (
    <group ref={group}>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  );
}

useGLTF.preload(CLOUDS_URL);

export function SkyWorld() {
  return (
    <>
      <SkyDome />
      <Clouds />
    </>
  );
}
