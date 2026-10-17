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
      },
    };
    L.setText(text, sub);
    this.list.push(L);
    return L;
  }

  update(w, h) {
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
      if (L.col) { L.lx = L.col === 'left' ? Math.max(170, w * 0.24) : Math.min(w - 170, w * 0.76); L.ly = L.y + L.dy * k; }
      else { L.lx = L.x + L.dx * k; L.ly = L.y + L.dy * k; }
      shownNow.push(L);
    }
    // keep column labels evenly spaced: never closer than one label height
    // and keep them clear of the explanation panel (bottom-left) and the top bar
    const floor = h - 320, ceil = 120;
    for (const side of ['left', 'right']) {
      const colL = shownNow.filter((L) => L.col === side).sort((a, b) => a.ly - b.ly);
      if (!colL.length) continue;
      // clamp below the top bar first, then space downwards, so clamping can never stack two labels on one line
      colL[0].ly = Math.max(colL[0].ly, ceil);
      for (let i = 1; i < colL.length; i++) colL[i].ly = Math.max(colL[i].ly, colL[i - 1].ly + 54);
      if (side === 'left') {
        colL[colL.length - 1].ly = Math.min(colL[colL.length - 1].ly, floor);
        for (let i = colL.length - 2; i >= 0; i--) colL[i].ly = Math.min(colL[i].ly, colL[i + 1].ly - 54);
      }
    }
    for (const L of shownNow) {
      const o = L.s.o;
      const shift = L.center ? '-50%' : L.col ? (L.col === 'left' ? '-100%' : '0') : L.dx < 0 ? '-100%' : '0';
      if (L.hidden) { L.hidden = false; L.el.style.visibility = L.line.style.visibility = L.dot.style.visibility = 'visible'; }
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
