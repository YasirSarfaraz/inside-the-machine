import * as THREE from 'three';
import { M, rbox, glow, makeFloor, rng, clamp01, smooth, lerp, frac } from '../common.js';
import { flyIn } from './laptop.js';

const lit = (hex, k = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, ...extra });

export function coolingChapter(ctx) {
  const { gsap } = ctx;
  const s = { load: 0.15, spread: 0, heat: 0, pipe: 0, fan: 0, mode: 0, temp: 0.62, clock: 1 };
  const tl = gsap.timeline();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const r = rng(9);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const col = new THREE.Color(), cool = new THREE.Color(0x8fb4d6), warm = new THREE.Color(0xe39a7c), grey = new THREE.Color(0x8a8f98), amber = new THREE.Color(0xffb060);
  const copper = new THREE.MeshStandardMaterial({ color: 0xc8743f, metalness: 0.95, roughness: 0.3 });

  // =============== 1. the hot chip ===============
  const heat = ctx.register('coolHeat', new THREE.Group());
  heat.add(makeFloor(30, -0.3, 60));
  add(heat, rbox(6.8, 0.25, 4.8, 0.05), new THREE.MeshStandardMaterial({ color: 0x1a3a2a, roughness: 0.6 }), 0, -0.2, 0);
  const CORES = [[-1.9, -0.9], [-0.65, -0.9], [0.6, -0.9], [-1.9, 0.6], [-0.65, 0.6], [0.6, 0.6]];
  const heatMat = new THREE.ShaderMaterial({
    uniforms: { uLoad: { value: 0 }, uTime: { value: 0 } },
    toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uLoad; uniform float uTime; varying vec2 vUv;
      vec3 ramp(float t){ t = clamp(t, 0.0, 1.0);
        vec3 a = vec3(0.05, 0.05, 0.07), b = vec3(0.45, 0.06, 0.05), c = vec3(0.95, 0.42, 0.10), d = vec3(1.0, 0.92, 0.65);
        return t < 0.4 ? mix(a, b, t / 0.4) : t < 0.75 ? mix(b, c, (t - 0.4) / 0.35) : mix(c, d, (t - 0.75) / 0.25); }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(5.6, 3.8);
        float h = 0.0;
        ${CORES.map(([x, z]) => `h += exp(-dot(p - vec2(${(x + 0.6).toFixed(2)}, ${(-z).toFixed(2)}), p - vec2(${(x + 0.6).toFixed(2)}, ${(-z).toFixed(2)})) * 1.6);`).join('\n        ')}
        h += 0.55 * exp(-dot(p - vec2(2.1, 0.0), p - vec2(2.1, 0.0)) * 0.8);
        h *= 0.85 + 0.15 * sin(uTime * 7.0 + p.x * 3.0) * sin(uTime * 5.3 + p.y * 4.0);
        float t = 0.08 + uLoad * h * 0.95;
        vec2 g = abs(fract(vUv * vec2(28.0, 19.0)) - 0.5);
        float grid = smoothstep(0.47, 0.5, max(g.x, g.y));
        gl_FragColor = vec4(ramp(t) * (1.0 - 0.25 * grid), 1.0); }`,
  });
  const die = add(heat, new THREE.PlaneGeometry(5.6, 3.8), heatMat, 0, 0.0, 0);
  die.rotation.x = -Math.PI / 2;
  const NS = 220;
  const sparks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), glow(0xfff2d0, 3), NS);
  const sp = Array.from({ length: NS }, () => {
    const c = CORES[Math.floor(r() * CORES.length)];
    return { x: c[0] + 0.6 + (r() - 0.5) * 1.0, z: c[1] + (r() - 0.5) * 1.0, ph: r() * 100, f: 6 + r() * 14 };
  });
  heat.add(sparks);
  const Ldie = ctx.label({ obj: anchor(heat, -2.6, 0, 1.7), text: 'CPU chip, seen from above', sub: 'colour = temperature', col: 'left', dy: 0 });
  const Lcore = ctx.label({ obj: anchor(heat, CORES[2][0] + 0.6, 0, CORES[2][1]), text: 'Busy cores get hottest', sub: '', col: 'right', dy: 0, hot: true });
  const Lspark = ctx.label({ obj: anchor(heat, CORES[4][0] + 0.6, 0.05, CORES[4][1]), text: 'Every switch flip', sub: 'dumps a little charge as heat', col: 'right', dy: 0 });

  // =============== 2. heat moving through copper ===============
  const atoms = ctx.register('coolAtoms', new THREE.Group());
  const NX = 18, NY = 8, NZ = 3, AS = 0.42;
  const X0 = -((NX - 1) * AS) / 2;
  const lat = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) lat.push([X0 + i * AS, (j - (NY - 1) / 2) * AS, (k - (NZ - 1) / 2) * AS, r() * 6.28, r() * 6.28]);
  const atomMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 }), lat.length);
  lat.forEach((_, n) => atomMesh.setColorAt(n, grey));
  atoms.add(atomMesh);
  const hotPlate = add(atoms, rbox(0.4, NY * AS + 0.3, NZ * AS + 0.4, 0.04), lit(0xe39a7c, 1.4), X0 - 0.55, 0, 0);
  const coldPlate = add(atoms, rbox(0.4, NY * AS + 0.3, NZ * AS + 0.4, 0.04), new THREE.MeshStandardMaterial({ color: 0x8fb4d6, roughness: 0.4, metalness: 0.3 }), -X0 + 0.55, 0, 0);
  const NEF = 14;
  const freeE = Array.from({ length: NEF }, () => ({ m: add(atoms, new THREE.SphereGeometry(0.05, 10, 8), glow(0xb5e3dc, 2.4)), y: (r() - 0.5) * NY * AS * 0.9, z: (r() - 0.5) * NZ * AS, ph: r(), sp: 0.12 + r() * 0.12 }));
  const Lhot = ctx.label({ obj: hotPlate, at: [0, NY * AS / 2, 0], text: 'Hot chip', sub: '', col: 'left', dy: 0 });
  const Latom = ctx.label({ obj: anchor(atoms, X0 + AS, AS * 2, AS), text: 'Copper atoms, shaking', sub: 'temperature = how hard they jiggle', col: 'left', dy: 0, hot: true });
  const Lpass = ctx.label({ obj: anchor(atoms, 0, AS * 3.5, 0), text: 'Each atom nudges the next', sub: 'so the shaking spreads', col: 'right', dy: 0 });
  const Lfree = ctx.label({ obj: freeE[2].m, text: 'Free electrons', sub: 'carry heat fast in metals', col: 'right', dy: 0 });

  // =============== 3. the heat pipe ===============
  const pipe = ctx.register('coolPipe', new THREE.Group());
  pipe.add(makeFloor(40, -1.4, 80));
  const PL = 10, PR = 0.85, WICK = 0.2;
  add(pipe, new THREE.CylinderGeometry(PR, PR, PL, 48, 1, true, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8743f, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }));
  add(pipe, new THREE.CylinderGeometry(PR - WICK, PR - WICK, PL, 48, 1, true, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
  const capMat = new THREE.MeshStandardMaterial({ color: 0xa8603a, metalness: 0.9, roughness: 0.4, side: THREE.DoubleSide });
  // the tube is cut open along its length (front half removed), so the end caps are half discs too
  for (const sx of [-1, 1]) add(pipe, new THREE.CircleGeometry(PR, 48, sx > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI).rotateY((sx * Math.PI) / 2), capMat, (sx * PL) / 2, 0, 0);
  add(pipe, rbox(2.0, 0.3, 1.8, 0.04), lit(0xe39a7c, 1.2), -PL / 2 + 1.2, -PR - 0.15, 0);
  for (let k = 0; k < 9; k++) add(pipe, new THREE.BoxGeometry(0.05, 2.4, 2.2), M.alu, PL / 2 - 2.2 + k * 0.25, 0, -0.2);
  const NP = 140;
  const vapMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), lit(0xf2efe8, 1.0, { transparent: true, opacity: 0.7 }), NP);
  const liqMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 10, 8), lit(0x4a86e0, 1.0), NP);
  pipe.add(vapMesh, liqMesh);
  const parts = Array.from({ length: NP }, () => ({ ph: r(), y: (r() - 0.5) * 2 * (PR - WICK - 0.12), z: -r() * (PR - WICK - 0.12), a: r() * Math.PI }));
  const Lpcu = ctx.label({ obj: anchor(pipe, -PL / 2 + 1.2, -PR - 0.3, 0.9), text: 'On the CPU', sub: 'the hot end', col: 'left', dy: 0, hot: true });
  const Lboil = ctx.label({ obj: anchor(pipe, -PL / 2 + 1.0, 0.1, 0), text: 'Liquid boils', sub: 'soaking up a lot of heat', col: 'left', dy: 0 });
  const Lvap = ctx.label({ obj: anchor(pipe, 0, 0.2, 0), text: 'Vapour rushes along', sub: 'near the speed of sound', col: 'right', dy: 0 });
  const Lcond = ctx.label({ obj: anchor(pipe, PL / 2 - 1.2, 0.1, 0), text: 'Condenses at the cold end', sub: 'giving the heat to the fins', col: 'right', dy: 0 });
  const Lwick = ctx.label({ obj: anchor(pipe, 0.5, -(PR - WICK / 2), 0), text: 'Wick', sub: 'pulls the liquid back, like a sponge', col: 'right', dy: 0 });

  // =============== 4. fins and fan ===============
  const fins = ctx.register('coolFins', new THREE.Group());
  fins.add(makeFloor(30, -1.3, 60));
  const NFIN = 26, FX0 = -2.5, FSTEP = 0.2;
  for (let k = 0; k < NFIN; k++) add(fins, new THREE.BoxGeometry(0.035, 1.8, 2.6), M.alu, FX0 + k * FSTEP, 0, 0);
  add(fins, new THREE.CylinderGeometry(0.16, 0.16, NFIN * FSTEP + 0.6, 24).rotateZ(Math.PI / 2), copper, FX0 + (NFIN * FSTEP) / 2 - 0.2, -0.55, 0);
  const fan = new THREE.Group();
  fan.position.set(0.1, 0, -2.9);
  fins.add(fan);
  add(fan, new THREE.TorusGeometry(1.15, 0.08, 10, 48), M.plastic);
  add(fan, new THREE.CylinderGeometry(0.32, 0.32, 0.22, 32).rotateX(Math.PI / 2), M.plastic);
  const rotor = new THREE.Group();
  fan.add(rotor);
  for (let k = 0; k < 11; k++) {
    const b = add(rotor, new THREE.BoxGeometry(0.75, 0.02, 0.2), M.plastic, 0, 0, 0);
    b.geometry.translate(0.66, 0, 0);
    b.rotation.set(0, 0, (k / 11) * Math.PI * 2);
    b.rotateX(0.45);
  }
  const NAIR = 220;
  const air = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), NAIR);
  fins.add(air);
  for (let i = 0; i < NAIR; i++) air.setColorAt(i, cool);
  const airP = Array.from({ length: NAIR }, () => ({ x: FX0 + 0.1 + Math.floor(r() * (NFIN - 1)) * FSTEP, y: (r() - 0.5) * 1.6, ph: r(), sp: 0.8 + r() * 0.4 }));
  const Lfin = ctx.label({ obj: anchor(fins, FX0 + (NFIN - 1) * FSTEP, 0.9, 1.3), text: 'Thin aluminium fins', sub: 'lots of surface for air to touch', col: 'right', dy: 0 });
  const Lfan = ctx.label({ obj: anchor(fan, -1.1, 0.4, 0), text: 'Fan', sub: 'pushes air between the fins', col: 'left', dy: 0, hot: true });
  const Lair = ctx.label({ obj: anchor(fins, FX0 + 0.2, 0.5, 1.9), text: 'Air leaves warmer', sub: 'out through the vents', col: 'left', dy: 0 });

  // =============== timeline ===============
  const T0 = flyIn(ctx, tl, ctx.laptop.parts.fan, { off: [1.0, 0.12, 0.75], text: 'Cooling', sub: 'fan + heat pipe', dx: -60, dy: -100 });
  const TOP = { p: [0.2, 6.8, 4.6], t: [0, 0, 0] };
  ctx.show(tl, 'coolHeat', T0);
  ctx.camSet(tl, TOP, T0);
  ctx.fade(tl, 0, T0 + 0.05, 0.6);
  ctx.title(tl, 4.4, 'PART 6 · HEAT', 'How Cooling Works', 2.6);
  ctx.showLabel(tl, Ldie, 7.2, 9.6);
  tl.to(s, { load: 1, duration: 3, ease: 'power1.inOut' }, 8.0);
  ctx.showLabel(tl, Lcore, 10.2, 6.6);
  ctx.showLabel(tl, Lspark, 11.4, 5.4);
  ctx.camTo(tl, { p: [2.4, 4.6, 5.6], t: [0, 0, 0] }, 9.0, 8, 'sine.inOut');

  ctx.cut(tl, 17.5, 'coolHeat', 'coolAtoms', { p: [0, 2.0, 14.0], t: [0, 0, 0] });
  ctx.showLabel(tl, Lhot, 18.2, 12.6);
  tl.to(s, { heat: 1, duration: 1.2 }, 18.6);
  ctx.showLabel(tl, Latom, 19.4, 5.6);
  tl.to(s, { spread: 1, duration: 9, ease: 'none' }, 20.0);
  ctx.showLabel(tl, Lpass, 22.6, 8.2);
  ctx.showLabel(tl, Lfree, 25.6, 5.2);
  ctx.camTo(tl, { p: [3.4, 3.0, 13.0], t: [0.4, 0, 0] }, 19.0, 11, 'sine.inOut');

  ctx.cut(tl, 31.5, 'coolAtoms', 'coolPipe', { p: [-3.4, 1.6, 7.0], t: [-3.0, 0, 0] });
  tl.to(s, { pipe: 1, duration: 1 }, 32.0);
  ctx.showLabel(tl, Lpcu, 32.4, 4.4);
  ctx.showLabel(tl, Lboil, 33.0, 4.6);
  ctx.camTo(tl, { p: [0, 2.0, 9.6], t: [0, 0, 0] }, 36.0, 4, 'power2.inOut');
  ctx.showLabel(tl, Lvap, 37.4, 8.4);
  ctx.showLabel(tl, Lcond, 39.4, 6.4);
  ctx.showLabel(tl, Lwick, 41.0, 4.8);
  ctx.camTo(tl, { p: [2.4, 2.6, 9.2], t: [0.6, 0, 0] }, 40.0, 6, 'sine.inOut');

  ctx.cut(tl, 46.5, 'coolPipe', 'coolFins', { p: [5.4, 3.2, 6.2], t: [0, 0, -0.6] });
  tl.to(s, { fan: 1, duration: 2, ease: 'power2.in' }, 47.2);
  ctx.showLabel(tl, Lfan, 47.4, 10.4);
  ctx.showLabel(tl, Lfin, 48.4, 9.4);
  ctx.showLabel(tl, Lair, 50.2, 7.6);
  ctx.camTo(tl, { p: [4.4, 2.2, 7.4], t: [0, 0, -0.4] }, 49.0, 9, 'sine.inOut');

  ctx.cut(tl, 58.5, 'coolFins', 'coolHeat', { p: [2.4, 4.6, 5.6], t: [0, 0, 0] });
  tl.to(s, { mode: 1, duration: 0.01 }, 58.5);
  tl.to(s, { temp: 1, duration: 4.6, ease: 'power1.in' }, 59.6);
  tl.to(s, { clock: 0.72, duration: 2, ease: 'power2.inOut' }, 64.2);
  tl.to(s, { temp: 0.94, duration: 2.4, ease: 'power2.out' }, 64.6);
  ctx.camTo(tl, TOP, 59.0, 11, 'sine.inOut');
  ctx.fade(tl, 1, 70.3, 0.6);
  ctx.hide(tl, 'coolHeat', 70.95);
  ctx.pad(tl, 71);

  const steps = [
    [0.6, 3.6, 'Cooling',
      'All this computing makes heat. The fan and the copper pipes carry it out of the laptop.',
      'A laptop CPU can produce 15–60 W of heat in an area the size of a fingernail. Without cooling it would pass 100 °C in seconds.'],
    [4.4, 6.0, 'Where heat comes from',
      'Every time a transistor switches, a tiny bit of electric charge is dumped and turns into heat. Billions of switches, billions of times a second.',
      'Switching power ≈ C·V²·f: the capacitance being charged, the voltage squared, and the clock frequency. That’s why lower voltages save so much energy.'],
    [10.4, 7.0, 'Hot spots',
      'The busiest parts of the chip get hottest. The heat has to be pulled out of the chip quickly.',
      'Hot spots can be 10–20 °C hotter than the rest of the die. The chip is topped with a metal lid or bare die touching the cooler, with thermal paste between to fill the tiny air gaps.'],
    [17.8, 13.4, 'Heat is shaking',
      'Heat is atoms shaking. The hot atoms jostle their neighbours, and the shaking spreads through the copper away from the chip.',
      'In metals, free electrons carry most of the heat as well as electricity. Copper conducts heat about 1000× better than air, which is why the path from chip to fins is metal.'],
    [31.8, 14.4, 'The heat pipe',
      'A heat pipe is a sealed copper tube with a little water inside. At the hot end the water boils; the vapour races to the cold end, turns back into liquid and releases its heat. A wick carries the liquid back.',
      'The air is pumped out, so water boils at ~30 °C. Boiling absorbs ~2,260 J per gram without getting hotter. A heat pipe moves heat many times better than a solid copper bar.'],
    [46.8, 11.4, 'Fins and fan',
      'At the cold end, the heat spreads into thin metal fins. The fan blows air between them, and the warm air leaves through the vents.',
      'Many thin fins give a large surface area in a small space. The fan spins at 2,000–6,000 rpm; faster means cooler but louder.'],
    [58.8, 11.6, 'Throttling',
      'When the cooling can’t keep up and the chip reaches its limit, it slows its clock to make less heat. That’s thermal throttling.',
      'Most laptop CPUs are allowed to reach ~100 °C. They boost to high clocks for short bursts, then settle to whatever speed the cooler can sustain.'],
  ];
  const outline = [['Cooling', 0], ['Heat', 4.4], ['Conduction', 17.5], ['Heat pipe', 31.5], ['Fins + fan', 46.5], ['Throttling', 58.5]];

  function update(now, dt) {
    const V = ctx.vis;
    if (V.coolHeat) {
      const busy = s.mode > 0.5 ? s.temp : s.load;
      heatMat.uniforms.uLoad.value = busy;
      heatMat.uniforms.uTime.value = now;
      sp.forEach((p, i) => {
        const k = Math.pow(Math.max(0, Math.sin(now * p.f * s.clock + p.ph)), 24) * busy;
        m4.compose(v.set(p.x, 0.04, p.z), q.identity(), sc.setScalar(k > 0.02 ? 0.4 + k : 0));
        sparks.setMatrixAt(i, m4);
      });
      sparks.instanceMatrix.needsUpdate = true;
      const ghz = (4.8 * (s.mode > 0.5 ? s.clock : 0.4 + 0.6 * s.load)).toFixed(1);
      const tC = s.mode > 0.5 ? Math.round(lerp(40, 100, (s.temp - 0.62) / 0.38)) : Math.round(lerp(42, 84, (s.load - 0.15) / 0.85));
      const watts = Math.round(s.mode > 0.5 ? 45 * s.clock ** 3 * 1.0 + 5 : 6 + 39 * s.load);
      ctx.readout(`<h4>${s.mode > 0.5 ? 'UNDER HEAVY LOAD' : 'CPU'}</h4><div class="bits">clock <i>${ghz} GHz</i><br>power <i>${watts} W</i><br>temperature <i class="${tC >= 98 ? 'alt' : ''}">${tC} °C</i>${s.mode > 0.5 && s.clock < 0.98 ? '<br>throttling: clock lowered' : ''}</div>`, 1);
    }

    if (V.coolAtoms) {
      const front = lerp(X0 - 0.5, -X0 + 1.5, s.spread);
      lat.forEach(([x, y, z, a, b], n) => {
        const h = s.heat * clamp01(0.15 + 0.85 * smooth((front - x) / 3.2)) * (1 - 0.35 * (x - X0) / (-2 * X0));
        const amp = 0.015 + 0.09 * h;
        m4.makeTranslation(x + amp * Math.sin(now * 23 + a), y + amp * Math.sin(now * 19 + b), z + amp * Math.cos(now * 21 + a + b));
        atomMesh.setMatrixAt(n, m4);
        atomMesh.setColorAt(n, col.copy(grey).lerp(amber, h));
      });
      atomMesh.instanceMatrix.needsUpdate = true;
      atomMesh.instanceColor.needsUpdate = true;
      freeE.forEach((e) => {
        e.m.visible = s.spread > 0.05;
        const u = frac(e.ph + now * e.sp);
        e.m.position.set(lerp(X0, -X0, u), e.y + 0.08 * Math.sin(now * 9 + e.ph * 20), e.z);
      });
    }

    if (V.coolPipe) {
      const run = s.pipe;
      const half = PL / 2 - 0.4;
      parts.forEach((p, i) => {
        const u = frac(p.ph + now * 0.09);
        if (u < 0.5) {
          const k = u / 0.5;
          m4.compose(v.set(lerp(-half, half, k), p.y * 0.85, p.z * 0.85), q.identity(), sc.setScalar(run));
          vapMesh.setMatrixAt(i, m4);
          liqMesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
        } else {
          const k = (u - 0.5) / 0.5;
          const rad = PR - WICK / 2;
          const ang = Math.PI * (0.5 + (p.a / Math.PI - 0.5) * 0.9);
          m4.compose(v.set(lerp(half, -half, k), Math.cos(ang) * rad * (i % 2 ? 1 : -1), -Math.abs(Math.sin(ang)) * rad), q.identity(), sc.setScalar(run));
          liqMesh.setMatrixAt(i, m4);
          vapMesh.setMatrixAt(i, m4.makeScale(0, 0, 0));
        }
      });
      vapMesh.instanceMatrix.needsUpdate = true;
      liqMesh.instanceMatrix.needsUpdate = true;
    }

    if (V.coolFins) {
      const f = s.fan;
      rotor.rotation.z -= dt * 26 * f;
      const zA = -2.6, zB = 2.6;
      airP.forEach((p, i) => {
        const u = frac(p.ph + now * 0.32 * p.sp * f + i * 0.0001);
        const z = lerp(zA, zB, u);
        m4.makeTranslation(p.x, p.y, z);
        air.setMatrixAt(i, f > 0.02 ? m4 : m4.makeScale(0, 0, 0));
        air.setColorAt(i, col.copy(cool).lerp(warm, smooth((z + 1.3) / 2.6)));
      });
      air.instanceMatrix.needsUpdate = true;
      air.instanceColor.needsUpdate = true;
      ctx.readout(`<h4>FAN</h4><div class="bits">speed <i>${Math.round(f * 4200)} rpm</i><br>air in <i>~28 °C</i> → out <i class="alt">~${Math.round(28 + 17 * f)} °C</i></div>`, 1);
    }
  }

  return { title: 'Cooling', tl, steps, outline, update };
}
