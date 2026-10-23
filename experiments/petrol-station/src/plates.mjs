// Enlarged machine cutaways ("plates") revealed after the camera zooms in.
// Each plate is drawn in a local 1000 × 750 space and placed inside its
// lesson's camera rectangle, so it appears where the machine physically is.
// Plates only draw model readings; they keep no fuel or money of their own.

import { chargeFor as chargeOf, formatKobo, formatMl } from "../model.mjs";
import { P, liquidHeight } from "./scene.mjs";

// Camera rectangles (all 4:3, like the full view, so the stage never resizes).
export const CAMERA = Object.freeze({
  station: [0, 0, 1200, 900],
  delivery: [20, 120, 640, 480],
  pricing: [420, 318, 320, 240],
  nozzle: [442, 437, 280, 210],
});

const INSET = 0.03; // the zoomed station stays visible as a thin frame

function placement(rect) {
  const [x, y, w] = rect;
  const s = (w * (1 - 2 * INSET)) / 1000;
  return `translate(${x + w * INSET} ${y + rect[3] * INSET}) scale(${s.toFixed(5)})`;
}

const INK = "#1d2a44";
const FUEL = "#f0ac2a";
const FUEL_TOP = "#f8d26a";

function pill(text, x, y, { anchor = "start", to = null, cls = "" } = {}) {
  const w = text.length * 16.5 + 30;
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  const leader = to ? `<path class="pl-leader" d="M${to[0]},${to[1]} L${anchor === "end" ? x0 + w : anchor === "middle" ? x : x0},${y}"/><circle class="pl-dot" cx="${to[0]}" cy="${to[1]}" r="6"/>` : "";
  return `<g class="pl-pill ${cls}">${leader}<rect x="${x0}" y="${y - 24}" width="${w}" height="48" rx="24"/><text x="${x0 + w / 2}" y="${y + 10}" text-anchor="middle">${text}</text></g>`;
}

function frame() {
  return `<rect class="pl-frame" x="0" y="0" width="1000" height="750" rx="28"/>`;
}

// ---------------------------------------------------------------------------
// Lesson 1 — tanker to underground storage (side section)

const L1 = {
  ground: 440,
  barrel: { x: 160, y: 170, w: 430, h: 170, rx: 70 },
  tank: { x: 620, y: 540, w: 350, h: 180, rx: 80 },
  valve: [540, 392],
  headX: 880,
};
const DELIVERY_PATH = "M500,338 L500,392 L600,392 C650,394 662,434 702,434 L750,434 L750,700";

function deliveryPlate() {
  const { ground, barrel: b, tank: t, valve: [vx, vy] } = L1;
  return `<g class="plate" id="plate-delivery" transform="${placement(CAMERA.delivery)}">
    <defs>
      <clipPath id="pl1-barrel"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx}"/></clipPath>
      <clipPath id="pl1-tank"><rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.rx}"/></clipPath>
    </defs>
    ${frame()}
    <path class="pl-soil" d="M0,${ground} H1000 V722 Q1000,750 972,750 H28 Q0,750 0,722 Z"/>
    <path class="pl-backfill" d="M590,500 H1000 V722 Q1000,750 972,750 H590 Z"/>
    <rect x="0" y="${ground}" width="1000" height="18" class="pl-concrete"/>
    <path class="pl-strata" d="M0,560 Q120,548 240,562 T480,560 M0,660 Q140,650 280,664 T560,660"/>

    <!-- tanker -->
    <path class="pl-cab" d="M30,${ground - 30} V300 L62,250 H150 V${ground - 30} Z"/>
    <path class="pl-glass" d="M46,300 L70,264 H138 V300 Z"/>
    <rect class="pl-chassis" x="150" y="346" width="455" height="26" rx="4"/>
    ${[90, 230, 312, 525].map((x) => `<circle class="pl-tyre" cx="${x}" cy="${ground - 34}" r="34"/><circle class="pl-hub" cx="${x}" cy="${ground - 34}" r="13"/>`).join("")}
    ${[240, 375, 505].map((x) => `<rect class="pl-steel" x="${x - 26}" y="${b.y - 22}" width="52" height="24" rx="6"/>`).join("")}
    <rect class="pl-inside" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx}"/>
    <g clip-path="url(#pl1-barrel)">
      <rect id="pl1-tanker-fuel" class="pl-fuel" x="${b.x}" y="${b.y + b.h}" width="${b.w}" height="0"/>
      <rect id="pl1-tanker-surface" class="pl-fuel-top" x="${b.x}" y="${b.y + b.h}" width="${b.w}" height="6"/>
    </g>
    <rect class="pl-shell" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx}"/>
    <text id="pl1-tanker-reading" class="pl-big halo" x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 16}" text-anchor="middle">—</text>

    <!-- outlet, valve and hose -->
    <path class="pl-pipe" d="M500,338 V392 H${vx - 24} M${vx + 24},392 H600"/>
    <g id="pl1-valve" class="pl-valve">
      <circle class="pl-valve-body" cx="${vx}" cy="${vy}" r="26"/>
      <g id="pl1-valve-ball" class="pl-turn" style="transform-origin:${vx}px ${vy}px">
        <rect class="pl-valve-port" x="${vx - 20}" y="${vy - 7}" width="40" height="14" rx="3"/>
        <rect class="pl-valve-handle" x="${vx - 4}" y="${vy - 70}" width="8" height="44" rx="4"/>
        <rect class="pl-valve-grip" x="${vx - 34}" y="${vy - 80}" width="68" height="16" rx="8"/>
      </g>
    </g>
    <path class="pl-hose" d="M600,392 C650,394 662,434 702,434 L730,434"/>
    <rect class="pl-steel" x="718" y="${ground - 6}" width="64" height="44" rx="6"/>
    <path class="pl-pipe" d="M750,${ground + 30} V${t.y + 6}"/>

    <!-- underground tank -->
    <rect class="pl-inside" x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.rx}"/>
    <g clip-path="url(#pl1-tank)">
      <rect id="pl1-tank-fuel" class="pl-fuel" x="${t.x}" y="${t.y + t.h}" width="${t.w}" height="0"/>
      <rect id="pl1-tank-surface" class="pl-fuel-top" x="${t.x}" y="${t.y + t.h}" width="${t.w}" height="6"/>
    </g>
    <path class="pl-pipe thin" d="M750,${t.y + 6} V700"/>
    <rect class="pl-shell" x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.rx}"/>
    <text id="pl1-tank-reading" class="pl-big halo" x="${t.x + t.w / 2}" y="${t.y + t.h / 2 + 16}" text-anchor="middle">—</text>

    <!-- vent (air only) -->
    <path class="pl-pipe thin" d="M955,${t.y + 4} V120"/>
    <rect class="pl-steel" x="935" y="96" width="40" height="26" rx="8"/>
    <path id="pl1-air" class="pl-air" d="M955,${t.y + 30} V112 M955,96 C955,70 930,60 900,58"/>

    <!-- fuel path markers (only while the model transfers) -->
    <path id="pl1-flow" class="pl-flow" d="${DELIVERY_PATH}"/>

    <!-- head: the height difference between the two fuel surfaces -->
    <g id="pl1-head" class="pl-head">
      <path id="pl1-head-top" class="pl-dim" d=""/>
      <path id="pl1-head-arrow" class="pl-dim-arrow" d=""/>
      <text id="pl1-head-text" class="pl-mid" x="${L1.headX - 18}" y="300" text-anchor="end">head</text>
    </g>

    <text id="pl1-moved" class="pl-mid halo" x="690" y="330" text-anchor="middle">moved 0 L</text>
    ${pill("Tanker compartment", 160, 112)}
    ${pill("Outlet valve", 380, 480, { to: [vx, vy + 26] })}
    ${pill("Fill pipe", 790, 498, { to: [752, 498] })}
    ${pill("Underground tank", 300, 640, { to: [t.x + 10, 640] })}
    ${pill("Vent: air out", 895, 40, { anchor: "end" })}
  </g>`;
}

function updateDelivery(root, s) {
  const { barrel: b, tank: t, headX } = L1;
  const del = s.delivery;
  const tankerMl = del?.tankerMl ?? 0;
  const tankerFrac = del ? tankerMl / del.tankerStartMl : 0;
  const tankFrac = s.tank.stockMl / s.config.tankCapacityMl;
  const fuelH = b.h * tankerFrac;
  const tankerTop = b.y + b.h - fuelH;
  const tankTop = t.y + t.h - (liquidHeight(tankFrac, t.h / 2) / (t.h / 2)) * (t.h / 2);
  set(root, "pl1-tanker-fuel", { y: tankerTop, height: fuelH });
  set(root, "pl1-tanker-surface", { y: tankerTop - 3, height: fuelH > 0 ? 6 : 0 });
  set(root, "pl1-tank-fuel", { y: tankTop, height: t.y + t.h - tankTop });
  set(root, "pl1-tank-surface", { y: tankTop - 3, height: s.tank.stockMl > 0 ? 6 : 0 });
  // Numeric only: the pills name the parts, and "30,000 L" fits inside either vessel.
  text(root, "pl1-tanker-reading", del ? formatMl(tankerMl, 0) : "—");
  text(root, "pl1-tank-reading", formatMl(s.tank.stockMl, 0));
  text(root, "pl1-moved", `moved ${formatMl(del?.receivedMl ?? 0, 0)}`);
  const open = del?.status === "discharging";
  root.querySelector("#pl1-valve-ball").classList.toggle("open", open);
  const showHead = Boolean(del) && tankerMl > 0;
  root.querySelector("#pl1-head").classList.toggle("off", !showHead);
  if (showHead) {
    set(root, "pl1-head-top", { d: `M590,${tankerTop} H${headX + 30}` });
    set(root, "pl1-head-arrow", { d: `M${headX},${tankerTop + 8} V${tankTop - 8}` });
    set(root, "pl1-head-text", { y: (tankerTop + tankTop) / 2 + 10 });
  }
}

// ---------------------------------------------------------------------------
// Lesson 2 — how litres become a price (open dispenser)

const METER = [230, 575];
const ENCODER = [420, 575];

function pricingPlate() {
  const [mx, my] = METER;
  const [ex, ey] = ENCODER;
  const vanes = [0, 45, 90, 135].map((a) => `<rect class="pl-vane" x="${mx - 66}" y="${my - 9}" width="132" height="18" rx="6" transform="rotate(${a} ${mx} ${my})"/>`).join("");
  const slots = Array.from({ length: 12 }, (_, i) => `<rect class="pl-slot" x="${ex - 5}" y="${ey - 52}" width="10" height="16" rx="2" transform="rotate(${i * 30} ${ex} ${ey})"/>`).join("");
  return `<g class="plate" id="plate-pricing" transform="${placement(CAMERA.pricing)}">
    ${frame()}
    <!-- cabinet with its front panel removed -->
    <rect class="pl-cabinet" x="40" y="24" width="520" height="700" rx="22"/>
    <rect class="pl-cabinet-head" x="40" y="24" width="520" height="54" rx="22"/>
    <text class="pl-head-text" x="300" y="62" text-anchor="middle">PUMP 1 · OPENED UP</text>

    <rect class="pl-display" x="74" y="98" width="452" height="232" rx="14"/>
    <text class="pl-lcd-k" x="96" y="140">AMOUNT ₦</text>
    <text id="pl2-amount" class="pl-lcd big" x="504" y="182" text-anchor="end">0.00</text>
    <text class="pl-lcd-k" x="96" y="222">LITRES</text>
    <text id="pl2-litres" class="pl-lcd big" x="504" y="264" text-anchor="end">0.000</text>
    <text class="pl-lcd-k" x="96" y="306">PRICE ₦/L</text>
    <text id="pl2-price" class="pl-lcd" x="504" y="310" text-anchor="end">—</text>

    <rect class="pl-cpu" x="120" y="368" width="300" height="70" rx="10"/>
    <text class="pl-cpu-text" x="270" y="412" text-anchor="middle">CALCULATOR</text>
    <path class="pl-wire" d="M270,368 V330"/>
    <path class="pl-barrier" d="M40,470 H560"/>
    <text class="pl-tiny" x="548" y="462" text-anchor="end">electronics ▲</text>
    <text class="pl-tiny" x="548" y="496" text-anchor="end">fuel ▼</text>

    <!-- fuel path: inlet → meter → outlet hose -->
    <path class="pl-pipe fuel" d="M${mx},724 V${my + 80} M${mx},${my - 80} V520 H560"/>
    <path id="pl2-flow" class="pl-flow" d="M${mx},750 V${my + 80} M${mx},${my - 80} V520 H560 C640,520 660,600 760,612"/>
    <text class="pl-tiny" x="${mx + 18}" y="712">from tank pump</text>

    <circle class="pl-meter" cx="${mx}" cy="${my}" r="80"/>
    <g id="pl2-rotor">${vanes}<circle class="pl-hub" cx="${mx}" cy="${my}" r="18"/></g>
    <path class="pl-shaft" d="M${mx + 80},${my} H${ex - 52}"/>
    <circle class="pl-disc" cx="${ex}" cy="${ey}" r="52"/>
    <g id="pl2-encoder">${slots}</g>
    <rect class="pl-sensor" x="${ex - 24}" y="${ey - 76}" width="48" height="34" rx="6"/>
    <path class="pl-wire" d="M${ex},${ey - 76} V438 H420"/>
    <path id="pl2-pulses" class="pl-pulse" d="M${ex},${ey - 76} V438 H420"/>

    <path class="pl-hose" d="M560,520 C640,520 660,600 760,612"/>
    <path class="pl-car" d="M740,560 H1000 V722 Q1000,750 972,750 H740 Z"/>
    <circle class="pl-filler" cx="770" cy="614" r="16"/>
    <path class="pl-nozzle" d="M730,594 L790,604 L786,624 L726,616 Z"/>

    <!-- the equation, fed by the calculator -->
    <rect class="pl-card" x="588" y="98" width="392" height="246" rx="16"/>
    <text class="pl-lcd-k ink" x="610" y="138">MEASURED LITRES</text>
    <text id="pl2-eq-litres" class="pl-mid strong" x="958" y="178" text-anchor="end">0.000 L</text>
    <text class="pl-lcd-k ink" x="610" y="214">× PRICE PER LITRE</text>
    <text id="pl2-eq-price" class="pl-mid strong" x="958" y="254" text-anchor="end">—</text>
    <path class="pl-rule" d="M610,272 H958"/>
    <text class="pl-lcd-k ink" x="610" y="304">= AMOUNT</text>
    <text id="pl2-eq-amount" class="pl-mid strong" x="958" y="330" text-anchor="end">₦0.00</text>

    <rect class="pl-card" x="588" y="364" width="392" height="120" rx="16"/>
    <text class="pl-lcd-k ink" x="610" y="402">PULSES COUNTED</text>
    <text id="pl2-pulse-count" class="pl-big" x="958" y="452" text-anchor="end">0</text>
    <text class="pl-tiny" x="610" y="474">illustrative: 100 pulses = 1 L</text>

    <g class="pl-legend">
      <path class="pl-pipe fuel" d="M600,520 H650"/><text class="pl-tiny" x="662" y="528">fuel</text>
      <path class="pl-wire" d="M760,520 H810"/><text class="pl-tiny" x="822" y="528">electric pulses</text>
    </g>
    ${pill("Meter", 70, 690, { to: [mx - 56, my + 56] })}
    ${pill("Pulse encoder", 330, 690, { to: [ex, ey + 52] })}
  </g>`;
}

function updatePricing(root, s) {
  const sale = s.sale;
  const last = s.ledger.sales.at(-1);
  const src = sale && sale.priceKobo != null ? sale : last;
  const ml = src?.deliveredMl ?? 0;
  const price = src?.priceKobo ?? s.station.priceKobo;
  const amount = price == null ? 0 : chargeOf(ml, price);
  // Rotor turns with the dispenser totaliser: no flow, no movement (1 turn = 1 L, illustrative).
  const angle = ((s.dispenser.totaliserMl % 1000) / 1000) * 360;
  root.querySelector("#pl2-rotor").setAttribute("transform", `rotate(${angle.toFixed(2)} ${METER[0]} ${METER[1]})`);
  root.querySelector("#pl2-encoder").setAttribute("transform", `rotate(${angle.toFixed(2)} ${ENCODER[0]} ${ENCODER[1]})`);
  text(root, "pl2-amount", formatKobo(amount, { symbol: false }));
  text(root, "pl2-litres", formatMl(ml, 3, { unit: false }));
  text(root, "pl2-price", price == null ? "—" : formatKobo(price, { symbol: false }));
  text(root, "pl2-eq-litres", formatMl(ml, 3));
  text(root, "pl2-eq-price", price == null ? "—" : `${formatKobo(price)}/L`);
  text(root, "pl2-eq-amount", formatKobo(amount));
  text(root, "pl2-pulse-count", String(Math.floor(ml / 10)));
}

// ---------------------------------------------------------------------------
// Lesson 3 — customer preset, trigger and automatic stopping (nozzle cutaway)

const NECK = "M600,345 L880,474 L880,530";
const NECK_LEN = Math.hypot(280, 129) + 56;
const TRIGGER_PIVOT = [170, 392];

function nozzlePlate() {
  return `<g class="plate" id="plate-nozzle" transform="${placement(CAMERA.nozzle)}">
    <defs><clipPath id="pl3-tank"><rect x="700" y="520" width="280" height="200" rx="40"/></clipPath></defs>
    ${frame()}
    <!-- car: filler neck and tank in section -->
    <path class="pl-car" d="M560,300 H1000 V722 Q1000,750 972,750 H560 Z"/>
    <path class="pl-neck" d="${NECK}"/>
    <path id="pl3-neck-fuel" class="pl-neck-fuel" d="M880,530 L880,474 L740,409" stroke-dasharray="0 2000"/>
    <rect class="pl-inside" x="700" y="520" width="280" height="200" rx="40"/>
    <g clip-path="url(#pl3-tank)">
      <rect id="pl3-car-fuel" class="pl-fuel" x="700" y="720" width="280" height="0"/>
    </g>
    <rect class="pl-shell" x="700" y="520" width="280" height="200" rx="40"/>
    <text id="pl3-car-reading" class="pl-mid halo" x="840" y="640" text-anchor="middle">—</text>

    <!-- hose into the nozzle -->
    <path class="pl-hose" d="M0,250 C60,250 80,305 120,305"/>

    <!-- nozzle body in section -->
    <path class="pl-nozzle-body" d="M110,268 H400 Q420,268 430,250 H500 Q522,250 522,272 V300 L772,414 L764,438 L522,338 V352 Q522,368 500,368 H110 Z"/>
    <path id="pl3-channel" class="pl-channel" d="M112,306 H292 M316,306 H520 L760,420"/>
    <path id="pl3-flow" class="pl-flow" d="M112,306 H520 L760,420"/>
    <!-- main valve: poppet lifts off its seat when the trigger pushes the stem -->
    <path class="pl-seat" d="M290,284 V328 M318,284 V328"/>
    <g id="pl3-poppet" class="pl-move">
      <path class="pl-spring" d="M304,282 l-14,-6 l28,-8 l-28,-8 l28,-8 l-14,-6"/>
      <rect class="pl-poppet" x="286" y="282" width="36" height="20" rx="5"/>
      <path class="pl-stem" d="M304,302 V384"/>
    </g>
    <!-- sensing port and tube back to the diaphragm -->
    <path id="pl3-tube" class="pl-tube" d="M752,428 L520,326 H470 V246"/>
    <path id="pl3-air" class="pl-air" d="M752,428 L520,326 H470 V246"/>
    <circle id="pl3-port" class="pl-port" cx="752" cy="430" r="9"/>
    <!-- diaphragm chamber and latch -->
    <path class="pl-chamber" d="M420,250 Q420,196 470,196 Q520,196 520,250 Z"/>
    <path id="pl3-diaphragm" class="pl-diaphragm" d="M424,236 Q470,250 516,236"/>
    <g id="pl3-latch" class="pl-move">
      <path class="pl-stem" d="M470,244 V392"/>
      <circle class="pl-roller" cx="470" cy="396" r="12"/>
    </g>
    <!-- trigger lever -->
    <g id="pl3-trigger" class="pl-turn" style="transform-origin:${TRIGGER_PIVOT[0]}px ${TRIGGER_PIVOT[1]}px">
      <path class="pl-trigger" d="M${TRIGGER_PIVOT[0]},${TRIGGER_PIVOT[1]} L470,406 Q486,410 482,424 L170,412 Z"/>
    </g>
    <circle class="pl-hub" cx="${TRIGGER_PIVOT[0]}" cy="${TRIGGER_PIVOT[1]}" r="10"/>
    <path class="pl-guard" d="M120,368 Q100,470 210,470 H470 Q520,470 520,430"/>

    <!-- numbered trip sequence (vehicle-full stop only) -->
    <g id="pl3-trip" class="pl-trip">
      ${[[752, 470, 1], [620, 340, 2], [470, 176, 3], [508, 400, 4]].map(([x, y, n]) => `<circle class="pl-badge" cx="${x}" cy="${y}" r="20"/><text class="pl-badge-text" x="${x}" y="${y + 8}" text-anchor="middle">${n}</text>`).join("")}
    </g>

    <!-- dispenser readout -->
    <rect class="pl-display" x="24" y="20" width="400" height="200" rx="14"/>
    <text id="pl3-target" class="pl-lcd-k" x="44" y="60">NO PRESET</text>
    <text class="pl-lcd-k" x="44" y="112">₦</text>
    <text id="pl3-amount" class="pl-lcd big" x="404" y="118" text-anchor="end">0.00</text>
    <text class="pl-lcd-k" x="44" y="176">L</text>
    <text id="pl3-litres" class="pl-lcd big" x="404" y="182" text-anchor="end">0.000</text>
    <text id="pl3-valve" class="pl-lcd-k" x="44" y="208">CONTROL VALVE CLOSED</text>

    <!-- stop explanation -->
    <rect class="pl-card" x="24" y="500" width="520" height="226" rx="16"/>
    <text id="pl3-why-title" class="pl-mid strong" x="46" y="546">Waiting</text>
    ${[0, 1, 2, 3].map((i) => `<text id="pl3-why-${i}" class="pl-small" x="46" y="${590 + i * 34}"></text>`).join("")}

    ${pill("Trigger", 230, 488, { to: [330, 412], anchor: "middle", cls: "small" })}
    ${pill("Valve + spring", 450, 160, { to: [304, 262], anchor: "start", cls: "small" })}
    ${pill("Sensing port", 990, 462, { to: [760, 432], anchor: "end", cls: "small" })}
    ${pill("Diaphragm + latch", 990, 210, { to: [516, 236], anchor: "end", cls: "small" })}
  </g>`;
}

// Box text area is about 476 units wide: titles ≤ 25 characters at 34 units,
// lines ≤ 30 characters at 26 units, at most four lines.
const WHY = {
  idle: ["Choose naira or litres", ["Your request becomes a", "preset: naira ÷ price per", "litre = target litres.", "The price locks for the sale."]],
  ready: ["Ready to pump", ["Squeeze: the stem lifts the", "main valve off its seat,", "against the spring.", "Release any time to stop."]],
  flowing: ["Fuel is flowing", ["The meter counts each mL.", "Air enters the sensing port", "while the tip is in open air."]],
  target: ["Stopped: preset reached", ["The dispenser closed its", "own valve upstream at the", "target. The nozzle did not", "trip: release the trigger."]],
  "vehicle-full": ["Stopped: car tank full", ["1 Fuel covers sensing port.", "2 Air stops: tube suction.", "3 The diaphragm lifts.", "4 Latch lets go: valve shuts."]],
  released: ["Released after preset", ["Dispenser valve shut first;", "now the nozzle spring has", "closed its valve too.", "Next: hang up and pay."]],
  manual: ["Trigger released", ["The spring closed the main", "valve. You pay only for the", "litres that flowed."]],
  paid: ["Paid", ["You paid for exactly the", "litres the meter measured.", "Authorise a new preset for", "the next customer."]],
  cancelled: ["Nothing dispensed", ["The nozzle was hung up", "before any fuel flowed,", "so nothing is due."]],
  "tank-empty": ["Station tank empty", ["No fuel reaches the pump.", "The sale settles for what", "was delivered."]],
  power: ["Stopped: no power", ["Pump and meter need power.", "The sale settles for what", "was delivered."]],
  estop: ["Emergency stop", ["All flow stopped.", "The sale settles for what", "was delivered."]],
};

/** `view.triggerHeld` is the learner's hand (UI-only); the model knows only flow. */
function updateNozzle(root, s, view = {}) {
  const sale = s.sale;
  const fuel = sale?.vehicle.fuelMl ?? s.config.vehicleStartFuelMl;
  const cap = sale?.vehicle.capacityMl ?? s.config.vehicleCapacityMl;
  const frac = fuel / cap;
  const h = 200 * frac;
  set(root, "pl3-car-fuel", { y: 720 - h, height: h });
  text(root, "pl3-car-reading", `Car ${formatMl(fuel, 1)} / ${formatMl(cap, 0)}`);

  const stop = sale?.stopReason ?? null;
  const tripped = stop === "vehicle-full";
  const neck = tripped ? 1 : Math.max(0, Math.min(1, (frac - 0.96) / 0.04));
  set(root, "pl3-neck-fuel", { "stroke-dasharray": `${(NECK_LEN * neck).toFixed(1)} 2000` });

  const flowing = sale?.status === "dispensing";
  // The nozzle valve follows the hand on the trigger; only a sensing trip closes it by itself.
  const nozzleOpen = Boolean(view.triggerHeld) && !tripped;
  root.querySelector("#pl3-trigger").classList.toggle("open", nozzleOpen);
  root.querySelector("#pl3-poppet").classList.toggle("open", nozzleOpen);
  root.querySelector("#pl3-latch").classList.toggle("tripped", tripped);
  root.querySelector("#pl3-trip").classList.toggle("on", tripped);
  root.querySelector("#pl3-port").classList.toggle("covered", tripped);
  root.querySelector("#pl3-tube").classList.toggle("vacuum", tripped);
  set(root, "pl3-diaphragm", { d: tripped ? "M424,236 Q470,206 516,236" : "M424,236 Q470,250 516,236" });

  const price = sale?.priceKobo;
  const ml = sale?.deliveredMl ?? 0;
  // Concise LCD line; the full budget ÷ price equation lives in the HTML panel.
  text(root, "pl3-target", sale?.mode ? `TARGET ${formatMl(sale.targetMl, 3)}` : "NO PRESET");
  text(root, "pl3-amount", formatKobo(price == null ? 0 : chargeOf(ml, price), { symbol: false }));
  text(root, "pl3-litres", formatMl(ml, 3, { unit: false }));
  text(root, "pl3-valve", flowing ? "DISPENSER VALVE OPEN" : "DISPENSER VALVE CLOSED");

  let key = "idle";
  // Settled states first, so a paid sale never shows a stale "pay" instruction.
  if (sale?.status === "paid" || sale?.status === "cancelled") key = sale.status;
  else if (sale?.status === "dispensing") key = "flowing";
  else if (stop === "target") key = view.triggerHeld ? "target" : "released";
  else if (stop) key = stop;
  else if (sale?.status === "nozzle" || sale?.status === "preset") key = "ready";
  const [title, lines] = WHY[key] ?? WHY.idle;
  text(root, "pl3-why-title", title);
  for (let i = 0; i < 4; i++) text(root, `pl3-why-${i}`, lines[i] ?? "");
}

// ---------------------------------------------------------------------------
// station pins and shared helpers

export function pinsMarkup() {
  const pins = [
    ["delivery", 1, P(6.4, 13.9, 5.6), "Tanker to storage", -1],
    ["pricing", 2, P(27, 20, 4.4), "Litres to price", -1],
    ["nozzle", 3, P(30.6, 22.4, 2.4), "Customer and nozzle", 1],
  ];
  return `<g id="lesson-pins" aria-hidden="true">${pins.map(([id, n, [x, y], name, side]) => {
    const w = name.length * 10.5 + 24;
    const lx = side > 0 ? 28 : -28 - w;
    return `<g class="pin" data-pin="${id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <path class="pin-tail" d="M0,0 L-9,-22 H9 Z"/><circle class="pin-head" cx="0" cy="-36" r="22"/><text class="pin-text" x="0" y="-28" text-anchor="middle">${n}</text>
      <g class="pin-label"><rect x="${lx}" y="-52" width="${w}" height="32" rx="16"/><text x="${lx + w / 2}" y="-30" text-anchor="middle">${name}</text></g></g>`;
  }).join("")}</g>`;
}

export function platesMarkup() {
  return `${deliveryPlate()}${pricingPlate()}${nozzlePlate()}`;
}

export const updatePlate = { delivery: updateDelivery, pricing: updatePricing, nozzle: updateNozzle };

function set(root, id, attrs) {
  const el = root.querySelector(`#${id}`);
  for (const [k, v] of Object.entries(attrs)) {
    const value = typeof v === "number" ? v.toFixed(1) : v;
    if (el.getAttribute(k) !== value) el.setAttribute(k, value);
  }
}

function text(root, id, value) {
  const el = root.querySelector(`#${id}`);
  if (el.textContent !== value) el.textContent = value;
}
