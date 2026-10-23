// UI controller: owns the single model state, playback clock and timers.
// Every reading on screen is derived from `read(state)`.

import {
  DEFAULT_INPUTS,
  SCENARIOS,
  STEPS,
  actionLabel,
  apply,
  can,
  createScenario,
  formatDuration,
  formatKobo,
  formatMl,
  guide,
  isFlowing,
  parseLitresToMl,
  parseNairaToKobo,
  read,
  receiptLabel,
  tick,
  timeToFlowEnd,
} from "../model.mjs";
import { CAMERAS, bindScene, sceneMarkup } from "./scene.mjs";

// Animation playback relative to simulated time (multiplied by the speed menu).
const PLAYBACK = { delivery: 100, dispense: 5 };
const STEP_CAMERA = { 1: "delivery", 2: "delivery", 3: "station", 4: "dispense", 5: "dispense", 6: "dispense", 7: "close" };
const AUTO_DELAY_MS = 1100;

// UI-only aliases for model actions.
const ALIASES = { powerOnRestore: { type: "powerOn", label: "Restore power" } };
const DANGER = new Set(["powerCut", "emergencyStop", "powerOff", "haltDischarge", "stopPump", "leaveUnpaid"]);
const GUIDED_ALWAYS = new Set(["stopPump"]);

const STOP_TEXT = {
  target: "preset reached",
  "vehicle-full": "car tank full",
  "tank-empty": "underground tank empty",
  manual: "stopped by hand",
  power: "power cut",
  estop: "emergency stop",
  "tanker-empty": "tanker empty",
  "tank-full": "tank full — the rest stays on the tanker",
  complete: "complete",
  "not-discharged": "nothing discharged",
};

const doc = document;
const $ = (sel) => doc.querySelector(sel);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const narrow = matchMedia("(max-width: 700px)");

const ui = { mode: "guided", paused: false, speed: 1, scenario: "standard" };
let state = createScenario(ui.scenario);
let scene;
let raf = 0;
let lastFrame = 0;
let carry = 0;
let flowPhase = 0;
let autoTimer = 0;
let seenEvents = 0;
let camera = [...CAMERAS.full];
let structureKey = "";

// ---------------------------------------------------------------------------
// inputs

const els = {};

function inputs() {
  const presetMode = doc.querySelector('input[name="preset-mode"]:checked')?.value ?? "amount";
  const presetRaw = els.preset.value;
  return {
    priceKobo: parseNairaToKobo(els.price.value),
    presetMode,
    amountKobo: presetMode === "amount" ? parseNairaToKobo(presetRaw) : null,
    volumeMl: presetMode === "volume" ? parseLitresToMl(presetRaw) : null,
    method: els.method.value,
    tankerLoadMl: parseLitresToMl(els.tanker.value),
  };
}

function resetInputs() {
  els.price.value = String(DEFAULT_INPUTS.priceKobo / 100);
  doc.querySelector('input[name="preset-mode"][value="amount"]').checked = true;
  els.preset.value = String(DEFAULT_INPUTS.amountKobo / 100);
  els.method.value = DEFAULT_INPUTS.method;
  els.tanker.value = String(DEFAULT_INPUTS.tankerLoadMl / 1000);
  syncPresetLabel();
}

function syncPresetLabel() {
  const mode = doc.querySelector('input[name="preset-mode"]:checked')?.value;
  $("#preset-label").textContent = mode === "volume" ? "Litres" : "Amount (₦)";
}

function inputErrors(inp) {
  return {
    price: inp.priceKobo == null ? "Enter a price like 1000 or 1000.50." : "",
    preset:
      inp.presetMode === "amount"
        ? inp.amountKobo == null ? "Enter naira like 20000 or 20000.50." : ""
        : inp.volumeMl == null ? "Enter litres like 25 or 12.5." : "",
    tanker: inp.tankerLoadMl == null ? "Enter litres like 20000." : "",
  };
}

/** Turn a button key into a model action, or an input error. */
function buildAction(key, inp) {
  const type = ALIASES[key]?.type ?? key;
  switch (type) {
    case "arriveTanker":
      return inp.tankerLoadMl == null ? { error: "Enter the tanker load in litres." } : { type, payload: { loadMl: inp.tankerLoadMl } };
    case "setPrice":
      return inp.priceKobo == null ? { error: "Enter a valid price per litre." } : { type, payload: { priceKobo: inp.priceKobo } };
    case "setPreset":
      if (inp.presetMode === "amount") {
        return inp.amountKobo == null ? { error: "Enter a valid naira amount." } : { type, payload: { mode: "amount", amountKobo: inp.amountKobo } };
      }
      return inp.volumeMl == null ? { error: "Enter a valid number of litres." } : { type, payload: { mode: "volume", volumeMl: inp.volumeMl } };
    case "recordPayment":
      return { type, payload: { method: inp.method } };
    default:
      return { type };
  }
}

function labelFor(key) {
  if (ALIASES[key]) return ALIASES[key].label;
  if (key === "startDischarge" && state.delivery?.status === "halted") return "Resume discharge";
  if (key === "finishDelivery" && state.delivery && state.delivery.receivedMl === 0 && state.delivery.status !== "complete") {
    return "Send tanker away";
  }
  return actionLabel(key);
}

/** Whether a button may be used now in the current mode, and why not. */
function availability(key, inp, g) {
  const action = buildAction(key, inp);
  if (action.error) return { ok: false, reason: action.error, action };
  const verdict = can(state, action);
  if (ui.mode === "auto") {
    return { ok: false, reason: verdict.ok ? "Auto is driving. Switch to Guided or Explore to take over." : verdict.reason, action };
  }
  if (!verdict.ok) return { ok: false, reason: verdict.reason, action };
  if (ui.mode === "guided" && !GUIDED_ALWAYS.has(action.type) && g.next?.type !== action.type) {
    const next = g.next ? `“${labelFor(g.next.type)}”` : "waiting for the flow to finish";
    return { ok: false, reason: `Guided order: next is ${next}. Explore mode allows any valid action.`, action };
  }
  return { ok: true, reason: null, action };
}

// ---------------------------------------------------------------------------
// actions, playback and auto mode

function dispatch(action) {
  const result = apply(state, action);
  if (!result.ok) {
    announce(result.reason);
    return false;
  }
  state = result.state;
  update();
  return true;
}

function onAction(key) {
  const inp = inputs();
  const g = guide(state, inp);
  const a = availability(key, inp, g);
  if (!a.ok) {
    announce(a.reason);
    showWhy(a.reason);
    return;
  }
  dispatch(a.action);
}

function onNext() {
  if (ui.mode === "auto") return;
  const inp = inputs();
  const g = guide(state, inp);
  if (!g.next || g.waiting) return;
  const verdict = can(state, g.next);
  if (!verdict.ok) {
    announce(verdict.reason);
    return;
  }
  dispatch(g.next);
}

/** Recovery after a fault is a human decision; Auto never performs it. */
function needsHuman(next) {
  if (!next) return false;
  if (next.type === "resetEmergency") return true;
  if (next.type === "powerOn" && state.station.powerCause === "power-cut") return true;
  return next.type === "startDischarge" && state.delivery?.status === "halted";
}

function scheduleAuto() {
  if (ui.mode !== "auto" || ui.paused || autoTimer) return;
  const g = guide(state, inputs());
  if (g.done || g.waiting || !g.next || needsHuman(g.next) || !can(state, g.next).ok) return;
  autoTimer = setTimeout(() => {
    autoTimer = 0;
    if (ui.mode !== "auto" || ui.paused) return;
    // Re-derive from the current state so a stale plan can never repeat an event.
    const next = guide(state, inputs());
    if (next.next && !next.waiting && !needsHuman(next.next)) dispatch(next.next);
  }, reducedMotion.matches ? 600 : AUTO_DELAY_MS);
}

function cancelAuto() {
  clearTimeout(autoTimer);
  autoTimer = 0;
}

function needsFrames() {
  return (!ui.paused && isFlowing(state)) || cameraMoving();
}

function ensureLoop() {
  if (!raf && needsFrames()) {
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function frame(now) {
  raf = 0;
  const realDt = Math.min(100, Math.max(0, now - lastFrame));
  lastFrame = now;
  if (!ui.paused && isFlowing(state)) {
    const scale = state.delivery?.status === "discharging" ? PLAYBACK.delivery : PLAYBACK.dispense;
    const exact = realDt * scale * ui.speed + carry;
    const sim = Math.floor(exact);
    carry = exact - sim;
    if (sim > 0) state = tick(state, sim);
    flowPhase += realDt * ui.speed;
  }
  stepCamera(realDt);
  update();
}

function stopEverything() {
  cancelAuto();
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  carry = 0;
  flowPhase = 0;
}

function reset() {
  stopEverything();
  clearTimeout(whyTimer);
  whyTimer = 0;
  whyOverride = "";
  els.announcer.textContent = "";
  ui.paused = false;
  state = createScenario(ui.scenario);
  seenEvents = 0;
  structureKey = "";
  resetInputs();
  els.log.replaceChildren();
  camera = [...targetCamera()];
  applyCamera();
  announce(`Reset: ${SCENARIOS[ui.scenario].label}.`);
  update();
}

function setMode(mode) {
  cancelAuto();
  ui.mode = mode;
  for (const b of doc.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  structureKey = "";
  update();
}

function setPaused(paused) {
  ui.paused = paused;
  if (paused) cancelAuto();
  lastFrame = performance.now();
  structureKey = "";
  update();
}

// ---------------------------------------------------------------------------
// camera (narrow screens follow the current step)

function targetCamera() {
  if (!narrow.matches) return CAMERAS.full;
  const g = guide(state, inputs());
  return CAMERAS[STEP_CAMERA[g.step] ?? "full"];
}

function cameraMoving() {
  const t = targetCamera();
  return camera.some((v, i) => Math.abs(v - t[i]) > 0.5);
}

function stepCamera(dt) {
  const t = targetCamera();
  if (reducedMotion.matches) {
    camera = [...t];
  } else {
    const k = 1 - Math.exp(-dt / 160);
    camera = camera.map((v, i) => (Math.abs(t[i] - v) < 0.5 ? t[i] : v + (t[i] - v) * k));
  }
  applyCamera();
}

function applyCamera() {
  const vb = camera.map((v) => Math.round(v * 10) / 10).join(" ");
  if (scene.svg.getAttribute("viewBox") !== vb) scene.svg.setAttribute("viewBox", vb);
}

// ---------------------------------------------------------------------------
// rendering

function announce(text) {
  els.announcer.textContent = "";
  // a fresh text node makes repeated messages audible
  requestAnimationFrame(() => {
    els.announcer.textContent = text;
  });
}

let whyOverride = "";
let whyTimer = 0;
function showWhy(text) {
  whyOverride = text;
  clearTimeout(whyTimer);
  whyTimer = setTimeout(() => {
    whyOverride = "";
    structureKey = "";
    update();
  }, 4000);
  structureKey = "";
  update();
}

function eventText(e) {
  const L = (ml, d = 3) => formatMl(ml, d);
  switch (e.type) {
    case "tanker-arrived": return `Tanker arrived carrying ${L(e.loadMl, 0)} of petrol.`;
    case "tank-checked": return `Tank dipped: ${L(e.stockMl, 0)} in stock, space for ${L(e.spaceMl, 0)}.`;
    case "delivery-connected": return "Delivery hose connected to the fill point.";
    case "discharge-started": return "Discharge started.";
    case "discharge-resumed": return "Discharge resumed.";
    case "discharge-halted": return `Discharge halted (${STOP_TEXT[e.reason]}) after ${L(e.receivedMl, 0)}.`;
    case "discharge-complete": return `Discharge finished: ${L(e.receivedMl, 0)} received — ${STOP_TEXT[e.reason]}.`;
    case "delivery-recorded": return `Delivery recorded once: ${L(e.acceptedMl, 0)} at a cost of ${formatKobo(e.costKobo)}.`;
    case "power-on": return "Power switched on.";
    case "power-restored": return "Power restored. Nothing restarts by itself.";
    case "power-off": return "Power switched off.";
    case "power-cut": return "Power cut! Pumps and meters stop.";
    case "price-set": return `Pump price set to ${formatKobo(e.priceKobo)} per litre.`;
    case "station-opened": return "Station open for service.";
    case "customer-arrived": return "A customer pulls up to pump 1.";
    case "preset-authorised": return `Preset authorised: up to ${L(e.targetMl)} at ${formatKobo(e.priceKobo)}/L (price locked for this sale).`;
    case "nozzle-lifted": return "Nozzle lifted into the car's filler.";
    case "pump-started": return "Pump started.";
    case "pump-stopped": return `Pump stopped — ${STOP_TEXT[e.reason]}. ${L(e.deliveredMl)} delivered.`;
    case "nozzle-returned": return e.deliveredMl > 0 ? "Nozzle returned. The sale is settled at the meter reading." : "Nozzle returned with nothing dispensed — no charge.";
    case "payment-recorded": return `Payment recorded: ${formatKobo(e.paidKobo)}, receipt ${receiptLabel(e.receiptNo)}.`;
    case "sale-unpaid": return `Customer left without paying: ${formatKobo(e.dueKobo)} outstanding.`;
    case "customer-left": return "The customer drives off.";
    case "emergency-stop": return "Emergency stop pressed: all flow stopped.";
    case "emergency-reset": return "Emergency stop reset. Restart anything explicitly.";
    case "station-closed": return `Station closed. Closing stock ${L(e.closingStockMl, 0)}.`;
    default: return e.type;
  }
}

function renderLog() {
  const events = state.events;
  if (events.length === seenEvents) return;
  const fresh = events.slice(seenEvents);
  seenEvents = events.length;
  for (const e of fresh) {
    const li = doc.createElement("li");
    li.textContent = eventText(e);
    els.log.prepend(li);
  }
  els.logCount.textContent = `(${events.length})`;
  announce(fresh.map(eventText).join(" "));
}

function setButton(btn, { label, ok, recommended, why }) {
  if (btn.firstChild.textContent !== label) btn.firstChild.textContent = label;
  btn.setAttribute("aria-disabled", String(!ok));
  btn.classList.toggle("recommended", Boolean(recommended && ok));
  const whyEl = doc.getElementById(btn.getAttribute("aria-describedby"));
  if (whyEl.textContent !== (why ?? "")) whyEl.textContent = why ?? "";
}

function stepDone(n) {
  const s = state;
  const archived = s.ledger.sales;
  switch (n) {
    case 1: return Boolean(s.delivery) || s.ledger.deliveries.length > 0;
    case 2: return s.ledger.deliveries.length > 0 || s.delivery?.status === "complete";
    case 3: return s.station.open || s.station.closedForDay;
    case 4: return archived.length > 0 || ["nozzle", "dispensing", "stopped", "returned", "paid", "unpaid", "cancelled"].includes(s.sale?.status);
    case 5: return archived.some((x) => x.deliveredMl > 0) || ["stopped", "returned", "paid", "unpaid"].includes(s.sale?.status);
    case 6: return archived.length > 0;
    case 7: return s.station.closedForDay;
    default: return false;
  }
}

function renderStructure(inp, g) {
  const explore = ui.mode === "explore";
  els.layout.classList.toggle("explore", explore);
  els.explorePanel.hidden = !explore;

  const errs = inputErrors(inp);
  for (const [k, msg] of Object.entries(errs)) {
    els[`${k}Err`].textContent = msg;
    els[k].setAttribute("aria-invalid", String(Boolean(msg)));
  }

  for (const li of els.steps) {
    const n = Number(li.dataset.step);
    const current = n === g.step;
    li.classList.toggle("current", current);
    li.classList.toggle("done", stepDone(n) && !current);
    li.classList.toggle("collapsed", !explore && !current);
  }

  for (const btn of els.buttons) {
    const key = btn.dataset.key;
    const a = availability(key, inp, g);
    const recommended = g.next && a.action.type === g.next.type && !ALIASES[key];
    setButton(btn, { label: labelFor(key), ok: a.ok, recommended, why: a.ok ? "" : a.reason });
  }

  renderReceipt();
  renderSummary();

  els.pause.textContent = ui.paused ? "Resume" : "Pause";
  els.pause.setAttribute("aria-pressed", String(ui.paused));
  els.pauseFlag.hidden = !ui.paused;
}

function renderNow(inp, g) {
  els.nowNum.textContent = g.done ? "Complete" : `Step ${g.step} of ${STEPS.length}`;
  els.nowTitle.textContent = g.title;
  els.nowText.textContent = g.instruction;
  let why = whyOverride;
  let nextOk = false;
  let nextLabel = "Next";
  if (g.done) {
    nextLabel = "Day complete — Reset to run again";
  } else if (g.waiting) {
    const left = timeToFlowEnd(state);
    nextLabel = g.waiting === "dispense" ? "Pumping…" : "Discharging…";
    why ||= `${ui.paused ? "Paused. " : ""}About ${formatDuration(left ?? 0)} of simulated flow left.`;
  } else if (g.next) {
    const action = g.next;
    const verdict = can(state, action);
    nextLabel = `Next: ${labelFor(action.type)}`;
    nextOk = verdict.ok;
    if (!verdict.ok) why ||= verdict.reason;
  }
  if (ui.mode === "auto") {
    nextOk = false;
    if (!g.done && !g.waiting && needsHuman(g.next)) {
      nextLabel = "Auto stopped — recover in Guided or Explore";
      why = "Auto never resets an emergency stop, restores power or resumes a halted flow by itself.";
    } else {
      nextLabel = ui.paused ? "Auto paused — press Resume" : g.done ? nextLabel : "Auto is running…";
    }
  }
  els.nowWhy.textContent = why;
  if (els.next.textContent !== nextLabel) els.next.textContent = nextLabel;
  els.next.setAttribute("aria-disabled", String(!nextOk));
}

function renderReadouts(v) {
  const set = (id, text) => {
    const el = els.read[id];
    if (el.textContent !== text) el.textContent = text;
  };
  set("tank", formatMl(v.tank.stockMl, 0));
  set("tank-s", `${(Math.floor(v.tank.fraction * 1000) / 10).toFixed(1)}% · space ${formatMl(v.tank.ullageMl, 0)}`);
  if (v.tanker.present) {
    set("tanker", formatMl(v.tanker.ml, 0));
    set("tanker-s", `received ${formatMl(v.tanker.receivedMl, 0)} of ${formatMl(v.tanker.startMl, 0)}`);
  } else {
    set("tanker", "—");
    set("tanker-s", state.ledger.deliveries.length ? "delivery recorded, tanker gone" : "no tanker on site");
  }
  if (v.vehicle.present) {
    set("car", formatMl(v.vehicle.fuelMl, 1));
    set("car-s", `of ${formatMl(v.vehicle.capacityMl, 0)} · +${formatMl(state.sale.deliveredMl, 3)}`);
  } else {
    set("car", "—");
    set("car-s", "no car at the pump");
  }
  set("meter", `${formatMl(v.meter.volumeMl, 3)} · ${formatKobo(v.meter.chargeKobo)}`);
  set(
    "meter-s",
    v.meter.lockedPriceKobo != null
      ? `${formatKobo(v.meter.lockedPriceKobo)}/L locked for this sale`
      : state.ledger.sales.length ? "showing the last sale" : "no sale yet",
  );
  set("money", `${formatKobo(v.totals.collectedKobo)} in`);
  set("money-s", `sales ${formatKobo(v.totals.salesKobo)} · owed ${formatKobo(v.totals.outstandingKobo)}`);

  const scale = state.delivery?.status === "discharging" ? PLAYBACK.delivery : PLAYBACK.dispense;
  const playing = isFlowing(state) ? (ui.paused ? " · paused" : ` · playing at ×${scale * ui.speed}`) : "";
  const clock = `Simulated flow time ${formatDuration(state.clockMs)}${playing}`;
  if (els.clock.textContent !== clock) els.clock.textContent = clock;
}

function dl(rows) {
  return `<dl>${rows.map(([k, v, cls = ""]) => `<dt class="${cls}">${k}</dt><dd class="${cls}">${v}</dd>`).join("")}</dl>`;
}

function renderReceipt() {
  const receipt = state.ledger.receipts.at(-1);
  const key = receipt ? receipt.no : 0;
  if (els.receipt.dataset.key === String(key)) return;
  els.receipt.dataset.key = String(key);
  els.receipt.hidden = !receipt;
  if (!receipt) return els.receipt.replaceChildren();
  const asked = receipt.mode === "amount" ? formatKobo(receipt.requestKobo) : formatMl(receipt.requestMl, 2);
  els.receipt.innerHTML = `<h4>Receipt ${receiptLabel(receipt.no)} · ${receipt.product}</h4>
    ${dl([
      ["Asked for", asked],
      ["Delivered", formatMl(receipt.volumeMl, 3)],
      ["Price (locked)", `${formatKobo(receipt.priceKobo)}/L`],
      ["Charged", formatKobo(receipt.chargeKobo)],
      ["Paid by", receipt.method[0].toUpperCase() + receipt.method.slice(1)],
      ["Pump stopped", STOP_TEXT[receipt.stopReason] ?? "—"],
    ])}
    <p class="note">Simulated receipt — no money moved. Charge = litres × price, rounded half-up to the kobo.</p>`;
}

function renderSummary() {
  const c = state.closing;
  const key = c ? "closed" : "";
  if (els.summary.dataset.key === key) return;
  els.summary.dataset.key = key;
  els.summary.hidden = !c;
  if (!c) return els.summary.replaceChildren();
  const ok = c.varianceMl === 0;
  els.summary.innerHTML = `<h4>Stock (litres)</h4>
    ${dl([
      ["Opening stock", formatMl(c.openingMl, 3)],
      ["+ Received", formatMl(c.receivedMl, 3)],
      ["− Sold", formatMl(c.soldMl, 3)],
      ["= Closing (book)", formatMl(c.expectedClosingMl, 3), "eq"],
      ["Tank dip (measured)", formatMl(c.measuredMl, 3)],
      ["Difference", `${formatMl(c.varianceMl, 3)} ${ok ? "✓" : "⚠"}`, ok ? "ok" : "bad"],
    ])}
    <h4>Money</h4>
    ${dl([
      ["Sales value", formatKobo(c.salesKobo)],
      ["Collected", formatKobo(c.collectedKobo)],
      ["Outstanding", formatKobo(c.outstandingKobo), c.outstandingKobo ? "bad" : ""],
      ["Delivery cost recorded", formatKobo(c.purchaseKobo)],
    ])}
    <p class="note">Sales value is not profit: it ignores the cost of litres sold, wages, power and losses. Evaporation and temperature are not modelled.</p>`;
}

function update() {
  const inp = inputs();
  const g = guide(state, inp);
  const v = read(state);
  scene.update({ ...v, saleStatus: state.sale?.status ?? null });
  scene.animateFlow(reducedMotion.matches ? 0 : flowPhase);
  renderReadouts(v);
  renderLog();

  const key = [state.events.length, ui.mode, ui.paused, JSON.stringify(inp), whyOverride, Boolean(g.waiting)].join("|");
  if (key !== structureKey) {
    structureKey = key;
    renderStructure(inp, g);
  }
  renderNow(inp, g);
  scheduleAuto();
  ensureLoop();
}

// ---------------------------------------------------------------------------
// boot

function buildButtons() {
  const buttons = [];
  for (const slot of doc.querySelectorAll(".act[data-act]")) {
    const key = slot.dataset.act;
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = `act-btn${DANGER.has(ALIASES[key]?.type ?? key) ? " danger" : ""}`;
    btn.dataset.key = key;
    btn.id = `btn-${key}`;
    btn.setAttribute("aria-describedby", `why-${key}`);
    btn.append(doc.createTextNode(""));
    btn.addEventListener("click", () => onAction(key));
    const why = doc.createElement("span");
    why.className = "why";
    why.id = `why-${key}`;
    slot.append(btn, why);
    buttons.push(btn);
  }
  return buttons;
}

function boot() {
  const host = $("#scene");
  host.innerHTML = sceneMarkup();
  const flag = doc.createElement("div");
  flag.className = "pause-flag";
  flag.textContent = "Paused";
  flag.hidden = true;
  host.append(flag);
  const svg = host.querySelector("svg");
  scene = { svg, ...bindScene(svg) };

  Object.assign(els, {
    layout: $(".layout"),
    price: $("#price-input"),
    preset: $("#preset-input"),
    method: $("#method-select"),
    tanker: $("#tanker-input"),
    priceErr: $("#price-error"),
    presetErr: $("#preset-error"),
    tankerErr: $("#tanker-error"),
    explorePanel: $("#explore-panel"),
    steps: [...doc.querySelectorAll(".step")],
    receipt: $("#receipt"),
    summary: $("#summary"),
    pause: $("#pause-btn"),
    pauseFlag: flag,
    nowNum: $("#now-num"),
    nowTitle: $("#now-title"),
    nowText: $("#now-text"),
    nowWhy: $("#now-why"),
    next: $("#next-btn"),
    clock: $("#clock"),
    log: $("#log"),
    logCount: $("#log-count"),
    announcer: $("#announcer"),
    read: Object.fromEntries(
      ["tank", "tank-s", "tanker", "tanker-s", "car", "car-s", "meter", "meter-s", "money", "money-s"].map((k) => [k, $(`#r-${k}`)]),
    ),
  });
  els.buttons = buildButtons();

  const scenarioSelect = $("#scenario-select");
  for (const [id, s] of Object.entries(SCENARIOS)) {
    const opt = doc.createElement("option");
    opt.value = id;
    opt.textContent = s.label;
    scenarioSelect.append(opt);
  }

  for (const b of doc.querySelectorAll("[data-mode]")) b.addEventListener("click", () => setMode(b.dataset.mode));
  els.pause.addEventListener("click", () => setPaused(!ui.paused));
  $("#reset-btn").addEventListener("click", reset);
  $("#speed-select").addEventListener("change", (e) => {
    ui.speed = Number(e.target.value);
    update();
  });
  $("#scenario-btn").addEventListener("click", () => {
    ui.scenario = scenarioSelect.value;
    reset();
  });
  els.next.addEventListener("click", onNext);
  for (const input of [els.price, els.preset, els.tanker, els.method]) input.addEventListener("input", update);
  for (const radio of doc.querySelectorAll('input[name="preset-mode"]')) {
    radio.addEventListener("change", () => {
      const mode = radio.value;
      els.preset.value = mode === "volume" ? String(DEFAULT_INPUTS.volumeMl / 1000) : String(DEFAULT_INPUTS.amountKobo / 100);
      syncPresetLabel();
      update();
    });
  }
  els.price.addEventListener("keydown", (e) => e.key === "Enter" && onAction("setPrice"));
  els.preset.addEventListener("keydown", (e) => e.key === "Enter" && onAction("setPreset"));
  narrow.addEventListener("change", () => update());
  reducedMotion.addEventListener("change", () => update());

  resetInputs();
  camera = [...targetCamera()];
  applyCamera();
  update();
}

if (typeof document !== "undefined") {
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
}
