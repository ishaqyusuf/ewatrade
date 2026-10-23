// Minimal SVG → PNG rasteriser for geometry previews without a browser.
// Supports the subset the scene uses: g/polygon/rect/circle/ellipse/path/text,
// matrix/translate/rotate/scale transforms, a CSS subset (descendant selectors
// with tag/#id/.class/:not(.class)), solid paints, pattern/gradient as an
// average colour, one level of userSpaceOnUse clip paths and nonzero fills.
// Text is drawn as translucent bars (no font engine) to check placement only.

import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- parsing

export function parseSvg(markup) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(markup))) {
    const top = stack.at(-1);
    if (m[1]) {
      stack.pop();
    } else if (m[2]) {
      const attrs = {};
      for (const a of m[3].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
      const node = { tag: m[2], attrs, children: [], parent: top };
      top.children.push(node);
      if (!m[4]) stack.push(node);
    } else if (m[5] && m[5].trim()) {
      top.children.push({ tag: "#text", text: m[5], parent: top, attrs: {}, children: [] });
    }
  }
  return root.children.find((c) => c.tag === "svg");
}

export function textOf(node) {
  return node.children.filter((c) => c.tag === "#text").map((c) => c.text).join("");
}

export function findById(node, id) {
  if (node.attrs?.id === id) return node;
  for (const c of node.children ?? []) {
    const hit = findById(c, id);
    if (hit) return hit;
  }
  return null;
}

/** Tiny DOM facade so scene.bindScene() can run in Node. */
export function fakeDom(svgNode) {
  const wrap = (node) => {
    if (!node) return null;
    const classSet = () => new Set((node.attrs.class ?? "").split(/\s+/).filter(Boolean));
    return {
      node,
      getAttribute: (k) => node.attrs[k] ?? null,
      setAttribute: (k, v) => {
        node.attrs[k] = String(v);
      },
      get textContent() {
        return textOf(node);
      },
      set textContent(v) {
        node.children = node.children.filter((c) => c.tag !== "#text");
        if (v) node.children.push({ tag: "#text", text: String(v), parent: node, attrs: {}, children: [] });
      },
      get dataset() {
        const out = {};
        for (const [k, v] of Object.entries(node.attrs)) {
          if (k.startsWith("data-")) out[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
        }
        return out;
      },
      classList: {
        toggle(name, on) {
          const set = classSet();
          const want = on === undefined ? !set.has(name) : Boolean(on);
          if (want) set.add(name);
          else set.delete(name);
          node.attrs.class = [...set].join(" ");
          return want;
        },
        contains: (name) => classSet().has(name),
      },
      querySelector: (sel) => wrap(findById(node, sel.replace(/^#/, ""))),
    };
  };
  return wrap(svgNode);
}

// ---------------------------------------------------------------- CSS subset

function parseCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const vars = {};
  const rules = [];
  let i = 0;
  let order = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    // find matching close
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    i = j;
    if (head.startsWith("@")) continue; // media/at-rules are skipped
    const decls = {};
    for (const d of body.split(";")) {
      const k = d.indexOf(":");
      if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).replace(/!important/, "").trim();
    }
    if (head === ":root") {
      for (const [k, v] of Object.entries(decls)) if (k.startsWith("--")) vars[k] = v;
      continue;
    }
    for (const sel of head.split(",").map((s) => s.trim())) {
      if (!sel.startsWith(".scene-svg")) continue;
      const parts = sel.split(/\s+/).map(parseCompound);
      if (parts.some((p) => !p)) continue;
      const spec = parts.reduce((a, p) => [a[0] + (p.id ? 1 : 0), a[1] + p.classes.length + p.not.length, a[2] + (p.tag ? 1 : 0)], [0, 0, 0]);
      rules.push({ parts, decls, spec: spec[0] * 1e6 + spec[1] * 1e3 + spec[2], order: order++ });
    }
  }
  rules.sort((a, b) => a.spec - b.spec || a.order - b.order);
  return { vars, rules };
}

function parseCompound(s) {
  if (s === "*") return { tag: null, id: null, classes: [], not: [] };
  const m = /^([a-z]+)?((?:#[\w-]+|\.[\w-]+|:not\(\.[\w-]+\))*)$/i.exec(s);
  if (!m) return null;
  const out = { tag: m[1] ?? null, id: null, classes: [], not: [] };
  for (const t of m[2].matchAll(/#([\w-]+)|\.([\w-]+)|:not\(\.([\w-]+)\)/g)) {
    if (t[1]) out.id = t[1];
    if (t[2]) out.classes.push(t[2]);
    if (t[3]) out.not.push(t[3]);
  }
  return out;
}

function matchCompound(node, c) {
  if (!node || node.tag.startsWith("#")) return false;
  if (c.tag && node.tag !== c.tag) return false;
  if (c.id && node.attrs.id !== c.id) return false;
  const cls = new Set((node.attrs.class ?? "").split(/\s+/));
  return c.classes.every((k) => cls.has(k)) && c.not.every((k) => !cls.has(k));
}

function matches(node, parts) {
  if (!matchCompound(node, parts.at(-1))) return false;
  let k = parts.length - 2;
  let anc = node.parent;
  while (k >= 0 && anc) {
    if (matchCompound(anc, parts[k])) k--;
    anc = anc.parent;
  }
  return k < 0;
}

// ---------------------------------------------------------------- paint

function parseColor(v, ctx) {
  if (!v || v === "none" || v === "transparent") return null;
  v = v.trim();
  const varMatch = /^var\((--[\w-]+)\)$/.exec(v);
  if (varMatch) return parseColor(ctx.vars[varMatch[1]], ctx);
  const url = /^url\(#([\w-]+)\)$/.exec(v);
  if (url) return ctx.paintServers[url[1]] ?? [128, 128, 128, 1];
  if (v[0] === "#") {
    let h = v.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = Number.parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgba) {
    const p = rgba[1].split(",").map((s) => Number.parseFloat(s));
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  const named = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
  return named[v] ?? null;
}

function collectPaintServers(svg, ctx) {
  const walk = (n) => {
    if (n.tag === "pattern") {
      const rect = n.children.find((c) => c.tag === "rect");
      ctx.paintServers[n.attrs.id] = parseColor(rect?.attrs.fill, ctx) ?? [200, 200, 200, 1];
    } else if (n.tag === "linearGradient") {
      const stops = n.children.filter((c) => c.tag === "stop").map((s) => {
        const c = parseColor(s.attrs["stop-color"], ctx) ?? [0, 0, 0, 1];
        return [...c.slice(0, 3), Number(s.attrs["stop-opacity"] ?? 1)];
      });
      const avg = [0, 1, 2, 3].map((i) => stops.reduce((a, s) => a + s[i], 0) / stops.length);
      ctx.paintServers[n.attrs.id] = avg;
    } else if (n.tag === "clipPath") {
      ctx.clips[n.attrs.id] = n;
    }
    for (const c of n.children) walk(c);
  };
  walk(svg);
}

// ---------------------------------------------------------------- transforms

const IDENT = [1, 0, 0, 1, 0, 0];
function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function parseTransform(t) {
  let m = IDENT;
  if (!t || t === "none") return m;
  for (const f of t.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const a = f[2].split(/[\s,]+/).filter(Boolean).map((s) => Number.parseFloat(s));
    let n = IDENT;
    if (f[1] === "matrix") n = a;
    else if (f[1] === "translate") n = [1, 0, 0, 1, a[0], a[1] ?? 0];
    else if (f[1] === "scale") n = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
    else if (f[1] === "rotate") {
      const r = (a[0] * Math.PI) / 180;
      n = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
    }
    m = mul(m, n);
  }
  return m;
}
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// ---------------------------------------------------------------- geometry

function ellipsePts(cx, cy, rx, ry, n = 40) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return out;
}

function rectPts(x, y, w, h, rx, ry) {
  if (!rx && !ry) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  rx = Math.min(rx || ry, w / 2);
  ry = Math.min(ry || rx, h / 2);
  const out = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= 8; i++) {
      const t = a0 + (i / 8) * (Math.PI / 2);
      out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
  };
  corner(x + w - rx, y + ry, -Math.PI / 2);
  corner(x + w - rx, y + h - ry, 0);
  corner(x + rx, y + h - ry, Math.PI / 2);
  corner(x + rx, y + ry, Math.PI);
  return out;
}

function pathSubpaths(d) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const subs = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  let lastCtrl = null;
  let i = 0;
  const num = () => Number.parseFloat(toks[i++]);
  const bez = (pts, steps = 16) => {
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (pts.length === 4) {
        const u = 1 - t;
        cur.push([
          u * u * u * pts[0][0] + 3 * u * u * t * pts[1][0] + 3 * u * t * t * pts[2][0] + t * t * t * pts[3][0],
          u * u * u * pts[0][1] + 3 * u * u * t * pts[1][1] + 3 * u * t * t * pts[2][1] + t * t * t * pts[3][1],
        ]);
      } else {
        const u = 1 - t;
        cur.push([
          u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0],
          u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1],
        ]);
      }
    }
  };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") {
      if (cur) cur.closed = true;
      x = sx;
      y = sy;
      cmd = "";
      continue;
    }
    if (C === "M") {
      x = rel ? x + num() : num();
      y = rel ? y + num() : num();
      sx = x;
      sy = y;
      cur = [[x, y]];
      subs.push(cur);
      cmd = rel ? "l" : "L";
    } else if (C === "L") {
      x = rel ? x + num() : num();
      y = rel ? y + num() : num();
      cur.push([x, y]);
    } else if (C === "H") {
      x = rel ? x + num() : num();
      cur.push([x, y]);
    } else if (C === "V") {
      y = rel ? y + num() : num();
      cur.push([x, y]);
    } else if (C === "C") {
      const p = [num(), num(), num(), num(), num(), num()];
      const o = rel ? [x, y] : [0, 0];
      const c1 = [p[0] + o[0], p[1] + o[1]];
      const c2 = [p[2] + o[0], p[3] + o[1]];
      const e = [p[4] + o[0], p[5] + o[1]];
      bez([[x, y], c1, c2, e]);
      lastCtrl = c2;
      [x, y] = e;
    } else if (C === "Q" || C === "T") {
      const o = rel ? [x, y] : [0, 0];
      let c1;
      if (C === "Q") c1 = [num() + o[0], num() + o[1]];
      else c1 = lastCtrl ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
      const e = [num() + o[0], num() + o[1]];
      bez([[x, y], c1, e]);
      lastCtrl = c1;
      [x, y] = e;
    } else {
      i++; // unsupported command: skip a token
    }
  }
  return subs;
}

function geometry(node) {
  const a = node.attrs;
  const n = (k, d = 0) => (a[k] === undefined ? d : Number.parseFloat(a[k]));
  switch (node.tag) {
    case "polygon":
    case "polyline": {
      const v = (a.points ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      if (!pts.length) return [];
      pts.closed = node.tag === "polygon";
      return [pts];
    }
    case "rect": {
      const p = rectPts(n("x"), n("y"), n("width"), n("height"), n("rx"), n("ry"));
      p.closed = true;
      return [p];
    }
    case "circle": {
      const p = ellipsePts(n("cx"), n("cy"), n("r"), n("r"));
      p.closed = true;
      return [p];
    }
    case "ellipse": {
      const p = ellipsePts(n("cx"), n("cy"), n("rx"), n("ry"));
      p.closed = true;
      return [p];
    }
    case "path":
      return pathSubpaths(a.d ?? "");
    default:
      return [];
  }
}

// ---------------------------------------------------------------- raster

class Canvas {
  constructor(w, h, ss) {
    this.w = w;
    this.h = h;
    this.ss = ss;
    this.W = w * ss;
    this.H = h * ss;
    this.rgb = new Float32Array(this.W * this.H * 3).fill(1);
  }

  /** Coverage mask (0/1 per subsample) of polygons under nonzero winding. */
  mask(polys) {
    const { W, H } = this;
    let minY = Infinity;
    let maxY = -Infinity;
    const edges = [];
    for (const p of polys) {
      for (let i = 0; i < p.length; i++) {
        const a = p[i];
        const b = p[(i + 1) % p.length];
        if (a[1] === b[1]) continue;
        edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1], 1] : [b[0], b[1], a[0], a[1], -1]);
        minY = Math.min(minY, a[1], b[1]);
        maxY = Math.max(maxY, a[1], b[1]);
      }
    }
    const rows = new Map();
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs = [];
      for (const e of edges) {
        if (yc >= e[1] && yc < e[3]) xs.push([e[0] + ((yc - e[1]) * (e[2] - e[0])) / (e[3] - e[1]), e[4]]);
      }
      if (!xs.length) continue;
      xs.sort((p, q) => p[0] - q[0]);
      const spans = [];
      let wind = 0;
      for (let k = 0; k < xs.length; k++) {
        const prev = wind;
        wind += xs[k][1];
        if (prev === 0 && wind !== 0) spans.push([xs[k][0]]);
        else if (prev !== 0 && wind === 0) spans.at(-1).push(xs[k][0]);
      }
      const row = [];
      for (const [sxa, sxb] of spans) {
        const xa = Math.max(0, Math.ceil(sxa - 0.5));
        const xb = Math.min(W - 1, Math.floor((sxb ?? sxa) - 0.5));
        if (xb >= xa) row.push([xa, xb]);
      }
      if (row.length) rows.set(y, row);
    }
    return rows;
  }

  paint(rows, color, alpha, clip) {
    const [r, g, b] = color.map((c) => c / 255);
    const a = alpha;
    for (const [y, spans] of rows) {
      const clipRow = clip?.get(y);
      if (clip && !clipRow) continue;
      for (let [xa, xb] of spans) {
        for (let x = xa; x <= xb; x++) {
          if (clipRow && !clipRow.some(([ca, cb]) => x >= ca && x <= cb)) continue;
          const i = (y * this.W + x) * 3;
          this.rgb[i] += (r - this.rgb[i]) * a;
          this.rgb[i + 1] += (g - this.rgb[i + 1]) * a;
          this.rgb[i + 2] += (b - this.rgb[i + 2]) * a;
        }
      }
    }
  }

  png() {
    const { w, h, ss, W } = this;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 3 + 1)] = 0;
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) sum += this.rgb[((y * ss + dy) * W + (x * ss + dx)) * 3 + c];
          raw[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.round(Math.min(1, Math.max(0, sum / (ss * ss))) * 255);
        }
      }
    }
    return encodePng(w, h, raw);
  }
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- strokes

function strokePolys(sub, width, closed) {
  const out = [];
  const hw = width / 2;
  const n = sub.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = sub[i];
    const b = sub[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;
    // orient consistently so nonzero union works
    out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
  }
  if (hw > 0.6) for (const p of sub) out.push(ellipsePts(p[0], p[1], hw, hw, 12));
  // nonzero needs one orientation: normalise all to positive area
  return out.map((p) => (area(p) < 0 ? p.reverse() : p));
}
function area(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

// ---------------------------------------------------------------- render

const INHERITED = ["fill", "stroke", "stroke-width", "font-size", "visibility", "text-anchor", "fill-opacity", "stroke-opacity"];

export function render(svg, css, { width = 1200, viewBox, ss = 2 } = {}) {
  const ctx = { ...parseCss(css), paintServers: {}, clips: {} };
  collectPaintServers(svg, ctx);
  const vb = (viewBox ?? svg.attrs.viewBox).split(/[\s,]+/).map(Number);
  const height = Math.round((width * vb[3]) / vb[2]);
  const canvas = new Canvas(width, height, ss);
  const k = (width * ss) / vb[2];
  const base = [k, 0, 0, k, -vb[0] * k, -vb[1] * k];

  function styleOf(node, parentStyle) {
    const s = {};
    for (const p of INHERITED) if (parentStyle[p] !== undefined) s[p] = parentStyle[p];
    const presentational = ["fill", "stroke", "stroke-width", "opacity", "font-size", "text-anchor", "display", "visibility", "vector-effect", "fill-opacity", "stroke-opacity"];
    for (const p of presentational) if (node.attrs[p] !== undefined) s[p] = node.attrs[p];
    for (const r of ctx.rules) if (matches(node, r.parts)) Object.assign(s, r.decls);
    if (node.attrs.style) {
      for (const d of node.attrs.style.split(";")) {
        const i = d.indexOf(":");
        if (i > 0) s[d.slice(0, i).trim()] = d.slice(i + 1).trim();
      }
    }
    if (parentStyle["vector-effect-all"]) s["vector-effect"] = "non-scaling-stroke";
    return s;
  }

  function draw(node, m, parentStyle, alpha, clip) {
    if (node.tag.startsWith("#") || ["defs", "title", "desc", "clipPath", "pattern", "linearGradient"].includes(node.tag)) return;
    const s = styleOf(node, parentStyle);
    if (s.display === "none" || s.visibility === "hidden") return;
    let mm = mul(m, parseTransform(node.attrs.transform));
    if (s.transform && s.transform !== "none") mm = mul(mm, parseTransform(s.transform.replace(/px/g, "")));
    const a = alpha * (s.opacity === undefined ? 1 : Number.parseFloat(s.opacity));
    if (a <= 0.001) return;
    let cl = clip;
    const clipRef = /url\(#([\w-]+)\)/.exec(node.attrs["clip-path"] ?? "");
    if (clipRef && ctx.clips[clipRef[1]]) {
      const polys = [];
      for (const c of ctx.clips[clipRef[1]].children) {
        const cm = mul(mm, parseTransform(c.attrs.transform));
        for (const sub of geometry(c)) polys.push(sub.map((p) => apply(cm, p)));
      }
      cl = canvas.mask(polys);
    }
    if (node.tag === "g" || node.tag === "svg") {
      for (const c of node.children) draw(c, mm, s, a, cl);
      return;
    }
    if (node.tag === "text") {
      const t = textOf(node).trim();
      if (!t) return;
      const fs = Number.parseFloat(s["font-size"] ?? 16);
      const w = fs * 0.56 * t.length;
      const x = Number.parseFloat(node.attrs.x ?? 0);
      const y = Number.parseFloat(node.attrs.y ?? 0);
      const anchor = s["text-anchor"] ?? "start";
      const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
      const pts = [[x0, y - fs * 0.7], [x0 + w, y - fs * 0.7], [x0 + w, y - fs * 0.05], [x0, y - fs * 0.05]].map((p) => apply(mm, p));
      const col = parseColor(s.fill ?? "#000", ctx) ?? [0, 0, 0, 1];
      canvas.paint(canvas.mask([pts]), col, a * 0.55 * col[3], cl);
      return;
    }
    const subs = geometry(node);
    if (!subs.length) return;
    const fill = parseColor(s.fill ?? "#000", ctx);
    if (fill) {
      const polys = subs.filter((p) => p.length > 2).map((p) => p.map((q) => apply(mm, q)));
      const fo = s["fill-opacity"] === undefined ? 1 : Number.parseFloat(s["fill-opacity"]);
      canvas.paint(canvas.mask(polys), fill, a * fill[3] * fo, cl);
    }
    const stroke = parseColor(s.stroke, ctx);
    const sw = Number.parseFloat(s["stroke-width"] ?? 1);
    if (stroke && sw > 0) {
      const scale = s["vector-effect"] === "non-scaling-stroke" ? k : Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2]));
      const polys = [];
      for (const sub of subs) {
        const dev = sub.map((q) => apply(mm, q));
        polys.push(...strokePolys(dev, sw * scale, sub.closed));
      }
      canvas.paint(canvas.mask(polys), stroke, a * stroke[3], cl);
    }
  }

  draw(svg, base, {}, 1, null);
  return canvas.png();
}
