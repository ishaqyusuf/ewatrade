// Petrol station simulator — pure deterministic model.
//
// Units (integers only):
//   volume  millilitres (ml)          1 L = 1,000 ml
//   money   kobo                      ₦1 = 100 kobo
//   price   kobo per litre
//   time    simulated milliseconds
//
// Rounding rule (the only one): a charge is volume × price rounded half-up to
// the nearest kobo, i.e. floor((ml × koboPerLitre + 500) / 1000). A naira
// budget converts to the largest whole-millilitre volume whose exact value does
// not exceed it, floor(budget × 1000 / price); because that exact value is at
// most the budget, its half-up rounded charge is too.
//
// Every function here is pure: inputs are never mutated and the same inputs
// always produce the same outputs. Rendering and playback read this model only.

export const MODEL_VERSION = 1;
export const ML_PER_LITRE = 1000;
export const KOBO_PER_NAIRA = 100;

export const DEFAULT_CONFIG = Object.freeze({
  product: "PMS",
  productName: "Petrol (PMS)",
  tankCapacityMl: 30_000_000, // 30,000 L underground tank
  openingStockMl: 6_000_000, // 6,000 L in the tank at the start of the day
  tankerLoadMl: 20_000_000, // 20,000 L on the tanker
  tankerProduct: "PMS",
  tankerCostPerLitreKobo: 92_000, // ₦920/L example purchase cost
  defaultRetailPriceKobo: 100_000, // ₦1,000/L example pump price
  dischargeRateMlPerMin: 600_000, // 600 L/min gravity drop
  dispenseRateMlPerMin: 40_000, // 40 L/min nozzle flow
  vehicleCapacityMl: 50_000, // 50 L car tank
  vehicleStartFuelMl: 8_000, // car arrives with 8 L
  vehicleProduct: "PMS",
  dispenserProduct: "PMS",
});

export const LIMITS = Object.freeze({
  priceKobo: [100, 10_000_000], // ₦1 – ₦100,000 per litre
  amountKobo: [5_000, 100_000_000], // ₦50 – ₦1,000,000
  volumeMl: [100, 1_000_000], // 0.1 L – 1,000 L
  tankerLoadMl: [1_000_000, 45_000_000], // 1,000 L – 45,000 L
});

export const SCENARIOS = Object.freeze({
  standard: { label: "Standard day", overrides: {} },
  "low-stock": {
    label: "Low stock (12 L left)",
    overrides: { openingStockMl: 12_000 },
  },
  empty: { label: "Empty tank", overrides: { openingStockMl: 0 } },
  "nearly-full": {
    label: "Nearly full tank (26,000 L)",
    overrides: { openingStockMl: 26_000_000 },
  },
});

export const STEPS = Object.freeze([
  { id: 1, title: "Tanker arrives" },
  { id: 2, title: "Receive the delivery" },
  { id: 3, title: "Open the station" },
  { id: 4, title: "Serve the customer" },
  { id: 5, title: "Dispense" },
  { id: 6, title: "Pay and receipt" },
  { id: 7, title: "Close and reconcile" },
]);

// ---------------------------------------------------------------------------
// Integer arithmetic

function assertNonNegInt(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

/** floor((a × b + d/2) / d) for non-negative integers, exact via BigInt. */
export function mulDivRoundHalfUp(a, b, d) {
  assertNonNegInt(a, "a");
  assertNonNegInt(b, "b");
  if (!Number.isSafeInteger(d) || d <= 0) throw new RangeError("d must be positive");
  const big = (BigInt(a) * BigInt(b) * 2n + BigInt(d)) / (BigInt(d) * 2n);
  return Number(big);
}

/** floor(a × b / d) for non-negative integers, exact via BigInt. */
export function mulDivFloor(a, b, d) {
  assertNonNegInt(a, "a");
  assertNonNegInt(b, "b");
  if (!Number.isSafeInteger(d) || d <= 0) throw new RangeError("d must be positive");
  return Number((BigInt(a) * BigInt(b)) / BigInt(d));
}

/** Charge in kobo for a volume at a per-litre price, rounded half-up. */
export function chargeFor(volumeMl, priceKobo) {
  return mulDivRoundHalfUp(volumeMl, priceKobo, ML_PER_LITRE);
}

/** Largest whole-millilitre volume whose charge cannot exceed the budget. */
export function maxVolumeForAmount(amountKobo, priceKobo) {
  if (!(priceKobo > 0)) return 0;
  return mulDivFloor(amountKobo, ML_PER_LITRE, priceKobo);
}

// ---------------------------------------------------------------------------
// Parsing and formatting (strings ↔ integers, no floating point)

function parseDecimal(text, maxDecimals, scale) {
  if (typeof text !== "string" && typeof text !== "number") return null;
  const clean = String(text).trim().replace(/[,\s₦]/g, "");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(clean);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > maxDecimals) return null;
  const whole = Number(match[1]);
  const part = Number(fraction.padEnd(maxDecimals, "0") || "0");
  const value = whole * scale + part;
  return Number.isSafeInteger(value) ? value : null;
}

/** "1,000.50" → 100050 kobo; null when not a valid naira amount. */
export function parseNairaToKobo(text) {
  return parseDecimal(text, 2, KOBO_PER_NAIRA);
}

/** "12.5" → 12500 ml; null when not a valid litre amount. */
export function parseLitresToMl(text) {
  return parseDecimal(text, 3, ML_PER_LITRE);
}

function groupThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 123456 kobo → "₦1,234.56". */
export function formatKobo(kobo, { symbol = true } = {}) {
  const sign = kobo < 0 ? "−" : "";
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / KOBO_PER_NAIRA);
  const rest = String(abs % KOBO_PER_NAIRA).padStart(2, "0");
  return `${sign}${symbol ? "₦" : ""}${groupThousands(naira)}.${rest}`;
}

/** 12345 ml → "12.345 L" (decimals: 0–3). */
export function formatMl(ml, decimals = 2, { unit = true } = {}) {
  const sign = ml < 0 ? "−" : "";
  const abs = Math.abs(ml);
  const factor = 10 ** (3 - decimals);
  const scaled = Math.floor(abs / factor); // truncate: meters never round up
  const whole = Math.floor(scaled / 10 ** decimals);
  const frac = decimals ? `.${String(scaled % 10 ** decimals).padStart(decimals, "0")}` : "";
  return `${sign}${groupThousands(whole)}${frac}${unit ? " L" : ""}`;
}

/** Simulated duration → "1h 02m 05s" / "2m 05s" / "45s". */
export function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v) => String(v).padStart(2, "0");
  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// State

function validateConfig(config) {
  const ints = [
    "tankCapacityMl",
    "openingStockMl",
    "tankerLoadMl",
    "tankerCostPerLitreKobo",
    "defaultRetailPriceKobo",
    "dischargeRateMlPerMin",
    "dispenseRateMlPerMin",
    "vehicleCapacityMl",
    "vehicleStartFuelMl",
  ];
  for (const key of ints) assertNonNegInt(config[key], key);
  if (config.openingStockMl > config.tankCapacityMl) {
    throw new RangeError("openingStockMl exceeds tankCapacityMl");
  }
  if (config.vehicleStartFuelMl > config.vehicleCapacityMl) {
    throw new RangeError("vehicleStartFuelMl exceeds vehicleCapacityMl");
  }
  if (config.dischargeRateMlPerMin <= 0 || config.dispenseRateMlPerMin <= 0) {
    throw new RangeError("flow rates must be positive");
  }
}

export function createState(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  validateConfig(config);
  return {
    version: MODEL_VERSION,
    config,
    clockMs: 0,
    tank: { stockMl: config.openingStockMl },
    station: {
      powerOn: false,
      powerCause: "switched-off", // "switched-on" | "switched-off" | "power-cut"
      open: false,
      estop: false,
      priceKobo: null,
      closedForDay: false,
    },
    dispenser: { nozzle: "holstered", totaliserMl: 0 },
    delivery: null,
    sale: null,
    ledger: {
      openingStockMl: config.openingStockMl,
      deliveries: [],
      sales: [],
      receipts: [],
    },
    closing: null,
    counters: { delivery: 1, sale: 1, receipt: 1, event: 1 },
    events: [],
  };
}

export function createScenario(name, extra = {}) {
  const scenario = SCENARIOS[name] ?? SCENARIOS.standard;
  return createState({ ...scenario.overrides, ...extra });
}

function clone(state) {
  return structuredClone(state);
}

function logEvent(draft, type, detail = {}) {
  draft.events.push({ seq: draft.counters.event++, t: draft.clockMs, type, ...detail });
}

const HOSE_CONNECTED = new Set(["connected", "discharging", "halted", "complete"]);

function deliveryHoseConnected(state) {
  return Boolean(state.delivery && HOSE_CONNECTED.has(state.delivery.status));
}

function ullage(state) {
  return state.config.tankCapacityMl - state.tank.stockMl;
}

function vehicleSpace(sale) {
  return sale ? sale.vehicle.capacityMl - sale.vehicle.fuelMl : 0;
}

/** Highest cumulative volume this delivery may reach right now. */
function deliveryLimit(state) {
  const d = state.delivery;
  return d.receivedMl + Math.min(d.tankerMl, ullage(state));
}

/** Cumulative dispense limit and the constraint that binds it. */
function saleLimit(state) {
  const sale = state.sale;
  const candidates = [
    ["target", sale.targetMl],
    ["vehicle-full", sale.deliveredMl + vehicleSpace(sale)],
    ["tank-empty", sale.deliveredMl + state.tank.stockMl],
  ];
  let best = candidates[0];
  for (const c of candidates) if (c[1] < best[1]) best = c;
  return { limitMl: best[1], reason: best[0] };
}

// ---------------------------------------------------------------------------
// Actions: each has a check (returns a learner-facing reason or null) and a
// run that mutates a private draft. `apply` is the only way state changes.

const SALE_ACTIVE = new Set(["preset", "nozzle", "dispensing", "stopped", "returned"]);

function dayClosed(state) {
  return state.station.closedForDay ? "The day is closed. Reset to run another day." : null;
}

const ACTIONS = {
  arriveTanker: {
    label: "Tanker arrives",
    check(s, p = {}) {
      if (s.delivery) return "A tanker is already on site.";
      const load = p.loadMl ?? s.config.tankerLoadMl;
      if (!Number.isSafeInteger(load) || load < LIMITS.tankerLoadMl[0] || load > LIMITS.tankerLoadMl[1]) {
        return "Tanker load must be between 1,000 L and 45,000 L.";
      }
      return dayClosed(s);
    },
    run(d, p = {}) {
      const load = p.loadMl ?? d.config.tankerLoadMl;
      d.delivery = {
        no: d.counters.delivery++,
        product: d.config.tankerProduct,
        status: "arrived",
        tankerStartMl: load,
        tankerMl: load,
        costPerLitreKobo: d.config.tankerCostPerLitreKobo,
        receivedMl: 0,
        activeMs: 0,
        dipBeforeMl: null,
        spaceMl: null,
        stopReason: null,
      };
      logEvent(d, "tanker-arrived", { loadMl: load });
    },
  },

  checkTank: {
    label: "Dip tank and check space",
    check(s) {
      if (!s.delivery) return "No tanker on site yet.";
      if (s.delivery.status !== "arrived") return "The tank has already been checked for this delivery.";
      return null;
    },
    run(d) {
      const del = d.delivery;
      del.status = "checked";
      del.dipBeforeMl = d.tank.stockMl;
      del.spaceMl = ullage(d);
      logEvent(d, "tank-checked", { stockMl: d.tank.stockMl, spaceMl: del.spaceMl });
    },
  },

  connectDelivery: {
    label: "Connect delivery hose",
    check(s) {
      const del = s.delivery;
      if (!del) return "No tanker on site yet.";
      if (del.status === "arrived") return "Dip the tank and check space before connecting.";
      if (del.status !== "checked") return "The delivery hose is already connected.";
      if (del.product !== s.config.product) return "Tanker product does not match this tank.";
      if (ullage(s) === 0) return "The tank is full — there is no space to receive fuel.";
      if (s.sale?.status === "dispensing") return "The pump is running. Wait for the current sale to stop.";
      return null;
    },
    run(d) {
      d.delivery.status = "connected";
      logEvent(d, "delivery-connected");
    },
  },

  startDischarge: {
    label: "Start discharge",
    check(s) {
      const del = s.delivery;
      if (!del) return "No tanker on site yet.";
      if (del.status === "discharging") return "Fuel is already flowing into the tank.";
      if (del.status === "complete") return "This delivery has finished. Disconnect the tanker.";
      if (del.status !== "connected" && del.status !== "halted") return "Connect the delivery hose first.";
      if (s.station.estop) return "Emergency stop is latched. Reset it first.";
      if (del.tankerMl === 0) return "The tanker is empty.";
      if (ullage(s) === 0) return "The tank is full.";
      return null;
    },
    run(d) {
      const resumed = d.delivery.status === "halted";
      d.delivery.status = "discharging";
      d.delivery.stopReason = null;
      logEvent(d, resumed ? "discharge-resumed" : "discharge-started");
    },
  },

  haltDischarge: {
    label: "Halt discharge",
    check(s) {
      if (s.delivery?.status !== "discharging") return "No delivery is flowing.";
      return null;
    },
    run(d) {
      d.delivery.status = "halted";
      d.delivery.stopReason = "manual";
      logEvent(d, "discharge-halted", { receivedMl: d.delivery.receivedMl, reason: "manual" });
    },
  },

  finishDelivery: {
    label: "Finish and disconnect",
    check(s) {
      if (!s.delivery) return "No tanker on site.";
      if (s.delivery.status === "discharging") return "Fuel is still flowing. Wait for it to finish or halt it.";
      return null;
    },
    run(d) {
      const del = d.delivery;
      const record = {
        no: del.no,
        product: del.product,
        tankerStartMl: del.tankerStartMl,
        acceptedMl: del.receivedMl,
        returnedMl: del.tankerMl,
        costPerLitreKobo: del.costPerLitreKobo,
        costKobo: chargeFor(del.receivedMl, del.costPerLitreKobo),
        dipBeforeMl: del.dipBeforeMl,
        dipAfterMl: d.tank.stockMl,
        stopReason: del.stopReason ?? (del.receivedMl === 0 ? "not-discharged" : "complete"),
      };
      d.ledger.deliveries.push(record);
      d.delivery = null;
      logEvent(d, "delivery-recorded", { acceptedMl: record.acceptedMl, costKobo: record.costKobo });
    },
  },

  powerOn: {
    label: "Switch power on",
    check(s) {
      if (s.station.powerOn) return "Power is already on.";
      return null;
    },
    run(d) {
      const restored = d.station.powerCause === "power-cut";
      d.station.powerOn = true;
      d.station.powerCause = "switched-on";
      logEvent(d, restored ? "power-restored" : "power-on");
    },
  },

  powerOff: {
    label: "Switch power off",
    check(s) {
      if (!s.station.powerOn) return "Power is already off.";
      return null;
    },
    run(d) {
      cutPower(d, "switched-off");
    },
  },

  powerCut: {
    label: "Power cut",
    check(s) {
      if (!s.station.powerOn) return "Power is already off.";
      return null;
    },
    run(d) {
      cutPower(d, "power-cut");
    },
  },

  setPrice: {
    label: "Set pump price",
    check(s, p = {}) {
      const price = p.priceKobo;
      if (!Number.isSafeInteger(price)) return "Enter a price per litre.";
      if (price < LIMITS.priceKobo[0] || price > LIMITS.priceKobo[1]) {
        return "Price must be between ₦1 and ₦100,000 per litre.";
      }
      if (price === s.station.priceKobo) return "That price is already set.";
      return dayClosed(s);
    },
    run(d, p) {
      const from = d.station.priceKobo;
      d.station.priceKobo = p.priceKobo;
      logEvent(d, "price-set", { fromKobo: from, priceKobo: p.priceKobo });
    },
  },

  openStation: {
    label: "Open for service",
    check(s) {
      if (s.station.closedForDay) return dayClosed(s);
      if (s.station.open) return "The station is already open.";
      if (!s.station.powerOn) return "Switch power on first — pumps cannot serve without it.";
      if (s.station.priceKobo == null) return "Set a pump price first.";
      if (s.station.estop) return "Emergency stop is latched. Reset it first.";
      return null;
    },
    run(d) {
      d.station.open = true;
      logEvent(d, "station-opened");
    },
  },

  customerArrives: {
    label: "Customer arrives",
    check(s) {
      if (s.station.closedForDay) return dayClosed(s);
      if (s.sale) return "A customer is already at the pump.";
      if (!s.station.open) return "The station is closed for service.";
      return null;
    },
    run(d) {
      d.sale = {
        no: d.counters.sale++,
        status: "arrived",
        vehicle: {
          product: d.config.vehicleProduct,
          capacityMl: d.config.vehicleCapacityMl,
          startFuelMl: d.config.vehicleStartFuelMl,
          fuelMl: d.config.vehicleStartFuelMl,
        },
        mode: null,
        amountKobo: null,
        volumeMl: null,
        priceKobo: null,
        targetMl: 0,
        deliveredMl: 0,
        activeMs: 0,
        rateMlPerMin: d.config.dispenseRateMlPerMin,
        stopReason: null,
        receiptNo: null,
        method: null,
      };
      logEvent(d, "customer-arrived", { saleNo: d.sale.no });
    },
  },

  setPreset: {
    label: "Authorise preset",
    check(s, p = {}) {
      const sale = s.sale;
      if (!sale) return "No customer at the pump.";
      if (sale.status !== "arrived" && sale.status !== "preset") {
        return "The preset is locked once the nozzle is lifted.";
      }
      if (!s.station.powerOn) return "No power — the dispenser keypad is dark.";
      if (s.station.priceKobo == null && sale.priceKobo == null) return "Set a pump price first.";
      const price = sale.priceKobo ?? s.station.priceKobo;
      if (p.mode === "amount") {
        const a = p.amountKobo;
        if (!Number.isSafeInteger(a) || a < LIMITS.amountKobo[0] || a > LIMITS.amountKobo[1]) {
          return "Amount must be between ₦50 and ₦1,000,000.";
        }
        if (maxVolumeForAmount(a, price) === 0) return "That amount buys less than 1 ml.";
        return null;
      }
      if (p.mode === "volume") {
        const v = p.volumeMl;
        if (!Number.isSafeInteger(v) || v < LIMITS.volumeMl[0] || v > LIMITS.volumeMl[1]) {
          return "Litres must be between 0.1 L and 1,000 L.";
        }
        return null;
      }
      return "Choose naira or litres.";
    },
    run(d, p) {
      const sale = d.sale;
      // The unit price is locked the first time the sale is authorised.
      if (sale.priceKobo == null) sale.priceKobo = d.station.priceKobo;
      sale.mode = p.mode;
      if (p.mode === "amount") {
        sale.amountKobo = p.amountKobo;
        sale.volumeMl = null;
        sale.targetMl = maxVolumeForAmount(p.amountKobo, sale.priceKobo);
      } else {
        sale.volumeMl = p.volumeMl;
        sale.amountKobo = null;
        sale.targetMl = p.volumeMl;
      }
      sale.status = "preset";
      logEvent(d, "preset-authorised", {
        saleNo: sale.no,
        mode: sale.mode,
        priceKobo: sale.priceKobo,
        targetMl: sale.targetMl,
      });
    },
  },

  liftNozzle: {
    label: "Lift nozzle into car",
    check(s) {
      const sale = s.sale;
      if (!sale) return "No customer at the pump.";
      if (sale.status === "arrived") return "Authorise a naira or litre preset first.";
      if (sale.status !== "preset") return "The nozzle is already out.";
      if (sale.vehicle.product !== s.config.dispenserProduct) {
        return "Wrong nozzle: this dispenser does not match the car's fuel.";
      }
      return null;
    },
    run(d) {
      d.sale.status = "nozzle";
      d.dispenser.nozzle = "in-vehicle";
      logEvent(d, "nozzle-lifted", { saleNo: d.sale.no });
    },
  },

  startPump: {
    label: "Start pump",
    check(s) {
      const sale = s.sale;
      if (!sale) return "No customer at the pump.";
      if (sale.status === "dispensing") return "Fuel is already flowing.";
      if (sale.status === "arrived") return "Authorise a naira or litre preset first.";
      if (sale.status === "preset") return "Lift the nozzle into the car's filler first.";
      if (sale.status !== "nozzle") {
        return "This sale has stopped. Return the nozzle and settle it; more fuel needs a new sale.";
      }
      if (s.dispenser.nozzle !== "in-vehicle") return "The nozzle is not in the car.";
      if (sale.vehicle.product !== s.config.dispenserProduct) return "Wrong nozzle for this car.";
      if (s.station.estop) return "Emergency stop is latched. Reset it first.";
      if (!s.station.powerOn) return "No power — the pump motor and meter need electricity.";
      if (!s.station.open) return "The station is closed for service.";
      if (deliveryHoseConnected(s)) return "The tank is taking a delivery. Finish and disconnect first.";
      if (s.tank.stockMl === 0) return "The tank is empty.";
      if (vehicleSpace(sale) === 0) return "The car's tank is already full.";
      return null;
    },
    run(d) {
      d.sale.status = "dispensing";
      logEvent(d, "pump-started", { saleNo: d.sale.no });
    },
  },

  stopPump: {
    label: "Stop pump",
    check(s) {
      if (s.sale?.status !== "dispensing") return "The pump is not running.";
      return null;
    },
    run(d) {
      stopSale(d, "manual");
    },
  },

  returnNozzle: {
    label: "Return nozzle",
    check(s) {
      const sale = s.sale;
      if (!sale || s.dispenser.nozzle !== "in-vehicle") return "The nozzle is already in its holster.";
      if (sale.status === "dispensing") return "Stop the pump before hanging up the nozzle.";
      return null;
    },
    run(d) {
      const sale = d.sale;
      d.dispenser.nozzle = "holstered";
      sale.status = sale.deliveredMl > 0 ? "returned" : "cancelled";
      logEvent(d, "nozzle-returned", { saleNo: sale.no, deliveredMl: sale.deliveredMl });
    },
  },

  recordPayment: {
    label: "Record payment",
    check(s, p = {}) {
      const sale = s.sale;
      if (!sale) return "No sale to pay for.";
      if (sale.status === "paid") return `Already paid — receipt ${receiptLabel(sale.receiptNo)}.`;
      if (sale.status === "unpaid") return "This sale was left unpaid.";
      if (sale.status === "cancelled") return "Nothing was dispensed, so nothing is due.";
      if (sale.status !== "returned") return "Return the nozzle first so the meter settles.";
      if (!["cash", "transfer", "card"].includes(p.method ?? "cash")) return "Choose cash, transfer or card.";
      return null;
    },
    run(d, p = {}) {
      const sale = d.sale;
      const method = p.method ?? "cash";
      const receipt = {
        no: d.counters.receipt++,
        saleNo: sale.no,
        product: d.config.productName,
        volumeMl: sale.deliveredMl,
        priceKobo: sale.priceKobo,
        chargeKobo: chargeFor(sale.deliveredMl, sale.priceKobo),
        paidKobo: chargeFor(sale.deliveredMl, sale.priceKobo),
        method,
        mode: sale.mode,
        requestKobo: sale.amountKobo,
        requestMl: sale.volumeMl,
        stopReason: sale.stopReason,
        t: d.clockMs,
      };
      d.ledger.receipts.push(receipt);
      sale.status = "paid";
      sale.receiptNo = receipt.no;
      sale.method = method;
      logEvent(d, "payment-recorded", { saleNo: sale.no, receiptNo: receipt.no, paidKobo: receipt.paidKobo });
    },
  },

  leaveUnpaid: {
    label: "Leave unpaid",
    check(s) {
      const sale = s.sale;
      if (!sale) return "No sale to settle.";
      if (sale.status === "paid") return "This sale is already paid.";
      if (sale.status === "unpaid") return "Already recorded as unpaid.";
      if (sale.status !== "returned") return "Return the nozzle first so the meter settles.";
      return null;
    },
    run(d) {
      d.sale.status = "unpaid";
      logEvent(d, "sale-unpaid", { saleNo: d.sale.no, dueKobo: chargeFor(d.sale.deliveredMl, d.sale.priceKobo) });
    },
  },

  customerLeaves: {
    label: "Customer leaves",
    check(s) {
      const sale = s.sale;
      if (!sale) return "No customer at the pump.";
      if (sale.status === "returned") return "Settle the sale first — record payment.";
      if (s.dispenser.nozzle === "in-vehicle") return "Return the nozzle first.";
      return null;
    },
    run(d) {
      const sale = d.sale;
      const status = sale.status === "arrived" || sale.status === "preset" ? "cancelled" : sale.status;
      d.ledger.sales.push({
        no: sale.no,
        status,
        mode: sale.mode,
        amountKobo: sale.amountKobo,
        volumeMl: sale.volumeMl,
        priceKobo: sale.priceKobo,
        deliveredMl: sale.deliveredMl,
        chargeKobo: sale.priceKobo == null ? 0 : chargeFor(sale.deliveredMl, sale.priceKobo),
        paidKobo: status === "paid" ? chargeFor(sale.deliveredMl, sale.priceKobo) : 0,
        stopReason: sale.stopReason,
        receiptNo: sale.receiptNo,
        method: sale.method,
      });
      d.sale = null;
      logEvent(d, "customer-left", { saleNo: sale.no, status });
    },
  },

  emergencyStop: {
    label: "Emergency stop",
    check(s) {
      if (s.station.estop) return "Emergency stop is already latched.";
      return null;
    },
    run(d) {
      d.station.estop = true;
      if (d.sale?.status === "dispensing") stopSale(d, "estop");
      if (d.delivery?.status === "discharging") {
        d.delivery.status = "halted";
        d.delivery.stopReason = "estop";
        logEvent(d, "discharge-halted", { receivedMl: d.delivery.receivedMl, reason: "estop" });
      }
      logEvent(d, "emergency-stop");
    },
  },

  resetEmergency: {
    label: "Reset emergency stop",
    check(s) {
      if (!s.station.estop) return "Emergency stop is not latched.";
      return null;
    },
    run(d) {
      d.station.estop = false;
      logEvent(d, "emergency-reset");
    },
  },

  closeStation: {
    label: "Close station",
    check(s) {
      if (s.station.closedForDay) return dayClosed(s);
      if (!s.station.open) return "The station is not open.";
      if (s.sale) return "Finish the current sale and let the customer leave first.";
      if (s.delivery) return "Finish and disconnect the delivery first.";
      return null;
    },
    run(d) {
      d.station.open = false;
      d.station.closedForDay = true;
      d.closing = reconcile(d);
      logEvent(d, "station-closed", { closingStockMl: d.tank.stockMl });
    },
  },
};

function cutPower(d, cause) {
  d.station.powerOn = false;
  d.station.powerCause = cause;
  if (d.sale?.status === "dispensing") stopSale(d, "power");
  logEvent(d, cause === "power-cut" ? "power-cut" : "power-off");
}

function stopSale(d, reason) {
  d.sale.status = "stopped";
  d.sale.stopReason = reason;
  logEvent(d, "pump-stopped", { saleNo: d.sale.no, deliveredMl: d.sale.deliveredMl, reason });
}

export const ACTION_TYPES = Object.freeze(Object.keys(ACTIONS));

export function actionLabel(type) {
  return ACTIONS[type]?.label ?? type;
}

export function receiptLabel(no) {
  return no == null ? "—" : `R-${String(no).padStart(4, "0")}`;
}

/** Whether an action is allowed now, and if not, why. */
export function can(state, action) {
  const def = ACTIONS[action?.type];
  if (!def) return { ok: false, reason: "Unknown action." };
  const reason = def.check(state, action.payload);
  return reason ? { ok: false, reason } : { ok: true, reason: null };
}

/** Apply one action. Rejected actions return the same state object unchanged. */
export function apply(state, action) {
  const verdict = can(state, action);
  if (!verdict.ok) return { state, ok: false, reason: verdict.reason };
  const draft = clone(state);
  ACTIONS[action.type].run(draft, action.payload);
  return { state: draft, ok: true, reason: null };
}

// ---------------------------------------------------------------------------
// Time. Flow volume is a function of cumulative active time, so the result is
// identical however the elapsed time is split into ticks.

export function isFlowing(state) {
  return state.delivery?.status === "discharging" || state.sale?.status === "dispensing";
}

export function tick(state, dtMs) {
  if (!Number.isSafeInteger(dtMs) || dtMs < 0) throw new RangeError("dtMs must be a non-negative integer");
  if (dtMs === 0 || !isFlowing(state)) return state;
  // Consume only the time the flow still needs, so the clock is also
  // independent of how elapsed time was split into ticks.
  const used = Math.min(dtMs, timeToFlowEnd(state));
  const d = clone(state);
  d.clockMs += used;

  if (d.delivery?.status === "discharging") {
    const del = d.delivery;
    del.activeMs += used;
    const limit = deliveryLimit(d);
    const cumulative = Math.min(
      mulDivFloor(d.config.dischargeRateMlPerMin, del.activeMs, 60_000),
      limit,
    );
    const step = cumulative - del.receivedMl;
    del.receivedMl += step;
    del.tankerMl -= step;
    d.tank.stockMl += step;
    if (del.receivedMl === limit) {
      del.status = "complete";
      del.stopReason = del.tankerMl === 0 ? "tanker-empty" : "tank-full";
      logEvent(d, "discharge-complete", { receivedMl: del.receivedMl, reason: del.stopReason });
    }
  }

  if (d.sale?.status === "dispensing") {
    const sale = d.sale;
    sale.activeMs += used;
    const { limitMl, reason } = saleLimit(d);
    const cumulative = Math.min(mulDivFloor(sale.rateMlPerMin, sale.activeMs, 60_000), limitMl);
    const step = cumulative - sale.deliveredMl;
    sale.deliveredMl += step;
    sale.vehicle.fuelMl += step;
    d.tank.stockMl -= step;
    d.dispenser.totaliserMl += step;
    if (sale.deliveredMl === limitMl) stopSale(d, reason);
  }

  return d;
}

/** Simulated time left until the active flow stops by itself (null if none). */
export function timeToFlowEnd(state) {
  // Active time at which floor(rate × activeMs / 60,000) first reaches the limit.
  const remaining = (limitMl, rate, activeMs) => {
    const needed = Number((BigInt(limitMl) * 60_000n + BigInt(rate) - 1n) / BigInt(rate));
    return Math.max(0, needed - activeMs);
  };
  const ends = [];
  if (state.delivery?.status === "discharging") {
    const del = state.delivery;
    ends.push(remaining(deliveryLimit(state), state.config.dischargeRateMlPerMin, del.activeMs));
  }
  if (state.sale?.status === "dispensing") {
    const sale = state.sale;
    ends.push(remaining(saleLimit(state).limitMl, sale.rateMlPerMin, sale.activeMs));
  }
  return ends.length ? Math.max(...ends) : null;
}

// ---------------------------------------------------------------------------
// Derived readings

export function reconcile(state) {
  const receivedMl = state.ledger.deliveries.reduce((sum, d) => sum + d.acceptedMl, 0)
    + (state.delivery?.receivedMl ?? 0);
  const archived = state.ledger.sales;
  const soldMl = archived.reduce((sum, s) => sum + s.deliveredMl, 0) + (state.sale?.deliveredMl ?? 0);
  const salesKobo = archived.reduce((sum, s) => sum + s.chargeKobo, 0)
    + (state.sale?.priceKobo != null ? chargeFor(state.sale.deliveredMl, state.sale.priceKobo) : 0);
  const collectedKobo = state.ledger.receipts.reduce((sum, r) => sum + r.paidKobo, 0);
  const purchaseKobo = state.ledger.deliveries.reduce((sum, d) => sum + d.costKobo, 0);
  const expectedClosingMl = state.ledger.openingStockMl + receivedMl - soldMl;
  return {
    openingMl: state.ledger.openingStockMl,
    receivedMl,
    soldMl,
    expectedClosingMl,
    measuredMl: state.tank.stockMl,
    varianceMl: state.tank.stockMl - expectedClosingMl,
    salesKobo,
    collectedKobo,
    outstandingKobo: salesKobo - collectedKobo,
    purchaseKobo,
    salesCount: archived.filter((s) => s.deliveredMl > 0).length + (state.sale?.deliveredMl > 0 ? 1 : 0),
    unpaidCount: archived.filter((s) => s.status === "unpaid").length,
  };
}

export function read(state) {
  const { config, tank, sale, delivery, station } = state;
  const lastSale = state.ledger.sales.at(-1) ?? null;
  const meterSource = sale && sale.priceKobo != null ? sale : lastSale;
  return {
    tank: {
      stockMl: tank.stockMl,
      capacityMl: config.tankCapacityMl,
      ullageMl: config.tankCapacityMl - tank.stockMl,
      fraction: tank.stockMl / config.tankCapacityMl,
    },
    tanker: delivery
      ? {
          present: true,
          status: delivery.status,
          ml: delivery.tankerMl,
          startMl: delivery.tankerStartMl,
          fraction: delivery.tankerMl / delivery.tankerStartMl,
          hoseConnected: HOSE_CONNECTED.has(delivery.status),
          receivedMl: delivery.receivedMl,
          spaceMl: delivery.spaceMl,
        }
      : { present: false, hoseConnected: false },
    vehicle: sale
      ? {
          present: true,
          fuelMl: sale.vehicle.fuelMl,
          capacityMl: sale.vehicle.capacityMl,
          fraction: sale.vehicle.fuelMl / sale.vehicle.capacityMl,
        }
      : { present: false },
    meter: {
      live: Boolean(sale && sale.priceKobo != null),
      volumeMl: meterSource?.deliveredMl ?? 0,
      chargeKobo:
        meterSource && meterSource.priceKobo != null
          ? chargeFor(meterSource.deliveredMl, meterSource.priceKobo)
          : 0,
      priceKobo: sale?.priceKobo ?? station.priceKobo,
      lockedPriceKobo: sale?.priceKobo ?? null,
      targetMl: sale?.targetMl ?? null,
      totaliserMl: state.dispenser.totaliserMl,
    },
    flows: {
      delivery: delivery?.status === "discharging",
      dispense: sale?.status === "dispensing",
    },
    nozzle: state.dispenser.nozzle,
    station: { ...station },
    totals: reconcile(state),
  };
}

// ---------------------------------------------------------------------------
// Guidance: the next recommended action. Guided mode highlights it; Auto mode
// dispatches it through `apply`, so both share the same transitions.

export const DEFAULT_INPUTS = Object.freeze({
  priceKobo: DEFAULT_CONFIG.defaultRetailPriceKobo,
  presetMode: "amount",
  amountKobo: 2_000_000, // ₦20,000
  volumeMl: 25_000, // 25 L
  method: "cash",
  tankerLoadMl: DEFAULT_CONFIG.tankerLoadMl,
});

function act(type, payload) {
  return payload === undefined ? { type } : { type, payload };
}

/** Guided step for the current state, with instruction and next action. */
export function guide(state, inputs = DEFAULT_INPUTS) {
  const s = state;
  const del = s.delivery;
  const sale = s.sale;
  const delivered = s.ledger.deliveries.length > 0;
  const served = s.ledger.sales.length > 0;
  const g = (step, instruction, next = null, waiting = null) => ({
    step,
    title: STEPS[step - 1].title,
    instruction,
    next,
    waiting,
    done: false,
  });

  if (s.station.closedForDay) {
    return { ...g(7, "Day closed. Opening stock + received − sold = closing stock."), done: true };
  }
  if (s.station.estop) {
    return g(sale ? 5 : del ? 2 : 3, "Emergency stop is latched. Check it is safe, then reset it. Nothing restarts by itself.", act("resetEmergency"));
  }

  // 1–2: delivery
  if (del) {
    switch (del.status) {
      case "arrived":
        return g(2, "Dip the tank: confirm the product and how much space it has before any hose goes on.", act("checkTank"));
      case "checked":
        return del.spaceMl === 0
          ? g(2, "No space in the tank. Send the tanker away.", act("finishDelivery"))
          : g(2, "Connect the tanker's hose to the tank fill point.", act("connectDelivery"));
      case "connected":
        return g(2, "Open the tanker valve. Fuel drops by gravity into the tank.", act("startDischarge"));
      case "discharging":
        return g(2, "Discharging. The tanker falls as the tank rises; it stops at the tank's free space.", null, "delivery");
      case "halted":
        return g(2, "Discharge halted. Resume it, or finish and record what was received.", act("startDischarge"));
      case "complete":
        return g(3, "Delivery finished. Disconnect and record the litres actually received.", act("finishDelivery"));
    }
  }
  if (!delivered && !served && !s.station.open) {
    return g(1, "A tanker brings petrol. Let it in to start the day's delivery.", act("arriveTanker", { loadMl: inputs.tankerLoadMl }));
  }

  // 3: open
  if (!sale) {
    if (!s.station.powerOn) return g(3, "Switch power on. Pump motors, meters and lights need it.", act("powerOn"));
    if (s.station.priceKobo == null) {
      return g(3, "Set the pump price per litre. Each sale locks the price it starts with.", act("setPrice", { priceKobo: inputs.priceKobo }));
    }
    if (!s.station.open) {
      if (served) return g(7, "The station is closed for service.", null);
      return g(3, "Open for service. Power is on, but customers wait until you open.", act("openStation"));
    }
    if (!served) return g(4, "A customer pulls up to the pump.", act("customerArrives"));
    return g(7, "Sale settled. Close the station and reconcile the day.", act("closeStation"));
  }

  // 4–6: sale
  switch (sale.status) {
    case "arrived": {
      const payload = inputs.presetMode === "volume"
        ? { mode: "volume", volumeMl: inputs.volumeMl }
        : { mode: "amount", amountKobo: inputs.amountKobo };
      return g(4, "Ask the customer: a naira amount or a number of litres? Authorise that preset.", act("setPreset", payload));
    }
    case "preset":
      return g(4, "Lift the petrol nozzle and place it in the car's filler.", act("liftNozzle"));
    case "nozzle":
      return g(5, "Start the pump. It stops by itself at the preset, a full car or an empty tank.", act("startPump"));
    case "dispensing":
      return g(5, "Pumping. The tank falls, the car rises and the meter counts together.", null, "dispense");
    case "stopped":
      return g(6, "Flow stopped. Hang up the nozzle so the sale settles.", act("returnNozzle"));
    case "returned":
      return g(6, "Charge for the litres delivered, not the litres asked for.", act("recordPayment", { method: inputs.method }));
    case "paid":
    case "unpaid":
    case "cancelled":
      return g(6, "Sale settled. The customer drives off.", act("customerLeaves"));
  }
  return g(1, "Ready.");
}

/** The automatic journey uses guide(); this helper runs it to completion. */
export function runJourney(state, inputs = DEFAULT_INPUTS, { tickMs = 1000, maxSteps = 100_000 } = {}) {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    const g = guide(s, inputs);
    if (g.done) return s;
    if (g.waiting) {
      s = tick(s, tickMs);
      continue;
    }
    if (!g.next) return s;
    const result = apply(s, g.next);
    if (!result.ok) throw new Error(`Journey stuck at ${g.next.type}: ${result.reason}`);
    s = result.state;
  }
  throw new Error("Journey did not finish");
}
