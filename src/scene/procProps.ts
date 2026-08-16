import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from "three";

// World pieces built from primitives instead of kitbashed from a GLB.
//
// One left, and it earns it: the city's sign flickers, which is not something
// a downloaded mesh can do, and building it here means its lit parts can be
// bright enough for the bloom pass to catch and sized for a prop that renders
// about 60px tall, rather than inherited from whatever a source model happened
// to use.
//
// The harbour's lighthouse used to live here too. It was the only prop on that
// island with no source model behind it, and it looked it — a modern
// navigation light on a coast of wooden boats. Kenney's fort tower took its
// place and its middle tile, and the record lost nothing but a rotating beam.
//
// Same contract as a kitbashed prop: centred on x/z, standing on y=0, already
// at its miniature size. usePropClone falls through to this registry when the
// record's diorama GLB has no node of that name.

// ---------------------------------------------------------- neon sign ------

// The city's animated piece: a shop pylon whose tubes pulse and stutter.
// The node the Diorama reaches into to drive them.
export const TUBES_NODE = "neonsign_tubes";

const TUBE_COLORS = ["#ff4d9d", "#4de3ff", "#ffcf5a"]; // magenta, cyan, amber
const CORE = "#fffaff"; // the white-hot middle of a lit tube
const SIGN_FRAME = "#26222c";

const POLE_H = 0.2;
const BOARD_W = 0.086;
const BOARD_H = 0.132;
const BLADE_W = 0.104;

function neonsign(): Object3D {
  const root = new Group();
  root.name = "neonsign";

  const frame = new MeshStandardMaterial({ color: SIGN_FRAME, roughness: 0.7 });

  const foot = new Mesh(new CylinderGeometry(0.022, 0.026, 0.009, 10), frame);
  foot.position.y = 0.0045;
  root.add(foot);

  const pole = new Mesh(new CylinderGeometry(0.008, 0.009, POLE_H, 8), frame);
  pole.position.y = 0.009 + POLE_H / 2;
  root.add(pole);

  const boardY = 0.009 + POLE_H + BOARD_H / 2;

  // The dark backing board. Without it the tubes float, and in the split
  // second before the flicker brings them back up there'd be nothing there.
  const board = new Mesh(new BoxGeometry(BOARD_W, BOARD_H, 0.014), frame);
  board.position.y = boardY;
  root.add(board);

  // A blade sign at right angles to the board. The diorama turns once every
  // eight beats and has no front, so a single flat sign would vanish edge-on
  // twice a revolution — the cross puts something lit at every angle.
  const blade = new Mesh(new BoxGeometry(0.012, 0.036, BLADE_W), frame);
  blade.position.set(0, 0.009 + POLE_H - 0.03, 0);
  root.add(blade);

  // Everything that glows lives under one node, unlit and additive — same
  // reason as the lighthouse beam: over near-black vinyl ordinary
  // transparency drags these toward grey, and a grey neon tube is just a
  // plastic strip. Transparent because the flicker drives opacity; an
  // emissive standard material would need a light to modulate.
  //
  // Each tube is two meshes, a saturated bar with a near-white core inside
  // it. That's partly how real neon photographs, and partly arithmetic: the
  // bloom pass thresholds on luminance, which is mostly green, so a magenta
  // bar can't reach the threshold at any brightness. The white core is what
  // actually blooms, and it blooms through the colour around it.
  //
  // userData carries which bank a mesh belongs to and how hard it burns
  // relative to that bank, so the Diorama can drive them without knowing the
  // build order.
  const tubes = new Group();
  tubes.name = TUBES_NODE;
  root.add(tubes);

  const tube = (
    w: number,
    h: number,
    d: number,
    color: string,
    bank: number,
    pos: [number, number, number],
  ) => {
    for (const [inset, c, gain] of [
      [0, color, 1],
      [0.4, CORE, 0.85],
    ] as const) {
      const m = new Mesh(
        new BoxGeometry(
          w - (w - 0.003) * inset,
          h - (h - 0.004) * inset,
          d + inset * 0.002,
        ),
        new MeshBasicMaterial({
          // past 1.0 and off tone mapping, so the bloom pass sees it: the
          // threshold is on luma and a saturated hue never gets there on its
          // own (see neonDressing.ts)
          color: new Color(c).multiplyScalar(1.6),
          transparent: true,
          opacity: 1,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          toneMapped: false,
        }),
      );
      m.position.set(...pos);
      m.userData.bank = bank;
      m.userData.gain = gain;
      tubes.add(m);
    }
  };

  // three stacked bars, repeated on the back face so the sign reads from both
  // sides of the board
  for (let i = 0; i < 3; i++) {
    const y = boardY + (i - 1) * 0.042;
    tube(0.064, 0.018, 0.004, TUBE_COLORS[i], i, [0, y, 0.009]);
    tube(0.064, 0.018, 0.004, TUBE_COLORS[i], i, [0, y, -0.009]);
  }

  // and the blade's strip, running along its length on both faces
  const bladeY = blade.position.y;
  const bladeL = BLADE_W - 0.016;
  tube(0.004, 0.018, bladeL, TUBE_COLORS[0], 3, [0.009, bladeY, 0]);
  tube(0.004, 0.018, bladeL, TUBE_COLORS[0], 3, [-0.009, bladeY, 0]);

  return root;
}

export const PROC_PROPS: Record<string, () => Object3D> = {
  neonsign,
};
