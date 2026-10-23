// Run: node --test experiments/petrol-station/model.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_INPUTS,
  apply,
  can,
  chargeFor,
  createScenario,
  createState,
  formatKobo,
  formatMl,
  guide,
  maxVolumeForAmount,
  parseLitresToMl,
  parseNairaToKobo,
  read,
  reconcile,
  runJourney,
  tick,
  timeToFlowEnd,
} from "./model.mjs";

// ---------------------------------------------------------------------------
// helpers

function must(state, type, payload) {
  const result = apply(state, payload === undefined ? { type } : { type, payload });
  assert.equal(result.ok, true, `${type} refused: ${result.reason}`);
  return result.state;
}

function refused(state, type, payload, pattern) {
  const result = apply(state, payload === undefined ? { type } : { type, payload });
  assert.equal(result.ok, false, `${type} should be refused`);
  assert.equal(result.state, state, "refused action must return the same state");
  if (pattern) assert.match(result.reason, pattern);
  return result.reason;
}

function runFlow(state, chunks = [1000]) {
  let s = state;
  let i = 0;
  let guard = 0;
  while ((s.delivery?.status === "discharging" || s.sale?.status === "dispensing") && guard++ < 1e6) {
    s = tick(s, chunks[i++ % chunks.length]);
  }
  return s;
}

function openStation(state, priceKobo = 100_000) {
  let s = must(state, "powerOn");
  s = must(s, "setPrice", { priceKobo });
  return must(s, "openStation");
}

function receiveDelivery(state, chunks) {
  let s = must(state, "arriveTanker");
  s = must(s, "checkTank");
  s = must(s, "connectDelivery");
  s = must(s, "startDischarge");
  s = runFlow(s, chunks);
  return must(s, "finishDelivery");
}

function assertConserved(s) {
  const r = reconcile(s);
  assert.equal(r.varianceMl, 0, "opening + received − sold must equal tank stock");
  assert.ok(s.tank.stockMl >= 0 && s.tank.stockMl <= s.config.tankCapacityMl, "tank within bounds");
  if (s.sale) {
    assert.ok(s.sale.vehicle.fuelMl <= s.sale.vehicle.capacityMl, "car never overfills");
    assert.equal(s.sale.vehicle.fuelMl - s.sale.vehicle.startFuelMl, s.sale.deliveredMl);
  }
  if (s.delivery) assert.equal(s.delivery.tankerStartMl - s.delivery.tankerMl, s.delivery.receivedMl);
}

// ---------------------------------------------------------------------------
// arithmetic and parsing

test("rounding: half-up to the kobo, exact for large values", () => {
  assert.equal(chargeFor(1, 100_000), 100); // 1 ml at ₦1,000/L = ₦1.00
  assert.equal(chargeFor(1, 93_550), 94); // 93.55 kobo → 94
  assert.equal(chargeFor(1, 93_450), 93); // 93.45 kobo → 93
  assert.equal(chargeFor(1, 500), 1); // exactly half rounds up
  assert.equal(chargeFor(45_000_000, 10_000_000), 450_000_000_000);
  assert.equal(chargeFor(0, 100_000), 0);
});

test("budget clamp: charge never exceeds the naira target", () => {
  for (let price = 100; price <= 300_000; price += 997) {
    for (const amount of [5_000, 123_456, 2_000_000, 99_999_999]) {
      const ml = maxVolumeForAmount(amount, price);
      assert.ok(chargeFor(ml, price) <= amount, `price ${price} amount ${amount}`);
      // and one more millilitre would exceed it (the clamp is tight)
      assert.ok((ml + 1) * price > amount * 1000);
    }
  }
  assert.equal(maxVolumeForAmount(2_000_000, 100_000), 20_000); // ₦20,000 at ₦1,000 = 20 L
  assert.equal(maxVolumeForAmount(500_000, 93_500), 5_347);
  assert.equal(chargeFor(5_347, 93_500), 499_945); // ₦4,999.45 ≤ ₦5,000
});

test("parsing and formatting avoid floating point", () => {
  assert.equal(parseNairaToKobo("1,000.50"), 100_050);
  assert.equal(parseNairaToKobo("₦20000"), 2_000_000);
  assert.equal(parseNairaToKobo("0.1"), 10);
  assert.equal(parseNairaToKobo("1.234"), null);
  assert.equal(parseNairaToKobo("-5"), null);
  assert.equal(parseNairaToKobo("abc"), null);
  assert.equal(parseLitresToMl("12.5"), 12_500);
  assert.equal(parseLitresToMl("0.001"), 1);
  assert.equal(parseLitresToMl("1.0001"), null);
  assert.equal(formatKobo(123_456), "₦1,234.56");
  assert.equal(formatKobo(5), "₦0.05");
  assert.equal(formatMl(12_345, 2), "12.34 L"); // meters truncate, never round up
  assert.equal(formatMl(20_000_000, 0), "20,000 L");
});

// ---------------------------------------------------------------------------
// delivery

test("delivery: tanker falls exactly as the tank rises; cost recorded once", () => {
  let s = createState();
  s = must(s, "arriveTanker");
  refused(s, "connectDelivery", undefined, /Dip the tank/);
  s = must(s, "checkTank");
  s = must(s, "connectDelivery");
  s = must(s, "startDischarge");
  s = tick(s, 60_000); // one simulated minute at 600 L/min
  assert.equal(s.delivery.receivedMl, 600_000);
  assert.equal(s.tank.stockMl, 6_600_000);
  assertConserved(s);
  refused(s, "finishDelivery", undefined, /still flowing/);
  s = runFlow(s, [7_777]);
  assert.equal(s.delivery.status, "complete");
  assert.equal(s.delivery.stopReason, "tanker-empty");
  assert.equal(s.tank.stockMl, 26_000_000);
  s = must(s, "finishDelivery");
  assert.equal(s.ledger.deliveries.length, 1);
  assert.equal(s.ledger.deliveries[0].acceptedMl, 20_000_000);
  assert.equal(s.ledger.deliveries[0].costKobo, 1_840_000_000); // 20,000 L × ₦920
  refused(s, "finishDelivery", undefined, /No tanker/);
  assert.equal(s.ledger.deliveries.length, 1, "repeat finish does not duplicate the record");
  assertConserved(s);
});

test("delivery: never overflows the tank; the rest stays on the tanker", () => {
  let s = createScenario("nearly-full"); // 26,000 L in a 30,000 L tank
  s = must(s, "arriveTanker");
  s = must(s, "checkTank");
  assert.equal(s.delivery.spaceMl, 4_000_000);
  s = must(s, "connectDelivery");
  s = must(s, "startDischarge");
  s = runFlow(s, [123_457]);
  assert.equal(s.tank.stockMl, 30_000_000);
  assert.equal(s.delivery.tankerMl, 16_000_000);
  assert.equal(s.delivery.stopReason, "tank-full");
  refused(s, "startDischarge", undefined, /finished/);
  s = must(s, "finishDelivery");
  assert.equal(s.ledger.deliveries[0].acceptedMl, 4_000_000);
  assert.equal(s.ledger.deliveries[0].returnedMl, 16_000_000);
  assert.equal(s.ledger.deliveries[0].costKobo, 368_000_000); // only accepted litres
  // A full tank cannot connect another delivery.
  s = must(s, "arriveTanker");
  s = must(s, "checkTank");
  refused(s, "connectDelivery", undefined, /full/);
  assertConserved(s);
});

test("delivery: halt and explicit resume give the same total as an unbroken run", () => {
  let a = createState();
  a = must(a, "arriveTanker");
  a = must(a, "checkTank");
  a = must(a, "connectDelivery");
  a = must(a, "startDischarge");
  a = tick(a, 90_001);
  a = must(a, "haltDischarge");
  const held = a.tank.stockMl;
  a = tick(a, 600_000); // time passes while halted: nothing moves
  assert.equal(a.tank.stockMl, held);
  a = must(a, "startDischarge");
  a = runFlow(a, [1_000]);
  const b = receiveDelivery(createState(), [60_000]);
  a = must(a, "finishDelivery");
  assert.equal(a.tank.stockMl, b.tank.stockMl);
  assert.deepEqual(a.ledger.deliveries[0].acceptedMl, b.ledger.deliveries[0].acceptedMl);
});

// ---------------------------------------------------------------------------
// interlocks

test("interlocks: no flow without stock, open station, power, nozzle and customer", () => {
  let s = createState();
  refused(s, "startPump", undefined, /No customer/);
  refused(s, "openStation", undefined, /power/i);
  s = must(s, "powerOn");
  refused(s, "openStation", undefined, /price/);
  s = must(s, "setPrice", { priceKobo: 100_000 });
  refused(s, "customerArrives", undefined, /closed/);
  s = must(s, "openStation");
  s = must(s, "customerArrives");
  refused(s, "startPump", undefined, /preset/);
  refused(s, "liftNozzle", undefined, /preset/);
  s = must(s, "setPreset", { mode: "volume", volumeMl: 10_000 });
  refused(s, "startPump", undefined, /nozzle/);
  s = must(s, "liftNozzle");

  // Power and open are separate: power off while open still blocks the pump.
  const noPower = must(s, "powerOff");
  assert.equal(noPower.station.open, true);
  refused(noPower, "startPump", undefined, /No power/);

  const estop = must(s, "emergencyStop");
  refused(estop, "startPump", undefined, /Emergency/);
  const reset = must(estop, "resetEmergency");
  assert.equal(reset.sale.status, "nozzle", "reset does not start anything by itself");

  // Delivery hose connected blocks dispensing.
  let withTanker = must(s, "arriveTanker");
  withTanker = must(withTanker, "checkTank");
  withTanker = must(withTanker, "connectDelivery");
  refused(withTanker, "startPump", undefined, /delivery/);

  // Wrong product mapping is refused.
  let wrong = createState({ vehicleProduct: "AGO" });
  wrong = openStation(wrong);
  wrong = must(wrong, "customerArrives");
  wrong = must(wrong, "setPreset", { mode: "volume", volumeMl: 10_000 });
  refused(wrong, "liftNozzle", undefined, /Wrong nozzle/);

  must(s, "startPump");
});

test("empty tank: sale stops at the last millilitre, then the next start is refused", () => {
  let s = createScenario("low-stock"); // 12 L in the tank
  s = openStation(s);
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "volume", volumeMl: 20_000 });
  s = must(s, "liftNozzle");
  s = must(s, "startPump");
  s = runFlow(s, [333]);
  assert.equal(s.sale.status, "stopped");
  assert.equal(s.sale.stopReason, "tank-empty");
  assert.equal(s.sale.deliveredMl, 12_000);
  assert.equal(s.tank.stockMl, 0);
  assertConserved(s);
  s = must(s, "returnNozzle");
  s = must(s, "recordPayment", { method: "cash" });
  assert.equal(s.ledger.receipts[0].chargeKobo, 1_200_000); // charged 12 L, not 20 L
  s = must(s, "customerLeaves");
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "volume", volumeMl: 5_000 });
  s = must(s, "liftNozzle");
  refused(s, "startPump", undefined, /empty/);
});

test("car capacity clamps a litre request", () => {
  let s = openStation(createState());
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "volume", volumeMl: 60_000 }); // car has 42 L space
  s = must(s, "liftNozzle");
  s = must(s, "startPump");
  s = runFlow(s);
  assert.equal(s.sale.stopReason, "vehicle-full");
  assert.equal(s.sale.deliveredMl, 42_000);
  assert.equal(s.sale.vehicle.fuelMl, 50_000);
  assertConserved(s);
});

// ---------------------------------------------------------------------------
// price snapshot, stops and payment

test("price edits after a sale starts never change that sale's rate", () => {
  let s = openStation(createState(), 100_000);
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "amount", amountKobo: 1_000_000 }); // ₦10,000
  s = must(s, "setPrice", { priceKobo: 150_000 }); // sign changes mid-sale
  s = must(s, "setPreset", { mode: "amount", amountKobo: 1_000_000 }); // re-preset keeps the lock
  assert.equal(s.sale.priceKobo, 100_000);
  assert.equal(s.sale.targetMl, 10_000);
  s = must(s, "liftNozzle");
  s = must(s, "startPump");
  s = tick(s, 3_000);
  s = must(s, "setPrice", { priceKobo: 200_000 });
  s = runFlow(s);
  assert.equal(read(s).meter.chargeKobo, 1_000_000);
  s = must(s, "returnNozzle");
  s = must(s, "recordPayment");
  assert.equal(s.ledger.receipts[0].priceKobo, 100_000);
  assert.equal(s.ledger.receipts[0].chargeKobo, 1_000_000);
  s = must(s, "customerLeaves");
  // The next sale takes the new price.
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "amount", amountKobo: 1_000_000 });
  assert.equal(s.sale.priceKobo, 200_000);
  assert.equal(s.sale.targetMl, 5_000);
});

test("budget sale with awkward price: meter never passes the target", () => {
  let s = openStation(createState(), 93_500);
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "amount", amountKobo: 500_000 });
  s = must(s, "liftNozzle");
  s = must(s, "startPump");
  while (s.sale.status === "dispensing") {
    s = tick(s, 97);
    assert.ok(read(s).meter.chargeKobo <= 500_000);
  }
  assert.equal(s.sale.deliveredMl, 5_347);
  assert.equal(read(s).meter.chargeKobo, 499_945);
});

test("manual stop and power cut freeze the delivered volume; no silent resume", () => {
  for (const stop of ["stopPump", "powerCut", "emergencyStop"]) {
    let s = openStation(createState());
    s = must(s, "customerArrives");
    s = must(s, "setPreset", { mode: "volume", volumeMl: 30_000 });
    s = must(s, "liftNozzle");
    s = must(s, "startPump");
    s = tick(s, 15_000); // 10 L at 40 L/min
    s = must(s, stop);
    assert.equal(s.sale.status, "stopped");
    assert.equal(s.sale.deliveredMl, 10_000);
    const frozen = s;
    s = tick(s, 600_000);
    assert.equal(s, frozen, "ticks do nothing after a stop");
    if (stop === "powerCut") s = must(s, "powerOn");
    if (stop === "emergencyStop") s = must(s, "resetEmergency");
    refused(s, "startPump", undefined, /stopped/);
    assert.equal(s.sale.deliveredMl, 10_000);
    s = must(s, "returnNozzle");
    s = must(s, "recordPayment", { method: "transfer" });
    assert.equal(s.ledger.receipts[0].chargeKobo, 1_000_000); // partial: 10 L, not 30 L
    assertConserved(s);
  }
});

test("payment and completion are idempotent", () => {
  let s = openStation(createState());
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "amount", amountKobo: 2_000_000 });
  s = must(s, "liftNozzle");
  s = must(s, "startPump");
  refused(s, "recordPayment", undefined, /Return the nozzle/);
  s = runFlow(s);
  s = must(s, "returnNozzle");
  refused(s, "returnNozzle");
  s = must(s, "recordPayment", { method: "card" });
  for (let i = 0; i < 5; i++) {
    refused(s, "recordPayment", { method: "card" }, /Already paid — receipt R-0001/);
    refused(s, "leaveUnpaid");
  }
  assert.equal(s.ledger.receipts.length, 1);
  s = must(s, "customerLeaves");
  refused(s, "customerLeaves");
  assert.equal(s.ledger.sales.length, 1);
  assert.equal(s.events.filter((e) => e.type === "payment-recorded").length, 1);
  s = must(s, "closeStation");
  refused(s, "closeStation");
  refused(s, "customerArrives", undefined, /closed/);
  assert.equal(s.events.filter((e) => e.type === "station-closed").length, 1);
});

test("unpaid sale shows as outstanding, separate from collected money", () => {
  let s = openStation(createState());
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "volume", volumeMl: 10_000 });
  s = must(s, "liftNozzle");
  s = must(s, "startPump");
  s = runFlow(s);
  s = must(s, "returnNozzle");
  s = must(s, "leaveUnpaid");
  refused(s, "recordPayment", undefined, /unpaid/);
  s = must(s, "customerLeaves");
  s = must(s, "closeStation");
  assert.equal(s.closing.salesKobo, 1_000_000);
  assert.equal(s.closing.collectedKobo, 0);
  assert.equal(s.closing.outstandingKobo, 1_000_000);
  assert.equal(s.ledger.receipts.length, 0);
});

test("nozzle returned before any flow cancels with nothing due", () => {
  let s = openStation(createState());
  s = must(s, "customerArrives");
  s = must(s, "setPreset", { mode: "volume", volumeMl: 10_000 });
  s = must(s, "liftNozzle");
  s = must(s, "returnNozzle");
  assert.equal(s.sale.status, "cancelled");
  refused(s, "recordPayment", undefined, /Nothing was dispensed/);
  s = must(s, "customerLeaves");
  assert.equal(reconcile(s).salesKobo, 0);
});

test("close requires settled work and reconciles", () => {
  let s = receiveDelivery(createState());
  s = openStation(s);
  s = must(s, "customerArrives");
  refused(s, "closeStation", undefined, /current sale/);
  s = must(s, "customerLeaves"); // left without buying
  s = must(s, "closeStation");
  assert.deepEqual(
    [s.closing.openingMl, s.closing.receivedMl, s.closing.soldMl, s.closing.measuredMl, s.closing.varianceMl],
    [6_000_000, 20_000_000, 0, 26_000_000, 0],
  );
});

// ---------------------------------------------------------------------------
// determinism: auto, manual and differently-sliced time agree

test("auto journey, manual journey and different tick sizes reconcile identically", () => {
  const auto = runJourney(createState(), DEFAULT_INPUTS, { tickMs: 1000 });
  const autoCoarse = runJourney(createState(), DEFAULT_INPUTS, { tickMs: 600_000 });

  let manual = createState();
  manual = receiveDelivery(manual, [17, 59_999, 3]);
  manual = openStation(manual);
  manual = must(manual, "customerArrives");
  manual = must(manual, "setPreset", { mode: "amount", amountKobo: 2_000_000 });
  manual = must(manual, "liftNozzle");
  manual = must(manual, "startPump");
  manual = runFlow(manual, [41, 1_337]);
  manual = must(manual, "returnNozzle");
  manual = must(manual, "recordPayment", { method: "cash" });
  manual = must(manual, "customerLeaves");
  manual = must(manual, "closeStation");

  for (const s of [auto, autoCoarse, manual]) {
    assert.equal(s.station.closedForDay, true);
    assert.deepEqual(s.closing, {
      openingMl: 6_000_000,
      receivedMl: 20_000_000,
      soldMl: 20_000,
      expectedClosingMl: 25_980_000,
      measuredMl: 25_980_000,
      varianceMl: 0,
      salesKobo: 2_000_000,
      collectedKobo: 2_000_000,
      outstandingKobo: 0,
      purchaseKobo: 1_840_000_000,
      salesCount: 1,
      unpaidCount: 0,
    });
    assert.equal(s.clockMs, auto.clockMs, "simulated clock independent of tick size");
  }
  assert.deepEqual(
    auto.events.map((e) => e.type),
    manual.events.map((e) => e.type),
    "same transitions in the same order",
  );
});

test("guide always proposes an allowed action until the day is done", () => {
  let s = createState();
  for (let i = 0; i < 2_000; i++) {
    const g = guide(s);
    if (g.done) break;
    if (g.waiting) {
      assert.ok(timeToFlowEnd(s) > 0);
      s = tick(s, 5_000);
      continue;
    }
    assert.ok(g.next, `no next action at step ${g.step}`);
    assert.equal(can(s, g.next).ok, true, `${g.next.type}: ${can(s, g.next).reason}`);
    s = apply(s, g.next).state;
    assertConserved(s);
  }
  assert.equal(guide(s).done, true);
});

test("reset: a fresh state is independent of a used one", () => {
  const used = runJourney(createState());
  const fresh = createState();
  assert.equal(fresh.events.length, 0);
  assert.equal(fresh.tank.stockMl, 6_000_000);
  assert.equal(fresh.sale, null);
  assert.equal(used.ledger.receipts.length, 1);
  assert.deepEqual(runJourney(fresh).closing, used.closing);
});

test("pure: apply and tick never mutate their input", () => {
  const s = openStation(createState());
  const snapshot = JSON.stringify(s);
  const a = must(s, "customerArrives");
  const b = must(a, "setPreset", { mode: "volume", volumeMl: 5_000 });
  const c = must(must(b, "liftNozzle"), "startPump");
  tick(c, 1_000);
  assert.equal(JSON.stringify(s), snapshot);
  assert.equal(c.sale.deliveredMl, 0);
});
