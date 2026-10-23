// Render geometry previews of real model states without a browser.
//   node experiments/petrol-station/tools/preview.mjs
// Output: experiments/petrol-station/screenshots/preview-*.png
// Text appears as translucent bars: this checks layout, not typography.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { apply, createState, read, runJourney, tick } from "../model.mjs";
import { CAMERAS, bindScene, sceneMarkup } from "../src/scene.mjs";
import { fakeDom, parseSvg, render } from "./raster.mjs";

const here = new URL(".", import.meta.url);
const outDir = new URL("../screenshots/", here);
const css = await readFile(new URL("../src/styles.css", here), "utf8");

const run = (s, ...types) => {
  for (const t of types) {
    const [type, payload] = Array.isArray(t) ? t : [t];
    const r = apply(s, payload ? { type, payload } : { type });
    if (!r.ok) throw new Error(`${type}: ${r.reason}`);
    s = r.state;
  }
  return s;
};

async function snap(name, state, { viewBox = CAMERAS.full, width = 1200 } = {}) {
  const svg = parseSvg(sceneMarkup());
  const scene = bindScene(fakeDom(svg));
  scene.update({ ...read(state), saleStatus: state.sale?.status ?? null });
  scene.animateFlow(0);
  const png = render(svg, css, { width, viewBox: viewBox.join(" ") });
  await writeFile(new URL(`preview-${name}.png`, outDir), png);
  console.log(`preview-${name}.png`);
}

await mkdir(outDir, { recursive: true });
const only = process.argv[2];

const initial = createState();
let delivery = run(initial, "arriveTanker", "checkTank", "connectDelivery", "startDischarge");
delivery = tick(delivery, 15 * 60_000);
let dispensing = run(delivery, "haltDischarge", "finishDelivery", "powerOn", ["setPrice", { priceKobo: 100_000 }], "openStation", "customerArrives",
  ["setPreset", { mode: "amount", amountKobo: 2_000_000 }], "liftNozzle", "startPump");
dispensing = tick(dispensing, 15_000);
const closed = runJourney(createState());

const shots = {
  initial: () => snap("initial", initial),
  delivery: () => snap("delivery", delivery),
  dispensing: () => snap("dispensing", dispensing),
  closed: () => snap("closed", closed),
  "phone-delivery": () => snap("phone-delivery", delivery, { viewBox: CAMERAS.delivery, width: 390 }),
  "phone-station": () => snap("phone-station", dispensing, { viewBox: CAMERAS.station, width: 390 }),
  "phone-dispense": () => snap("phone-dispense", dispensing, { viewBox: CAMERAS.dispense, width: 390 }),
};
for (const [name, fn] of Object.entries(shots)) if (!only || only === name) await fn();
