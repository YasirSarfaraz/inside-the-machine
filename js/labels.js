import * as THREE from 'three';

const SVG = 'http://www.w3.org/2000/svg';
const v = new THREE.Vector3();

function shown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// Callout labels (dot on the 3D part, leader line, text box) projected every frame.
export class Labels {
  constructor(camera) {
    this.camera = camera;
    this.box = document.getElementById('labels');
    this.svg = document.getElementById('lines');
    this.list = [];
  }

  // col: 'left' | 'right' lines the label up in a tidy column at the side of the screen (leader line runs to it).
  add({ obj, at = [0, 0, 0], dx = 90, dy = -70, text, sub = '', hot = false, center = false, col = null }) {
    const el = document.createElement('div');
    el.className = 'label' + (hot ? ' hot' : '');
    this.box.appendChild(el);
    const line = document.createElementNS(SVG, 'line');
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('r', 3.5);
    this.svg.append(line, dot);
    const L = {
      obj, at: new THREE.Vector3(...at), dx, dy, center, col, el, line, dot, s: { o: 0 }, text: null, sub: null, hidden: false,
      setText: (t, st = '') => {
        if (t === L.text && st === L.sub) return;
        L.text = t; L.sub = st;
        el.innerHTML = `<b>${t}</b>${st ? `<small>${st}</small>` : ''}`;
        L.w = 0; // re-measure on next show
      },
    };
    L.setText(text, sub);
    this.list.push(L);
    return L;
  }

  update(w, h) {
    if (w !== this.lastW || h !== this.lastH) { this.lastW = w; this.lastH = h; for (const L of this.list) L.w = 0; } // fonts change with screen size
    const k = Math.min(1, w / 1200);
    const shownNow = [];
    for (const L of this.list) {
      const o = L.s.o;
      if (o < 0.01 || !shown(L.obj)) { this.hide(L); continue; }
      v.copy(L.at);
      L.obj.localToWorld(v);
      v.project(this.camera);
      if (v.z > 1 || v.z < -1) { this.hide(L); continue; }
      L.x = (v.x * 0.5 + 0.5) * w;
      L.y = (-v.y * 0.5 + 0.5) * h;
      const m = w < 700 ? 120 : 170; // column inset from the screen edge
      if (L.col) { L.lx = L.col === 'left' ? Math.max(m, w * 0.24) : Math.min(w - m, w * 0.76); L.ly = L.y + L.dy * k; }
      else { L.lx = L.x + L.dx * k; L.ly = L.y + L.dy * k; }
      shownNow.push(L);
    }
    // keep column labels evenly spaced: never closer than one label height
    // and keep them clear of the explanation panel (bottom-left) and the top bar
    const narrow = w < 700;
    const floor = h - (narrow ? 300 : 320), ceil = narrow ? 104 : 120;
    for (const side of ['left', 'right']) {
      const colL = shownNow.filter((L) => L.col === side).sort((a, b) => a.ly - b.ly);
      if (!colL.length) continue;
      // clamp below the top bar first, then space downwards, so clamping can never stack two labels on one line
      colL[0].ly = Math.max(colL[0].ly, side === 'right' ? Math.max(ceil, this.topRight || 0) : ceil); // stay below the readout on phones
      for (let i = 1; i < colL.length; i++) colL[i].ly = Math.max(colL[i].ly, colL[i - 1].ly + 54);
      if (side === 'left') {
        colL[colL.length - 1].ly = Math.min(colL[colL.length - 1].ly, floor);
        for (let i = colL.length - 2; i >= 0; i--) colL[i].ly = Math.min(colL[i].ly, colL[i + 1].ly - 54);
      }
    }
    // free-floating labels: nudge apart any that would overlap (matters most on small screens)
    const free = shownNow.filter((L) => !L.col).sort((a, b) => a.ly - b.ly);
    for (const L of free) {
      if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      L.fx = L.center ? 0.5 : L.dx < 0 ? 1 : 0;
    }
    for (let i = 1; i < free.length; i++) for (let j = 0; j < i; j++) {
      const A = free[j], B = free[i];
      const ax = A.lx - A.fx * A.w, bx = B.lx - B.fx * B.w;
      const overlapX = Math.min(ax + A.w, bx + B.w) - Math.max(ax, bx);
      const overlapY = A.h / 2 + B.h / 2 + 2 - Math.abs(B.ly - A.ly);
      if (overlapX > 0 && overlapY > 0) B.ly += overlapY;
    }
    for (const L of shownNow) {
      const o = L.s.o;
      const f = L.center ? 0.5 : L.col ? (L.col === 'left' ? 1 : 0) : L.dx < 0 ? 1 : 0; // how much of the box sits left of lx
      const shift = `${-f * 100}%`;
      if (L.hidden) { L.hidden = false; L.el.style.visibility = L.line.style.visibility = L.dot.style.visibility = 'visible'; }
      // keep the whole label on screen, however narrow the screen is
      if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      const left = Math.min(Math.max(L.lx - f * L.w, 6), w - 6 - L.w);
      L.lx = left + f * L.w;
      L.ly = Math.min(Math.max(L.ly, 70), h - 24);
      L.el.style.transform = `translate(${L.lx.toFixed(1)}px, ${L.ly.toFixed(1)}px) translate(${shift}, -50%)`;
      L.el.style.opacity = o;
      L.line.setAttribute('x1', L.x); L.line.setAttribute('y1', L.y);
      L.line.setAttribute('x2', L.lx); L.line.setAttribute('y2', L.ly);
      L.line.style.opacity = o;
      L.dot.setAttribute('cx', L.x); L.dot.setAttribute('cy', L.y);
      L.dot.style.opacity = o;
    }
  }

  hide(L) {
    if (L.hidden) return;
    L.hidden = true;
    L.el.style.visibility = L.line.style.visibility = L.dot.style.visibility = 'hidden';
  }
}
