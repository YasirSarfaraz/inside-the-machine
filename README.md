# Inside the Machine — Episode 1

A scroll-driven 3D explainer. Scroll down to move forward, up to go back. A laptop takes itself apart, then each part is explained from the big picture down to what physically happens inside.

Tabs at the top switch technology; the row under them jumps to any depth level. **Simple / Deep dive** adds a technical paragraph to every step.

| Technology | Levels |
|---|---|
| Overview | lid opens → exploded view → parts → display stack |
| Wi-Fi | card → radio waves → E/B field → electrons in the antenna → inside the chip → mixer → ADC → OFDM → noisy QAM → packet + CRC → web page |
| CPU | package → die + clock → pipeline → binary adder → NAND gate from 4 transistors → transistor field → MOSFET → FinFET → silicon atoms, doping, field effect |
| Battery | pack → layer stack → ion/electron flow → graphite atoms → solvated ions through the separator → LiCoO₂ crystal → charging |

## Run locally

ES modules need a local server (opening `index.html` directly won't work).

```
start.bat                  # Windows: serves on :8137 and opens the browser
# or
python -m http.server 8137 # then open http://localhost:8137
```

- `?idle` gives a UI-free looping hero (assemble → explode → spin), for a portfolio card or iframe.
- `?t=120` opens at a given timeline second. Keys: `←` / `→` previous / next step, `D` simple ↔ deep dive.
- Console: `__episode.jump(t)` jumps to any time.

## Structure

```
index.html          tabs, panel + import map (three@0.170.0, gsap@3.12.5 from CDN)
css/style.css
js/main.js          renderer, post-processing, scroll ↔ timeline, navigation, explanation panel
js/labels.js        callout labels (dot + leader line + text) projected from 3D
js/common.js        materials, helpers, thick lines, text sprites
js/scenes/laptop.js laptop model, explode rig, intro/outro chapters, idle loop
js/scenes/wifi.js   js/scenes/cpu.js   js/scenes/battery.js
```

Each chapter returns `{ title, tl, steps, outline, update }`. `tl` is a GSAP timeline added to one master timeline that scroll position scrubs (110 px per timeline second). Scroll-driven values (what's shown, camera, progress of a process) live in state objects on that timeline; continuous motion (waves, electrons, clock ticks) runs on real time in `update(now, dt)`, so scenes stay alive when you stop scrolling. To add a chapter (screen, RAM/SSD, cooling, quantum), write a new `scenes/*.js` and add it to the `chapters` array in `main.js`.

## Deploy (later)

It's fully static: push the folder to a GitHub repo and enable GitHub Pages.

## Realism

- Lighting: the studio HDRI "Studio Small 09" from Poly Haven (CC0), loaded at runtime; falls back to a procedural room if offline.
- Rendering: a single direct draw per frame (MSAA, shadows, no post-processing); drops to 1× resolution automatically if the frame rate falls.
- `js/realism.js` generates every surface procedurally: brushed aluminium, PCB traces/vias/silkscreen, laser-etched chip markings, battery and SSD labels, keyboard legends, speaker grilles, the cover glass and the desktop on screen. No paid or downloaded models.

## Look & feel

- Aesthetic: minimal. One typeface (Inter), white on black, no boxes, blur or glow.
- Laptop: slim unibody body in matte stone-graphite, warm low key backlight, a polished ring emblem, standing in a soft pool of light with a faint breathing halo.
- Navigation: tabs per technology, a thin segmented line for the sections, ← / → in the panel and on the keyboard, `D` for simple/deeper.
- Run with `start.bat` (or `python serve.py`), which serves files with no-cache headers so reloads always show the latest version.
