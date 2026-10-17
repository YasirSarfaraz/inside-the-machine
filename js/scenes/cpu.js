import * as THREE from 'three';
import { M, rbox, glow, makeFloor, canvasTexture, rng, clamp01, frac, smooth, lerp, textSprite, staticLine, makeLine, setLine, panelMesh } from '../common.js';
import { MAT, slab, pcbMaterial, dieMesh } from '../realism.js';
import { flyIn } from './laptop.js';

const hash = (i, k) => frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);
const WARM = new THREE.Color(0xff7a4c).multiplyScalar(1.6);
const COOL = new THREE.Color(0x8fd0c8).multiplyScalar(1.6);
const DIM = new THREE.Color(0x3a4658);

export function cpuChapter(ctx) {
  const { gsap } = ctx;
  const s = { lid: 0, clock: 0, clockOn: 0, gate: 0, add: 0, combo: 0, finOn: 0, wrap: 0, free: 0, hole: 0, field: 0 };
  const tl = gsap.timeline();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const r = rng(11);
  const m4 = new THREE.Matrix4();
  const tmpC = new THREE.Color();

  // =============== 1. the package and the die ===============
  const pkg = ctx.register('cpuPkg', new THREE.Group());
  pkg.add(makeFloor(30, 0, 60));
  const substrate = add(pkg, slab(2.4, 2.4, 0.1, 0.05, 0.01), [pcbMaterial({ mask: '#1d4a33', w: 2.4, d: 2.4, title: ['EP-01 SoC', 'BGA PACKAGE'] }), new THREE.MeshStandardMaterial({ color: 0x173a2a, roughness: 0.6 })], 0, 0, 0);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.03, 0.035), new THREE.MeshStandardMaterial({ color: 0x8a6a3c, metalness: 0.4, roughness: 0.5 }), 48);
  for (let i = 0; i < 48; i++) {
    const side = i % 4, t = Math.floor(i / 4) / 11 - 0.5;
    const [x, z] = [[t * 1.9, -1.06], [t * 1.9, 1.06], [-1.06, t * 1.9], [1.06, t * 1.9]][side];
    m4.makeRotationY(side > 1 ? Math.PI / 2 : 0).setPosition(x, 0.115, z);
    caps.setMatrixAt(i, m4);
  }
  pkg.add(caps);
  const die = new THREE.Group();
  die.position.y = 0.1;
  pkg.add(die);
  // floorplan (die units: x −0.65…0.65, z −0.475…0.475)
  const DW = 1.3, DD = 0.95;
  const FLOOR = [
    ...[-0.24, 0.24].flatMap((z) => [-0.5, -0.27, -0.04, 0.19].map((x) => ({ x, z, w: 0.2, d: 0.36, kind: 'core', color: 0x6f9bff }))),
    { x: -0.155, z: 0, w: 0.89, d: 0.08, kind: 'cache', color: 0xc9a8ff },
    { x: 0.47, z: 0, w: 0.28, d: 0.84, kind: 'gpu', color: 0x6fffd0 },
  ];
  const toUV = (f) => ({ x0: (f.x - f.w / 2 + DW / 2) / DW, x1: (f.x + f.w / 2 + DW / 2) / DW, y0: (f.z - f.d / 2 + DD / 2) / DD, y1: (f.z + f.d / 2 + DD / 2) / DD, kind: f.kind });
  const dieBody = dieMesh(DW, 0.035, DD, FLOOR.map(toUV), { W: 1300, H: 950, seed: 4 });
  dieBody.position.y = 0.0175;
  die.add(dieBody);
  const blocks = [];
  const block = (f) => {
    const mat = new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const b = add(die, new THREE.PlaneGeometry(f.w, f.d), mat, f.x, 0.0357, f.z);
    b.rotation.x = -Math.PI / 2;
    blocks.push({ mat, dist: Math.hypot(f.x, f.z) });
    return b;
  };
  const fl = FLOOR.map(block);
  const cores = fl.slice(0, 8), cache = fl[8], gpu = fl[9];
  const ihs = new THREE.Group();
  ihs.position.y = 0.1;
  pkg.add(ihs);
  add(ihs, slab(1.8, 1.8, 0.16, 0.12, 0.03), MAT.nickel(), 0, 0, 0);
  const engr = canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = 'rgba(40,46,56,0.55)';
    c.font = '700 54px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText('EP·01 CPU', w / 2, h / 2 - 10);
    c.font = '500 30px "JetBrains Mono", monospace';
    c.fillText('8-CORE · 4.0 GHz', w / 2, h / 2 + 44);
  });
  add(ihs, new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: engr, transparent: true, depthWrite: false }), 0, 0.1605, 0).rotation.x = -Math.PI / 2;
  const Lsub = ctx.label({ obj: substrate, at: [-1.1, 0.05, 0.9], text: 'Substrate', sub: 'fans out thousands of connections', dx: -70, dy: 60 });
  const Lihs = ctx.label({ obj: ihs, at: [0.8, 0.16, -0.5], text: 'Heat spreader', sub: 'metal lid that moves heat away', dx: 90, dy: -70 });
  const Ldie = ctx.label({ obj: die, at: [0.6, 0.04, 0.4], text: 'Die', sub: 'the actual silicon chip', dx: 100, dy: 60, hot: true });
  const Lcore = ctx.label({ obj: cores[0], at: [0, 0.005, 0], text: 'CPU core', sub: '×8: each runs a program', dx: -110, dy: -60 });
  const Lcache = ctx.label({ obj: cache, at: [-0.35, 0.005, 0], text: 'Cache', sub: 'fast on-chip memory', dx: -130, dy: 50 });
  const Lgpu = ctx.label({ obj: gpu, at: [0, 0.005, -0.25], text: 'Graphics (GPU)', sub: 'draws the screen', dx: 90, dy: -60 });
  const Lclock = ctx.label({ obj: die, at: [0, 0.05, 0], text: 'Clock: 4 GHz', sub: '4 billion ticks per second', dx: 40, dy: 120, hot: true });

  // =============== 2. inside one core: the pipeline ===============
  const core = ctx.register('cpuCore', new THREE.Group());
  core.add(makeFloor(40, -0.2, 80));
  add(core, rbox(13, 0.16, 7.4, 0.06), new THREE.MeshStandardMaterial({ color: 0x141a26, metalness: 0.5, roughness: 0.35 }), 0, -0.1, 0);
  const XS = [-4.8, -2.4, 0, 2.4, 4.8];
  const STAGES = [
    ['Fetch', 'read the next instruction', 0x3d63b8], ['Decode', 'work out what it means', 0x6b55c8],
    ['Execute', 'ALU does the maths', 0xd9902f], ['Memory', 'load / store data', 0x2fa087], ['Write-back', 'save result in a register', 0x3a8fc0],
  ];
  const stageMats = [];
  const stageL = STAGES.map(([name, sub, color], i) => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4 });
    stageMats.push(mat);
    const b = add(core, rbox(1.95, 0.5, 1.7, 0.08), mat, XS[i], 0.25, 0);
    return ctx.label({ obj: b, at: [0, -0.25, 0.85], text: `${i + 1} · ${name}`, sub, dx: 0, dy: 46 + (i % 2) * 44, center: true });
  });
  for (let i = 0; i < 4; i++) core.add(staticLine([[XS[i] + 1.0, 0.25, 0], [XS[i + 1] - 1.0, 0.25, 0]], { width: 3, color: 0x6b655c }));
  const SIDE = [
    ['L1 instruction cache', 'the program lives here', -4.8, -2.6, 2.2, 0x29405e],
    ['Register file', '16+ tiny, ultra-fast slots', 0, -2.6, 2.6, 0x4a3a66],
    ['L1 data cache', 'recently used data', 2.4, -2.6, 2.2, 0x234f48],
    ['Branch predictor', 'guesses the next jump', -2.4, 2.6, 2.2, 0x3a3a52],
  ];
  const sideL = SIDE.map(([name, sub, x, z, w, color]) => {
    const b = add(core, rbox(w, 0.35, 1.3, 0.06), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 }), x, 0.18, z);
    return ctx.label({ obj: b, at: [0, 0.18, z < 0 ? -0.5 : 0.5], text: name, sub, dx: 0, dy: z < 0 ? -50 : 50, center: true });
  });
  core.add(staticLine([[-4.8, 0.3, -1.95], [-4.8, 0.3, -0.85]], { width: 2.5, color: 0x8fd0c8 }));
  core.add(staticLine([[0, 0.3, -1.95], [0, 0.3, -0.85]], { width: 2.5, color: 0xc070ff }));
  core.add(staticLine([[2.4, 0.3, -1.95], [2.4, 0.3, -0.85]], { width: 2.5, color: 0x46d0a0 }));
  const PROGRAM = ['LOAD r1, [a]', 'LOAD r2, [b]', 'ADD r3, r1, r2', 'CMP r3, 100', 'STORE [c], r3', 'JMP loop'];
  const tokColors = [0x8fd0c8, 0x8fd0c8, 0xe6c08f, 0xc070ff, 0x46d0a0, 0xff7a9c];
  const tokens = PROGRAM.map((txt, j) => {
    const g = new THREE.Group();
    core.add(g);
    add(g, rbox(1.75, 0.22, 0.7, 0.06), new THREE.MeshStandardMaterial({ color: 0x0d1420, emissive: tokColors[j], emissiveIntensity: 0.25, roughness: 0.4 }));
    const sp = textSprite(txt, { size: 0.2, mono: true, color: '#ffffff', weight: 600 });
    sp.position.set(0, 0.3, 0);
    g.add(sp);
    return g;
  });
  const aluSprite = textSprite('5 + 3 = 8', { size: 0.34, mono: true, color: '#e6c08f', weight: 700 });
  aluSprite.position.set(0, 1.55, 0);
  core.add(aluSprite);
  const Ltok = ctx.label({ obj: tokens[2], at: [0, 0.15, 0], text: 'An instruction', sub: 'one tiny step of a program', dx: 60, dy: -110, hot: true });
  const TICK = 1.15;

  // =============== 3. the adder (inside the ALU) ===============
  const adder = ctx.register('cpuAdd', new THREE.Group());
  adder.add(makeFloor(40, -2.6, 80));
  const A = [1, 0, 1, 0], Bb = [1, 1, 0, 0]; // bit 0 first: A = 0101 (5), B = 0011 (3)
  const SUM = [], CARRY = [0];
  for (let i = 0; i < 4; i++) { const t = A[i] + Bb[i] + CARRY[i]; SUM.push(t & 1); CARRY.push(t >> 1); }
  const FX = (i) => 3.9 - i * 2.6;
  const bitSprite = (v, size = 0.5) => textSprite(String(v), { size, mono: true, weight: 700, color: v ? '#7fe0ff' : '#5b6b82' });
  const fas = [];
  for (let i = 0; i < 4; i++) {
    const x = FX(i);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d2636, emissive: 0xe6c08f, emissiveIntensity: 0, roughness: 0.4, metalness: 0.3 });
    const b = add(adder, rbox(1.7, 1.0, 1.0, 0.1), mat, x, 0, 0);
    const name = textSprite(`FA${i}`, { size: 0.3, mono: true, color: '#cfc8bd' });
    name.position.set(x, 0, 0.55);
    adder.add(name);
    const a = bitSprite(A[i]); a.position.set(x - 0.4, 1.7, 0); adder.add(a);
    const bb = bitSprite(Bb[i]); bb.position.set(x + 0.4, 1.7, 0); adder.add(bb);
    adder.add(staticLine([[x - 0.4, 1.4, 0], [x - 0.4, 0.5, 0]], { width: 2, color: A[i] ? 0x8fd0c8 : 0x3a4658 }));
    adder.add(staticLine([[x + 0.4, 1.4, 0], [x + 0.4, 0.5, 0]], { width: 2, color: Bb[i] ? 0x8fd0c8 : 0x3a4658 }));
    const sumWire = staticLine([[x, -0.5, 0], [x, -1.3, 0]], { width: 2.5, color: SUM[i] ? 0x8fd0c8 : 0x3a4658 });
    adder.add(sumWire);
    const sm = bitSprite(SUM[i], 0.6); sm.position.set(x, -1.75, 0); adder.add(sm);
    const cw = staticLine([[x - 0.85, 0, 0], [x - 1.75, 0, 0]], { width: 2.5, color: CARRY[i + 1] ? 0xe6c08f : 0x3a4658 });
    adder.add(cw);
    const cs = textSprite(String(CARRY[i + 1]), { size: 0.36, mono: true, weight: 700, color: CARRY[i + 1] ? '#e6c08f' : '#5b6b82' });
    cs.position.set(x - 1.3, 0.35, 0);
    adder.add(cs);
    fas.push({ mat, b, sm, sumWire, cw, cs, x });
  }
  const c0 = textSprite('0', { size: 0.36, mono: true, weight: 700, color: '#5b6b82' }); c0.position.set(5.2, 0.35, 0); adder.add(c0);
  adder.add(staticLine([[5.6, 0, 0], [4.75, 0, 0]], { width: 2.5, color: 0x3a4658 }));
  const carryDot = add(adder, new THREE.SphereGeometry(0.1, 16, 10), glow(0xe6c08f, 2.6));
  const hdrA = textSprite('A = 0101  (5)', { size: 0.3, mono: true, color: '#8e887f' }); hdrA.position.set(-5.6, 1.95, 0); adder.add(hdrA);
  const hdrB = textSprite('B = 0011  (3)', { size: 0.3, mono: true, color: '#8e887f' }); hdrB.position.set(-5.6, 1.5, 0); adder.add(hdrB);
  const LFA = ctx.label({ obj: fas[0].b, at: [0.4, 0.5, 0.5], text: 'Full adder', sub: 'adds 2 bits + a carry', dx: 60, dy: -100, hot: true });
  const Lcar = ctx.label({ obj: anchor(adder, FX(0) - 1.3, 0.1, 0), text: 'Carry', sub: '1 + 1 = 10 in binary', dx: 30, dy: 90 });
  const Lsum = ctx.label({ obj: anchor(adder, -0.6, -1.75, 0), text: 'Sum = 1000', sub: '= 8', dx: -200, dy: 0 });

  // =============== 4. a NAND gate built from 4 transistors ===============
  const gate = ctx.register('cpuGate', new THREE.Group());
  gate.add(makeFloor(40, -3.8, 80));
  add(gate, new THREE.BoxGeometry(6.2, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a1f1a, emissive: 0xff7a4c, emissiveIntensity: 0.5 }), 0, 3.0, 0);
  add(gate, new THREE.BoxGeometry(6.2, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x15202e, emissive: 0x8fb4d6, emissiveIntensity: 0.3 }), 0, -3.2, 0);
  const tVdd = textSprite('+1 V  (VDD)', { size: 0.28, mono: true, color: '#ff9a7a' }); tVdd.position.set(-4.2, 3.0, 0); gate.add(tVdd);
  const tGnd = textSprite('0 V  (ground)', { size: 0.28, mono: true, color: '#7ab4ff' }); tGnd.position.set(-4.2, -3.2, 0); gate.add(tGnd);
  const fet = (x, y, type) => {
    const mat = new THREE.MeshStandardMaterial({ color: type === 'P' ? 0x5a2f48 : 0x24385e, emissive: 0x46ff9a, emissiveIntensity: 0, roughness: 0.4 });
    const m = add(gate, rbox(0.9, 1.0, 0.5, 0.08), mat, x, y, 0);
    add(gate, new THREE.BoxGeometry(0.08, 0.8, 0.55), M.silver, x - 0.5, y, 0);
    const t = textSprite(type === 'P' ? 'P' : 'N', { size: 0.34, weight: 800, color: type === 'P' ? '#ff9ac0' : '#9ac4ff' });
    t.position.set(x, y, 0.3);
    gate.add(t);
    return { m, mat };
  };
  const PA = fet(-1.3, 1.9, 'P'), PB = fet(1.3, 1.9, 'P'), NA = fet(0, -0.4, 'N'), NB = fet(0, -1.9, 'N');
  const wires = {};
  const wire = (name, pts, width = 3) => { const l = staticLine(pts, { width, color: 0xffffff }); gate.add(l); wires[name] = l; };
  wire('vA', [[-1.3, 2.95, 0], [-1.3, 2.4, 0]]);
  wire('vB', [[1.3, 2.95, 0], [1.3, 2.4, 0]]);
  wire('pA', [[-1.3, 1.4, 0], [-1.3, 0.9, 0]]);
  wire('pB', [[1.3, 1.4, 0], [1.3, 0.9, 0]]);
  wire('node', [[-1.3, 0.9, 0], [1.3, 0.9, 0], [3.7, 0.9, 0]]);
  wire('nTop', [[0, 0.9, 0], [0, 0.1, 0]]);
  wire('nMid', [[0, -0.9, 0], [0, -1.4, 0]]);
  wire('nBot', [[0, -2.4, 0], [0, -3.1, 0]]);
  wire('inA', [[-4.5, 0.4, 0], [-2.2, 0.4, 0], [-2.2, 1.9, 0], [-1.8, 1.9, 0], [-2.2, 1.9, 0], [-2.2, -0.4, 0], [-0.5, -0.4, 0]], 2);
  wire('inB', [[-4.5, -1.2, 0], [-1.0, -1.2, 0], [-1.0, -1.9, 0], [-0.5, -1.9, 0], [-1.0, -1.9, 0], [-1.0, -1.2, 0], [-3.4, -1.2, 0], [-3.4, -1.2, -0.7], [-3.4, 2.5, -0.7], [0.6, 2.5, -0.7], [0.6, 1.9, -0.7], [0.8, 1.9, 0]], 2);
  const inAS = [bitSprite(0, 0.55), bitSprite(1, 0.55)], inBS = [bitSprite(0, 0.55), bitSprite(1, 0.55)], outS = [bitSprite(0, 0.6), bitSprite(1, 0.6)];
  inAS.forEach((sp) => { sp.position.set(-5.0, 0.4, 0); gate.add(sp); });
  inBS.forEach((sp) => { sp.position.set(-5.0, -1.2, 0); gate.add(sp); });
  outS.forEach((sp) => { sp.position.set(4.6, 0.9, 0); gate.add(sp); });
  const tA = textSprite('A', { size: 0.3, color: '#8e887f' }); tA.position.set(-5.5, 0.4, 0); gate.add(tA);
  const tB = textSprite('B', { size: 0.3, color: '#8e887f' }); tB.position.set(-5.5, -1.2, 0); gate.add(tB);
  const led = add(gate, new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshBasicMaterial({ color: 0x333333 }), 4.1, 0.9, 0);
  const Lpmos = ctx.label({ obj: PA.m, at: [0, 0.5, 0.25], text: 'PMOS transistor', sub: 'ON when its input is 0', dx: -90, dy: -60 });
  const Lnmos = ctx.label({ obj: NB.m, at: [0.45, 0, 0.25], text: 'NMOS transistor', sub: 'ON when its input is 1', dx: 110, dy: 40 });
  const Lout = ctx.label({ obj: led, text: 'Output', sub: '0 only when A AND B are 1', dx: 40, dy: -80, hot: true });

  // =============== 5. transistor carpet ===============
  const carpet = ctx.register('cpuCarpet', new THREE.Group());
  add(carpet, new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.6, metalness: 0.3 }), 0, 0, 0).rotation.x = -Math.PI / 2;
  const NX = 56, SPC = 0.24;
  const tr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.06, 0.26), new THREE.MeshBasicMaterial({ color: 0xffffff }), NX * NX);
  for (let i = 0; i < NX * NX; i++) {
    m4.makeTranslation(((i % NX) - NX / 2 + 0.5) * SPC, 0.03, (Math.floor(i / NX) - NX / 2 + 0.5) * SPC);
    tr.setMatrixAt(i, m4);
    tr.setColorAt(i, new THREE.Color(0, 0, 0));
  }
  carpet.add(tr);
  const wiresX = new THREE.InstancedMesh(new THREE.BoxGeometry(NX * SPC, 0.02, 0.035), M.copper, 19);
  for (let i = 0; i < 19; i++) { m4.makeTranslation(0, 0.1, (i * 3 - 27) * SPC + SPC / 2); wiresX.setMatrixAt(i, m4); }
  const wiresZ = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.02, NX * SPC), M.copper, 14);
  for (let i = 0; i < 14; i++) { m4.makeTranslation((i * 4 - 26) * SPC, 0.14, 0); wiresZ.setMatrixAt(i, m4); }
  carpet.add(wiresX, wiresZ);
  const cOn = new THREE.Color(0.3, 1.3, 2.0), cOff = new THREE.Color(0.02, 0.035, 0.07);

  // =============== 6. one transistor (planar MOSFET, see-through) ===============
  const fetG = ctx.register('cpuFet', new THREE.Group());
  fetG.add(makeFloor(30, -1.42, 60));
  const subMat = new THREE.MeshStandardMaterial({ color: 0x9a6b95, roughness: 0.75, metalness: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
  const nMat = new THREE.MeshStandardMaterial({ color: 0x3d7be0, roughness: 0.6, metalness: 0.05, transparent: true, opacity: 0.6, depthWrite: false });
  const body = add(fetG, new THREE.BoxGeometry(5.2, 1.4, 2.4), subMat, 0, -0.7, 0);
  const source = add(fetG, new THREE.BoxGeometry(1.3, 0.52, 2.42), nMat, -1.95, -0.25, 0);
  const drain = add(fetG, new THREE.BoxGeometry(1.3, 0.52, 2.42), nMat, 1.95, -0.25, 0);
  add(fetG, new THREE.BoxGeometry(2.0, 0.06, 2.4), new THREE.MeshStandardMaterial({ color: 0xe8f0ff, roughness: 0.2, transparent: true, opacity: 0.55 }), 0, 0.03, 0);
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x8d939e, metalness: 0.8, roughness: 0.3, emissive: 0xff6a3d, emissiveIntensity: 0 });
  const gateBox = add(fetG, new THREE.BoxGeometry(1.8, 0.45, 2.4), gateMat, 0, 0.285, 0);
  const chanMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fd0c8).multiplyScalar(1.4), transparent: true, opacity: 0, depthWrite: false });
  const channel = add(fetG, new THREE.BoxGeometry(1.5, 0.05, 2.3), chanMat, 0, -0.035, 0);
  for (const x of [-1.95, 1.95]) add(fetG, new THREE.CylinderGeometry(0.13, 0.13, 0.9, 20), M.silver, x, 0.45, 0);
  add(fetG, new THREE.CylinderGeometry(0.13, 0.13, 0.5, 20), M.silver, 0, 0.75, 0);
  const NE = 80;
  const elec = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 12, 8), glow(0xb5e3dc, 2.6), NE);
  elec.renderOrder = 5;
  const E = Array.from({ length: NE }, () => ({ z: (r() - 0.5) * 2.0, deep: -0.12 - r() * 0.32, ph: r() }));
  fetG.add(elec);
  let flow = 0;
  const Lsrc = ctx.label({ obj: source, at: [0, 0.26, 1.21], text: 'Source', sub: 'n-type: full of free electrons', dx: -80, dy: 80 });
  const Ldrn = ctx.label({ obj: drain, at: [0, 0.26, 1.21], text: 'Drain', sub: 'n-type', dx: 80, dy: 80 });
  const Lgate = ctx.label({ obj: gateBox, at: [0.5, 0.22, 0.6], text: 'Gate', sub: '', dx: 90, dy: -80, hot: true });
  const Lchan = ctx.label({ obj: channel, at: [0.3, 0, 1.15], text: 'Channel opens', sub: 'a thin layer of electrons', dx: 40, dy: 120 });
  const Lsil = ctx.label({ obj: body, at: [1.5, -0.3, 1.2], text: 'p-type silicon', sub: 'blocks electrons by default', dx: 90, dy: 60 });
  const Lox = ctx.label({ obj: gateBox, at: [-0.9, -0.25, 1.2], text: 'Gate oxide', sub: 'insulator, ~1 nm thick', dx: -120, dy: -50 });

  // =============== 7. FinFET: what modern transistors look like ===============
  const fin = ctx.register('cpuFin', new THREE.Group());
  fin.add(makeFloor(40, -0.85, 80));
  add(fin, new THREE.BoxGeometry(8, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0x5d4a68, roughness: 0.7 }), 0, -0.4, 0);
  add(fin, new THREE.BoxGeometry(8, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0xdfe8f5, roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0.225, 0);
  const finMat = new THREE.MeshStandardMaterial({ color: 0xb47ab0, roughness: 0.6, transparent: true, opacity: 0.8 });
  const FZ = [-1.1, 0, 1.1];
  const fins = FZ.map((z) => add(fin, new THREE.BoxGeometry(7.2, 1.3, 0.3), finMat, 0, 0.45, z));
  const finGateMat = new THREE.MeshStandardMaterial({ color: 0x8d939e, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.42, emissive: 0xff6a3d, emissiveIntensity: 0, depthWrite: false });
  const finGate = add(fin, new THREE.BoxGeometry(1.1, 1.75, 4.2), finGateMat, 0, 0.88, 0);
  const epiMat = new THREE.MeshStandardMaterial({ color: 0x3d7be0, roughness: 0.5, transparent: true, opacity: 0.4, depthWrite: false });
  const finSrc = add(fin, rbox(1.6, 1.15, 3.9, 0.15), epiMat, -2.9, 0.85, 0);
  add(fin, rbox(1.6, 1.15, 3.9, 0.15), epiMat, 2.9, 0.85, 0);
  for (const x of [-2.9, 2.9]) add(fin, new THREE.CylinderGeometry(0.16, 0.16, 1.0, 20), M.silver, x, 1.9, 0);
  add(fin, new THREE.CylinderGeometry(0.16, 0.16, 0.8, 20), M.silver, 0, 2.15, 0);
  const wrapLine = staticLine([[0.58, 0.4, -1.36], [0.58, 1.2, -1.36], [0.58, 1.2, -0.84], [0.58, 0.4, -0.84]], { width: 7, color: 0xe6c08f });
  fin.add(wrapLine);
  const NFE = 90;
  const fElec = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), glow(0xb5e3dc, 2.6), NFE);
  fElec.renderOrder = 5;
  const FE = Array.from({ length: NFE }, (_, i) => ({ fz: FZ[i % 3], dz: (r() - 0.5) * 0.18, y: 0.3 + r() * 0.75, ph: r() }));
  fin.add(fElec);
  let fflow = 0;
  const Lfin = ctx.label({ obj: fins[2], at: [-1.6, 0.65, 0.15], text: 'Fin', sub: 'silicon, ~5–7 nm wide', dx: -60, dy: -90 });
  const LfinG = ctx.label({ obj: finGate, at: [0.3, 0.88, 1.6], text: 'Gate', sub: 'wraps over the fins', dx: 90, dy: -70, hot: true });
  const Lwrap = ctx.label({ obj: anchor(fin, 0.6, 1.18, -1.1), text: '3-sided grip', sub: 'top + both sides of the fin', dx: 70, dy: -80 });
  const LfinS = ctx.label({ obj: finSrc, at: [-0.4, 0.2, 1.95], text: 'Source', sub: 'n-type silicon grown on the fins', dx: -110, dy: 60 });

  // =============== 8. down to the atoms ===============
  const atom = ctx.register('cpuAtom', new THREE.Group());
  const NXA = 11, NYA = 7;
  const SiMat = new THREE.MeshStandardMaterial({ color: 0x8f9bb0, roughness: 0.35, metalness: 0.3 });
  const atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 24, 16), SiMat, NXA * NYA);
  const P_AT = [3, 3], B_AT = [7, 2];
  let ai = 0;
  for (let i = 0; i < NXA; i++) for (let j = 0; j < NYA; j++) {
    m4.makeTranslation(i - 5, j - 3, 0);
    const isP = i === P_AT[0] && j === P_AT[1], isB = i === B_AT[0] && j === B_AT[1];
    atoms.setMatrixAt(ai, m4);
    atoms.setColorAt(ai, new THREE.Color(isP ? 0xff9a3c : isB ? 0xff6aa8 : 0xffffff));
    ai++;
  }
  atom.add(atoms);
  const bonds = new THREE.Group();
  const bondMat = new THREE.MeshStandardMaterial({ color: 0x4b5a70, roughness: 0.6 });
  const bondGeoH = new THREE.CylinderGeometry(0.04, 0.04, 1, 8).rotateZ(Math.PI / 2);
  const bondGeoV = new THREE.CylinderGeometry(0.04, 0.04, 1, 8);
  const pairs = [];
  for (let i = 0; i < NXA; i++) for (let j = 0; j < NYA; j++) {
    if (i < NXA - 1) { add(bonds, bondGeoH, bondMat, i - 4.5, j - 3, 0); pairs.push([i - 4.5, j - 3, 0]); }
    if (j < NYA - 1) { add(bonds, bondGeoV, bondMat, i - 5, j - 2.5, 0); pairs.push([i - 5, j - 2.5, 1]); }
  }
  atom.add(bonds);
  // two shared electrons on every bond (covalent pair); the boron's missing one is the "hole"
  const bx = B_AT[0] - 5, by = B_AT[1] - 3;
  const holeBonds = pairs.map((p, k) => [p, k]).filter(([p]) => Math.hypot(p[0] - bx, p[1] - by) < 0.6).map(([, k]) => k);
  const pairE = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 10, 8), glow(0x6fb8ff, 1.6), pairs.length * 2);
  atom.add(pairE);
  const holeRing = add(atom, new THREE.RingGeometry(0.07, 0.11, 24), glow(0xff6aa8, 2.4));
  const freeE = add(atom, new THREE.SphereGeometry(0.1, 16, 12), glow(0xb5e3dc, 3));
  const gatePlate = add(atom, new THREE.BoxGeometry(11, 0.25, 1.2), new THREE.MeshStandardMaterial({ color: 0x8d939e, metalness: 0.7, roughness: 0.3, transparent: true, opacity: 0.85, emissive: 0xff6a3d, emissiveIntensity: 0 }), 0, 4.3, 0);
  const oxide = add(atom, new THREE.BoxGeometry(11, 0.35, 1.0), new THREE.MeshStandardMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.3, depthWrite: false }), 0, 3.85, 0);
  const NCH = 14;
  const chE = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 14, 10), glow(0xb5e3dc, 3), NCH);
  atom.add(chE);
  const chPh = Array.from({ length: NCH }, () => r());
  const plusS = [];
  for (let i = 0; i < 7; i++) { const p = textSprite('+', { size: 0.4, weight: 800, color: '#ffb07a' }); p.position.set(-4.5 + i * 1.5, 4.75, 0.4); atom.add(p); plusS.push(p); }
  const Lsi = ctx.label({ obj: anchor(atom, -4, 2, 0), text: 'Silicon atom', sub: '4 outer electrons, 4 bonds', dx: -60, dy: -70 });
  const Lbond = ctx.label({ obj: anchor(atom, -3.5, 1, 0), text: 'Covalent bond', sub: 'a shared pair of electrons', dx: -90, dy: 60 });
  const Lp = ctx.label({ obj: anchor(atom, P_AT[0] - 5, P_AT[1] - 3, 0.2), text: 'Phosphorus atom', sub: '5 outer electrons → 1 spare', dx: -110, dy: 80, hot: true });
  const Lfree = ctx.label({ obj: freeE, text: 'Free electron', sub: 'can wander and carry current', dx: 70, dy: -60, hot: true });
  const Lb = ctx.label({ obj: anchor(atom, bx, by, 0.2), text: 'Boron atom', sub: '3 outer electrons → a “hole”', dx: 100, dy: 70 });
  const Lg = ctx.label({ obj: gatePlate, at: [3.5, 0.12, 0], text: 'Gate (+)', sub: 'pulls electrons to the surface', dx: 60, dy: -50 });
  const Lsc = ctx.label({ obj: anchor(atom, 0, 1.5, 0), text: '0.235 nm', sub: 'Si–Si bond length', dx: 0, dy: -36, center: true });

  // =============== timeline ===============
  const T0 = flyIn(ctx, tl, ctx.laptop.parts.cpu, { off: [0.45, 0.6, 0.75], text: 'CPU', sub: 'central processing unit', dx: -60, dy: -110 });
  ctx.show(tl, 'cpuPkg', T0);
  ctx.camSet(tl, { p: [3.6, 2.8, 4.4], t: [0, 0.1, 0] }, T0);
  ctx.fade(tl, 0, T0 + 0.05, 0.6);
  ctx.title(tl, 4.4, 'PART 2 · COMPUTATION', 'How a CPU Works', 2.6);
  ctx.camTo(tl, { p: [2.7, 2.1, 3.5], t: [0, 0.15, 0] }, 4.4, 4, 'sine.inOut');
  ctx.showLabel(tl, Lsub, 5.6, 3.6);
  ctx.showLabel(tl, Lihs, 6.2, 3.0);
  tl.to(s, { lid: 1, duration: 2.4, ease: 'power2.inOut' }, 9.0);
  ctx.showLabel(tl, Ldie, 10.6, 3.0);
  ctx.camTo(tl, { p: [0.15, 1.6, 1.2], t: [0, 0.12, 0] }, 12.6, 3, 'power2.inOut');
  ctx.showLabel(tl, Lcore, 14.8, 7.0);
  ctx.showLabel(tl, Lcache, 15.4, 6.4);
  ctx.showLabel(tl, Lgpu, 16.0, 5.8);
  tl.to(s, { clockOn: 1, duration: 0.8 }, 17.8);
  ctx.showLabel(tl, Lclock, 18.4, 3.4);

  ctx.cut(tl, 22.5, 'cpuPkg', 'cpuCore', { p: [-1.5, 7.5, 9.5], t: [0, 0, 0] });
  stageL.forEach((L, i) => ctx.showLabel(tl, L, 23.2 + i * 0.6, 16.4 - i * 0.6));
  sideL.forEach((L, i) => ctx.showLabel(tl, L, 27.4 + i * 0.6, 4.6));
  ctx.camTo(tl, { p: [0.5, 5.4, 8.4], t: [0, 0, 0.3] }, 26.6, 4, 'sine.inOut');
  ctx.showLabel(tl, Ltok, 32.6, 3.4);
  ctx.camTo(tl, { p: [1.0, 3.4, 6.0], t: [0, 0.5, 0] }, 34.2, 4, 'sine.inOut');

  ctx.cut(tl, 40.5, 'cpuCore', 'cpuAdd', { p: [0.4, 0.6, 12.8], t: [0.4, 0.1, 0] });
  ctx.showLabel(tl, LFA, 41.6, 5.2);
  tl.to(s, { add: 4, duration: 9.4, ease: 'none' }, 45.6);
  ctx.showLabel(tl, Lcar, 47.2, 4.0);
  ctx.camTo(tl, { p: [0, 1.0, 11.2], t: [-0.2, 0.1, 0] }, 47.0, 6, 'sine.inOut');
  ctx.showLabel(tl, Lsum, 55.2, 3.0);

  ctx.cut(tl, 58.5, 'cpuAdd', 'cpuGate', { p: [1.2, 0.9, 14.2], t: [0.4, 0.55, 0] });
  ctx.showLabel(tl, Lpmos, 59.6, 6.0);
  ctx.showLabel(tl, Lnmos, 60.4, 5.2);
  [[64.8, 1], [68.2, 2], [71.6, 3]].forEach(([at, v]) => tl.to(s, { combo: v, duration: 0.01 }, at));
  ctx.showLabel(tl, Lout, 62.0, 15.6);
  ctx.camTo(tl, { p: [4.5, 1.6, 12.8], t: [0.2, 0.5, 0] }, 66.0, 8, 'sine.inOut');

  ctx.cut(tl, 78.5, 'cpuGate', 'cpuCarpet', { p: [0, 7.6, 6.2], t: [0, 0, 0] });
  ctx.camTo(tl, { p: [0.7, 1.0, 1.7], t: [0, 0, 0] }, 78.6, 7.4, 'power1.inOut');

  ctx.cut(tl, 86.5, 'cpuCarpet', 'cpuFet', { p: [3.6, 2.6, 6.0], t: [0, -0.1, 0] });
  ctx.camTo(tl, { p: [2.6, 2.0, 6.4], t: [0, -0.1, 0] }, 86.6, 5, 'sine.inOut');
  ctx.showLabel(tl, Lsrc, 87.4, 18.4);
  ctx.showLabel(tl, Ldrn, 88.0, 17.8);
  ctx.showLabel(tl, Lsil, 88.8, 3.4);
  ctx.showLabel(tl, Lgate, 90.0, 15.8);
  ctx.showLabel(tl, Lox, 90.6, 2.6);
  [[93.0, 97.0], [99.8, 101.6], [102.8, 104.6]].forEach(([on, off]) => {
    tl.to(s, { gate: 1, duration: 0.3 }, on);
    tl.to(s, { gate: 0, duration: 0.3 }, off);
  });
  ctx.showLabel(tl, Lchan, 93.4, 3.4);
  ctx.camTo(tl, { p: [-2.4, 2.3, 5.8], t: [0, -0.1, 0] }, 97.4, 8, 'sine.inOut');

  ctx.cut(tl, 106.5, 'cpuFet', 'cpuFin', { p: [6.5, 5.0, 8.0], t: [0, 0.5, 0] });
  ctx.showLabel(tl, Lfin, 107.4, 6.0);
  ctx.showLabel(tl, LfinG, 108.2, 13.4);
  ctx.showLabel(tl, LfinS, 108.8, 4.6);
  tl.to(s, { finOn: 1, duration: 0.4 }, 111.0);
  tl.to(s, { wrap: 1, duration: 0.8 }, 114.4);
  ctx.camTo(tl, { p: [7.2, 2.2, -2.6], t: [0, 0.7, -0.6] }, 113.4, 3.4, 'power2.inOut');
  ctx.showLabel(tl, Lwrap, 115.4, 6.0);
  tl.to(s, { finOn: 0, duration: 0.3 }, 118.0);
  tl.to(s, { finOn: 1, duration: 0.3 }, 119.6);

  ctx.cut(tl, 122.5, 'cpuFin', 'cpuAtom', { p: [0, 0.6, 14.5], t: [0, 0.4, 0] });
  ctx.showLabel(tl, Lsi, 123.4, 4.6);
  ctx.showLabel(tl, Lbond, 124.2, 3.8);
  ctx.showLabel(tl, Lsc, 125.0, 3.0);
  ctx.camTo(tl, { p: [-1.6, 0.3, 7.6], t: [-2, 0, 0] }, 127.6, 2.6, 'power2.inOut');
  ctx.showLabel(tl, Lp, 128.4, 4.8);
  tl.to(s, { free: 1, duration: 3 }, 129.6);
  ctx.showLabel(tl, Lfree, 130.6, 3.0);
  ctx.camTo(tl, { p: [2.4, -0.2, 8.0], t: [2.0, -0.6, 0] }, 133.0, 2.4, 'power2.inOut');
  tl.to(s, { hole: 1, duration: 1 }, 133.6);
  ctx.showLabel(tl, Lb, 134.0, 2.8);
  ctx.camTo(tl, { p: [0, 2.4, 16.5], t: [0, 1.55, 0] }, 136.4, 2.0, 'power2.inOut');
  tl.to(s, { field: 1, duration: 2.2 }, 137.0);
  ctx.showLabel(tl, Lg, 137.4, 2.8);
  ctx.fade(tl, 1, 140.3, 0.6);
  ctx.hide(tl, 'cpuAtom', 140.95);
  ctx.pad(tl, 141);

  const steps = [
    [0.6, 3.6, 'The CPU',
      'This is the CPU, the chip that runs every program on your laptop.',
      'It sits under the heat pipe, soldered onto the motherboard as a ball-grid-array package.'],
    [4.4, 4.8, 'The package',
      'From the outside: a metal lid that spreads heat, on a small board that connects the chip to the motherboard.',
      'Integrated heat spreader (IHS) on an organic substrate. Many laptop CPUs skip the lid and expose the bare die to the cooler.'],
    [9.2, 5.2, 'The die',
      'Under the lid is the real chip: a thin slice of silicon called the die.',
      'A few hundred mm² of silicon, made in hundreds of process steps over several months. Its wiring stacks 10–15 metal layers on top of the transistors.'],
    [14.4, 4.0, 'The floorplan',
      'The die is divided into regions: cores that run programs, cache memory, and graphics.',
      'Cores, shared L3 cache, an integrated GPU, memory controller and I/O, all on one piece of silicon.'],
    [18.4, 4.0, 'The clock',
      'A clock ticks billions of times per second. On every tick, the whole chip takes one step.',
      'At 4 GHz one tick lasts 0.25 nanoseconds. In that time, light travels only 7.5 cm.'],
    [22.8, 4.6, 'Inside one core',
      'A core works like an assembly line. Every instruction goes through the same five stations.',
      'The classic pipeline: fetch → decode → execute → memory → write-back. Real cores have 15–20 stages and can handle several instructions per stage.'],
    [27.4, 5.0, 'Feeding the line',
      'Instructions come from a small cache. Results land in registers, the core’s tiny, ultra-fast scratch slots.',
      'L1 caches are ~32–64 KB and answer in about 1 ns. Registers answer within a single tick. The branch predictor guesses which way jumps will go, so the line never stalls.'],
    [32.4, 7.8, 'A pipeline',
      'While one instruction is being executed, the next is decoded and the one after is fetched. Five instructions are in flight at once.',
      'Pipelining is why one core can finish roughly one (or several) instructions every tick, even though each needs five ticks to go through.'],
    [40.8, 5.0, 'Adding in binary',
      'The Execute stage holds the ALU. Let’s watch it add 5 + 3. In binary that’s 0101 + 0011.',
      'Each bit position has a full adder: it takes two bits plus a carry, and outputs a sum bit and a carry bit.'],
    [45.8, 9.2, 'The carry ripples',
      'Like adding by hand: 1 + 1 = 10 in binary, so it writes 0 and carries 1 to the next column. Scroll to watch the carry ripple left.',
      'This is a ripple-carry adder. Fast CPUs use carry-lookahead adders that work out all the carries at once, so a 64-bit add still fits in one tick.'],
    [55.0, 3.4, 'The result',
      'Out comes 1000: that’s 8. Every calculation your computer does is built from steps like this.',
      'A full adder is about 28 transistors. A 64-bit ALU uses thousands; a modern core, hundreds of millions.'],
    [58.8, 6.0, 'Gates are made of transistors',
      'Each little logic block is built from transistors acting as switches. This is a NAND gate: four transistors.',
      'CMOS logic pairs PMOS transistors (connect to +V when the input is 0) with NMOS transistors (connect to ground when the input is 1). NAND is universal: any logic can be built from it.'],
    [64.8, 6.8, 'Switch the inputs',
      'Scroll to change the inputs. If either input is 0, a top switch connects the output to +1 V: output 1.',
      'The PMOS pair is in parallel (either one can pull the output up). The NMOS pair is in series (both must be on to pull it down).'],
    [71.6, 6.6, 'Both inputs 1',
      'Only when A and B are both 1 do the bottom switches connect the output to ground: output 0.',
      'In a steady state almost no current flows through a CMOS gate. Power is used mainly when it switches, which is why faster clocks mean more heat.'],
    [78.8, 7.4, 'Billions of switches',
      'Zoom out and a core is a carpet of transistors, wired together in layers of copper.',
      'A modern laptop chip has tens of billions of transistors; Apple’s M3 Max has 92 billion.'],
    [86.8, 5.6, 'One transistor',
      'Here’s one switch, cut open. Electrons want to flow from the source to the drain, but the silicon between them blocks the way.',
      'A MOSFET: n-type source and drain in p-type silicon. The two n–p junctions back-to-back stop current flowing.'],
    [92.6, 4.6, 'Gate on: a 1',
      'Put a small voltage on the gate and a thin channel of electrons forms underneath it. Current flows.',
      'The gate’s electric field crosses the oxide and pulls electrons to the surface: an inversion layer. The gate itself never touches the channel.'],
    [97.2, 8.8, 'Gate off: a 0',
      'Remove the voltage and the channel disappears. Current stops. On, off, billions of times a second.',
      'Switching takes a few picoseconds. Each switch charges and discharges tiny capacitances, and that is where a CPU’s heat comes from.'],
    [106.8, 6.6, 'What it really looks like',
      'Modern transistors are 3D. The channel is a tall, thin fin of silicon, and the gate drapes over it.',
      'FinFETs were introduced at the 22 nm node (2011). The newest chips use gate-all-around nanosheets, where the gate surrounds the channel completely.'],
    [113.4, 8.8, 'Grip on three sides',
      'Wrapping the gate around the fin gives it a much tighter grip, so the switch turns off more completely and leaks less.',
      '“3 nm” is a marketing name: the gate pitch is about 48 nm and a fin is a few nanometres wide, only tens of atoms across.'],
    [122.8, 5.0, 'Silicon atoms',
      'Zoom all the way in: silicon atoms, each sharing electrons with 4 neighbours. Every electron is locked in a bond, so pure silicon barely conducts.',
      'Silicon forms a diamond-cubic crystal (drawn flat here). Each bond is a shared pair of electrons, 0.235 nm long.'],
    [127.8, 5.2, 'Doping',
      'Swap in a phosphorus atom. It has 5 outer electrons but only needs 4, so one is set free to move around.',
      'This is n-type doping, about one dopant per million silicon atoms. It’s what makes the source and drain conductive.'],
    [133.0, 3.8, 'Holes',
      'Boron has only 3 outer electrons, which leaves a gap called a hole. Neighbouring electrons hop into it, so the hole moves too.',
      'p-type doping. Holes behave like positive charge carriers. The body of our transistor was p-type.'],
    [136.8, 3.6, 'The field effect',
      'Put a positive gate above the crystal and free electrons are pulled up to the surface. That layer is the channel: the switch is on.',
      'That is the “field effect” in MOSFET: an electric field, not a mechanical contact, decides whether current can flow.'],
  ];
  const outline = [['Package', 0], ['Die', 9], ['Pipeline', 22.5], ['Adder', 40.5], ['NAND gate', 58.5], ['Transistors', 78.5], ['MOSFET', 86.5], ['FinFET', 106.5], ['Atoms', 122.5]];

  let lastK = -1;
  const v = new THREE.Vector3();
  function update(now, dt) {
    const V = ctx.vis;
    if (V.cpuPkg) {
      ihs.position.set(-0.6 * s.lid, 0.1 + 1.7 * s.lid, 0);
      ihs.rotation.z = 0.35 * s.lid;
      const clk = now * 1.1;
      for (const { mat, dist } of blocks) {
        const p = Math.pow(Math.max(0, Math.cos(Math.PI * 2 * (clk - dist * 2.4))), 10);
        mat.opacity = 0.55 * p * s.clockOn;
      }
    }

    // pipeline: tokens step one stage per tick
    if (V.cpuCore) {
      const tk = now / TICK;
      const f = frac(tk);
      const pulse = Math.exp(-f * 8);
      stageMats.forEach((m) => (m.emissiveIntensity = 0.15 + 0.5 * pulse));
      const rows = [];
      tokens.forEach((g, j) => {
        const p = (Math.floor(tk) + j) % 6;
        const e = smooth((f - 0.6) / 0.4);
        let x, y = 0.62, z = 0, sc = 1;
        if (p < 4) x = lerp(XS[p], XS[p + 1], e);
        else if (p === 4) { x = XS[4] + e * 1.6; sc = 1 - e; }
        else { x = XS[0]; z = lerp(-2.6, 0, e); y = lerp(0.5, 0.62, e); sc = e; }
        g.position.set(x, y, z);
        g.scale.setScalar(Math.max(0.001, sc));
        if (p < 5) rows[p] = PROGRAM[j];
      });
      const addJ = 2, pAdd = (Math.floor(tk) + addJ) % 6;
      aluSprite.material.opacity = pAdd === 2 ? smooth(f / 0.2) * (1 - smooth((f - 0.6) / 0.2)) : 0;
      const names = ['FETCH', 'DECODE', 'EXECUTE', 'MEMORY', 'WRITE-BACK'];
      ctx.readout(`<h4>PIPELINE · TICK ${Math.floor(tk) % 1000}</h4><table>${names.map((n, i) => `<tr class="${i === 2 ? 'on' : ''}"><td style="text-align:left">${n}</td><td style="text-align:left">${rows[i] || '—'}</td></tr>`).join('')}</table>`, 1);
    }

    // ripple-carry adder
    if (V.cpuAdd) {
      fas.forEach((fa, i) => {
        const k = clamp01(s.add - i);
        const done = k > 0.5;
        fa.mat.emissiveIntensity = 0.05 + 0.9 * Math.exp(-Math.pow((s.add - i - 0.5) * 3, 2));
        fa.sm.material.opacity = done ? 1 : 0;
        fa.sumWire.material.opacity = done ? 1 : 0.15;
        const cOut = clamp01(s.add - i - 0.5) > 0;
        fa.cw.material.opacity = cOut ? 1 : 0.15;
        fa.cs.material.opacity = cOut ? 1 : 0;
      });
      const ci = Math.floor(s.add), cf = frac(s.add);
      carryDot.visible = ci >= 0 && ci < 4 && cf > 0.5 && CARRY[ci + 1] === 1;
      if (carryDot.visible) carryDot.position.set(lerp(FX(ci) - 0.85, FX(ci) - 1.75, (cf - 0.5) * 2), 0, 0.1);
      const got = fas.map((fa, i) => (s.add - i > 0.5 ? String(SUM[i]) : '?')).reverse().join('');
      const val = got.includes('?') ? '…' : String(parseInt(got, 2));
      ctx.readout(`<h4>BINARY ADDITION</h4><div class="bits">&nbsp;&nbsp;<i>0101</i> &nbsp;(5)<br>+ <i>0011</i> &nbsp;(3)<br>= <i class="alt">${got}</i> &nbsp;(${val})</div>`, 1);
    }

    // NAND gate: which transistors conduct, which wires are tied to +V or ground
    if (V.cpuGate) {
      const c = Math.round(s.combo);
      const a = c >> 1 & 1, b = c & 1;
      const out = a && b ? 0 : 1;
      const onPA = !a, onPB = !b, onNA = !!a, onNB = !!b;
      [[PA, onPA], [PB, onPB], [NA, onNA], [NB, onNB]].forEach(([t, on]) => (t.mat.emissiveIntensity = on ? 0.9 : 0));
      const col = (w, c3) => w.material.color.copy(c3);
      col(wires.vA, WARM); col(wires.vB, WARM);
      col(wires.pA, onPA ? WARM : DIM); col(wires.pB, onPB ? WARM : DIM);
      const outC = out ? WARM : COOL;
      col(wires.node, outC); col(wires.nTop, outC);
      col(wires.nMid, onNB ? COOL : onNA ? outC : DIM);
      col(wires.nBot, COOL);
      col(wires.inA, a ? WARM : DIM); col(wires.inB, b ? WARM : DIM);
      inAS.forEach((sp, i) => (sp.visible = i === a));
      inBS.forEach((sp, i) => (sp.visible = i === b));
      outS.forEach((sp, i) => (sp.visible = i === out));
      led.material.color.copy(out ? WARM : new THREE.Color(0x223040));
      ctx.readout(`<h4>NAND TRUTH TABLE</h4><table><tr><td>A</td><td>B</td><td>OUT</td></tr>${[0, 1, 2, 3].map((k) => `<tr class="${k === c ? 'on' : ''}"><td>${k >> 1}</td><td>${k & 1}</td><td>${(k >> 1) & k & 1 ? 0 : 1}</td></tr>`).join('')}</table>`, 1);
    }

    if (V.cpuCarpet) {
      const k = Math.floor(now * 2.4);
      if (k !== lastK) {
        lastK = k;
        for (let i = 0; i < NX * NX; i++) tr.setColorAt(i, hash(i, k) > 0.78 ? cOn : cOff);
        tr.instanceColor.needsUpdate = true;
      }
    }

    if (V.cpuFet) {
      flow += dt * 0.42 * (s.gate > 0.5 ? 1 : 0);
      gateMat.emissiveIntensity = s.gate * 1.4;
      chanMat.opacity = s.gate * 0.8;
      const on = s.gate > 0.5;
      Lgate.setText(on ? 'Gate: voltage ON' : 'Gate: 0 V', on ? 'channel open → 1' : 'no channel → 0');
      for (let i = 0; i < NE; i++) {
        const e = E[i];
        const x = -2.55 + 5.1 * frac(flow + e.ph);
        const inChan = Math.abs(x) < 1.3;
        const y = inChan ? -0.085 : e.deep - (e.deep + 0.085) * smooth((1.6 - Math.abs(x)) / 0.3);
        const vis = !inChan || on;
        const jig = 0.015 * Math.sin(now * 9 + i);
        m4.makeScale(vis ? 1 : 0, vis ? 1 : 0, vis ? 1 : 0).setPosition(x, y + jig, e.z * (inChan ? 0.95 : 1));
        elec.setMatrixAt(i, m4);
      }
      elec.instanceMatrix.needsUpdate = true;
    }

    if (V.cpuFin) {
      fflow += dt * 0.35 * (s.finOn > 0.5 ? 1 : 0);
      finGateMat.emissiveIntensity = s.finOn * 0.8;
      epiMat.opacity = 0.4 - 0.3 * s.wrap;
      wrapLine.material.opacity = s.wrap;
      for (let i = 0; i < NFE; i++) {
        const e = FE[i];
        const x = -3.5 + 7 * frac(fflow + e.ph);
        const inGate = Math.abs(x) < 0.6;
        const vis = !inGate || s.finOn > 0.5;
        m4.makeScale(vis ? 1 : 0, vis ? 1 : 0, vis ? 1 : 0).setPosition(x, e.y + 0.01 * Math.sin(now * 8 + i), e.fz + e.dz);
        fElec.setMatrixAt(i, m4);
      }
      fElec.instanceMatrix.needsUpdate = true;
    }

    if (V.cpuAtom) {
      // bond electron pairs (the one next to boron goes missing → hole that hops around)
      const hop = holeBonds[Math.floor(now * 0.9) % holeBonds.length];
      let k = 0;
      pairs.forEach(([x, y, vert], bi) => {
        for (const sgn of [-1, 1]) {
          const j = 0.02 * Math.sin(now * 6 + bi + sgn);
          const missing = s.hole > 0.5 && bi === hop && sgn === 1;
          m4.makeScale(missing ? 0 : 1, missing ? 0 : 1, missing ? 0 : 1).setPosition(x + (vert ? sgn * 0.11 : j), y + (vert ? j : sgn * 0.11), 0.05);
          pairE.setMatrixAt(k++, m4);
        }
      });
      pairE.instanceMatrix.needsUpdate = true;
      holeRing.visible = s.hole > 0.5;
      if (holeRing.visible) { const [x, y, vert] = pairs[hop]; holeRing.position.set(x + (vert ? 0.11 : 0), y + (vert ? 0 : 0.11), 0.12); }
      // phosphorus' spare electron: loosely orbiting, then wandering between atoms; pulled up by the gate field
      const px0 = P_AT[0] - 5, py0 = P_AT[1] - 3;
      const orbit = [px0 + 0.45 * Math.cos(now * 2.2), py0 + 0.45 * Math.sin(now * 2.2)];
      const wander = [px0 + 1.6 * Math.sin(now * 0.37) + 0.5 * Math.sin(now * 1.3) + 0.5, py0 + 1.2 * Math.sin(now * 0.29 + 1) + 0.5];
      const fx = lerp(orbit[0], wander[0], s.free), fy = lerp(orbit[1], wander[1], s.free);
      freeE.position.set(fx, lerp(fy, 2.55, s.field), 0.2);
      gatePlate.material.emissiveIntensity = s.field * 0.6;
      gatePlate.visible = oxide.visible = s.field > 0.01;
      gatePlate.position.y = 4.3 + (1 - s.field) * 1.5;
      plusS.forEach((p) => (p.material.opacity = s.field));
      for (let i = 0; i < NCH; i++) {
        const x = -5.5 + 11 * frac(now * 0.08 + chPh[i]);
        const y = lerp(-3.6 + chPh[i] * 2, 2.6 + 0.12 * Math.sin(now * 3 + i), s.field);
        const sh = s.field > 0.05 ? 1 : 0;
        m4.makeScale(sh, sh, sh).setPosition(x, y, 0.35);
        chE.setMatrixAt(i, m4);
      }
      chE.instanceMatrix.needsUpdate = true;
    }
  }

  return { title: 'CPU', tl, steps, outline, update };
}
