// Isometric station illustration. Builds one inline SVG and returns an
// `update(view)` function that only reflects model readings — the scene keeps
// no inventory or money of its own.
//
// World units are metres (not to scale: the tank and people are enlarged for
// legibility). x runs to the lower right, y to the lower left, z up.

import { formatKobo, formatMl } from "../model.mjs";

export const VIEW = Object.freeze({ w: 1200, h: 900 });

// Camera crops used on narrow screens, keyed by guided step.
export const CAMERAS = Object.freeze({
  full: [0, 0, 1200, 900],
  delivery: [40, 110, 600, 600],
  station: [300, 0, 900, 640],
  dispense: [330, 300, 620, 560],
  close: [0, 0, 1200, 900],
});

const S = 19;
const OX = 465;
const OY = 70;
const C = Math.cos(Math.PI / 6);
const H = 0.5;

const INK = "#1d2a44";
const PAL = {
  paper: "#f3e9d2",
  concreteTop: "#e4dccb",
  concreteSide: "#cfc5b0",
  slab: "#d6ccb7",
  soil: "#b9784f",
  soilDark: "#9a5f3d",
  soilDeep: "#7f4c31",
  backfill: "#e2c995",
  red: "#d23c2f",
  redDark: "#a92a20",
  green: "#1f8a5b",
  greenDark: "#166544",
  cream: "#fbf6ea",
  steel: "#a9b4bf",
  steelLight: "#d5dce2",
  glass: "#2a3d5e",
  glassLight: "#4f6b93",
  fuel: "#f0ac2a",
  fuelDeep: "#d98a14",
  fuelTop: "#f8d26a",
  car: "#3a77a6",
  tyre: "#232a36",
  yellow: "#f2c230",
  shadow: "rgba(120, 70, 30, 0.2)",
};

// ---------------------------------------------------------------------------
// projection and drawing helpers

export function P(x, y, z = 0) {
  return [OX + (x - y) * C * S, OY + (x + y) * H * S - z * S];
}
const r1 = (n) => Math.round(n * 10) / 10;
const pt = ([a, b]) => `${r1(a)},${r1(b)}`;
const pts3 = (list) => list.map((q) => pt(P(...q))).join(" ");
const poly = (list, fill, extra = "") => `<polygon points="${pts3(list)}" fill="${fill}" ${extra}/>`;
const poly2 = (list, fill, extra = "") => `<polygon points="${list.map(pt).join(" ")}" fill="${fill}" ${extra}/>`;

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function shades(base) {
  return { top: mix(base, "#ffffff", 0.22), front: base, side: mix(base, INK, 0.2) };
}

/** Solid box with its three visible faces (+z top, +y front, +x side). */
function box(x, y, z, w, d, h, color, extra = "") {
  const c = typeof color === "string" ? shades(color) : color;
  const top = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
  const front = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
  const side = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
  return `<g class="ink" ${extra}>${poly(front, c.front)}${poly(side, c.side)}${poly(top, c.top)}</g>`;
}

/** Short warm shadow: footprint swept toward +x/+y on the ground. */
function shadow(x, y, w, d, len = 0.9) {
  const corners = [];
  for (const [a, b] of [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]) {
    corners.push(P(a, b, 0), P(a + len * 0.6, b + len, 0));
  }
  return poly2(hull(corners), PAL.shadow, 'class="shade"');
}

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function ring(axis, c, r, from = 0, to = Math.PI * 2, n = 36) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    const a = r * Math.cos(t);
    const b = r * Math.sin(t);
    if (axis === "x") out.push([c[0], c[1] + a, c[2] + b]);
    else if (axis === "y") out.push([c[0] + a, c[1], c[2] + b]);
    else out.push([c[0] + a, c[1] + b, c[2]]);
  }
  return out;
}

/** Cylinder between two centres; the cap facing the viewer is drawn last. */
function cylinder(axis, c0, c1, r, color, extra = "") {
  const c = typeof color === "string" ? shades(color) : color;
  const body = hull([...ring(axis, c0, r), ...ring(axis, c1, r)].map((q) => P(...q)));
  return `<g class="ink" ${extra}>${poly2(body, c.front)}${poly(ring(axis, c1, r), c.top)}</g>`;
}

/** Band on a cylinder's surface between two angles (for stripes/highlights). */
function band(axis, c0, c1, r, from, to, fill, extra = "") {
  const a = ring(axis, c0, r, from, to, 12);
  const b = ring(axis, c1, r, from, to, 12).reverse();
  return poly([...a, ...b], fill, extra);
}

function plane(kind, x0, y0, z0) {
  const [e, f] = P(x0, y0, z0);
  const m = {
    front: [C * S, H * S, 0, S], // u → +x, w → −z
    side: [C * S, -H * S, 0, S], // u → −y, w → −z
    top: [C * S, H * S, -C * S, H * S], // u → +x, w → +y
  }[kind];
  return `matrix(${m.map(r1).join(" ")} ${r1(e)} ${r1(f)})`;
}

function polyline3(list) {
  return list.map((q, i) => `${i ? "L" : "M"}${pt(P(...q))}`).join(" ");
}

function cubic3(a, b, c, d) {
  return `M${pt(P(...a))} C${pt(P(...b))} ${pt(P(...c))} ${pt(P(...d))}`;
}

function pipe(d, cls = "") {
  return `<path class="pipe-outer ${cls}" d="${d}"/><path class="pipe-inner ${cls}" d="${d}"/>`;
}

function label(text, anchor, at, { id = "", align = "middle" } = {}) {
  const [ax, ay] = anchor;
  const [lx, ly] = at;
  const w = text.length * 8.6 + 20;
  const x = align === "start" ? lx : align === "end" ? lx - w : lx - w / 2;
  return `<g class="callout" ${id ? `id="${id}"` : ""}>
    <path class="leader" d="M${r1(ax)},${r1(ay)} L${r1(lx)},${r1(ly)}"/>
    <circle class="leader-dot" cx="${r1(ax)}" cy="${r1(ay)}" r="3"/>
    <rect class="tag" x="${r1(x)}" y="${r1(ly - 13)}" width="${r1(w)}" height="26" rx="13"/>
    <text class="tag-text" x="${r1(x + w / 2)}" y="${r1(ly + 5)}" text-anchor="middle">${text}</text>
  </g>`;
}

// ---------------------------------------------------------------------------
// geometry constants shared by drawing and updates

const SLAB = { w: 40, d: 24, depth: 8 };
const CUT_Y = SLAB.d; // the front face is the cutaway plane
const TANK = { x0: 2.5, x1: 18.5, zc: -4.1, r: 2.25, head: 1.1 };
const TANKER = { barrel0: [1.7, 13.9, 2.45], barrel1: [9.4, 13.9, 2.45], r: 1.3 };
const FILL = [4.5, 23.55, 0];
const ATG_X = 9.2;
const STP_X = 15.9;
const RISER_X = 27;
const DISP = { x: 26.4, y: 18.5, w: 1.2, d: 3.1, z: 0.28, h: 2.47 };
const CAR = { x: 29, y: 17.6, w: 2, d: 4.6 };
const HOSE_OUT = [27.62, 21.25, 2.5];
const HOLSTER = [27.78, 19.15, 1.3];
const FILLER = [29.35, 22.24, 0.95];

/** Liquid height in a horizontal cylinder holding a volume fraction. */
export function liquidHeight(fraction, r) {
  const f = Math.min(1, Math.max(0, fraction));
  const area = (h) => r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(Math.max(0, 2 * r * h - h * h));
  const total = Math.PI * r * r;
  let lo = 0;
  let hi = 2 * r;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (area(mid) / total < f) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// static drawing

function defs() {
  const capsule = `<rect x="${TANK.x0}" y="${-(TANK.zc + TANK.r)}" width="${TANK.x1 - TANK.x0}" height="${TANK.r * 2}" rx="${TANK.head}" ry="${TANK.r}" transform="${plane("front", 0, CUT_Y, 0)}"/>`;
  return `<defs>
    <pattern id="ps-gravel" width="14" height="10" patternUnits="userSpaceOnUse">
      <rect width="14" height="10" fill="${PAL.backfill}"/>
      <circle cx="3" cy="3" r="1.6" fill="#cfae74"/><circle cx="10" cy="7" r="1.3" fill="#c9a66b"/>
      <circle cx="9" cy="2" r="0.8" fill="#f1dcaa"/>
    </pattern>
    <pattern id="ps-soil" width="40" height="22" patternUnits="userSpaceOnUse">
      <rect width="40" height="22" fill="${PAL.soil}"/>
      <path d="M0 15 Q10 11 20 15 T40 15" stroke="${PAL.soilDark}" stroke-width="1.4" fill="none" opacity="0.6"/>
      <circle cx="30" cy="6" r="1.4" fill="${PAL.soilDark}" opacity="0.6"/>
      <circle cx="8" cy="5" r="0.9" fill="#d29a6f"/>
    </pattern>
    <pattern id="ps-hazard" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="10" height="10" fill="${PAL.yellow}"/><rect width="5" height="10" fill="${INK}"/>
    </pattern>
    <pattern id="ps-paper" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${PAL.paper}"/><circle cx="1.5" cy="1.5" r="0.6" fill="#e8dbbd"/>
    </pattern>
    <linearGradient id="ps-tank-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a4a66"/><stop offset="0.55" stop-color="#56677f"/><stop offset="1" stop-color="#34445e"/>
    </linearGradient>
    <linearGradient id="ps-glow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff2c4" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="ps-tank-clip" clipPathUnits="userSpaceOnUse">${capsule}</clipPath>
  </defs>`;
}

function ground() {
  const { w, d, depth } = SLAB;
  const top = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]];
  const side = [[w, 0, 0], [w, d, 0], [w, d, -depth], [w, 0, -depth]];
  const front = [[0, d, 0], [w, d, 0], [w, d, -depth], [0, d, -depth]];

  // forecourt joints
  let joints = "";
  for (let x = 4; x < w; x += 4) joints += `<path class="joint" d="${polyline3([[x, 0, 0], [x, d, 0]])}"/>`;
  for (let y = 4; y < d; y += 4) joints += `<path class="joint" d="${polyline3([[0, y, 0], [w, y, 0]])}"/>`;

  // cut face strata, drawn flat then mapped onto the y = d plane
  const strata = `<g transform="${plane("front", 0, d, 0)}" class="plane">
    <rect x="0" y="0" width="${w}" height="${depth}" fill="url(#ps-soil)"/>
    <rect x="0" y="${depth - 1.1}" width="${w}" height="1.1" fill="${PAL.soilDeep}" opacity="0.55"/>
    <path d="M${TANK.x0 - 1.1} 0.9 L${TANK.x1 + 1.1} 0.9 L${TANK.x1 + 1.5} ${depth - 1.2} L${TANK.x0 - 1.5} ${depth - 1.2} Z" fill="url(#ps-gravel)"/>
    <rect x="0" y="0" width="${w}" height="0.45" fill="${PAL.slab}"/>
    <rect x="0" y="0.45" width="${w}" height="0.45" fill="#bfae8d"/>
    <rect x="${STP_X - 1}" y="0" width="2" height="${-(TANK.zc + TANK.r)}" fill="#c9bfa9" stroke="${INK}" stroke-width="0.06"/>
    <rect x="${STP_X - 0.88}" y="0.12" width="1.76" height="${-(TANK.zc + TANK.r) - 0.12}" fill="#8f8572"/>
    <rect x="${RISER_X - 0.8}" y="0" width="1.6" height="0.9" fill="#c9bfa9" stroke="${INK}" stroke-width="0.06"/>
  </g>`;
  return `<g id="ps-ground">
    <g class="ink">${poly(side, "url(#ps-soil)")}${poly(side, "rgba(29,42,68,0.22)")}</g>
    ${strata}
    <g class="ink">${poly(front, "none")}</g>
    <g class="ink">${poly(top, PAL.concreteTop)}</g>
    ${joints}
    <path class="kerb" d="${polyline3([[0, d, 0], [w, d, 0], [w, 0, 0]])}"/>
  </g>`;
}

function tankCutaway() {
  const { x0, x1, zc, r } = TANK;
  const capsule = `<rect x="${x0}" y="${-(zc + r)}" width="${x1 - x0}" height="${r * 2}" rx="${TANK.head}" ry="${r}"/>`;
  const bottom = zc - r;
  const top = zc + r;
  const fillTop = -0.05;
  // pipes in the cut plane (screen space)
  const fillPipe = polyline3([[FILL[0], CUT_Y, fillTop], [FILL[0], CUT_Y, top], [FILL[0], CUT_Y, bottom + 0.35]]);
  const vent = polyline3([[x0 + 0.7, CUT_Y, top - 0.1], [x0 + 0.7, CUT_Y, -1.25], [0.8, CUT_Y, -1.25], [0.8, CUT_Y, 0]]);
  const probe = polyline3([[ATG_X, CUT_Y, -0.05], [ATG_X, CUT_Y, bottom + 0.12]]);
  const stpColumn = polyline3([[STP_X, CUT_Y, -1.2], [STP_X, CUT_Y, bottom + 1.0]]);
  const product = polyline3([[STP_X, CUT_Y, -1.2], [RISER_X, CUT_Y, -1.2], [RISER_X, CUT_Y, -0.05]]);
  return `<g id="ps-tank">
    <g clip-path="url(#ps-tank-clip)">
      <g transform="${plane("front", 0, CUT_Y, 0)}"><rect x="${x0}" y="${-top}" width="${x1 - x0}" height="${2 * r}" fill="url(#ps-tank-wall)"/>
        ${[0.25, 0.5, 0.75].map((k) => `<path d="M${x0} ${-(bottom + 2 * r * k)} L${x1} ${-(bottom + 2 * r * k)}" stroke="#6b7c95" stroke-width="0.05" fill="none" opacity="0.6"/>`).join("")}
      </g>
      <polygon id="ps-fuel-surface" fill="${PAL.fuelTop}" points=""/>
      <polygon id="ps-fuel-section" fill="${PAL.fuel}" points=""/>
      <path id="ps-fuel-line" class="fuel-line" d=""/>
    </g>
    <g transform="${plane("front", 0, CUT_Y, 0)}" class="plane">
      ${capsule.replace("/>", ` fill="none" stroke="${INK}" stroke-width="0.34"/>`)}
      ${capsule.replace("/>", ` fill="none" stroke="#7d8b9e" stroke-width="0.18"/>`)}
    </g>
    ${pipe(vent)}
    ${pipe(fillPipe)}
    <path class="probe" d="${probe}"/>
    <g id="ps-atg-float">${(() => {
      const [a, b] = P(ATG_X, CUT_Y, 0);
      return `<rect class="ink" x="${r1(a - 7)}" y="${r1(b - 4)}" width="14" height="8" rx="3" fill="${PAL.red}"/>`;
    })()}</g>
    ${pipe(stpColumn)}
    ${pipe(product)}
    <g id="ps-stp">${(() => {
      const [a, b] = P(STP_X, CUT_Y, bottom + 0.55);
      return `<rect class="ink" x="${r1(a - 9)}" y="${r1(b - 16)}" width="18" height="28" rx="5" fill="${PAL.steel}"/>
        <rect x="${r1(a - 9)}" y="${r1(b + 6)}" width="18" height="5" fill="${INK}" opacity="0.65"/>
        <circle id="ps-stp-glow" cx="${r1(a)}" cy="${r1(b - 3)}" r="5" fill="${PAL.green}" opacity="0"/>`;
    })()}${(() => {
      const [a, b] = P(STP_X, CUT_Y, -1.2);
      return `<rect class="ink" x="${r1(a - 12)}" y="${r1(b - 10)}" width="24" height="17" rx="3" fill="${PAL.steelLight}"/>`;
    })()}</g>
    <path id="ps-flow-fill" class="flow" d="${polyline3([[FILL[0], CUT_Y, fillTop], [FILL[0], CUT_Y, bottom + 0.35]])}"/>
    <path id="ps-flow-product" class="flow" d="${polyline3([[STP_X, CUT_Y, bottom + 0.9], [STP_X, CUT_Y, -1.2], [RISER_X, CUT_Y, -1.2], [RISER_X, CUT_Y, -0.05]])}"/>
  </g>`;
}

function manholes() {
  const cover = (x, y, col = "#9a9182") => {
    const pts = ring("z", [x, y, 0.02], 0.55).map((q) => P(...q));
    return `<polygon class="ink" points="${pts.map(pt).join(" ")}" fill="${col}"/>`;
  };
  return `<g id="ps-covers">${cover(FILL[0], FILL[1], PAL.green)}${cover(ATG_X, 23.4)}${cover(STP_X, 23.4)}</g>`;
}

function shop() {
  const x = 2;
  const y = 1;
  const w = 10;
  const d = 5;
  const h = 3.6;
  const face = `<g transform="${plane("front", x, y + d, h)}" class="plane">
    <rect x="0" y="0.2" width="${w}" height="0.62" fill="${PAL.red}"/>
    <text x="${w / 2}" y="0.68" class="plane-text" font-size="0.48" text-anchor="middle" fill="#fff">SHOP · LUBES</text>
    <rect x="0.7" y="1.25" width="3.2" height="1.4" fill="${PAL.glass}" stroke="${INK}" stroke-width="0.06"/>
    <rect x="0.8" y="1.35" width="1.2" height="1.2" fill="${PAL.glassLight}" opacity="0.6"/>
    <rect x="4.5" y="1.25" width="1.5" height="${h - 1.25}" fill="${PAL.green}" stroke="${INK}" stroke-width="0.06"/>
    <rect x="6.6" y="1.25" width="2.7" height="1.4" fill="${PAL.glass}" stroke="${INK}" stroke-width="0.06"/>
    <rect x="6.7" y="1.35" width="1" height="1.2" fill="${PAL.glassLight}" opacity="0.6"/>
  </g>`;
  return `<g id="ps-shop">${shadow(x, y, w, d, 1.1)}${box(x, y, 0, w, d, h, PAL.cream)}${face}
    ${box(x - 0.25, y - 0.25, h, w + 0.5, d + 0.5, 0.45, PAL.green)}</g>`;
}

function powerHouse() {
  return `<g id="ps-power">
    ${shadow(13.5, 2, 2.6, 2.2, 0.8)}
    ${box(13.5, 2, 0, 2.6, 2.2, 1.5, "#c9b98e")}
    ${cylinder("z", [14.2, 2.6, 1.5], [14.2, 2.6, 2.3], 0.1, INK)}
    <g transform="${plane("front", 13.5, 4.2, 1.5)}" class="plane"><rect x="0.25" y="0.25" width="2.1" height="0.9" fill="#a99a70" stroke="${INK}" stroke-width="0.05"/>
      <text x="1.3" y="0.9" class="plane-text" font-size="0.42" text-anchor="middle" fill="${INK}">GEN</text></g>
    ${cylinder("z", [17.4, 3.6, 0], [17.4, 3.6, 1.4], 0.09, INK)}
    ${box(16.9, 3.3, 1.4, 1.0, 0.55, 1.15, PAL.steel)}
    <g transform="${plane("front", 16.9, 3.85, 2.55)}" class="plane">
      <circle id="ps-power-lamp" cx="0.5" cy="0.42" r="0.24" fill="#7a7f88" stroke="${INK}" stroke-width="0.05"/>
      <rect x="0.2" y="0.78" width="0.6" height="0.22" fill="${INK}"/>
    </g>
  </g>`;
}

function canopyColumns(which) {
  const cols = which === "back" ? [[22, 12], [34, 12]] : [[22, 19.6], [34, 19.6]];
  return cols.map(([x, y]) => `${shadow(x - 0.22, y - 0.22, 0.44, 0.44, 0.6)}${box(x - 0.22, y - 0.22, 0, 0.44, 0.44, 6.4, PAL.steelLight)}`).join("");
}

function canopyRoof() {
  const x = 21;
  const y = 11;
  const w = 14;
  const d = 9.6;
  const z = 6.4;
  const h = 0.9;
  const fascia = `<g transform="${plane("front", x, y + d, z + h)}" class="plane">
    <rect x="0" y="0" width="${w}" height="${h}" fill="${PAL.red}"/>
    <rect x="0" y="${h - 0.2}" width="${w}" height="0.2" fill="${PAL.green}"/>
    <text x="${w / 2}" y="0.56" class="plane-text" font-size="0.46" text-anchor="middle" fill="#fff">PETROL · FILLING STATION</text>
  </g>
  <g transform="${plane("side", x + w, y + d, z + h)}" class="plane">
    <rect x="0" y="0" width="${d}" height="${h}" fill="${PAL.redDark}"/>
    <rect x="0" y="${h - 0.2}" width="${d}" height="0.2" fill="${PAL.greenDark}"/>
  </g>`;
  const light = (cx, cy) => {
    const pts = ring("z", [cx, cy, 0.01], 3.3).map((q) => P(...q));
    return `<polygon class="light-pool" points="${pts.map(pt).join(" ")}"/>`;
  };
  return {
    pools: `<g id="ps-light-pools">${light(27.2, 18.4)}${light(31.5, 17.6)}</g>`,
    roof: `<g id="ps-canopy">${box(x, y, z, w, d, h, { top: "#ebe5d8", front: PAL.red, side: PAL.redDark })}${fascia}
      <path id="ps-canopy-strip" class="canopy-strip" d="${polyline3([[x + 0.4, y + d, z], [x + w - 0.4, y + d, z]])}"/></g>`,
  };
}

function tanker() {
  const [b0, b1, r] = [TANKER.barrel0, TANKER.barrel1, TANKER.r];
  const wheel = (x) => {
    const tyre = ring("y", [x, 15.12, 0.52], 0.52).map((q) => P(...q));
    const hub = ring("y", [x, 15.14, 0.52], 0.24).map((q) => P(...q));
    return `<polygon class="ink" points="${tyre.map(pt).join(" ")}" fill="${PAL.tyre}"/><polygon points="${hub.map(pt).join(" ")}" fill="${PAL.steel}"/>`;
  };
  const domes = [3.1, 5.5, 7.9].map((x) => cylinder("z", [x, 13.9, 3.65], [x, 13.9, 3.95], 0.42, PAL.steelLight)).join("");
  const sight = `<g transform="${plane("front", 6.3, 15.22, 3.25)}" class="plane">
    <rect x="0" y="0" width="0.8" height="1.9" rx="0.12" fill="${PAL.glass}" stroke="${INK}" stroke-width="0.08"/>
    <rect id="ps-tanker-level" x="0.1" y="0.1" width="0.6" height="1.7" fill="${PAL.fuel}"/>
    <path d="M0.1 0.525 h0.25 M0.1 0.95 h0.35 M0.1 1.375 h0.25" stroke="${INK}" stroke-width="0.05"/>
  </g>`;
  const lettering = `<g transform="${plane("front", 1.9, 15.2, 2.85)}" class="plane">
    <text x="0" y="0" class="plane-text" font-size="0.62" fill="${INK}">PETROL</text>
    <text x="0" y="0.62" class="plane-text" font-size="0.36" fill="${PAL.redDark}">PMS · FLAMMABLE</text>
  </g>`;
  const cabFace = `<g transform="${plane("side", 12.6, 15.1, 3.3)}" class="plane">
    <rect x="0.3" y="0.25" width="1.8" height="0.95" rx="0.1" fill="${PAL.glass}" stroke="${INK}" stroke-width="0.06"/>
    <rect x="0.45" y="0.35" width="0.6" height="0.75" fill="${PAL.glassLight}" opacity="0.6"/>
    <rect x="0.35" y="1.9" width="1.7" height="0.35" fill="${INK}" opacity="0.8"/>
    <circle cx="0.35" cy="2.05" r="0.15" fill="${PAL.yellow}"/><circle cx="2.05" cy="2.05" r="0.15" fill="${PAL.yellow}"/>
  </g>
  <g transform="${plane("front", 9.8, 15.1, 3.3)}" class="plane">
    <rect x="0.4" y="0.25" width="1.5" height="0.9" rx="0.1" fill="${PAL.glass}" stroke="${INK}" stroke-width="0.06"/>
    <rect x="0.3" y="1.5" width="2.2" height="0.08" fill="${INK}" opacity="0.5"/>
  </g>`;
  return `<g id="ps-tanker" class="vehicle">
    ${shadow(1.4, 12.6, 11.4, 2.7, 1.0)}
    ${box(1.4, 13.15, 0.8, 10.6, 1.5, 0.32, "#3a4152")}
    ${wheel(2.6)}${wheel(3.75)}${wheel(10.9)}
    ${cylinder("x", b0, b1, r, { front: "#e9ecef", top: "#f6f7f8" })}
    ${band("x", b0, b1, r, -0.7, -0.35, PAL.red, 'class="ink-thin"')}
    ${band("x", b0, b1, r, 0.9, 1.25, "#ffffff", 'opacity="0.75"')}
    ${domes}
    ${lettering}
    ${sight}
    ${box(1.8, 14.9, 0.75, 0.7, 0.45, 0.5, PAL.steel)}
    ${box(4.2, 14.85, 0.85, 3.4, 0.35, 0.28, "#2d3340")}
    ${box(9.8, 12.7, 0.9, 2.8, 2.4, 2.4, PAL.red)}
    ${box(9.75, 12.65, 3.3, 2.9, 2.5, 0.2, PAL.redDark)}
    ${cabFace}
  </g>`;
}

function tankerChip() {
  const [x, y] = P(6.4, 13.9, 5.1);
  return `<g id="ps-tanker-chip" class="chip vehicle">
    <rect x="${r1(x - 78)}" y="${r1(y - 26)}" width="156" height="44" rx="10"/>
    <text class="chip-k" x="${r1(x)}" y="${r1(y - 9)}" text-anchor="middle">TANKER LOAD</text>
    <text class="chip-v" id="ps-tanker-text" x="${r1(x)}" y="${r1(y + 11)}" text-anchor="middle">—</text>
  </g>`;
}

function island() {
  const { x, y, w, d, z, h } = DISP;
  const display = `<g transform="${plane("side", x + w, y + d, z + h)}" class="plane">
    <rect x="0.25" y="0.18" width="2.6" height="1.05" rx="0.08" fill="${INK}"/>
    <rect id="ps-disp-screen" x="0.33" y="0.25" width="2.44" height="0.9" rx="0.05" fill="#24402f"/>
    <text id="ps-disp-amount" x="2.68" y="0.55" class="plane-text lcd" font-size="0.26" text-anchor="end">0.00</text>
    <text id="ps-disp-litres" x="2.68" y="0.85" class="plane-text lcd" font-size="0.26" text-anchor="end">0.000</text>
    <text id="ps-disp-price" x="2.68" y="1.08" class="plane-text lcd" font-size="0.17" text-anchor="end">—</text>
    <rect x="0.5" y="1.5" width="0.9" height="0.6" rx="0.05" fill="#d7d0bf" stroke="${INK}" stroke-width="0.04"/>
    ${[0, 1, 2].map((i) => [0, 1].map((j) => `<rect x="${0.58 + i * 0.27}" y="${1.57 + j * 0.25}" width="0.2" height="0.18" fill="${INK}" opacity="0.55"/>`).join("")).join("")}
    <rect x="0" y="${h - 0.5}" width="${d}" height="0.5" fill="${PAL.red}"/>
  </g>
  <g transform="${plane("front", x, y + d, z + h)}" class="plane">
    <rect x="0" y="${h - 0.5}" width="${w}" height="0.5" fill="${PAL.red}"/>
    <rect x="0.15" y="0.3" width="${w - 0.3}" height="0.5" fill="${PAL.green}"/>
  </g>
  <g transform="${plane("side", x + w + 0.05, y + d + 0.05, z + h + 0.4)}" class="plane">
    <text x="${d / 2}" y="0.3" class="plane-text" font-size="0.3" text-anchor="middle" fill="#fff">PETROL · PMS</text>
  </g>`;
  return `<g id="ps-island">
    ${shadow(26.2, 17, 1.6, 6.4, 0.5)}
    ${box(26.2, 17, 0, 1.6, 6.4, 0.28, { top: "#efe9dc", front: "url(#ps-hazard)", side: "#cfc5b0" })}
    ${shadow(x, y, w, d, 0.8)}
    ${box(x, y, z, w, d, h, { top: "#fffdf7", front: PAL.cream, side: "#e6dfcf" })}
    ${box(x - 0.05, y - 0.05, z + h, w + 0.1, d + 0.1, 0.4, PAL.red)}
    ${display}
    ${box(27.6, 18.95, 1.1, 0.25, 0.4, 0.35, "#5a6476")}
  </g>`;
}

function eStop() {
  const [x, y] = P(22.22, 19.82, 1.6);
  return `<g id="ps-estop">
    <rect class="ink" x="${r1(x - 8)}" y="${r1(y - 9)}" width="16" height="18" rx="2" fill="${PAL.yellow}"/>
    <circle id="ps-estop-lamp" class="ink" cx="${r1(x)}" cy="${r1(y)}" r="5.5" fill="${PAL.red}"/>
  </g>`;
}

function car() {
  const { x, y, w, d } = CAR;
  const wheel = (wy) => {
    const tyre = ring("x", [x + w + 0.02, wy, 0.38], 0.38).map((q) => P(...q));
    const hub = ring("x", [x + w + 0.04, wy, 0.38], 0.17).map((q) => P(...q));
    return `<polygon class="ink" points="${tyre.map(pt).join(" ")}" fill="${PAL.tyre}"/><polygon points="${hub.map(pt).join(" ")}" fill="${PAL.steelLight}"/>`;
  };
  const cab = { x0: x + 0.15, x1: x + w - 0.15, yb0: y + 1.0, yb1: y + 4.0, yt0: y + 1.55, yt1: y + 3.6, z0: 1.0, z1: 1.6 };
  const c = shades(PAL.car);
  const rear = [[cab.x0, cab.yb1, cab.z0], [cab.x1, cab.yb1, cab.z0], [cab.x1, cab.yt1, cab.z1], [cab.x0, cab.yt1, cab.z1]];
  const side = [[cab.x1, cab.yb0, cab.z0], [cab.x1, cab.yb1, cab.z0], [cab.x1, cab.yt1, cab.z1], [cab.x1, cab.yt0, cab.z1]];
  const roof = [[cab.x0, cab.yt0, cab.z1], [cab.x1, cab.yt0, cab.z1], [cab.x1, cab.yt1, cab.z1], [cab.x0, cab.yt1, cab.z1]];
  const sideGlass = [[cab.x1, cab.yb0 + 0.25, cab.z0 + 0.06], [cab.x1, cab.yb1 - 0.15, cab.z0 + 0.06], [cab.x1, cab.yt1 - 0.06, cab.z1 - 0.07], [cab.x1, cab.yt0 + 0.12, cab.z1 - 0.07]];
  const rearFace = `<g transform="${plane("front", x, y + d, 1.0)}" class="plane">
    <rect x="0.12" y="0.12" width="0.4" height="0.18" fill="${PAL.red}" stroke="${INK}" stroke-width="0.04"/>
    <rect x="${w - 0.52}" y="0.12" width="0.4" height="0.18" fill="${PAL.red}" stroke="${INK}" stroke-width="0.04"/>
    <rect x="0.7" y="0.3" width="0.6" height="0.2" fill="#f4f0e6" stroke="${INK}" stroke-width="0.04"/>
    <rect x="0.18" y="-0.02" width="0.34" height="0.22" rx="0.04" fill="${c.side}" stroke="${INK}" stroke-width="0.04"/>
  </g>`;
  return `<g id="ps-car" class="vehicle">
    ${shadow(x, y, w, d, 0.7)}
    ${box(x, y, 0.3, w, d, 0.7, PAL.car)}
    ${wheel(y + 0.85)}${wheel(y + 3.7)}
    <g class="ink">${poly(rear, PAL.glass)}${poly(side, c.side)}${poly(sideGlass, PAL.glassLight)}${poly(roof, c.top)}</g>
    <path class="ink-thin" d="${polyline3([[cab.x1, cab.yb0 + 1.6, cab.z0 + 0.06], [cab.x1, cab.yb0 + 1.5, cab.z1 - 0.07]])}" stroke="${c.side}" stroke-width="2.5"/>
    ${rearFace}
  </g>`;
}

function carChip() {
  const [x, y] = P(30, 19.9, 3.4);
  return `<g id="ps-car-chip" class="chip vehicle">
    <rect x="${r1(x - 74)}" y="${r1(y - 30)}" width="148" height="52" rx="10"/>
    <text class="chip-k" x="${r1(x)}" y="${r1(y - 13)}" text-anchor="middle">CAR TANK</text>
    <rect class="bar-bg" x="${r1(x - 58)}" y="${r1(y - 5)}" width="116" height="9" rx="4.5"/>
    <rect id="ps-car-bar" class="bar-fill" x="${r1(x - 58)}" y="${r1(y - 5)}" width="0" height="9" rx="4.5"/>
    <text class="chip-v small" id="ps-car-text" x="${r1(x)}" y="${r1(y + 18)}" text-anchor="middle">—</text>
  </g>`;
}

function attendant() {
  const [x, y] = P(28.55, 23.55, 0);
  return `<g id="ps-attendant" transform="translate(${r1(x)} ${r1(y)})">
    <ellipse cx="4" cy="1" rx="10" ry="3" fill="${PAL.shadow}"/>
    <path class="ink" d="M-4 0 L-3 -15 L1 -15 L0 0 Z" fill="${INK}"/>
    <path class="ink" d="M1 0 L2 -15 L6 -15 L5 0 Z" fill="#2c3a58"/>
    <path class="ink" d="M-6 -14 Q-6 -29 1 -29 Q8 -29 8 -14 Z" fill="${PAL.green}"/>
    <path d="M-5 -20 H7" stroke="${PAL.yellow}" stroke-width="2.4"/>
    <path class="ink" d="M7 -26 Q13 -21 12 -15" fill="none" stroke-width="3.4"/>
    <path class="ink" d="M7 -26 Q13 -21 12 -15" fill="none" stroke="${PAL.green}" stroke-width="1.6"/>
    <circle class="ink" cx="1" cy="-34" r="5.2" fill="#8a5a3c"/>
    <path class="ink" d="M-4.5 -36 Q1 -43 6.5 -36 Z" fill="${PAL.red}"/>
    <path d="M5 -36.5 h4" stroke="${PAL.red}" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

function priceSign() {
  const px = 37.6;
  const py = 20.6;
  const panel = { x: 36, y: 20.4, w: 3.2, d: 0.42, z: 4.1, h: 3.9 };
  const face = `<g transform="${plane("front", panel.x, panel.y + panel.d, panel.z + panel.h)}" class="plane">
    <rect id="ps-sign-face" x="0.12" y="0.12" width="${panel.w - 0.24}" height="${panel.h - 0.24}" fill="${PAL.cream}"/>
    <rect x="0.12" y="0.12" width="${panel.w - 0.24}" height="0.8" fill="${PAL.green}"/>
    <text x="${panel.w / 2}" y="0.68" class="plane-text" font-size="0.5" text-anchor="middle" fill="#fff">PETROL</text>
    <text x="${panel.w / 2}" y="1.32" class="plane-text" font-size="0.3" text-anchor="middle" fill="${INK}">PMS · per litre</text>
    <rect x="0.3" y="1.5" width="${panel.w - 0.6}" height="1.1" rx="0.08" fill="${INK}"/>
    <text id="ps-sign-price" x="${panel.w / 2}" y="2.32" class="plane-text sign-digits" font-size="0.72" text-anchor="middle">— — —</text>
    <rect id="ps-open-plate" x="0.3" y="2.85" width="${panel.w - 0.6}" height="0.75" rx="0.08" fill="#7a7f88"/>
    <text id="ps-open-text" x="${panel.w / 2}" y="3.38" class="plane-text" font-size="0.42" text-anchor="middle" fill="#fff">CLOSED</text>
  </g>`;
  return `<g id="ps-sign">
    ${shadow(px - 0.4, py - 0.3, 0.8, 0.6, 1.4)}
    ${box(px - 0.45, py - 0.3, 0, 0.9, 0.6, 0.5, "#d2c8b4")}
    ${cylinder("z", [px - 0.7, py, 0.5], [px - 0.7, py, panel.z], 0.13, PAL.steel)}
    ${cylinder("z", [px + 0.7, py, 0.5], [px + 0.7, py, panel.z], 0.13, PAL.steel)}
    ${box(panel.x, panel.y, panel.z, panel.w, panel.d, panel.h, { top: "#ffffff", front: PAL.red, side: PAL.redDark })}
    ${face}
  </g>`;
}

function ventRiser() {
  return `<g id="ps-vent">${cylinder("z", [0.8, 23.6, 0], [0.8, 23.6, 5.0], 0.1, PAL.steel)}
    ${cylinder("z", [0.8, 23.6, 5.0], [0.8, 23.6, 5.3], 0.28, PAL.green)}</g>`;
}

function hoses() {
  const holstered = cubic3(HOSE_OUT, [28.5, 21.6, 0.7], [28.3, 19.4, 0.6], HOLSTER);
  const toCar = cubic3(HOSE_OUT, [28.3, 22.6, 0.4], [28.9, 23.0, 0.4], FILLER);
  const tankerValve = [2.15, 15.35, 0.95];
  const delivery = cubic3(tankerValve, [2.2, 19.2, 0.05], [4.1, 20.8, 0.05], [FILL[0], FILL[1] - 0.1, 0.1]);
  const [hx, hy] = P(...HOLSTER);
  const [fx, fy] = P(...FILLER);
  return {
    dispenser: `<g id="ps-hose">
      <path id="ps-hose-path" class="hose" d="${holstered}" data-holstered="${holstered}" data-car="${toCar}"/>
      <path id="ps-flow-hose" class="flow" d="${toCar}"/>
      <g id="ps-nozzle" data-holstered="${r1(hx)},${r1(hy)}" data-car="${r1(fx)},${r1(fy)}" transform="translate(${r1(hx)} ${r1(hy)})">
        <path class="ink" d="M-3 -6 L6 -6 L9 2 L3 2 Z" fill="${PAL.green}"/>
        <path class="ink" d="M6 -4 L13 -1" stroke-width="3.2"/>
      </g>
    </g>`,
    delivery: `<g id="ps-delivery-hose" class="vehicle">
      <path class="hose" d="${delivery}"/>
      <path id="ps-flow-delivery" class="flow" d="${delivery}"/>
    </g>`,
  };
}

function meterCallout() {
  const x = 878;
  const y = 34;
  const anchor = P(27.62, 20.1, 2.2);
  return `<g id="ps-meter-callout">
    <path class="leader long" d="M${r1(anchor[0])},${r1(anchor[1])} C${r1(anchor[0] + 120)},${r1(anchor[1] - 40)} ${x - 60},${y + 220} ${x + 30},${y + 196}"/>
    <circle class="leader-dot" cx="${r1(anchor[0])}" cy="${r1(anchor[1])}" r="4"/>
    <rect class="meter-frame" x="${x}" y="${y}" width="292" height="200" rx="16"/>
    <rect class="meter-head" x="${x}" y="${y}" width="292" height="34" rx="16"/>
    <rect x="${x}" y="${y + 18}" width="292" height="16" fill="${PAL.red}"/>
    <text class="meter-title" x="${x + 16}" y="${y + 23}">PUMP 1 · PETROL</text>
    <text id="ps-meter-state" class="meter-state" x="${x + 276}" y="${y + 23}" text-anchor="end">IDLE</text>
    <g id="ps-meter-screen">
      <rect class="meter-glass" x="${x + 14}" y="${y + 44}" width="264" height="142" rx="8"/>
      <text class="meter-k" x="${x + 26}" y="${y + 70}">AMOUNT ₦</text>
      <text id="ps-meter-amount" class="meter-v big" x="${x + 266}" y="${y + 82}" text-anchor="end">0.00</text>
      <text class="meter-k" x="${x + 26}" y="${y + 116}">LITRES</text>
      <text id="ps-meter-litres" class="meter-v big" x="${x + 266}" y="${y + 128}" text-anchor="end">0.000</text>
      <text class="meter-k" x="${x + 26}" y="${y + 158}">PRICE ₦/L</text>
      <text id="ps-meter-price" class="meter-v" x="${x + 266}" y="${y + 164}" text-anchor="end">—</text>
      <text id="ps-meter-lock" class="meter-lock" x="${x + 26}" y="${y + 178}"></text>
    </g>
  </g>`;
}

function tankGauge() {
  const x = 26;
  const y = 642;
  const anchor = P(ATG_X, CUT_Y, TANK.zc - TANK.r + 0.12);
  return `<g id="ps-tank-gauge">
    <path class="leader" d="M${r1(anchor[0])},${r1(anchor[1])} L${r1(anchor[0] - 20)},${y}"/>
    <circle class="leader-dot" cx="${r1(anchor[0])}" cy="${r1(anchor[1])}" r="4"/>
    <rect class="gauge-frame" x="${x}" y="${y}" width="300" height="168" rx="16"/>
    <text class="gauge-title" x="${x + 18}" y="${y + 28}">TANK GAUGE · PETROL</text>
    <text id="ps-gauge-litres" class="gauge-big" x="${x + 18}" y="${y + 72}">—</text>
    <text id="ps-gauge-pct" class="gauge-pct" x="${x + 282}" y="${y + 72}" text-anchor="end">—</text>
    <rect class="bar-bg" x="${x + 18}" y="${y + 86}" width="264" height="16" rx="8"/>
    <rect id="ps-gauge-bar" class="bar-fill fuel" x="${x + 18}" y="${y + 86}" width="0" height="16" rx="8"/>
    <text id="ps-gauge-space" class="gauge-small" x="${x + 18}" y="${y + 126}">—</text>
    <text id="ps-gauge-cap" class="gauge-small muted" x="${x + 18}" y="${y + 150}">—</text>
  </g>`;
}

function labels() {
  return `<g id="ps-labels">
    ${label("Vent", P(0.8, 23.6, 5.3), [70, 300])}
    ${label("Fill point", P(FILL[0], FILL[1], 0), [96, 360], { align: "end" })}
    ${label("Underground tank", P(TANK.x0 + 0.3, CUT_Y, TANK.zc - 1.2), [104, 560], { align: "middle" })}
    ${label("Gauge probe", P(ATG_X, CUT_Y, -0.6), [300, 392], { align: "middle" })}
    ${label("Submersible pump", P(STP_X, CUT_Y, TANK.zc - TANK.r + 0.8), [420, 680], { align: "start" })}
    ${label("Product line", P(22, CUT_Y, -1.2), [560, 640], { align: "start" })}
    ${label("Nozzle", P(...HOLSTER), [652, 418], { align: "start" })}
    ${label("Price sign", P(37.6, 20.6, 8), [850, 420], { align: "start" })}
    ${label("Power", P(17.4, 3.85, 2.2), [790, 120], { align: "start" })}
    ${label("Emergency stop", P(22.22, 19.82, 1.6), [418, 470], { align: "end" })}
    ${label("Attendant", P(28.55, 23.55, 1.4), [700, 712], { align: "start" })}
    ${label("Delivery hose", P(2.9, 19.6, 0.05), [70, 420], { align: "start" })}
  </g>`;
}

function stamp() {
  return `<g id="ps-closed-stamp" opacity="0">
    <g transform="translate(980 760) rotate(-8)">
      <rect x="-150" y="-44" width="300" height="88" rx="12" fill="none" stroke="${PAL.red}" stroke-width="5"/>
      <text x="0" y="-4" text-anchor="middle" class="stamp-big">DAY CLOSED</text>
      <text x="0" y="26" text-anchor="middle" class="stamp-small">stock reconciled · see summary</text>
    </g>
  </g>`;
}

/** Full static markup. Dynamic attributes are filled by update(). */
export function sceneMarkup() {
  const canopy = canopyRoof();
  const hose = hoses();
  return `<svg class="scene-svg" viewBox="${CAMERAS.full.join(" ")}" role="img" aria-labelledby="ps-scene-title ps-scene-desc" xmlns="http://www.w3.org/2000/svg">
    <title id="ps-scene-title">Cutaway petrol station</title>
    <desc id="ps-scene-desc">An isometric filling station with the ground cut open to show the underground tank, pipes and submersible pump. A tanker, dispenser, car, attendant and price sign sit on the forecourt.</desc>
    ${defs()}
    <rect x="-400" y="-400" width="2000" height="1700" fill="url(#ps-paper)"/>
    ${ground()}
    ${tankCutaway()}
    ${manholes()}
    ${canopy.pools}
    ${shop()}
    ${powerHouse()}
    ${canopyColumns("back")}
    ${tanker()}
    ${hose.delivery}
    ${ventRiser()}
    ${island()}
    ${car()}
    ${hose.dispenser}
    ${attendant()}
    ${canopyColumns("front")}
    ${eStop()}
    ${canopy.roof}
    ${priceSign()}
    ${labels()}
    ${tankerChip()}
    ${carChip()}
    ${meterCallout()}
    ${tankGauge()}
    ${stamp()}
  </svg>`;
}

// ---------------------------------------------------------------------------
// dynamic updates

function setAttr(el, name, value) {
  if (el && el.getAttribute(name) !== String(value)) el.setAttribute(name, value);
}
function setText(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

/** Bind to a rendered SVG; returns update(view) and a flow animator. */
export function bindScene(svg) {
  const $ = (id) => svg.querySelector(`#ps-${id}`);
  const el = Object.fromEntries(
    [
      "fuel-surface", "fuel-section", "fuel-line", "atg-float", "stp-glow",
      "flow-fill", "flow-product", "flow-hose", "flow-delivery",
      "tanker", "tanker-chip", "tanker-text", "tanker-level", "delivery-hose",
      "car", "car-chip", "car-bar", "car-text", "hose-path", "nozzle",
      "power-lamp", "light-pools", "canopy-strip", "sign-face", "sign-price", "open-plate", "open-text",
      "disp-screen", "disp-amount", "disp-litres", "disp-price",
      "meter-state", "meter-amount", "meter-litres", "meter-price", "meter-lock", "meter-screen",
      "gauge-litres", "gauge-pct", "gauge-bar", "gauge-space", "gauge-cap",
      "estop-lamp", "closed-stamp",
    ].map((k) => [k, $(k)]),
  );
  const flows = ["flow-fill", "flow-product", "flow-hose", "flow-delivery"];

  function update(v) {
    const { tank, tanker, vehicle, meter, flows: flowing, station, nozzle } = v;

    // underground tank liquid (height from volume in a horizontal cylinder)
    const h = liquidHeight(tank.fraction, TANK.r);
    const zf = TANK.zc - TANK.r + h;
    const dz = zf - TANK.zc;
    const halfChord = Math.sqrt(Math.max(0, TANK.r * TANK.r - dz * dz));
    const inset = TANK.head * (1 - Math.sqrt(Math.max(0, 1 - (dz / TANK.r) ** 2)));
    const xa = TANK.x0 + inset;
    const xb = TANK.x1 - inset;
    const empty = tank.stockMl === 0;
    setAttr(el["fuel-surface"], "points", empty ? "" : pts3([[xa, CUT_Y, zf], [xb, CUT_Y, zf], [xb, CUT_Y - halfChord, zf], [xa, CUT_Y - halfChord, zf]]));
    setAttr(el["fuel-section"], "points", empty ? "" : pts3([[TANK.x0, CUT_Y, TANK.zc - TANK.r - 0.1], [TANK.x1, CUT_Y, TANK.zc - TANK.r - 0.1], [TANK.x1, CUT_Y, zf], [TANK.x0, CUT_Y, zf]]));
    setAttr(el["fuel-line"], "d", empty ? "" : polyline3([[xa, CUT_Y, zf], [xb, CUT_Y, zf]]));
    const [, floatY] = P(ATG_X, CUT_Y, Math.max(zf, TANK.zc - TANK.r + 0.15));
    const [, baseY] = P(ATG_X, CUT_Y, 0);
    setAttr(el["atg-float"], "transform", `translate(0 ${r1(floatY - baseY)})`);

    setText(el["gauge-litres"], formatMl(tank.stockMl, 0));
    setText(el["gauge-pct"], `${Math.floor(tank.fraction * 1000) / 10}%`);
    setAttr(el["gauge-bar"], "width", r1(264 * tank.fraction));
    setText(el["gauge-space"], `Space for ${formatMl(tank.ullageMl, 0)}`);
    setText(el["gauge-cap"], `Capacity ${formatMl(tank.capacityMl, 0)} · not to scale`);

    // tanker
    svg.classList.toggle("has-tanker", tanker.present);
    svg.classList.toggle("hose-on", tanker.hoseConnected);
    if (tanker.present) {
      setText(el["tanker-text"], formatMl(tanker.ml, 0));
      const full = 1.7;
      const level = full * tanker.fraction;
      setAttr(el["tanker-level"], "y", r1(0.1 + full - level));
      setAttr(el["tanker-level"], "height", Math.max(0, level).toFixed(3));
    }

    // car
    svg.classList.toggle("has-car", vehicle.present);
    if (vehicle.present) {
      setAttr(el["car-bar"], "width", r1(116 * vehicle.fraction));
      setText(el["car-text"], `${formatMl(vehicle.fuelMl, 1, { unit: false })} of ${formatMl(vehicle.capacityMl, 0)}`);
    }
    const inCar = nozzle === "in-vehicle";
    setAttr(el["hose-path"], "d", el["hose-path"].dataset[inCar ? "car" : "holstered"]);
    setAttr(el.nozzle, "transform", `translate(${el.nozzle.dataset[inCar ? "car" : "holstered"].replace(",", " ")})`);

    // power, open, e-stop
    const power = station.powerOn;
    svg.classList.toggle("power-on", power);
    svg.classList.toggle("power-cut", station.powerCause === "power-cut");
    setAttr(el["power-lamp"], "fill", power ? "#34c27a" : station.powerCause === "power-cut" ? PAL.red : "#7a7f88");
    setAttr(el["sign-face"], "fill", power ? "#fffbea" : "#e6dccb");
    setText(el["sign-price"], station.priceKobo == null ? "— — —" : formatKobo(station.priceKobo));
    const open = station.open;
    setAttr(el["open-plate"], "fill", open ? PAL.green : station.closedForDay ? PAL.redDark : "#7a7f88");
    setText(el["open-text"], open ? (power ? "OPEN" : "OPEN · NO POWER") : "CLOSED");
    svg.classList.toggle("estop", station.estop);
    setAttr(el["closed-stamp"], "opacity", station.closedForDay ? 1 : 0);

    // meter (dispenser face and callout read the same values)
    const amount = formatKobo(meter.chargeKobo, { symbol: false });
    // Three decimals (whole millilitres) so the shown volume always explains the charge.
    const litres = formatMl(meter.volumeMl, 3, { unit: false });
    const price = meter.priceKobo == null ? "—" : formatKobo(meter.priceKobo, { symbol: false });
    setText(el["disp-amount"], power ? amount : "");
    setText(el["disp-litres"], power ? litres : "");
    setText(el["disp-price"], power ? `₦${price}/L` : "");
    setAttr(el["disp-screen"], "fill", power ? "#24402f" : "#1c2433");
    svg.classList.toggle("meter-off", !power);
    setText(el["meter-amount"], power ? amount : "");
    setText(el["meter-litres"], power ? litres : "");
    setText(el["meter-price"], power ? price : "");
    const lockNote = meter.lockedPriceKobo != null && meter.lockedPriceKobo !== station.priceKobo
      ? `Sale locked at ₦${formatKobo(meter.lockedPriceKobo, { symbol: false })} · sign now ₦${formatKobo(station.priceKobo, { symbol: false })}`
      : meter.lockedPriceKobo != null ? "Price locked for this sale" : "";
    setText(el["meter-lock"], power ? lockNote : "");
    const meterState = !power ? "NO POWER" : station.estop ? "E-STOP" : flowing.dispense ? "PUMPING" : v.saleStatus === "stopped" ? "STOPPED" : meter.live ? "READY" : "IDLE";
    setText(el["meter-state"], meterState);

    // flow markers only on connected paths while the model is transferring
    svg.classList.toggle("flow-delivery", flowing.delivery);
    svg.classList.toggle("flow-dispense", flowing.dispense);
  }

  /** Advance dash markers; `phase` is real-time ms accumulated while flowing. */
  function animateFlow(phase) {
    const offset = r1(-(phase / 18) % 1000);
    for (const id of flows) setAttr(el[id], "stroke-dashoffset", offset);
  }

  return { update, animateFlow };
}
