// Lesson controller: station overview, reversible SVG camera zoom and three
// machine lessons. Each lesson owns one model state; every reading, plate and
// station drawing is derived from it through the shared pure model.

import {
  apply,
  can,
  chargeFor,
  createState,
  formatDuration,
  formatKobo,
  formatMl,
  isFlowing,
  maxVolumeForAmount,
  parseLitresToMl,
  parseNairaToKobo,
  read,
  receiptLabel,
  tick,
} from "../model.mjs";
import { CAMERA, pinsMarkup, platesMarkup, updatePlate } from "./plates.mjs";
import { bindScene, sceneMarkup } from "./scene.mjs";

const doc = typeof document === "undefined" ? null : document;
const $ = (sel, root = doc) => root.querySelector(sel);
const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: true };
const ZOOM_MS = 1000;
const DEMO_GAP_MS = 1000;

/** Apply several model actions in order; stops at the first refusal. */
function run(state, actions) {
  let s = state;
  for (const a of actions) {
    const r = apply(s, a);
    if (!r.ok) return { ok: false, state, reason: r.reason };
    s = r.state;
  }
  return { ok: true, state: s, reason: null };
}

/** Escape typed text for an HTML attribute; the literal text is preserved. */
function escAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const A = (type, payload) => (payload === undefined ? { type } : { type, payload });

// A station picture for the overview: tanker on site, car at the pump, power on.
function overviewState() {
  return run(createState(), [A("powerOn"), A("setPrice", { priceKobo: 100_000 }), A("openStation"), A("customerArrives"), A("arriveTanker", { loadMl: 12_000_000 })]).state;
}

// ---------------------------------------------------------------------------
// lessons

export const LESSONS = {
  delivery: {
    number: 1,
    title: "Tanker to storage",
    speed: 100, // simulated seconds per real second
    speedNote: "Shown at 100× real time: 12,000 L at an illustrative 600 L/min drop.",
    setup: () =>
      run(createState(), [A("arriveTanker", { loadMl: 12_000_000 }), A("checkTank"), A("connectDelivery")]).state,
    intro: [
      "The tanker's fuel sits higher than the fuel in the underground tank. Open the outlet valve and gravity drains it down the hose and fill pipe — this is a gravity drop, so no station pump is involved.",
      "Watch the two readings: the tanker loses exactly what the tank gains. The air the fuel pushes out of the tank leaves through the vent; fuel does not.",
    ],
    note: "Illustration only, not a discharge procedure. Other delivery set-ups exist. The station's electric pump is a separate machine (lesson 2).",
    controls: {
      open: {
        label: (s) => (s.delivery?.status === "halted" ? "Re-open outlet valve" : "Open outlet valve"),
        primary: true,
        actions: () => [A("startDischarge")],
      },
      close: { label: () => "Close outlet valve", actions: () => [A("haltDischarge")] },
    },
    readings: (s) => {
      const d = s.delivery;
      const gained = s.tank.stockMl - s.config.openingStockMl;
      // Three decimals (whole ml) so learners can verify exact conservation.
      return [
        ["Tanker", d ? formatMl(d.tankerMl, 3) : "gone"],
        ["Underground tank", formatMl(s.tank.stockMl, 3)],
        ["Tanker lost", formatMl(d ? d.tankerStartMl - d.tankerMl : 0, 3)],
        ["Tank gained", formatMl(gained, 3)],
        ["Space left in tank", formatMl(s.config.tankCapacityMl - s.tank.stockMl, 3), "wide"],
      ];
    },
    check: (s) => {
      const d = s.delivery;
      if (!d) return "";
      const lost = d.tankerStartMl - d.tankerMl;
      const gained = s.tank.stockMl - s.config.openingStockMl;
      return lost === gained ? `✓ Lost = gained (${formatMl(lost, 3)})` : `⚠ ${formatMl(lost - gained, 3)} unaccounted`;
    },
    status: (s) => {
      const d = s.delivery;
      if (!d) return "";
      if (d.status === "discharging") return "Valve open: fuel is draining by gravity.";
      if (d.status === "complete") return d.stopReason === "tank-full" ? "Tank full — the rest stays on the tanker." : "Tanker empty — nothing left above the valve.";
      if (d.status === "halted") return "Valve closed: flow and readings stop.";
      return "Hose connected. The valve is closed.";
    },
    demo: [(s) => (s.delivery?.status === "connected" || s.delivery?.status === "halted" ? "open" : null)],
  },

  pricing: {
    number: 2,
    title: "Litres to price",
    speed: 1,
    speedNote: "Shown in real time: 5 L at an illustrative 40 L/min takes 7.5 s.",
    setup: () => run(createState(), [A("powerOn"), A("setPrice", { priceKobo: 100_000 }), A("openStation")]).state,
    intro: [
      "The tank's pump pushes fuel through the meter. The meter turns once for each fixed volume, and the encoder on its shaft sends electric pulses to the calculator.",
      "The calculator counts the pulses as litres and multiplies them by the price per litre. A new price changes the money, not the fuel or the flow speed.",
    ],
    note: "Pulses per litre and rotor shape are illustrative, not a manufacturer's calibration. Each run is a new sale: the price is locked when it starts.",
    extra: () => `<div class="field"><label for="price-input">Price per litre (₦)</label>
        <input id="price-input" data-form="price" inputmode="decimal" autocomplete="off" value="${escAttr(ui.form.price)}"></div>
      <div class="row">
        <button type="button" class="btn" data-set='{"price":"1000"}'>₦1,000/L</button>
        <button type="button" class="btn" data-set='{"price":"1250"}'>₦1,250/L</button>
      </div>`,
    controls: {
      run5: {
        label: () => "Pump 5 L at this price",
        primary: true,
        actions: (s, inp) => {
          if (inp.priceKobo == null) return { error: "Enter a price like 1000 or 1250." };
          const settle = settleSale(s);
          if (settle.error) return settle;
          const price = s.station.priceKobo === inp.priceKobo ? [] : [A("setPrice", { priceKobo: inp.priceKobo })];
          return [...settle, ...price, A("customerArrives"), A("setPreset", { mode: "volume", volumeMl: 5_000 }), A("liftNozzle"), A("startPump")];
        },
      },
      stop: { label: () => "Stop pump", danger: true, actions: () => [A("stopPump")] },
      sign: {
        label: () => "Change price mid-sale",
        actions: (s, inp) => {
          if (inp.priceKobo == null) return { error: "Enter a price like 1000 or 1250." };
          if (s.sale?.status !== "dispensing") return { error: "Use this while fuel is flowing to see the locked price." };
          return [A("setPrice", { priceKobo: inp.priceKobo })];
        },
      },
    },
    readings: (s) => {
      const sale = s.sale;
      const ml = sale?.deliveredMl ?? 0;
      return [
        ["Measured", formatMl(ml, 3)],
        ["Price locked for sale", sale?.priceKobo != null ? `${formatKobo(sale.priceKobo)}/L` : "—"],
        ["Amount", sale?.priceKobo != null ? formatKobo(chargeFor(ml, sale.priceKobo)) : "—"],
        ["Pulses (illustrative)", String(Math.floor(ml / 10))],
        ["Price on the sign now", s.station.priceKobo != null ? `${formatKobo(s.station.priceKobo)}/L` : "—", "wide"],
      ];
    },
    check: (s) => {
      const sale = s.sale;
      if (!sale || sale.priceKobo == null) return "";
      return `${formatMl(sale.deliveredMl, 3)} × ${formatKobo(sale.priceKobo)}/L = ${formatKobo(chargeFor(sale.deliveredMl, sale.priceKobo))}`;
    },
    status: (s) => {
      const sale = s.sale;
      if (!sale) return "Choose a price, then pump 5 L.";
      if (sale.status === "dispensing") {
        return sale.priceKobo !== s.station.priceKobo
          ? "The sign changed, but this sale keeps its locked price."
          : "Measuring: the rotor turns only while fuel flows.";
      }
      if (sale.stopReason === "target") return "5 L measured. Change the price and pump 5 L again to compare.";
      if (sale.stopReason) return `Stopped (${sale.stopReason}). The charge is for the litres measured.`;
      return "";
    },
    after: (s) => compareTable(s),
    demoSetup: () => setForm({ price: "1000" }),
    demo: [
      () => "run5",
      () => {
        setForm({ price: "1250" });
        return "run5";
      },
    ],
  },

  nozzle: {
    number: 3,
    title: "Customer and nozzle",
    speed: 3,
    speedNote: "Shown at 3× real time; the nozzle flow is an illustrative 40 L/min.",
    setup: () =>
      run(createState(ui.scenario === "fill" ? { vehicleStartFuelMl: 44_000 } : {}), [
        A("powerOn"),
        A("setPrice", { priceKobo: 100_000 }),
        A("openStation"),
        A("customerArrives"),
      ]).state,
    intro: [
      "The customer asks for naira or litres; the dispenser turns that into a target. Squeezing the trigger lifts a stem that opens the nozzle's main valve against its spring.",
      "Two different things can stop the flow automatically: the dispenser closes its own valve at the preset, or a full car covers the nozzle's sensing port and the nozzle trips itself shut.",
    ],
    note: "Simplified mechanism for learning, not exact component physics. You only pay for the litres that actually flowed.",
    extra: () => `<div class="row" role="group" aria-label="Car">
        <button type="button" class="btn" data-scenario="room" aria-pressed="${ui.scenario === "room"}">Car with room (8 of 50 L)</button>
        <button type="button" class="btn" data-scenario="fill" aria-pressed="${ui.scenario === "fill"}">Nearly full car (44 of 50 L)</button>
      </div>
      <fieldset class="field"><legend>Customer asks for</legend>
        <div class="choice">
          <label><input type="radio" name="req-mode" data-form="mode" value="amount"${ui.form.mode === "amount" ? " checked" : ""}> Naira</label>
          <label><input type="radio" name="req-mode" data-form="mode" value="volume"${ui.form.mode === "volume" ? " checked" : ""}> Litres</label>
        </div>
        <label for="request-input" id="request-label">${ui.form.mode === "volume" ? "Litres" : "Naira amount (₦)"}</label>
        <input id="request-input" data-form="request" inputmode="decimal" autocomplete="off" value="${escAttr(ui.form.request)}">
      </fieldset>
      <p class="equation" id="request-eq"></p>`,
    controls: {
      authorise: {
        label: () => "Authorise preset",
        actions: (s, inp) => {
          const payload = inp.mode === "volume"
            ? inp.volumeMl == null ? null : { mode: "volume", volumeMl: inp.volumeMl }
            : inp.amountKobo == null ? null : { mode: "amount", amountKobo: inp.amountKobo };
          if (!payload) return { error: inp.mode === "volume" ? "Enter litres like 20 or 12.5." : "Enter naira like 10000." };
          const sale = s.sale;
          if (sale && !["arrived", "preset"].includes(sale.status)) {
            if (["paid", "unpaid", "cancelled"].includes(sale.status)) return [A("customerLeaves"), A("customerArrives"), A("setPreset", payload)];
            return { error: "Finish this sale first: release the trigger, then hang up and pay." };
          }
          return [A("setPreset", payload)];
        },
      },
      insert: { label: () => "Put nozzle in filler", actions: () => [A("liftNozzle")] },
      squeeze: {
        label: () => "Squeeze trigger",
        primary: true,
        actions: () => [A("startPump")],
        onPress: () => {
          ui.triggerHeld = true;
        },
      },
      release: {
        label: () => "Release trigger",
        danger: true,
        // While flowing, releasing stops the sale; after a preset stop it only closes the nozzle.
        actions: (s) => (s.sale?.status === "dispensing" ? [A("stopPump")] : ui.triggerHeld ? [] : { error: "Your hand is not on the trigger." }),
        emptyOk: () => ui.triggerHeld,
        onPress: () => {
          ui.triggerHeld = false;
        },
      },
      pay: {
        label: () => "Hang up and pay",
        actions: (s) => {
          const sale = s.sale;
          if (!sale || s.dispenser.nozzle !== "in-vehicle") return { error: "Put the nozzle in the filler and pump first." };
          if (sale.status === "dispensing" || ui.triggerHeld) return { error: "Release the trigger first." };
          return sale.deliveredMl > 0 ? [A("returnNozzle"), A("recordPayment", { method: "cash" })] : [A("returnNozzle")];
        },
      },
    },
    readings: (s) => {
      const sale = s.sale;
      const ml = sale?.deliveredMl ?? 0;
      const ask = !sale?.mode ? "—" : sale.mode === "amount" ? formatKobo(sale.amountKobo) : formatMl(sale.volumeMl, 3);
      return [
        ["Asked for", ask],
        ["Target", sale?.mode ? formatMl(sale.targetMl, 3) : "—"],
        ["Delivered", formatMl(ml, 3)],
        ["Charge", sale?.priceKobo != null ? formatKobo(chargeFor(ml, sale.priceKobo)) : "—"],
        ["Car tank", sale ? `${formatMl(sale.vehicle.fuelMl, 3)} of ${formatMl(sale.vehicle.capacityMl, 0)}` : "—", "wide"],
      ];
    },
    check: (s) => {
      const r = s.ledger.receipts.at(-1);
      if (!r || s.sale?.receiptNo !== r.no) return "";
      return `Receipt ${receiptLabel(r.no)}: ${formatMl(r.volumeMl, 3)} × ${formatKobo(r.priceKobo)}/L = ${formatKobo(r.chargeKobo)} paid`;
    },
    status: (s) => {
      const sale = s.sale;
      if (!sale) return "";
      const why = {
        target: ui.triggerHeld
          ? "Preset reached: the dispenser closed its own valve upstream. The nozzle did not trip — release the trigger."
          : "Preset reached and trigger released. Hang up and pay for the litres measured.",
        "vehicle-full": "Car full: fuel covered the sensing port, suction lifted the diaphragm and the latch let the valve snap shut.",
        manual: "Trigger released: the spring closed the valve. You pay for exactly what flowed.",
        "tank-empty": "The station tank ran out. You pay for what flowed.",
      };
      // Settled states first, so a paid sale never repeats the pay instruction.
      if (sale.status === "paid") return "Paid for exactly the litres measured. Authorise a new preset for the next customer.";
      if (sale.status === "cancelled") return "Hung up with nothing dispensed — nothing is due.";
      if (sale.status === "dispensing") return "Trigger squeezed: fuel flows while air is drawn in through the sensing port.";
      if (sale.stopReason) return why[sale.stopReason] ?? "Stopped.";
      if (sale.status === "nozzle") return "Nozzle in the filler. Squeeze the trigger.";
      if (sale.status === "preset") return "Preset authorised and price locked. Put the nozzle in the filler.";
      return "Choose naira or litres, then authorise.";
    },
    equation: (s, inp) => {
      const sale = s.sale;
      if (sale?.mode === "amount") {
        return `${formatKobo(sale.amountKobo)} ÷ ${formatKobo(sale.priceKobo)}/L = ${formatMl(sale.targetMl, 3)} target`;
      }
      if (sale?.mode === "volume") {
        return `${formatMl(sale.targetMl, 3)} × ${formatKobo(sale.priceKobo)}/L = up to ${formatKobo(chargeFor(sale.targetMl, sale.priceKobo))}`;
      }
      const price = s.station.priceKobo;
      if (inp.mode === "amount" && inp.amountKobo != null) {
        return `${formatKobo(inp.amountKobo)} ÷ ${formatKobo(price)}/L = ${formatMl(maxVolumeForAmount(inp.amountKobo, price), 3)} target`;
      }
      if (inp.mode === "volume" && inp.volumeMl != null) {
        return `${formatMl(inp.volumeMl, 3)} × ${formatKobo(price)}/L = up to ${formatKobo(chargeFor(inp.volumeMl, price))}`;
      }
      return "Enter the customer's request.";
    },
    demoSetup: () => {
      ui.scenario = "room";
      setForm({ mode: "amount", request: "5000" });
    },
    demo: [
      () => "authorise",
      () => "insert",
      () => "squeeze",
      () => "release",
      () => "pay",
      () => () => {
        ui.scenario = "fill";
        setForm({ mode: "volume", request: "20" });
        resetLessonState();
      },
      () => "authorise",
      () => "insert",
      () => "squeeze",
      () => "pay",
    ],
  },
};

/** Actions that finish the previous sale before a fresh one starts. */
function settleSale(s) {
  const sale = s.sale;
  if (!sale) return [];
  if (sale.status === "dispensing") return { error: "Wait for this 5 L to finish, or stop the pump." };
  const out = [];
  if (s.dispenser.nozzle === "in-vehicle") out.push(A("returnNozzle"));
  const willBeReturned = sale.status === "returned" || (s.dispenser.nozzle === "in-vehicle" && sale.deliveredMl > 0);
  if (willBeReturned) out.push(A("recordPayment", { method: "cash" }));
  out.push(A("customerLeaves"));
  return out;
}

function compareTable(s) {
  const rows = s.ledger.sales.filter((x) => x.deliveredMl > 0).map((x) => ({ ...x, now: false }));
  if (s.sale?.priceKobo != null && s.sale.deliveredMl > 0) rows.push({ ...s.sale, chargeKobo: chargeFor(s.sale.deliveredMl, s.sale.priceKobo), now: true });
  if (!rows.length) return `<p class="note">Completed runs appear here for comparison.</p>`;
  const rate = s.config.dispenseRateMlPerMin;
  const body = rows.slice(-4).map((r) => `<tr><td>${formatKobo(r.priceKobo)}${r.now ? " (now)" : ""}</td><td>${formatMl(r.deliveredMl, 3)}</td><td>${(r.deliveredMl * 60 / rate).toFixed(1)} s</td><td>${formatKobo(r.chargeKobo)}</td></tr>`).join("");
  const done = rows.filter((r) => !r.now && r.deliveredMl === 5_000);
  const prices = new Set(done.map((r) => r.priceKobo));
  const lesson = prices.size > 1 ? `<p class="check">Same 5.000 L and the same 7.5 s of flow — only the money changed.</p>` : "";
  return `<table class="compare"><thead><tr><th>Price/L</th><th>Litres</th><th>Flow</th><th>Amount</th></tr></thead><tbody>${body}</tbody></table>${lesson}`;
}

// ---------------------------------------------------------------------------
// state

const SCENARIO_FORM = {
  room: { mode: "amount", request: "10000" },
  fill: { mode: "volume", request: "20" },
};
const ui = {
  lesson: null,
  paused: false,
  speed: 1,
  revealed: false,
  scenario: "room",
  triggerHeld: false, // the learner's hand on the nozzle (not part of the fuel model)
  form: { price: "1000", ...SCENARIO_FORM.room },
};
let state = overviewState();
let scene;
let svg;
let raf = 0;
let last = 0;
let carry = 0;
let phase = 0;
let cam = { from: [...CAMERA.station], to: [...CAMERA.station], start: 0, now: [...CAMERA.station], done: null };
let demo = null;
let lastEvents = 0;

// ---------------------------------------------------------------------------
// camera

function flyTo(rect, done) {
  cam = { from: [...cam.now], to: [...rect], start: performance.now(), now: [...cam.now], done };
  if (reducedMotion.matches) {
    cam.now = [...rect];
    applyViewBox();
    cam.done = null;
    done?.();
    return;
  }
  loop();
}

function camMoving() {
  return cam.now.some((v, i) => v !== cam.to[i]);
}

function stepCamera(now) {
  if (!camMoving()) return;
  const t = Math.min(1, (now - cam.start) / ZOOM_MS);
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out
  // Interpolate the visible width geometrically so the zoom feels uniform.
  const w = cam.from[2] * (cam.to[2] / cam.from[2]) ** e;
  const k = (w - cam.from[2]) / (cam.to[2] - cam.from[2] || 1);
  const cx = cam.from[0] + cam.from[2] / 2 + (cam.to[0] + cam.to[2] / 2 - cam.from[0] - cam.from[2] / 2) * k;
  const cy = cam.from[1] + cam.from[3] / 2 + (cam.to[1] + cam.to[3] / 2 - cam.from[1] - cam.from[3] / 2) * k;
  const h = (w * 3) / 4;
  cam.now = t >= 1 ? [...cam.to] : [cx - w / 2, cy - h / 2, w, h];
  applyViewBox();
  if (t >= 1 && cam.done) {
    const done = cam.done;
    cam.done = null;
    done();
  }
}

function applyViewBox() {
  svg.setAttribute("viewBox", cam.now.map((v) => v.toFixed(1)).join(" "));
}

// ---------------------------------------------------------------------------
// lesson flow

function openLesson(id, { focus = true } = {}) {
  if (!LESSONS[id]) return;
  stopDemo();
  ui.lesson = id;
  ui.paused = false;
  ui.triggerHeld = false;
  carry = 0;
  state = LESSONS[id].setup();
  lastEvents = state.events.length;
  hidePlate();
  svg.classList.add("zoomed");
  renderPanel();
  update();
  flyTo(CAMERA[id], () => {
    showPlate(id);
    if (focus) $("#lesson-title")?.focus();
  });
}

function backToStation() {
  stopDemo();
  ui.lesson = null;
  hidePlate();
  state = overviewState();
  renderPanel();
  update();
  svg.classList.remove("zoomed");
  flyTo(CAMERA.station, () => $(`[data-lesson]`)?.focus());
}

function replay() {
  if (ui.lesson) openLessonInPlace();
}

/** Fresh lesson state without moving the camera. */
function openLessonInPlace() {
  stopDemo();
  resetLessonState();
  announce("Lesson reset.");
}

function resetLessonState() {
  ui.paused = false;
  ui.triggerHeld = false;
  carry = 0;
  phase = 0;
  state = LESSONS[ui.lesson].setup();
  lastEvents = state.events.length;
  renderPanel();
  update();
}

function showPlate(id) {
  ui.revealed = true;
  for (const p of svg.querySelectorAll(".plate")) {
    const on = p.id === `plate-${id}`;
    p.classList.toggle("active", on);
    p.setAttribute("aria-hidden", String(!on));
  }
  svg.classList.add("revealed");
  update();
}

function hidePlate() {
  ui.revealed = false;
  svg.classList.remove("revealed");
  for (const p of svg.querySelectorAll(".plate")) {
    p.classList.remove("active");
    p.setAttribute("aria-hidden", "true");
  }
}

function press(key) {
  const lesson = LESSONS[ui.lesson];
  const ctl = lesson?.controls[key];
  if (!ctl) return false;
  const verdict = availability(ctl);
  if (!verdict.ok) {
    announce(verdict.reason);
    return false;
  }
  state = verdict.state;
  ctl.onPress?.(state);
  update();
  return true;
}

function availability(ctl) {
  const actions = ctl.actions(state, inputs());
  if (!actions) return { ok: false, reason: "Not available now.", state };
  if (actions.error) return { ok: false, reason: actions.error, state };
  if (!actions.length) return ctl.emptyOk?.(state) ? { ok: true, state, reason: null } : { ok: false, reason: "Nothing to do.", state };
  if (actions.length === 1) {
    const v = can(state, actions[0]);
    if (!v.ok) return { ok: false, reason: v.reason, state };
  }
  return run(state, actions);
}

// ---------------------------------------------------------------------------
// demo (auto lesson): presses the same controls with a pause between steps

function startDemo() {
  if (!ui.lesson) return;
  stopDemo();
  LESSONS[ui.lesson].demoSetup?.();
  resetLessonState();
  demo = { i: 0, timer: 0 };
  ui.paused = false;
  scheduleDemo();
  renderControls();
}

function stopDemo() {
  if (demo) clearTimeout(demo.timer);
  demo = null;
}

function scheduleDemo() {
  if (!demo || demo.timer || ui.paused || isFlowing(state)) return;
  const steps = LESSONS[ui.lesson].demo;
  if (demo.i >= steps.length) {
    stopDemo();
    renderControls();
    return;
  }
  demo.timer = setTimeout(() => {
    demo.timer = 0;
    if (!demo || ui.paused || isFlowing(state)) return;
    const step = steps[demo.i++];
    const key = step(state);
    if (typeof key === "function") key();
    else if (key) press(key);
    update();
  }, reducedMotion.matches ? 500 : DEMO_GAP_MS);
}

// ---------------------------------------------------------------------------
// frames

function loop() {
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function frame(now) {
  raf = 0;
  const dt = Math.min(100, Math.max(0, now - last));
  last = now;
  const lesson = LESSONS[ui.lesson];
  if (lesson && !ui.paused && isFlowing(state)) {
    const exact = dt * lesson.speed * ui.speed + carry;
    const sim = Math.floor(exact);
    carry = exact - sim;
    if (sim > 0) state = tick(state, sim);
    phase += dt * Math.min(2, ui.speed);
  }
  stepCamera(now);
  update();
  if (camMoving() || (lesson && !ui.paused && isFlowing(state))) loop();
}

// ---------------------------------------------------------------------------
// rendering

function announce(text) {
  const el = $("#announcer");
  el.textContent = "";
  requestAnimationFrame(() => {
    el.textContent = text;
  });
}

function inputs() {
  const f = ui.form;
  return {
    priceKobo: parseNairaToKobo(f.price),
    mode: f.mode,
    amountKobo: f.mode === "amount" ? parseNairaToKobo(f.request) : null,
    volumeMl: f.mode === "volume" ? parseLitresToMl(f.request) : null,
  };
}

function setForm(patch) {
  Object.assign(ui.form, patch);
  for (const [k, v] of Object.entries(patch)) {
    const el = doc.querySelector(`[data-form="${k}"]:not([type="radio"])`);
    if (el && el.value !== v) el.value = v;
    for (const r of doc.querySelectorAll(`input[type="radio"][data-form="${k}"]`)) r.checked = r.value === v;
  }
  const label = doc.querySelector("#request-label");
  if (label) label.textContent = ui.form.mode === "volume" ? "Litres" : "Naira amount (₦)";
  update();
}

function renderPanel() {
  const panel = $("#panel");
  const lesson = LESSONS[ui.lesson];
  for (const b of doc.querySelectorAll("[data-lesson]")) b.setAttribute("aria-current", String(b.dataset.lesson === ui.lesson));
  $("#back-btn").hidden = !lesson;
  if (!lesson) {
    panel.innerHTML = `<section class="card">
      <h2 id="lesson-title" tabindex="-1">Pick a machine to look inside</h2>
      <p>Fuel arrives by tanker, waits underground, then a pump and meter deliver it to the car. The numbered pins show where each machine lives.</p>
      <ol class="overview-list">
        <li><span class="n">1</span><span><strong>Tanker to storage</strong> — how gravity moves fuel down into the tank.</span></li>
        <li><span class="n">2</span><span><strong>Litres to price</strong> — how the meter turns measured litres into money.</span></li>
        <li><span class="n">3</span><span><strong>Customer and nozzle</strong> — presets, the trigger and the two automatic stops.</span></li>
      </ol>
    </section>`;
    return;
  }
  panel.innerHTML = `<section class="card" aria-labelledby="lesson-title">
      <h2 id="lesson-title" tabindex="-1">${lesson.number} · ${lesson.title}</h2>
      ${lesson.intro.map((p) => `<p>${p}</p>`).join("")}
    </section>
    <section class="card controls" aria-label="Try it">
      ${lesson.extra ? lesson.extra() : ""}
      <div class="row" id="ctl-row">${Object.entries(lesson.controls)
        .map(([k, c]) => `<button type="button" class="btn${c.primary ? " primary" : ""}${c.danger ? " danger" : ""}" data-ctl="${k}" aria-describedby="why-${k}"></button>`)
        .join("")}</div>
      ${Object.keys(lesson.controls).map((k) => `<p class="why" id="why-${k}"></p>`).join("")}
      <p class="check" id="lesson-check"></p>
      <p id="lesson-status"></p>
    </section>
    <section class="card" aria-label="Readings">
      <div class="readings" id="readings"></div>
      ${lesson.after ? `<div id="lesson-after">${lesson.after(state)}</div>` : ""}
    </section>
    <section class="card controls" aria-label="Playback">
      <div class="playback">
        <button type="button" class="btn" id="pause-btn" aria-pressed="false">Pause</button>
        <button type="button" class="btn" id="replay-btn">Replay</button>
        <button type="button" class="btn" id="demo-btn">Play demo</button>
        <label>Speed <select id="speed-select">${[0.5, 1, 2]
          .map((v) => `<option value="${v}"${v === ui.speed ? " selected" : ""}>${v === 0.5 ? "½" : v}×</option>`)
          .join("")}</select></label>
      </div>
      <p class="note">${lesson.speedNote} Flow time so far: <span id="sim-time">0s</span>.</p>
      <p class="note">${lesson.note}</p>
    </section>`;
  for (const b of panel.querySelectorAll("[data-ctl]")) {
    b.addEventListener("click", () => (demo ? announce("The demo is running — stop it to take over.") : press(b.dataset.ctl)));
  }
  $("#pause-btn", panel).addEventListener("click", () => {
    ui.paused = !ui.paused;
    if (!ui.paused) {
      scheduleDemo();
      loop();
    }
    renderControls();
  });
  $("#replay-btn", panel).addEventListener("click", replay);
  $("#demo-btn", panel).addEventListener("click", () => (demo ? (stopDemo(), renderControls()) : startDemo()));
  $("#speed-select", panel).addEventListener("change", (e) => {
    ui.speed = Number(e.target.value);
  });
  for (const el of panel.querySelectorAll("[data-form]")) {
    el.addEventListener(el.type === "radio" ? "change" : "input", () => {
      const patch = { [el.dataset.form]: el.value };
      if (el.dataset.form === "mode") patch.request = el.value === "volume" ? "20" : "10000";
      setForm(patch);
    });
  }
  for (const b of panel.querySelectorAll("[data-set]")) {
    b.addEventListener("click", () => setForm(JSON.parse(b.dataset.set)));
  }
  for (const b of panel.querySelectorAll("[data-scenario]")) {
    b.addEventListener("click", () => {
      stopDemo();
      ui.scenario = b.dataset.scenario;
      setForm(SCENARIO_FORM[ui.scenario]);
      resetLessonState();
      announce(b.textContent);
    });
  }
}

function renderControls() {
  const lesson = LESSONS[ui.lesson];
  if (!lesson) return;
  const panel = $("#panel");
  for (const b of panel.querySelectorAll("[data-ctl]")) {
    const ctl = lesson.controls[b.dataset.ctl];
    const label = ctl.label(state);
    if (b.textContent !== label) b.textContent = label;
    const v = demo ? { ok: false, reason: "The demo is running — stop it to take over." } : availability(ctl);
    b.setAttribute("aria-disabled", String(!v.ok));
    const why = $(`#why-${b.dataset.ctl}`, panel);
    // After a settled nozzle sale, show one neutral next step instead of stale stop reasons.
    const settled = !demo && ui.lesson === "nozzle" && ["paid", "cancelled"].includes(state.sale?.status);
    const reason = v.ok ? "" : settled ? "Authorise a new preset first." : v.reason;
    if (why.textContent !== reason) why.textContent = reason;
  }
  const pause = $("#pause-btn", panel);
  pause.textContent = ui.paused ? "Resume" : "Pause";
  pause.setAttribute("aria-pressed", String(ui.paused));
  $("#demo-btn", panel).textContent = demo ? "Stop demo" : "Play demo";
  stageFlag();
}

function renderReadings() {
  const lesson = LESSONS[ui.lesson];
  if (!lesson) return;
  const html = lesson.readings(state, inputs())
    .map(([k, v, cls = ""]) => `<div class="reading ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`)
    .join("");
  const box = $("#readings");
  if (box.innerHTML !== html) box.innerHTML = html;
  const setText = (id, value) => {
    const el = $(id);
    if (el && el.textContent !== value) el.textContent = value;
  };
  setText("#lesson-check", lesson.check?.(state) ?? "");
  setText("#lesson-status", lesson.status?.(state) ?? "");
  setText("#sim-time", formatDuration(state.clockMs));
  if (lesson.equation) setText("#request-eq", lesson.equation(state, inputs()));
  if (lesson.after) {
    const after = lesson.after(state);
    const el = $("#lesson-after");
    if (el.innerHTML !== after) el.innerHTML = after;
  }
}

function stageFlag() {
  const flag = $("#stage .flag");
  flag.hidden = !ui.paused || !ui.lesson;
}

function update() {
  scene.update({ ...read(state), saleStatus: state.sale?.status ?? null });
  scene.animateFlow(reducedMotion.matches ? 0 : phase);
  const flowing = isFlowing(state);
  // A sensing-port trip releases the latch: the hand no longer holds the valve open.
  if (ui.triggerHeld && state.sale?.stopReason === "vehicle-full") ui.triggerHeld = false;
  if (ui.lesson && ui.revealed) {
    const plate = svg.querySelector(`#plate-${ui.lesson}`);
    updatePlate[ui.lesson](plate, state, { triggerHeld: ui.triggerHeld });
    plate.classList.toggle("flowing", flowing && !ui.paused);
    const offset = reducedMotion.matches ? "0" : (-phase * 0.08).toFixed(1);
    for (const el of plate.querySelectorAll(".pl-flow, .pl-air, .pl-pulse")) el.style.strokeDashoffset = offset;
  }
  if (state.events.length !== lastEvents) {
    const fresh = state.events.slice(lastEvents);
    lastEvents = state.events.length;
    const text = LESSONS[ui.lesson]?.status?.(state);
    if (text && fresh.length) announce(text);
    renderControls();
  }
  renderReadings();
  renderControls();
  scheduleDemo();
  if (flowing && !ui.paused && ui.lesson) loop();
}

// ---------------------------------------------------------------------------
// boot

function boot() {
  const stage = $("#stage");
  stage.innerHTML = sceneMarkup().replace("</svg>", `${pinsMarkup()}${platesMarkup()}</svg>`);
  const flag = doc.createElement("div");
  flag.className = "flag";
  flag.textContent = "Paused";
  flag.hidden = true;
  stage.append(flag);
  svg = stage.querySelector("svg");
  svg.querySelector("title").textContent = "Petrol station with zoomable machine cutaways";
  scene = bindScene(svg);
  hidePlate();
  applyViewBox();

  for (const b of doc.querySelectorAll("[data-lesson]")) {
    b.addEventListener("click", () => (ui.lesson === b.dataset.lesson ? null : openLesson(b.dataset.lesson)));
  }
  $("#back-btn").addEventListener("click", backToStation);
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui.lesson) backToStation();
  });
  renderPanel();
  update();
  // First impression is a machine, not the wide station: zoom into lesson 1.
  openLesson("delivery", { focus: false });
}

if (doc) {
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
}
