import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rbox, rng, smooth, glow } from '../common.js';
import {
  MAT, slab, ring, ribbon, chip, boardMaterial, shell, arc, BEZEL, brushedMap, stampedTop, battLabel, ssdLabel, grilleAlpha, coverGlassMaps, screenTexture,
  keyboardLayout, legendTexture,
} from '../realism.js';

export const OVERVIEW = { p: [4.4, 3.0, 6.2], t: [0, 0.35, -0.35] };
export const IDLE_VIEW = { p: [6.0, 4.4, 8.4], t: [0, 0.3, -0.4] };

const LID_OPEN = -1.92; // ~110°
// Backlit legends: drawn white, tinted ice-blue, flagged to feed the glow pass.
function legendMat() {
  const m = new THREE.MeshBasicMaterial({ map: legendTexture(keyboardLayout(0.19)), transparent: true, depthWrite: false });
  m.color.setRGB(1.15, 1.05, 0.92);
  m.userData.bloom = true;
  return m;
}
// The visible screen area inside the cover glass (thin side bezels, slightly taller chin).
const SCREEN_W = BEZEL.w - 2 * BEZEL.side, SCREEN_H = BEZEL.d - BEZEL.top - BEZEL.bottom;
const SCREEN_Z = 1.1 - BEZEL.d / 2 + BEZEL.bottom + SCREEN_H / 2;

// ---------- logic board layout ----------
// One description drives both the printed board texture and the 3D parts on it, so everything lines up.
// World units; the board spans x −1.375…0.975, z −0.97…−0.15 (z grows towards the front of the laptop).
const CPU_AT = [-0.8, -0.56];
const RAM_AT = [[-0.47, -0.645], [-0.3, -0.645], [-0.47, -0.475], [-0.3, -0.475]];
const VRM_Z = [-0.86, -0.74, -0.62, -0.5];
const HOLES = [[-1.33, -0.925], [-1.33, -0.195], [0.93, -0.925], [0.93, -0.195], [-0.45, -0.925]];
const BOARD_PARTS = [
  { id: 'U1', kind: 'soc', x: CPU_AT[0], z: CPU_AT[1], w: 0.36, d: 0.36 },
  ...RAM_AT.map(([x, z], i) => ({ id: `U${i + 2}`, kind: 'ram', x, z, w: 0.15, d: 0.11 })),
  { id: 'U6', kind: 'ic', x: -1.17, z: -0.215, w: 0.12, d: 0.08, mark: ['PMIC', 'EP-P1'] },
  { id: 'U7', kind: 'ic', x: 0.1, z: -0.65, w: 0.1, d: 0.1, mark: ['EC', 'EP-E7'] },
  { id: 'U8', kind: 'ic', x: -0.95, z: -0.22, w: 0.08, d: 0.07, mark: ['AUDIO'] },
  ...VRM_Z.map((z, i) => ({ id: `L${i + 1}`, kind: 'choke', x: -1.24, z, w: 0.08, d: 0.08 })),
  ...VRM_Z.map((z, i) => ({ id: `Q${i + 1}`, kind: 'fet', x: -1.13, z, w: 0.05, d: 0.06 })),
  ...[-1.27, -1.17, -1.07].map((x, i) => ({ id: `C${i + 1}`, kind: 'pcap', x, z: -0.33, w: 0.05, d: 0.05 })),
  { id: 'J1', kind: 'conn', x: 0.88, z: -0.8, w: 0.09, d: 0.04 },
  { id: 'J2', kind: 'conn', x: 0.15, z: -0.92, w: 0.2, d: 0.045 },
  { id: 'J3', kind: 'conn', x: 0.84, z: -0.3, w: 0.12, d: 0.05 },
  { id: 'J4', kind: 'conn', x: -0.12, z: -0.92, w: 0.16, d: 0.04 },
  { id: 'J5', kind: 'm2', x: 0.55, z: -0.535, w: 0.24, d: 0.035 },
  { id: 'J6', kind: 'm2', x: -0.035, z: -0.3, w: 0.035, d: 0.24 },
];
const SUB_CAPS = Array.from({ length: 28 }, (_, i) => {
  const side = i % 4, t = (Math.floor(i / 4) / 6 - 0.5) * 0.26;
  const [x, z] = [[t, -0.15], [t, 0.15], [-0.15, t], [0.15, t]][side];
  return { x, z, vert: side > 1 };
});
const capRow = (n, x, z, dx, dz, vert) => Array.from({ length: n }, (_, i) => ({ kind: 'cap', x: x + i * dx, z: z + i * dz, w: vert ? 0.01 : 0.018, d: vert ? 0.018 : 0.01 }));
const BOARD_CAPS = [
  ...capRow(8, -0.53, -0.56, 0.04, 0, false), // between the RAM rows
  ...capRow(9, -1.055, -0.885, 0, 0.05, true), // VRM output
  ...capRow(5, -0.95, -0.775, 0.045, 0, false), // behind the SoC
  ...capRow(3, 0.18, -0.68, 0, 0.04, true), // EC
  ...capRow(4, 0.38, -0.83, 0, 0.06, true), // Wi-Fi supply
  ...capRow(2, -1.09, -0.24, 0, 0.04, true), // PMIC
];
const BOARD_LAYOUT = {
  x0: -1.375, x1: 0.975, z0: -0.97, z1: -0.15, mask: '#0f3326', seed: 2,
  parts: [...BOARD_PARTS, ...BOARD_CAPS],
  holes: HOLES.map(([x, z]) => [x, z, 0.013]),
  stitch: 0.035,
  pours: [[[-1.165, -0.895], [-1.03, -0.895], [-0.98, -0.845], [-0.98, -0.47], [-1.03, -0.42], [-1.165, -0.42]]],
  buses: [
    { pts: [[-0.62, -0.645], [-0.545, -0.645]], n: 10 }, { pts: [[-0.62, -0.475], [-0.545, -0.475]], n: 10 },
    { pts: [[-0.395, -0.645], [-0.375, -0.645]], n: 10 }, { pts: [[-0.395, -0.475], [-0.375, -0.475]], n: 10 },
    { pts: [[-0.7, -0.74], [-0.7, -0.79], [-0.66, -0.83], [0.06, -0.83], [0.12, -0.89]], n: 8 },
    { pts: [[-0.62, -0.395], [-0.16, -0.395], [-0.06, -0.495], [0.43, -0.495], [0.43, -0.52]], n: 4, pitch: 0.011 },
    { pts: [[-0.8, -0.38], [-0.8, -0.33], [-0.75, -0.28], [-0.055, -0.28]], n: 8 },
    { pts: [[-1.11, -0.23], [-1.03, -0.23], [-1.01, -0.25], [-1.01, -0.36], [-0.98, -0.39]], n: 3 },
    { pts: [[-0.12, -0.9], [-0.12, -0.87]], n: 6, pitch: 0.016 },
    { pts: [[0.84, -0.325], [0.84, -0.36]], n: 4, pitch: 0.02, w: 0.006 },
    { pts: [[0.88, -0.78], [0.88, -0.74]], n: 3, pitch: 0.018 },
    { pts: [[0.05, -0.65], [0.0, -0.65], [-0.04, -0.69], [-0.04, -0.75]], n: 4 },
  ],
  vias: [
    ...[-0.24, -0.208, -0.176, -0.144, -0.112, -0.08].map((x) => [x, -0.86]),
    ...[0.78, 0.81, 0.84, 0.87, 0.9].map((x) => [x, -0.37]),
    ...[0.86, 0.88, 0.9].map((x) => [x, -0.73]),
    ...[-0.07, -0.055, -0.04, -0.025].map((x) => [x, -0.76]),
  ],
  title: { lines: ['EP-01 LOGIC BOARD', 'REV A · 2026'], x: 0.66, z: -0.5 },
};

// One shared set of materials and textures for every laptop instance.
let MM;
function materials() {
  if (MM) return MM;
  MM = {
    alu: new THREE.MeshPhysicalMaterial({ color: 0x57544f, metalness: 0.7, roughness: 0.62, roughnessMap: brushedMap(), sheen: 0.4, sheenColor: 0x9a8f80, sheenRoughness: 0.8 }), aluDark: MAT.darkAluminium(), plastic: MAT.plastic(), rubber: MAT.rubber(),
    copper: MAT.copper(), nickel: MAT.nickel(), gold: MAT.gold(), epoxy: MAT.epoxy(), keycap: MAT.keycap(),
    silicon: MAT.silicon(), mlcc: MAT.mlcc(), flex: MAT.flex(),
    battWrap: new THREE.MeshStandardMaterial({ color: 0x1a1c21, metalness: 0.3, roughness: 0.45 }),
    battLabel: new THREE.MeshStandardMaterial({ map: battLabel(), metalness: 0.1, roughness: 0.5 }),
    board: boardMaterial(BOARD_LAYOUT),
    boardSide: new THREE.MeshStandardMaterial({ color: 0x173a2a, roughness: 0.6 }),
    substrate: boardMaterial({ x0: -0.18, x1: 0.18, z0: -0.18, z1: 0.18, mask: '#1d4a33', parts: SUB_CAPS.map((c) => ({ kind: 'cap', x: c.x, z: c.z, w: c.vert ? 0.009 : 0.016, d: c.vert ? 0.016 : 0.009 })), stitch: 0.02 }),
    ssdBoard: boardMaterial({ x0: -0.31, x1: 0.31, z0: -0.1, z1: 0.1, mask: '#15181d', copper: 'rgba(120,130,145,0.4)', stitch: 0.02, font: 0.011, buses: [{ pts: [[-0.11, -0.03], [-0.05, -0.03]], n: 6, pitch: 0.008 }, { pts: [[-0.11, 0.03], [-0.05, 0.03]], n: 6, pitch: 0.008 }, { pts: [[-0.28, 0], [-0.23, 0]], n: 8, pitch: 0.012 }], title: { lines: ['M.2 2280'], x: -0.27, z: 0.055 } }),
    wifiBoard: boardMaterial({ x0: -0.11, x1: 0.11, z0: -0.15, z1: 0.15, mask: '#173a5c', copper: 'rgba(100,160,215,0.45)', stitch: 0.016, font: 0.011, buses: [{ pts: [[0, 0.09], [0, 0.115]], n: 9, pitch: 0.02 }], title: { lines: ['M.2 2230'], x: -0.09, z: -0.145 } }),
    darkSide: new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.6 }),
    battFlex: boardMaterial({ x0: -1.45, x1: 1.45, z0: -0.035, z1: 0.035, mask: '#13402c', buses: [{ pts: [[-1.4, 0], [1.4, 0]], n: 4, pitch: 0.012, w: 0.005 }] }),
    beige: new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.55 }),
    choke: new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.7, metalness: 0.2 }),
    shield: new THREE.MeshStandardMaterial({ map: stampedTop(['802.11ax · BT 5.3', 'EP01-WLAN', 'FCC ID: EP01W']), metalness: 1, roughness: 0.32 }),
    sticker: new THREE.MeshStandardMaterial({ map: ssdLabel(), roughness: 0.6 }),
    trackpad: new THREE.MeshPhysicalMaterial({ color: 0x4a4744, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
    logo: new THREE.MeshPhysicalMaterial({ color: 0xe8ebef, metalness: 1, roughness: 0.06 }),
    aluWall: new THREE.MeshPhysicalMaterial({ color: 0x5c5954, metalness: 0.8, roughness: 0.42, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    keyGlow: new THREE.MeshStandardMaterial({ color: 0x0a0908, emissive: 0xffd6a3, emissiveIntensity: 0.1, roughness: 0.6 }),
    emblem: new THREE.MeshPhysicalMaterial({ color: 0xdcc8a6, metalness: 1, roughness: 0.14 }),
    padGlow: new THREE.MeshStandardMaterial({ color: 0x0c0b0a, emissive: 0xffe2bd, emissiveIntensity: 0.06, roughness: 0.5 }),
    hinge: new THREE.MeshStandardMaterial({ color: 0x1b1c1f, metalness: 0.7, roughness: 0.45 }),
  };
  return MM;
}

// A curved blower-fan blade (plan view), standing upright.
function bladeGeometry() {
  const s = new THREE.Shape(), N = 10, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, r = 0.09 + t * 0.145, a = t * 0.55;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  for (let i = N; i >= 0; i--) { const [x, y] = pts[i]; const a = Math.atan2(y, x) + Math.PI / 2; s.lineTo(x + 0.005 * Math.cos(a), y + 0.005 * Math.sin(a)); }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** A detailed laptop: every part is a separate group so it can be exploded. */
export function buildLaptopModel() {
  const T = materials();
  const g = new THREE.Group();
  const root = new THREE.Group();
  g.add(root);
  const P = {};
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const place = (parent, obj, x = 0, y = 0, z = 0) => { obj.position.set(x, y, z); parent.add(obj); return obj; };
  const r = rng(7);
  const m4 = new THREE.Matrix4();

  // ---- bottom plate: thin flat aluminium, four round feet ----
  // Slim proportions: the closed laptop is ~0.145 thick on a 3.2-wide body (≈ 4.5 %, like a 14" pro notebook).
  P.bottom = new THREE.Group();
  root.add(P.bottom);
  add(P.bottom, slab(3.16, 2.16, 0.012, 0.08, 0.003), T.alu, 0, 0.002, 0);
  for (const [x, z] of [[-1.38, -0.88], [1.38, -0.88], [-1.38, 0.88], [1.38, 0.88]]) {
    add(P.bottom, new THREE.CylinderGeometry(0.06, 0.065, 0.01, 32), T.rubber, x, -0.003, z);
  }
  for (const [x, z] of [[-1.5, -1.0], [0, -1.04], [1.5, -1.0], [-1.5, 1.0], [-0.5, 1.04], [0.5, 1.04], [1.5, 1.0]]) {
    add(P.bottom, new THREE.CylinderGeometry(0.012, 0.012, 0.002, 12), T.nickel, x, 0.001, z);
  }
  for (const [x, z] of HOLES) add(P.bottom, new THREE.CylinderGeometry(0.02, 0.02, 0.006, 14), T.nickel, x, 0.017, z);

  // ---- battery: three pouch cells with printed wraps ----
  P.battery = new THREE.Group();
  root.add(P.battery);
  for (let i = 0; i < 3; i++) {
    const x = -1.0 + i * 1.0;
    add(P.battery, slab(0.94, 0.8, 0.04, 0.035, 0.01), [T.battLabel, T.battWrap], x, 0.016, 0.48);
    add(P.battery, new THREE.BoxGeometry(0.08, 0.003, 0.08), T.nickel, x - 0.25, 0.058, 0.06);
    add(P.battery, new THREE.BoxGeometry(0.08, 0.003, 0.08), T.nickel, x + 0.25, 0.058, 0.06);
  }
  add(P.battery, slab(2.9, 0.07, 0.003, 0.02, 0.001), [T.battFlex, T.boardSide], 0, 0.057, 0.04);
  add(P.battery, rbox(0.14, 0.014, 0.06, 0.005), T.beige, 0.9, 0.066, 0.0);

  // ---- logic board: every part placed from BOARD_LAYOUT ----
  P.board = new THREE.Group();
  root.add(P.board);
  const BY = 0.034; // top of the board
  add(P.board, slab(2.35, 0.82, 0.014, 0.04, 0.003), [T.board, T.boardSide], -0.2, 0.02, -0.56);
  for (const [x, z] of HOLES) add(P.board, new THREE.CylinderGeometry(0.02, 0.02, 0.006, 20), T.nickel, x, BY + 0.003, z);

  P.cpu = new THREE.Group();
  P.cpu.position.set(CPU_AT[0], BY, CPU_AT[1]);
  P.board.add(P.cpu);
  add(P.cpu, slab(0.36, 0.36, 0.01, 0.012, 0.002), [T.substrate, T.boardSide]);
  add(P.cpu, slab(0.22, 0.17, 0.006, 0.004, 0.001), T.silicon, 0, 0.01, 0);
  const cpuCaps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 0.006, 0.009), T.mlcc, SUB_CAPS.length);
  SUB_CAPS.forEach((c, i) => { m4.makeRotationY(c.vert ? Math.PI / 2 : 0).setPosition(c.x, 0.013, c.z); cpuCaps.setMatrixAt(i, m4); });
  P.cpu.add(cpuCaps);

  for (const p of BOARD_PARTS) {
    if (p.kind === 'ram') place(P.board, chip(p.w, 0.012, p.d, ['LPDDR5X', '8 GB · 2326'], { size: 0.16 }), p.x, BY, p.z);
    else if (p.kind === 'ic') place(P.board, chip(p.w, 0.01, p.d, p.mark, { size: 0.2 }), p.x, BY, p.z);
    else if (p.kind === 'choke') place(P.board, chip(p.w, 0.03, p.d, ['R47'], { bg: '#2a2c31', fg: 'rgba(200,200,205,0.6)', dot: false, size: 0.3, sideMat: T.choke, r: 0.01, bevel: 0.004 }), p.x, BY, p.z);
    else if (p.kind === 'fet') place(P.board, chip(p.w, 0.008, p.d, [''], { dot: false }), p.x, BY, p.z);
    else if (p.kind === 'pcap') add(P.board, new THREE.CylinderGeometry(0.025, 0.025, 0.034, 24), T.nickel, p.x, BY + 0.017, p.z);
    else if (p.kind === 'conn') add(P.board, rbox(p.w, 0.018, p.d, 0.004), T.beige, p.x, BY + 0.009, p.z);
    else if (p.kind === 'm2') add(P.board, rbox(p.w, 0.022, p.d, 0.004), T.black, p.x, BY + 0.011, p.z);
  }
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.009, 1), T.mlcc, BOARD_CAPS.length);
  BOARD_CAPS.forEach((c, i) => { m4.makeScale(c.w * 0.82, 1, c.d * 0.82).setPosition(c.x, BY + 0.0045, c.z); caps.setMatrixAt(i, m4); });
  P.board.add(caps);

  // display flex: a thin ribbon from J2 up towards the hinge
  const flexCurve = new THREE.CatmullRomCurve3([[0.15, BY + 0.019, -0.9], [0.15, BY + 0.021, -0.955], [0.15, BY + 0.012, -0.985], [0.15, BY - 0.02, -0.995]].map((p) => new THREE.Vector3(...p)));
  add(P.board, ribbon(flexCurve, 0.15, 20), T.flex);

  P.wifi = new THREE.Group();
  P.wifi.position.set(0.55, BY + 0.006, -0.7);
  P.board.add(P.wifi);
  add(P.wifi, slab(0.22, 0.3, 0.008, 0.012, 0.001), [T.wifiBoard, T.darkSide]);
  add(P.wifi, slab(0.17, 0.2, 0.016, 0.006, 0.002), [T.shield, T.nickel], 0, 0.008, -0.01);
  for (let i = 0; i < 9; i++) add(P.wifi, new THREE.BoxGeometry(0.012, 0.002, 0.03), T.gold, -0.08 + i * 0.02, 0.009, 0.13);
  for (const x of [-0.05, 0.05]) {
    add(P.wifi, new THREE.CylinderGeometry(0.012, 0.012, 0.008, 16), T.gold, x, 0.012, -0.125);
    const cable = new THREE.CatmullRomCurve3([[x, 0.016, -0.125], [x, 0.019, -0.19], [x * 1.6, 0.02, -0.27], [x * 2.2, 0.02, -0.33]].map((p) => new THREE.Vector3(...p)));
    add(P.wifi, new THREE.TubeGeometry(cable, 30, 0.005, 6), T.black);
  }

  P.ssd = new THREE.Group();
  P.ssd.position.set(0.3, BY + 0.006, -0.3);
  P.board.add(P.ssd);
  add(P.ssd, slab(0.62, 0.2, 0.008, 0.01, 0.001), [T.ssdBoard, T.darkSide]);
  place(P.ssd, chip(0.12, 0.01, 0.12, ['NVMe CTRL', 'EP-C21'], { size: 0.14 }), -0.17, 0.008, 0);
  place(P.ssd, chip(0.16, 0.012, 0.14, ['3D NAND', '512 GB'], { size: 0.14 }), 0.03, 0.008, 0);
  place(P.ssd, chip(0.16, 0.012, 0.14, ['3D NAND', '512 GB'], { size: 0.14 }), 0.21, 0.008, 0);
  add(P.ssd, new THREE.PlaneGeometry(0.36, 0.13), T.sticker, 0.12, 0.0212, 0).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 12; i++) add(P.ssd, new THREE.BoxGeometry(0.03, 0.002, 0.011), T.gold, -0.295, 0.009, -0.08 + i * 0.0145);

  // ---- cooling: cold plate, heat pipe, fin stack, blower fan ----
  P.cooler = new THREE.Group();
  root.add(P.cooler);
  add(P.cooler, slab(0.42, 0.42, 0.01, 0.02, 0.002), T.copper, CPU_AT[0], 0.051, CPU_AT[1]);
  const pipeCurve = new THREE.CatmullRomCurve3([[CPU_AT[0], 0, CPU_AT[1]], [-0.5, 0, -0.86], [0.2, 0, -0.97], [1.45, 0, -0.97]].map((p) => new THREE.Vector3(...p)));
  const pipeGeo = new THREE.TubeGeometry(pipeCurve, 80, 0.024, 14);
  pipeGeo.scale(1, 0.42, 1);
  pipeGeo.translate(0, 0.068, 0);
  add(P.cooler, pipeGeo, T.copper);
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.044, 0.15), T.copper, 34);
  for (let i = 0; i < 34; i++) { m4.makeTranslation(0.88 + i * 0.016, 0.062, -0.97); fins.setMatrixAt(i, m4); }
  P.cooler.add(fins);
  P.fan = new THREE.Group();
  P.fan.position.set(1.18, 0.036, -0.5);
  P.cooler.add(P.fan);
  add(P.fan, slab(0.7, 0.62, 0.004, 0.12, 0.001), T.plastic);
  add(P.fan, ring(0.7, 0.62, 0.044, 0.12, 0.012), T.plastic);
  add(P.fan, slab(0.7, 0.62, 0.004, 0.12, 0.001, [[0.5, 0.5, 0.25, 0, 0]]), T.plastic, 0, 0.044, 0);
  P.rotor = new THREE.Group();
  P.rotor.position.y = 0.006;
  P.fan.add(P.rotor);
  add(P.rotor, new THREE.CylinderGeometry(0.085, 0.085, 0.034, 32), T.plastic, 0, 0.017, 0);
  add(P.rotor, new THREE.CylinderGeometry(0.06, 0.06, 0.002, 32), new THREE.MeshPhysicalMaterial({ color: 0x0c0d10, roughness: 0.2, clearcoat: 1 }), 0, 0.035, 0);
  const blade = bladeGeometry();
  add(P.rotor, mergeGeometries(Array.from({ length: 33 }, (_, i) => blade.clone().rotateY((i / 33) * Math.PI * 2))), T.plastic);

  // ---- keyboard deck ----
  P.deck = new THREE.Group();
  root.add(P.deck);
  const KZ = -0.42;
  // unibody walls: rounded bottom edge, straight sides, softly rounded top edge
  const wallProfile = [
    ...arc(-0.022, 0.036, 0.022, -Math.PI / 2, 0, 10),
    ...arc(-0.005, 0.105, 0.005, 0, Math.PI / 2, 5),
    [-0.028, 0.11], [-0.028, 0.02], [-0.022, 0.014],
  ];
  add(P.deck, shell(3.2, 2.2, 0.1, wallProfile), T.aluWall);
  add(P.deck, slab(3.15, 2.15, 0.011, 0.075, 0.002, [[2.92, 1.1, 0.03, 0, KZ], [1.42, 0.86, 0.04, 0, 0.6]]), T.alu, 0, 0.0988, 0);
  add(P.deck, slab(2.94, 1.12, 0.004, 0.03, 0.001), T.keyGlow, 0, 0.09, KZ);
  // ports on the side walls (left: MagSafe-style, 2× USB-C, audio; right: HDMI, USB-C, SD)
  const port = (geo, x, z) => add(P.deck, geo, T.black, x, 0.06, z);
  port(rbox(0.006, 0.02, 0.11, 0.0099, 3), -1.6, -0.75);
  port(rbox(0.006, 0.022, 0.08, 0.0109, 3), -1.6, -0.55);
  port(rbox(0.006, 0.022, 0.08, 0.0109, 3), -1.6, -0.42);
  port(new THREE.CylinderGeometry(0.011, 0.011, 0.006, 20).rotateZ(Math.PI / 2), -1.6, 0.55);
  port(rbox(0.006, 0.028, 0.13, 0.004, 2), 1.6, -0.6);
  port(rbox(0.006, 0.022, 0.08, 0.0109, 3), 1.6, -0.42);
  port(rbox(0.006, 0.01, 0.15, 0.0049, 2), 1.6, 0.3);
  const layout = keyboardLayout(0.19);
  // one instanced mesh per keycap size (≈10 draw calls instead of 80)
  const bySize = new Map();
  for (const k of layout.keys) {
    const id = `${k.w.toFixed(3)}x${k.d.toFixed(3)}`;
    if (!bySize.has(id)) bySize.set(id, []);
    bySize.get(id).push(k);
  }
  for (const list of bySize.values()) {
    const im = new THREE.InstancedMesh(rbox(list[0].w, 0.016, list[0].d, 0.0079, 3), T.keycap, list.length);
    list.forEach((k, i) => { m4.makeTranslation(k.x, 0.1, KZ + k.z); im.setMatrixAt(i, m4); });
    P.deck.add(im);
  }
  const legends = add(P.deck, new THREE.PlaneGeometry(layout.width, layout.depth), legendMat(), 0, 0.1082, KZ);
  legends.rotation.x = -Math.PI / 2;
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.8, alphaMap: grilleAlpha(5, 70), transparent: true, depthWrite: false });
  for (const x of [-1.535, 1.535]) add(P.deck, new THREE.PlaneGeometry(0.07, 1.0), grilleMat, x, 0.1101, KZ).rotation.x = -Math.PI / 2;
  add(P.deck, slab(1.416, 0.856, 0.004, 0.04, 0.001), T.padGlow, 0, 0.1022, 0.6);
  add(P.deck, slab(1.4, 0.84, 0.006, 0.035, 0.002), T.trackpad, 0, 0.1035, 0.6);
  add(P.deck, rbox(0.5, 0.004, 0.006, 0.0019, 2), glow(0xffe6c4, 0.7), 0, 0.064, 1.101);
  add(P.deck, new THREE.CylinderGeometry(0.022, 0.022, 2.5, 32), T.hinge, 0, 0.1, -1.085).rotation.z = Math.PI / 2;

  // ---- lid (pivot at the hinge); layers from the inside out ----
  P.lid = new THREE.Group();
  P.lid.position.set(0, 0.111, -1.1);
  root.add(P.lid);
  const layer = (name) => { const l = new THREE.Group(); P.lid.add(l); P[name] = l; return l; };

  const glassMaps = coverGlassMaps();
  const glass = layer('glass');
  add(glass, new THREE.PlaneGeometry(3.18, 2.18), new THREE.MeshPhysicalMaterial({
    map: glassMaps.map, alphaMap: glassMaps.alpha, transparent: true, roughness: 0.12, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.1, envMapIntensity: 0.25, side: THREE.DoubleSide,
  }), 0, 0.0015, 1.1).rotation.x = Math.PI / 2;

  const lcd = layer('lcd');
  add(lcd, slab(3.12, 2.04, 0.004, 0.02, 0.001), T.black, 0, 0.0028, SCREEN_Z);
  P.lcdMat = new THREE.MeshBasicMaterial({ map: screenTexture(), color: 0x000000, side: THREE.DoubleSide });
  add(lcd, new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), P.lcdMat, 0, 0.0027, SCREEN_Z).rotation.x = Math.PI / 2;

  const back = layer('backlight');
  P.blMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, emissive: 0xcfe4ff, emissiveIntensity: 0, roughness: 0.9 });
  add(back, slab(3.1, 2.02, 0.004, 0.02, 0.001), P.blMat, 0, 0.0072, SCREEN_Z);
  add(back, new THREE.BoxGeometry(2.9, 0.003, 0.012), glow(0xcfe6ff, 0.9), 0, 0.0095, 0.12);

  const cover = layer('cover');
  add(cover, slab(3.2, 2.2, 0.024, 0.1, 0.009), T.alu, 0, 0.0115, 1.1);
  // the logogram: a thin ring with an offset arc
  add(cover, new THREE.RingGeometry(0.1, 0.106, 128), T.emblem, 0, 0.0358, 1.1).rotation.set(-Math.PI / 2, 0, 0);
  add(cover, new THREE.RingGeometry(0.118, 0.13, 128, 1, 0.6, 2.4), T.emblem, 0, 0.0358, 1.1).rotation.set(-Math.PI / 2, 0, 0);
  P.antennas = new THREE.Group();
  cover.add(P.antennas);
  P.antMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.3, emissive: 0x4cc9ff, emissiveIntensity: 0 });
  for (const x of [-0.95, 0.95]) {
    add(P.antennas, slab(0.34, 0.06, 0.004, 0.01, 0.001), T.plastic, x, 0.0075, 2.08);
    add(P.antennas, new THREE.BoxGeometry(0.28, 0.002, 0.03), P.antMat, x, 0.0072, 2.08);
    const run = new THREE.CatmullRomCurve3([[x, 0.009, 2.05], [x * 1.33, 0.009, 1.95], [x * 1.4, 0.009, 1.0], [x * 1.25, 0.009, 0.12]].map((p) => new THREE.Vector3(...p)));
    add(P.antennas, new THREE.TubeGeometry(run, 40, 0.005, 6), T.black);
  }

  // shadow catcher
  P.shadow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ opacity: 0.35 }));
  P.shadow.rotation.x = -Math.PI / 2;
  P.shadow.receiveShadow = true;
  g.add(P.shadow);
  P.platform = new THREE.Group();
  g.add(P.platform);
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const x = c.getContext('2d'), gr = x.createRadialGradient(256, 256, 0, 256, 256, 256);
    gr.addColorStop(0, 'rgba(255,232,205,0.13)'); gr.addColorStop(0.5, 'rgba(200,190,175,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  add(P.platform, new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false }), 0, 0.001, 0).rotation.x = -Math.PI / 2;
  P.halo = add(P.platform, new THREE.RingGeometry(2.7, 2.708, 256), new THREE.MeshBasicMaterial({ color: 0xffe9cf, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.002, 0);
  P.halo.rotation.x = -Math.PI / 2;
  const noRecv = new Set([P.lcdMat, P.blMat]);
  g.traverse((o) => {
    if (!o.isMesh || o === P.shadow) return;
    const mats = [].concat(o.material);
    if (mats.some((m) => m.transparent)) return;
    o.castShadow = true;
    o.receiveShadow = !mats.some((m) => noRecv.has(m));
  });

  // ---- explode rig ----
  const state = { open: 0, explode: 0, spin: 0, glow: 0 };
  const rig = [
    [P.bottom, 0, -1.1, 0, 0],
    [P.battery, 0, -0.55, 0.2, 0.08],
    [P.board, 0, -0.08, 0, 0.12],
    [P.cooler, 0, 0.42, 0, 0.3],
    [P.ssd, 0, 0.2, 0.05, 0.38],
    [P.wifi, 0, 0.24, -0.05, 0.4],
    [P.deck, 0, 0.95, 0.15, 0.04],
    [P.lid, 0, 0.75, -1.0, 0.1],
    [P.glass, 0, -1.15, 0, 0.3],
    [P.lcd, 0, -0.78, 0, 0.28],
    [P.backlight, 0, -0.4, 0, 0.26],
    [P.cover, 0, 0.18, 0, 0.24],
  ].map(([o, dx, dy, dz, d]) => ({ o, d, off: new THREE.Vector3(dx, dy, dz), base: o.position.clone() }));

  function update(now = 0) {
    for (const rg of rig) {
      const e = smooth((state.explode - rg.d) / (1 - rg.d));
      rg.o.position.copy(rg.base).addScaledVector(rg.off, e);
    }
    P.lid.rotation.x = LID_OPEN * state.open;
    root.rotation.y = state.spin;
    P.rotor.rotation.y = -now * 9;
    P.platform.position.y = P.shadow.position.y;
    const on = smooth((state.open - 0.45) / 0.55);
    P.lcdMat.color.setScalar(0.04 + 0.96 * on);
    P.blMat.emissiveIntensity = 0.14 * on * smooth(state.explode * 3);
    P.antMat.emissiveIntensity = state.glow * 2.5;
    P.shadow.position.y = -0.012 - 1.15 * smooth(state.explode);
  }

  function explodedWorldPos(obj) {
    const saved = { ...state };
    Object.assign(state, { explode: 1, open: 1, spin: 0 });
    update();
    g.updateMatrixWorld(true);
    const v = obj.getWorldPosition(new THREE.Vector3());
    Object.assign(state, saved);
    update();
    return v;
  }

  update();
  return { group: g, parts: P, state, update, explodedWorldPos };
}

export function createLaptop(ctx) {
  const model = buildLaptopModel();
  ctx.register('laptop', model.group);
  return model;
}

export function flyIn(ctx, tl, part, { off, text, sub, dx = 110, dy = -80 }) {
  const p = ctx.laptop.explodedWorldPos(part);
  ctx.show(tl, 'laptop', 0);
  ctx.camSet(tl, OVERVIEW, 0);
  ctx.fade(tl, 0, 0.05, 0.7);
  ctx.camTo(tl, { p: [p.x + off[0], p.y + off[1], p.z + off[2]], t: [p.x, p.y, p.z] }, 0.7, 3.1, 'power2.inOut');
  const L = ctx.label({ obj: part, text, sub, dx, dy, hot: true });
  ctx.showLabel(tl, L, 2.0, 1.9);
  ctx.fade(tl, 1, 3.6, 0.5);
  ctx.hide(tl, 'laptop', 4.15);
  return 4.2;
}

export function introChapter(ctx) {
  const { gsap } = ctx;
  const L = ctx.laptop, s = L.state, P = L.parts;
  const tl = gsap.timeline();

  ctx.show(tl, 'laptop', 0);
  ctx.camSet(tl, { p: [3.4, 2.6, 5.2], t: [0, 0.75, 0] }, 0);
  ctx.title(tl, 0, 'A SCROLLABLE 3D EXPLAINER', 'Inside the Machine', 3.2, 'Scroll to take a laptop apart, then go as deep as you like into each part.', true);
  ctx.camTo(tl, { p: [2.0, 1.7, 4.8], t: [0, 0.35, 0] }, 0.4, 5.2, 'sine.inOut');
  tl.to(s, { open: 1, duration: 3, ease: 'power2.inOut' }, 3.0);
  ctx.camTo(tl, { p: [0.0, 1.9, 5.8], t: [0, 0.75, -0.4] }, 5.6, 3, 'power2.inOut');
  tl.to(s, { explode: 1, duration: 4.5, ease: 'power2.inOut' }, 9);
  ctx.camTo(tl, OVERVIEW, 8.6, 5, 'power2.inOut');

  const lab = (obj, at, text, sub, col) => ctx.label({ obj, at, text, sub, col, dy: 0 });
  const first = [
    [lab(P.bottom, [-1.2, 0.014, 1.0], 'Bottom plate', 'flat aluminium cover', 'left'), 14.0],
    [lab(P.battery, [-1.0, 0.056, 0.48], 'Battery', '3 lithium-ion cells', 'left'), 14.9],
    [lab(P.board, [-0.6, 0.035, -0.2], 'Motherboard', 'connects everything', 'left'), 15.8],
    [lab(P.deck, [-1.3, 0.11, -0.5], 'Top case', 'unibody shell + keyboard', 'left'), 16.7],
    [lab(P.cpu, [0, 0.016, 0], 'CPU', 'the processor', 'left'), 17.6],
    [lab(P.wifi, [0, 0.03, 0], 'Wi-Fi card', 'radio + modem', 'right'), 18.2],
    [lab(P.fan, [0, 0.03, 0], 'Fan', 'cooling', 'right'), 18.8],
    [lab(P.ssd, [0.25, 0.02, 0], 'SSD', 'storage', 'right'), 19.3],
  ];
  for (const [l, at] of first) ctx.showLabel(tl, l, at, 20.6 - at);
  const second = [
    [lab(P.glass, [1.4, 0.0015, 1.5], 'Cover glass', 'protects', 'right'), 21.0],
    [lab(P.lcd, [1.4, 0.003, 1.0], 'LCD panel', 'liquid crystals + colour filters', 'right'), 21.8],
    [lab(P.backlight, [1.4, 0.0092, 0.5], 'Backlight', 'white LED light source', 'right'), 22.6],
    [lab(P.antennas, [0.95, 0.009, 2.08], 'Wi-Fi antennas', 'hidden in the lid', 'right'), 23.4],
  ];
  for (const [l, at] of second) ctx.showLabel(tl, l, at, 26.4 - at);
  tl.to(s, { glow: 1, duration: 0.6 }, 23.4).to(s, { glow: 0, duration: 0.6 }, 26.2);

  tl.to(s, { spin: Math.PI * 2, duration: 10, ease: 'sine.inOut' }, 26.6);
  ctx.camTo(tl, { p: [5.2, 3.6, 7.2], t: [0, 0.3, -0.3] }, 26.6, 5, 'sine.inOut');
  ctx.camTo(tl, OVERVIEW, 31.6, 5, 'sine.inOut');
  ctx.fade(tl, 1, 36.9, 0.6);
  ctx.hide(tl, 'laptop', 37.55);
  ctx.pad(tl, 37.6);

  const steps = [
    [3.0, 5.6, 'The lid opens',
      'Every time you open your laptop, a lot happens before you even see the screen.',
      'A magnet in the lid moves past a Hall-effect sensor in the base. That wakes the system: firmware runs, and the CPU starts executing billions of instructions per second.'],
    [8.6, 5.2, 'Take it apart',
      'Inside, a laptop is a sandwich of layers, each with its own job.',
      'Roughly six layers in a stack about 15 mm thick. In this exploded view each layer moves out along the direction it was assembled in.'],
    [14.0, 6.6, 'The base',
      'At the bottom, a flat plate. Above it, the battery and the motherboard. On top, the unibody top case with the keyboard.',
      'Bottom plate → battery cells (≈ 50–100 Wh) → logic board with CPU, RAM, SSD and Wi-Fi → unibody top case, machined from one block of aluminium, which also spreads heat.'],
    [20.8, 5.6, 'The display',
      'The screen is a stack too: protective glass, a liquid-crystal layer that forms the image, and a backlight behind it.',
      'Cover glass → LCD (liquid crystals + colour filters) → backlight and diffusers. OLED screens skip the backlight: each pixel makes its own light.'],
    [26.6, 10.2, 'Choose a part',
      'Keep scrolling to fly into the Wi-Fi chip, the CPU and the battery. Or pick one from the tabs at the top.',
      'Each part goes from the big picture down to what is physically happening: fields, electrons, atoms and ions.'],
  ];
  const outline = [['Open', 0], ['Explode', 8.6], ['Parts', 14], ['Display', 20.8], ['Spin', 26.6]];
  return { title: 'Overview', tl, steps, outline };
}

export function outroChapter(ctx) {
  const { gsap } = ctx;
  const s = ctx.laptop.state;
  const tl = gsap.timeline();
  ctx.show(tl, 'laptop', 0);
  ctx.camSet(tl, OVERVIEW, 0);
  ctx.fade(tl, 0, 0.05, 0.9);
  tl.to(s, { explode: 0, duration: 4, ease: 'power2.inOut' }, 1.2);
  ctx.camTo(tl, { p: [2.6, 2.0, 5.0], t: [0, 0.3, 0] }, 1.0, 4.5, 'power2.inOut');
  tl.to(s, { open: 0, duration: 2.6, ease: 'power2.inOut' }, 5.4);
  ctx.camTo(tl, { p: [3.8, 2.6, 5.4], t: [0, 0.0, 0] }, 5.4, 5, 'sine.inOut');
  ctx.title(tl, 7.4, 'COMING NEXT', 'Episode 2', 0,
    '<span>Screen</span> · <span>RAM vs SSD</span> · <span>Cooling</span><br>and finally: <span>the quantum computer</span>');
  ctx.pad(tl, 14);
  const steps = [
    [0.8, 5.4, 'One thin machine',
      'Radio waves into bits. Switches into logic. Ions into power. All folded into one thin machine.',
      'Radio → QAM symbols → bits. Transistors + clock → computation. Lithium ions → stored chemical energy. All in about 1.5 kg.'],
    [6.6, 7.4, 'Coming next',
      'Next: the screen, RAM versus SSD, and cooling. And at the end, the strangest machine of all: a quantum computer.',
      'Pixels and liquid crystals, why RAM is ~1000× faster than an SSD, how heat moves. Then qubits: superposition and entanglement on the Bloch sphere.'],
  ];
  return { title: 'Up Next', tl, steps, outline: [['Reassemble', 0], ['Next', 6.6]] };
}

// Portfolio-card loop: assemble → open → explode → spin → reassemble → close.
export function idleLoop(ctx) {
  const s = ctx.laptop.state;
  ctx.gsap.timeline({ repeat: -1 })
    .to(s, { open: 1, duration: 2.4, ease: 'power2.inOut' }, 0.6)
    .to(s, { explode: 1, duration: 3, ease: 'power2.inOut' }, 3.4)
    .to(s, { spin: Math.PI * 2, duration: 9, ease: 'sine.inOut' }, 6.6)
    .to(s, { explode: 0, duration: 2.6, ease: 'power2.inOut' }, 15.8)
    .to(s, { open: 0, duration: 2.2, ease: 'power2.inOut' }, 18.6)
    .to({}, { duration: 1 }, 20.8);
}

