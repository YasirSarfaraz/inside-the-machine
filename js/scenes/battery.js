import * as THREE from 'three';
import { M, rbox, glow, makeFloor, textSprite, rng, clamp01, smooth, frac, lerp } from '../common.js';
import { MAT, slab, battLabel } from '../realism.js';
import { flyIn } from './laptop.js';

export function batteryChapter(ctx) {
  const { gsap } = ctx;
  // soc: 1 = ions in the graphite (charged), 0 = ions in the cathode (empty)
  const s = { pull: 0, stack: 0, soc: 1, current: 0, mode: 0, deint: 0, cross: 0, shed: 0, block: 0, inter: 0 };
  const tl = gsap.timeline();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const r = rng(21);
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const ionMat = glow(0xe6c08f, 1.9);
  const elMat = glow(0xb5e3dc, 2.6);

  // =============== 1. the pack ===============
  const cellWrap = new THREE.MeshStandardMaterial({ color: 0x1a1c21, metalness: 0.3, roughness: 0.45 });
  const cellLabel = new THREE.MeshStandardMaterial({ map: battLabel(), metalness: 0.1, roughness: 0.5 });
  const nickel = MAT.nickel(), alTab = MAT.aluminium(0xb9bdc4);
  const pack = ctx.register('batPack', new THREE.Group());
  pack.add(makeFloor(30, 0, 60));
  const cells = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Group();
    c.position.set(-1.15 + i * 1.15, 0.07, 0);
    pack.add(c);
    add(c, slab(1.05, 1.7, 0.14, 0.06, 0.03), [cellLabel, cellWrap], 0, -0.07, 0);
    const t = textSprite('3.7 V', { size: 0.16, mono: true, color: '#cfe0ff' });
    t.position.set(0, 0.16, -0.25);
    c.add(t);
    add(c, new THREE.BoxGeometry(0.16, 0.006, 0.3), nickel, -0.25, 0.0, -0.95);
    add(c, new THREE.BoxGeometry(0.16, 0.006, 0.3), alTab, 0.25, 0.0, -0.95);
    cells.push(c);
  }
  for (let i = 0; i < 2; i++) add(pack, new THREE.BoxGeometry(0.8, 0.012, 0.12), M.silver, -0.575 + i * 1.15, 0.095, -1.05);
  const Lcells = ctx.label({ obj: cells[0], at: [-0.4, 0.07, 0.5], text: '3 cells in series', sub: '3 × 3.7 V ≈ 11.1 V', dx: -90, dy: 60 });
  const Lcell = ctx.label({ obj: cells[1], at: [0.3, 0.07, 0.3], text: 'One lithium-ion cell', sub: 'let’s open it', dx: 100, dy: -70, hot: true });

  // =============== 2. the layer stack inside the pouch ===============
  const stack = ctx.register('batStack', new THREE.Group());
  stack.add(makeFloor(30, -0.3, 60));
  const foilAl = new THREE.MeshStandardMaterial({ color: 0x9aa2ae, metalness: 0.6, roughness: 0.55 });
  const foilCu = new THREE.MeshStandardMaterial({ color: 0xa8603a, metalness: 0.6, roughness: 0.55 });
  const TYPES = {
    al: ['Aluminium foil', 'collects current at the + side · ~12 µm', foilAl, 0.03],
    cat: ['Cathode coating', 'lithium metal oxide · ~70 µm', new THREE.MeshStandardMaterial({ color: 0x6e3340, roughness: 0.7 }), 0.06],
    sep: ['Separator', 'porous plastic film · ~15 µm', new THREE.MeshStandardMaterial({ color: 0xaeb8c6, roughness: 0.95, transparent: true, opacity: 0.85 }), 0.025],
    an: ['Anode coating', 'graphite · ~80 µm', new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.8 }), 0.06],
    cu: ['Copper foil', 'collects current at the − side · ~8 µm', foilCu, 0.03],
  };
  const ORDER = ['al', 'cat', 'sep', 'an', 'cu', 'an', 'sep', 'cat', 'al', 'cat', 'sep', 'an', 'cu'];
  const sheets = ORDER.map((type, i) => {
    const [, , mat, h] = TYPES[type];
    const g = new THREE.Group();
    stack.add(g);
    add(g, rbox(4.2, h, 2.8, h / 2.2), mat);
    if (type === 'al') add(g, new THREE.BoxGeometry(0.5, 0.02, 0.7), M.silver, -1.3, 0, -1.6);
    if (type === 'cu') add(g, new THREE.BoxGeometry(0.5, 0.02, 0.7), M.copper, 1.3, 0, -1.6);
    return { g, type, i };
  });
  const pouch = add(stack, rbox(4.5, 1.1, 3.1, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a95a8, metalness: 0.6, roughness: 0.35, transparent: true, opacity: 0.85, depthWrite: false }), 0, 0.45, 0);
  const stackLabels = ['al', 'cat', 'sep', 'an', 'cu'].map((type, k) => {
    const sh = sheets[[0, 1, 2, 3, 4][k]];
    const [name, sub] = TYPES[type];
    return ctx.label({ obj: sh.g, at: [2.1, 0, 1.4], text: name, sub, dx: 90, dy: -10 });
  });

  // =============== 3. the cell sandwich (ions + electrons) ===============
  const cell = ctx.register('batCell', new THREE.Group());
  cell.add(makeFloor(40, -1.65, 80));
  const H = 3.2, D = 2.0;
  const copper = add(cell, new THREE.BoxGeometry(0.1, H, D), M.copper, -3.3, 0, 0);
  const alu = add(cell, new THREE.BoxGeometry(0.1, H, D), M.silver, 3.3, 0, 0);
  add(cell, new THREE.BoxGeometry(0.3, 0.5, 0.1), M.copper, -3.3, H / 2 + 0.2, 0);
  add(cell, new THREE.BoxGeometry(0.3, 0.5, 0.1), M.silver, 3.3, H / 2 + 0.2, 0);
  const graphMat = new THREE.MeshStandardMaterial({ color: 0x2e333c, roughness: 0.7, metalness: 0.3 });
  const oxideMat = new THREE.MeshStandardMaterial({ color: 0x9a3f52, roughness: 0.55, metalness: 0.25 });
  const SHEETS = 7, GAP = 0.42;
  const sheetY = (k) => -1.26 + k * GAP;
  const anodeSheets = [], cathodeSheets = [];
  for (let k = 0; k < SHEETS; k++) {
    anodeSheets.push(add(cell, new THREE.BoxGeometry(2.0, 0.06, D), graphMat, -2.2, sheetY(k), 0));
    cathodeSheets.push(add(cell, new THREE.BoxGeometry(2.0, 0.08, D), oxideMat, 2.2, sheetY(k), 0));
  }
  const sep = add(cell, new THREE.BoxGeometry(0.07, H, D), new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.9, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0, 0);
  cell.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.07, H, D)), new THREE.LineBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.6 })));
  const electrolyte = add(cell, new THREE.BoxGeometry(6.5, H, D), new THREE.MeshStandardMaterial({ color: 0x2a6fd6, transparent: true, opacity: 0.06, roughness: 0.1, depthWrite: false }), 0, 0, 0);
  electrolyte.renderOrder = 3;
  const minus = textSprite('−', { size: 0.7, color: '#b5e3dc', weight: 800 }); minus.position.set(-3.75, H / 2 + 0.35, 0);
  const plus = textSprite('+', { size: 0.6, color: '#e39a7c', weight: 800 }); plus.position.set(3.75, H / 2 + 0.35, 0);
  cell.add(minus, plus);
  const wire = new THREE.CatmullRomCurve3([
    [-3.3, 1.95, 0], [-3.3, 2.9, 0], [-2.7, 3.55, 0], [-0.8, 3.7, 0], [0.8, 3.7, 0], [2.7, 3.55, 0], [3.3, 2.9, 0], [3.3, 1.95, 0],
  ].map((p) => new THREE.Vector3(...p)));
  add(cell, new THREE.TubeGeometry(wire, 120, 0.045, 10), new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.4, metalness: 0.6 }));
  const load = new THREE.Group();
  load.position.set(0, 3.75, 0);
  cell.add(load);
  add(load, new THREE.SphereGeometry(0.38, 32, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false }), 0, 0.25, 0);
  const filMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe6c08f) });
  add(load, new THREE.TorusGeometry(0.12, 0.025, 8, 24), filMat, 0, 0.25, 0);
  add(load, new THREE.CylinderGeometry(0.17, 0.17, 0.2, 20), M.aluDark, 0, -0.1, 0);
  const plug = new THREE.Group();
  plug.position.set(0, 3.75, 0);
  cell.add(plug);
  add(plug, rbox(0.8, 0.45, 0.45, 0.08), M.plastic, 0, 0.1, 0);
  add(plug, new THREE.BoxGeometry(0.05, 0.25, 0.05), M.silver, -0.15, 0.45, 0);
  add(plug, new THREE.BoxGeometry(0.05, 0.25, 0.05), M.silver, 0.15, 0.45, 0);
  const boltMat = glow(0x46ff9a, 2.2);
  add(plug, new THREE.SphereGeometry(0.05, 12, 8), boltMat, 0.28, 0.15, 0.23);
  const NI = 30;
  const ionGeo = new THREE.SphereGeometry(0.085, 16, 12);
  const ions = [];
  for (let i = 0; i < NI; i++) {
    const layer = i % (SHEETS - 1);
    ions.push({
      m: add(cell, ionGeo, ionMat),
      a: new THREE.Vector3(-3.0 + r() * 1.6, sheetY(layer) + GAP / 2, (r() - 0.5) * 1.6),
      c: new THREE.Vector3(1.4 + r() * 1.6, sheetY((layer + 2) % (SHEETS - 1)) + GAP / 2, (r() - 0.5) * 1.6),
      d: r(), wob: (r() - 0.5) * 0.9,
    });
  }
  const NEL = 26;
  const elGeo = new THREE.SphereGeometry(0.065, 12, 8);
  const electrons = Array.from({ length: NEL }, () => add(cell, elGeo, elMat));
  let eflow = 0;
  const wireTop = anchor(cell, 0, 0, 0);
  wireTop.position.copy(wire.getPoint(0.25));
  const Lcu = ctx.label({ obj: copper, at: [0, -0.9, 1.0], text: 'Copper foil', sub: 'collects electrons', dx: -90, dy: 0 });
  const Lan = ctx.label({ obj: anodeSheets[5], at: [-0.3, 0, 1.0], text: 'Anode: graphite', sub: 'stores lithium when charged', dx: -150, dy: -40 });
  const Lsep = ctx.label({ obj: sep, at: [0, -0.7, 1.0], text: 'Separator', sub: 'ions pass, electrons can’t', dx: 70, dy: 30 });
  const Lel = ctx.label({ obj: electrolyte, at: [-0.9, 1.45, 1.0], text: 'Electrolyte', sub: 'liquid that carries ions', dx: 70, dy: -70 });
  const Lca = ctx.label({ obj: cathodeSheets[5], at: [0.3, 0, 1.0], text: 'Cathode: metal oxide', sub: 'e.g. lithium cobalt oxide', dx: 150, dy: -40 });
  const Lal = ctx.label({ obj: alu, at: [0, -0.9, 1.0], text: 'Aluminium foil', sub: 'collects at the + side', dx: 90, dy: 0 });
  const Lion = ctx.label({ obj: ions[3].m, text: 'Li⁺ ion', sub: 'lithium missing one electron', dx: 60, dy: -60, hot: true });
  const Lelec = ctx.label({ obj: wireTop, text: 'Electrons (e⁻)', sub: 'take the outside path', dx: -60, dy: -60 });
  const Lload = ctx.label({ obj: load, at: [0, 0.4, 0], text: 'Your laptop', sub: 'the load', dx: 90, dy: -40, hot: true });

  // =============== 4. graphite, atom by atom ===============
  const gra = ctx.register('batGraphite', new THREE.Group());
  const A = 0.3, SX = Math.sqrt(3) * A;
  const LAYERS = [-1.35, -0.45, 0.45, 1.35];
  const cpos = [];
  for (let i = -14; i <= 14; i++) for (let j = -6; j <= 6; j++) {
    const x0 = SX * (i + j / 2), z0 = 1.5 * A * j;
    for (const [x, z] of [[x0, z0], [x0, z0 + A]]) if (Math.abs(x) < 3.3 && Math.abs(z) < 2.0) cpos.push([x, z]);
  }
  const bondIdx = [];
  for (let a = 0; a < cpos.length; a++) for (let b = a + 1; b < cpos.length; b++) {
    if (Math.abs(Math.hypot(cpos[a][0] - cpos[b][0], cpos[a][1] - cpos[b][1]) - A) < 0.01) bondIdx.push([a, b]);
  }
  const carbon = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.4, metalness: 0.2 }), cpos.length * LAYERS.length);
  const bondPos = [];
  let ci = 0;
  LAYERS.forEach((y, li) => {
    const off = li % 2 ? SX / 2 : 0; // AB stacking
    for (const [x, z] of cpos) { m4.makeTranslation(x + off, y, z); carbon.setMatrixAt(ci++, m4); }
    for (const [a, b] of bondIdx) bondPos.push(cpos[a][0] + off, y, cpos[a][1], cpos[b][0] + off, y, cpos[b][1]);
  });
  gra.add(carbon);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bondPos, 3));
  gra.add(new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0x5f6b80 })));
  add(gra, new THREE.BoxGeometry(7.2, 0.18, 4.4), foilCu, 0, -2.0, 0);
  add(gra, new THREE.BoxGeometry(3.0, 4.2, 4.4), new THREE.MeshStandardMaterial({ color: 0x2a6fd6, transparent: true, opacity: 0.07, depthWrite: false }), 4.9, 0, 0);
  const NG = 18;
  const gIons = [], gEl = [];
  for (let i = 0; i < NG; i++) {
    const gap = i % 3;
    const y = (LAYERS[gap] + LAYERS[gap + 1]) / 2;
    const x = -2.8 + r() * 5.4, z = -1.6 + r() * 3.2;
    gIons.push({ m: add(gra, new THREE.SphereGeometry(0.14, 16, 12), ionMat), x, y, z, d: r() });
    gEl.push(add(gra, new THREE.SphereGeometry(0.07, 12, 8), elMat));
  }
  const Lgl = ctx.label({ obj: anchor(gra, -2.6, LAYERS[3], 1.8), text: 'Graphene layer', sub: 'carbon atoms in hexagons', dx: -80, dy: -60 });
  const Lgsp = ctx.label({ obj: anchor(gra, -3.0, 0.9, 1.8), text: 'Layer gap', sub: '0.335 nm → ~0.37 nm with Li inside', dx: -110, dy: 30 });
  const Lgion = ctx.label({ obj: gIons[4].m, text: 'Li between the layers', sub: 'LiC₆: 1 Li per 6 carbons', dx: 80, dy: -70, hot: true });
  const Lgcu = ctx.label({ obj: anchor(gra, -2.6, -2.0, 2.2), text: 'Copper foil', sub: 'the electron leaves this way', dx: -80, dy: 50 });
  const Lgout = ctx.label({ obj: anchor(gra, 4.3, 1.6, 0), text: 'Into the electrolyte', sub: 'the ion leaves without its electron', dx: 40, dy: -80 });

  // =============== 5. the electrolyte and separator ===============
  const elec = ctx.register('batElec', new THREE.Group());
  add(elec, new THREE.BoxGeometry(0.6, 5, 3.2), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.8 }), -5.6, 0, 0);
  add(elec, new THREE.BoxGeometry(0.6, 5, 3.2), new THREE.MeshStandardMaterial({ color: 0x7a3442, roughness: 0.7 }), 5.6, 0, 0);
  const fibers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), new THREE.MeshStandardMaterial({ color: 0x8e9aac, roughness: 0.95 }), 70);
  for (let i = 0; i < 70; i++) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI));
    const len = 0.8 + r() * 1.6;
    let y = -2.3 + r() * 4.6, z = -1.4 + r() * 2.8;
    if (Math.abs(y) < 0.55 && Math.abs(z) < 0.55) y += y < 0 ? -0.6 : 0.6; // keep a clear pore in the middle
    m4.compose(new THREE.Vector3((r() - 0.5) * 0.35, y, z), q, new THREE.Vector3(1, len, 1));
    fibers.setMatrixAt(i, m4);
  }
  elec.add(fibers);
  const molecule = (parent) => {
    const g = new THREE.Group();
    add(g, new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0x8e96a4, roughness: 0.5 }), 0, 0, 0);
    add(g, new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd94a4a, roughness: 0.5 }), 0.2, 0, 0);
    add(g, new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd94a4a, roughness: 0.5 }), -0.12, 0.16, 0);
    add(g, new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd94a4a, roughness: 0.5 }), -0.12, -0.16, 0);
    parent.add(g);
    return g;
  };
  const solvent = [];
  for (let i = 0; i < 30; i++) {
    const g = molecule(elec);
    g.scale.setScalar(0.8);
    let x = -4.9 + r() * 9.8;
    if (Math.abs(x) < 0.5) x += 1;
    solvent.push({ g, p: new THREE.Vector3(x, -2.2 + r() * 4.4, -1.3 + r() * 2.6), ph: r() * 6.28 });
  }
  const anions = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    add(g, new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff9a3c, roughness: 0.4 }));
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) add(g, new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9be04a, roughness: 0.4 }), d[0] * 0.24, d[1] * 0.24, d[2] * 0.24);
    elec.add(g);
    anions.push({ g, p: new THREE.Vector3((i % 2 ? 1 : -1) * (1.2 + r() * 3.3), -2 + r() * 4, -1.2 + r() * 2.4), ph: r() * 6.28 });
  }
  const liIon = add(elec, new THREE.SphereGeometry(0.2, 20, 14), ionMat);
  const shell = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((d) => {
    const g = molecule(elec);
    return { g, d: new THREE.Vector3(...d).normalize() };
  });
  const blockedE = add(elec, new THREE.SphereGeometry(0.1, 14, 10), elMat);
  const crossX = new THREE.Group();
  const xMat = glow(0xff5a5a, 2);
  add(crossX, new THREE.BoxGeometry(0.5, 0.08, 0.08), xMat).rotation.z = 0.78;
  add(crossX, new THREE.BoxGeometry(0.5, 0.08, 0.08), xMat).rotation.z = -0.78;
  elec.add(crossX);
  const ionPath = (u) => {
    if (u < 0.45) return v.set(lerp(-4.6, -0.5, u / 0.45), lerp(1.2, 0.05, smooth(u / 0.45)), 0);
    if (u < 0.6) return v.set(lerp(-0.5, 0.5, (u - 0.45) / 0.15), 0.05, 0);
    return v.set(lerp(0.5, 5.05, (u - 0.6) / 0.4), lerp(0.05, -0.6, smooth((u - 0.6) / 0.4)), 0);
  };
  const LliI = ctx.label({ obj: liIon, text: 'Li⁺ ion', sub: 'wrapped in solvent molecules', dx: -70, dy: -90, hot: true });
  const Lshell = ctx.label({ obj: shell[0].g, text: 'Solvent shell', sub: 'O atoms (red) face the + ion', dx: 70, dy: -80 });
  const Lpf6 = ctx.label({ obj: anions[1].g, text: 'PF₆⁻ anion', sub: 'from the LiPF₆ salt', dx: 60, dy: 60 });
  const Lsepf = ctx.label({ obj: anchor(elec, 0, 2.3, 1.4), text: 'Separator', sub: 'plastic fibres with tiny pores', dx: 40, dy: -60 });
  const Lblock = ctx.label({ obj: crossX, text: 'Electrons can’t cross', sub: 'the separator is an insulator', dx: -60, dy: 80 });
  const LanW = ctx.label({ obj: anchor(elec, -5.3, 2.3, 1.6), text: 'Anode side', sub: '', dx: -30, dy: -40 });
  const LcaW = ctx.label({ obj: anchor(elec, 5.3, 2.3, 1.6), text: 'Cathode side', sub: '', dx: 30, dy: -40 });

  // =============== 6. the cathode crystal (layered LiCoO₂) ===============
  const cath = ctx.register('batCathode', new THREE.Group());
  const SLABS = [-1.6, 0, 1.6], LI_LAYERS = [-0.8, 0.8];
  const OX = 6, OZ = 4, OS = 0.85;
  const octMat = new THREE.MeshStandardMaterial({ color: 0x3d63b8, transparent: true, opacity: 0.3, roughness: 0.5, depthWrite: false });
  const octs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0), octMat, OX * OZ * SLABS.length);
  const coMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), OX * OZ * SLABS.length);
  const oMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc0504a, roughness: 0.6 }), OX * OZ * SLABS.length * 6);
  const coPos = [];
  let oi = 0, k2 = 0;
  const qo = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0));
  for (const y of SLABS) for (let i = 0; i < OX; i++) for (let j = 0; j < OZ; j++) {
    const x = (i - (OX - 1) / 2) * OS + (j % 2) * OS / 2, z = (j - (OZ - 1) / 2) * OS * 0.9;
    m4.compose(new THREE.Vector3(x, y, z), qo, new THREE.Vector3(0.95, 0.9, 0.95));
    octs.setMatrixAt(k2, m4);
    m4.makeTranslation(x, y, z);
    coMesh.setMatrixAt(k2, m4);
    coPos.push([x, y, z]);
    k2++;
    for (const d of [[0.5, 0, 0], [-0.5, 0, 0], [0, 0.45, 0], [0, -0.45, 0], [0, 0, 0.5], [0, 0, -0.5]]) {
      v.set(d[0], d[1], d[2]).applyQuaternion(qo);
      m4.makeTranslation(x + v.x * 0.95, y + v.y, z + v.z * 0.95);
      oMesh.setMatrixAt(oi++, m4);
    }
  }
  cath.add(octs, coMesh, oMesh);
  add(cath, new THREE.BoxGeometry(5.8, 0.15, 3.6), M.silver, 0.2, -2.45, 0);
  const sites = [];
  for (const y of LI_LAYERS) for (let i = 0; i < OX - 1; i++) for (let j = 0; j < OZ; j++) {
    sites.push(new THREE.Vector3((i - (OX - 2) / 2) * OS + (j % 2) * OS / 2, y, (j - (OZ - 1) / 2) * OS * 0.9));
  }
  const siteRing = new THREE.InstancedMesh(new THREE.TorusGeometry(0.12, 0.015, 6, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7a6a40 }), sites.length);
  sites.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); siteRing.setMatrixAt(i, m4); });
  cath.add(siteRing);
  const NCI = 20;
  const cIons = [], cEls = [];
  for (let i = 0; i < NCI; i++) {
    const site = sites[(i * 7) % sites.length];
    let best = 0, bd = 1e9;
    coPos.forEach((p, k) => { const d = Math.hypot(p[0] - site.x, p[1] - site.y + 0.8, p[2] - site.z); if (d < bd) { bd = d; best = k; } });
    cIons.push({ m: add(cath, new THREE.SphereGeometry(0.15, 16, 12), ionMat), site, from: new THREE.Vector3(-5.5, site.y + (r() - 0.5) * 0.4, site.z), d: i / NCI, co: best });
    cEls.push(add(cath, new THREE.SphereGeometry(0.07, 12, 8), elMat));
  }
  const CO4 = new THREE.Color(0xc070ff), CO3 = new THREE.Color(0x4c8bff);
  const Loct = ctx.label({ obj: anchor(cath, 2.0, 1.6, 1.4), text: 'CoO₆ octahedron', sub: 'cobalt (centre) + 6 oxygens', dx: 80, dy: -70 });
  const Lsite = ctx.label({ obj: anchor(cath, -1.5, 0.8, 1.4), text: 'Lithium layer', sub: 'empty slots between the slabs', dx: -100, dy: -60 });
  const Lcion = ctx.label({ obj: cIons[0].m, text: 'Li⁺ slots in', sub: '', dx: -80, dy: 70, hot: true });
  const Lco = ctx.label({ obj: anchor(cath, 1.2, -1.6, 1.4), text: 'Co⁴⁺ + e⁻ → Co³⁺', sub: 'cobalt takes the electron', dx: 100, dy: 60 });
  const Lalc = ctx.label({ obj: anchor(cath, -2.0, -2.45, 1.8), text: 'Aluminium foil', sub: 'electrons arrive from the wire', dx: -80, dy: 40 });

  // =============== timeline ===============
  const T0 = flyIn(ctx, tl, ctx.laptop.parts.battery, { off: [-0.4, 0.9, 1.9], text: 'Battery', sub: 'lithium-ion cells', dx: -60, dy: -110 });
  ctx.show(tl, 'batPack', T0);
  ctx.camSet(tl, { p: [3.4, 3.0, 4.4], t: [0, 0.1, 0] }, T0);
  ctx.fade(tl, 0, T0 + 0.05, 0.6);
  ctx.title(tl, 4.4, 'PART 3 · ENERGY', 'How a Battery Works', 2.6);
  ctx.camTo(tl, { p: [2.4, 2.6, 4.4], t: [0, 0.1, 0] }, 4.4, 4, 'sine.inOut');
  ctx.showLabel(tl, Lcells, 5.6, 3.4);
  tl.to(s, { pull: 1, duration: 2.2, ease: 'power2.inOut' }, 7.6);
  ctx.showLabel(tl, Lcell, 9.2, 2.6);

  ctx.cut(tl, 12.5, 'batPack', 'batStack', { p: [5.2, 3.0, 6.6], t: [0, 0.6, 0] });
  tl.to(s, { stack: 1, duration: 3.6, ease: 'power2.inOut' }, 13.6);
  ctx.camTo(tl, { p: [5.6, 3.2, 7.4], t: [0, 1.8, 0] }, 13.6, 4, 'power2.inOut');
  stackLabels.forEach((L, i) => ctx.showLabel(tl, L, 17.2 + i * 0.5, 6.6 - i * 0.5));

  ctx.cut(tl, 24.5, 'batStack', 'batCell', { p: [0, 1.6, 14.6], t: [0, 1.05, 0] });
  [[Lan, 25.0], [Lca, 25.6], [Lsep, 26.2], [Lel, 26.8], [Lcu, 27.4], [Lal, 27.8]].forEach(([l, at]) => ctx.showLabel(tl, l, at, 30.0 - at));
  tl.to(s, { current: 1, duration: 0.6 }, 30.2);
  tl.to(s, { soc: 0, duration: 8.6, ease: 'none' }, 30.4);
  ctx.showLabel(tl, Lion, 30.8, 3.6);
  ctx.showLabel(tl, Lelec, 34.6, 4.8);
  ctx.showLabel(tl, Lload, 35.2, 4.2);
  ctx.camTo(tl, { p: [2.8, 1.9, 14.2], t: [0, 1.05, 0] }, 30.4, 9, 'sine.inOut');
  tl.to(s, { current: 0, duration: 0.5 }, 39.4);

  ctx.cut(tl, 40.5, 'batCell', 'batGraphite', { p: [4.0, 4.2, 10.5], t: [0.6, 0.1, 0] });
  ctx.showLabel(tl, Lgl, 41.4, 5.0);
  ctx.showLabel(tl, Lgsp, 42.2, 4.2);
  ctx.showLabel(tl, Lgion, 43.6, 3.6);
  ctx.camTo(tl, { p: [6.8, 2.2, 10.2], t: [1.6, 0, 0] }, 46.0, 3, 'power2.inOut');
  tl.to(s, { deint: 1, duration: 8.4, ease: 'none' }, 47.0);
  ctx.showLabel(tl, Lgout, 48.6, 4.4);
  ctx.showLabel(tl, Lgcu, 50.2, 5.0);

  ctx.cut(tl, 56.5, 'batGraphite', 'batElec', { p: [0, 0.6, 12.5], t: [0, 0, 0] });
  ctx.showLabel(tl, LanW, 57.0, 12.6);
  ctx.showLabel(tl, LcaW, 57.0, 12.6);
  ctx.showLabel(tl, LliI, 57.6, 4.6);
  ctx.showLabel(tl, Lshell, 58.6, 3.6);
  ctx.showLabel(tl, Lpf6, 59.6, 3.0);
  tl.to(s, { cross: 1, duration: 8.4, ease: 'none' }, 60.4);
  ctx.showLabel(tl, Lsepf, 62.4, 3.6);
  ctx.camTo(tl, { p: [1.2, 1.0, 10.5], t: [0.6, 0.2, 0] }, 62.2, 3, 'power2.inOut');
  tl.to(s, { shed: 1, duration: 2.2 }, 66.2);
  tl.to(s, { block: 1, duration: 3.0, ease: 'none' }, 64.4);
  ctx.showLabel(tl, Lblock, 65.6, 3.0);

  ctx.cut(tl, 70.5, 'batElec', 'batCathode', { p: [6.4, 4.0, 11.0], t: [0, 0.2, 0] });
  ctx.showLabel(tl, Loct, 71.4, 6.0);
  ctx.showLabel(tl, Lsite, 72.2, 5.2);
  tl.to(s, { inter: 1, duration: 9.6, ease: 'none' }, 75.4);
  ctx.showLabel(tl, Lcion, 76.0, 3.6);
  ctx.showLabel(tl, Lalc, 77.6, 4.0);
  ctx.showLabel(tl, Lco, 80.0, 5.4);
  ctx.camTo(tl, { p: [-4.8, 2.8, 10.4], t: [0, 0, 0] }, 78.6, 6, 'sine.inOut');

  ctx.cut(tl, 86.5, 'batCathode', 'batCell', { p: [-2.6, 1.8, 14.4], t: [0, 1.05, 0] });
  tl.to(s, { mode: 1, duration: 0.01 }, 86.5);
  tl.to(s, { current: 1, duration: 0.6 }, 87.2);
  tl.to(s, { soc: 1, duration: 8.6, ease: 'none' }, 87.6);
  ctx.showLabel(tl, Lload, 87.8, 8.6);
  ctx.camTo(tl, { p: [0, 1.7, 15.4], t: [0, 1.05, 0] }, 92.0, 4, 'sine.inOut');
  tl.to(s, { current: 0, duration: 0.5 }, 96.6);
  ctx.fade(tl, 1, 100.3, 0.6);
  ctx.hide(tl, 'batCell', 100.95);
  ctx.pad(tl, 101);

  const steps = [
    [0.6, 3.6, 'The battery',
      'This is what powers everything: the battery pack.',
      'Laptop packs hold 3 or 4 lithium-ion cells in series, plus a small circuit board that monitors every cell.'],
    [4.4, 7.8, 'Cells',
      'The pack is made of separate cells. Each one gives about 3.7 volts; in series they add up.',
      'About 4.2 V when full, about 3.0 V when empty. A typical laptop pack stores 50–100 Wh.'],
    [12.8, 4.6, 'Inside the pouch',
      'Open a cell and you find a stack of very thin sheets, repeated dozens of times.',
      'The stack (or a wound “jelly roll”) is sealed in an aluminium-laminate pouch filled with liquid electrolyte.'],
    [17.4, 6.8, 'The layers',
      'Metal foil coated with graphite on one side, metal foil coated with a metal oxide on the other, and a thin plastic separator in between.',
      'Copper foil + graphite = anode (−). Aluminium foil + lithium metal oxide = cathode (+). All the layers together are thinner than a few hairs.'],
    [24.8, 5.4, 'The basic idea',
      'Simplified to one sandwich: graphite on the left, metal oxide on the right, liquid electrolyte between them.',
      'Electrolyte: a lithium salt (LiPF₆) dissolved in organic carbonate solvents. It conducts ions, not electrons.'],
    [30.2, 4.6, 'Discharging',
      'When you use your laptop, lithium ions leave the graphite and drift through the electrolyte to the other side.',
      'Anode: LiC₆ → C₆ + Li⁺ + e⁻. Cathode: CoO₂ + Li⁺ + e⁻ → LiCoO₂.'],
    [34.8, 5.4, 'The long way round',
      'Their electrons can’t cross the separator, so they take the long way: through the wire, powering your laptop on the way.',
      'That split is the whole trick: ions inside, electrons outside. The current through your laptop is those electrons.'],
    [40.8, 6.0, 'Zoom into the graphite',
      'Graphite is stacked sheets of carbon atoms in hexagons. In a charged battery, lithium sits squeezed between the sheets.',
      'This is called intercalation. Fully charged graphite is LiC₆: one lithium for every six carbon atoms. The layers swell by about 10%.'],
    [46.8, 9.2, 'Ion out, electron down',
      'As the battery discharges, each lithium gives up its electron and slides out of the edge as a Li⁺ ion. The electron goes down into the copper foil.',
      'This happens through a thin protective film on the graphite (the SEI), formed in the first charge. It lets ions through but stops the electrolyte from being destroyed.'],
    [56.8, 5.6, 'Through the electrolyte',
      'The ion doesn’t travel alone. Solvent molecules cling to it, their oxygen atoms pointing at its positive charge.',
      'Usually four solvent molecules form this “solvation shell”. The PF₆⁻ anions balance the charge of the liquid.'],
    [62.4, 4.0, 'Through the pores',
      'The separator is a mesh of plastic fibres. The ion slips through a pore.',
      'Pores are tens of nanometres wide. If the cell overheats, the plastic melts and closes the pores, a built-in safety shutdown.'],
    [66.4, 3.8, 'Electrons are blocked',
      'An electron trying the same route is stopped: the separator doesn’t conduct. Near the cathode, the ion sheds its shell.',
      'If anything ever pierces the separator, electrons take the short cut inside the cell: a short circuit, the cause of battery fires.'],
    [70.8, 5.0, 'The cathode crystal',
      'The cathode is a crystal of cobalt and oxygen, built as stacked slabs with empty lithium layers in between.',
      'Layered LiCoO₂: CoO₆ octahedra share edges to form slabs. Newer laptop cells use NMC (nickel–manganese–cobalt) with the same structure.'],
    [75.8, 10.4, 'Slotting in',
      'Each arriving ion slots into a gap. At the same moment an electron arrives through the wire and is taken by a cobalt atom.',
      'Co⁴⁺ + e⁻ → Co³⁺. The energy released by this reaction is what drove electrons through your laptop.'],
    [86.8, 5.2, 'Charging',
      'Plug in the charger and it pushes everything backwards: electrons through the wire, ions back into the graphite.',
      'Chargers use constant current, then constant voltage, to fill each cell to 4.2 V. Charging too fast or too cold can plate metallic lithium on the graphite.'],
    [92.0, 8.4, 'Stored energy',
      'A battery stores energy by holding lithium where it doesn’t want to be. Use the laptop and it flows back.',
      'Energy = voltage × charge moved: about 3.7 V per cell. Each cycle the SEI grows a little, which is why batteries slowly lose capacity.'],
  ];
  const outline = [['Pack', 0], ['Layers', 12.5], ['Ion flow', 24.5], ['Graphite', 40.5], ['Electrolyte', 56.5], ['Cathode', 70.5], ['Charging', 86.5]];

  function update(now, dt) {
    const V = ctx.vis;
    if (V.batPack) {
      const pl = smooth(s.pull);
      cells[1].position.set(0, 0.07 + 0.55 * pl, 0.5 * pl);
      cells[1].rotation.x = 0.3 * pl;
    }

    if (V.batStack) {
      const e = smooth(s.stack);
      sheets.forEach(({ g, i }) => g.position.set(0, lerp(i * 0.07, i * 0.36, e), 0));
      pouch.material.opacity = 0.85 * (1 - e);
      pouch.visible = e < 0.98;
    }

    if (V.batCell) {
      const u = 1 - s.soc;
      for (const ion of ions) {
        const p = smooth(clamp01(u * 1.7 - ion.d * 0.7));
        v.lerpVectors(ion.a, ion.c, p);
        v.y += Math.sin(p * Math.PI) * ion.wob;
        v.x += 0.02 * Math.sin(now * 3 + ion.d * 20);
        ion.m.position.copy(v);
      }
      const charging = s.mode > 0.5;
      eflow += dt * 0.25 * s.current * (charging ? -1 : 1);
      const show = s.current > 0.05;
      electrons.forEach((e, i) => {
        e.visible = show;
        if (show) { e.position.copy(wire.getPoint(frac(eflow + i / NEL))); e.scale.setScalar(s.current); }
      });
      load.visible = !charging;
      plug.visible = charging;
      filMat.color.setRGB(0.4 + 3.0 * s.current, 0.25 + 2.0 * s.current, 0.1 + 0.9 * s.current);
      boltMat.color.setRGB(0.66, (0.3 + 0.7 * s.current) * 2.2, 1.32);
      Lload.obj = charging ? plug : load;
      Lload.setText(charging ? 'Charger' : 'Your laptop', charging ? 'pushes electrons back' : 'the load');
    }

    if (V.batGraphite) {
      gIons.forEach((ion, i) => {
        const k = clamp01(s.deint * 1.6 - ion.d * 0.6); // this ion's progress
        const out = smooth(k);
        const x = lerp(ion.x, 6.2, out);
        ion.m.position.set(x + 0.015 * Math.sin(now * 4 + i), ion.y, ion.z);
        ion.m.visible = x < 6.1;
        // its electron: leaves at the start, drops to the copper, then runs off to the left
        const e = gEl[i];
        const ek = clamp01(k * 2.2);
        e.visible = k > 0.001 && ek < 0.999;
        if (e.visible) {
          const down = smooth(ek / 0.5), left = smooth((ek - 0.5) / 0.5);
          e.position.set(lerp(ion.x, -3.8, left), lerp(ion.y, -1.85, down), ion.z);
        }
      });
    }

    if (V.batElec) {
      solvent.forEach(({ g, p, ph }) => {
        g.position.set(p.x + 0.08 * Math.sin(now * 0.9 + ph), p.y + 0.08 * Math.cos(now * 0.7 + ph), p.z);
        g.rotation.set(now * 0.3 + ph, now * 0.2 + ph, 0);
      });
      anions.forEach(({ g, p, ph }) => {
        g.position.set(p.x + 0.12 * Math.sin(now * 0.5 + ph), p.y + 0.12 * Math.cos(now * 0.6 + ph), p.z);
        g.rotation.set(now * 0.4 + ph, now * 0.3, 0);
      });
      const ip = ionPath(s.cross);
      liIon.position.copy(ip);
      shell.forEach(({ g, d }, i) => {
        const away = s.shed * (1.4 + i * 0.3);
        g.position.set(ip.x + d.x * (0.5 + away), ip.y + d.y * (0.5 + away), ip.z + d.z * (0.5 + away));
        g.lookAt(ip);
        g.rotateY(Math.PI / 2);
      });
      const b = s.block;
      const bx = b < 0.6 ? lerp(-4.8, -0.45, smooth(b / 0.6)) : lerp(-0.45, -2.6, smooth((b - 0.6) / 0.4));
      blockedE.position.set(bx, -1.3, 0.4);
      blockedE.visible = b > 0.001 && b < 0.999;
      crossX.position.set(-0.25, -1.3, 0.5);
      crossX.visible = b > 0.5 && b < 0.999;
    }

    if (V.batCathode) {
      cIons.forEach((ion, i) => {
        const k = smooth(clamp01(s.inter * 1.5 - ion.d * 0.5));
        v.lerpVectors(ion.from, ion.site, k);
        v.y += Math.sin(k * Math.PI) * 0.15;
        ion.m.position.copy(v);
        ion.m.visible = k > 0.01;
        const co = coPos[ion.co];
        const e = cEls[i];
        e.visible = k > 0.3 && k < 0.999;
        if (e.visible) { const f = smooth((k - 0.3) / 0.7); e.position.set(lerp(ion.site.x, co[0], f), lerp(-2.35, co[1], f), lerp(ion.site.z, co[2], f)); }
        coMesh.setColorAt(ion.co, k > 0.98 ? CO3 : CO4);
      });
      if (!coMesh.userData.init) {
        coMesh.userData.init = true;
        for (let k = 0; k < coPos.length; k++) if (!cIons.some((x) => x.co === k)) coMesh.setColorAt(k, CO3);
      }
      coMesh.instanceColor.needsUpdate = true;
    }
  }

  return { title: 'Battery', tl, steps, outline, update };
}
