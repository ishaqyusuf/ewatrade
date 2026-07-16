import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const adb = "/Users/M1PRO/Library/Android/sdk/platform-tools/adb"
const serial = "emulator-5554"
const root = resolve(process.cwd(), "../..")
const evidence = JSON.parse(
  readFileSync(
    resolve(root, ".scratch/qa/alijawda-feed-seller/mobile-session-result.json"),
    "utf8",
  ),
)
const screenshotDir = resolve(
  root,
  ".scratch/qa/alijawda-feed-seller/screenshots",
)

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function openLink(link) {
  execFileSync(adb, [
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    link,
  ])
}

function screenshot(name) {
  const image = execFileSync(adb, ["-s", serial, "exec-out", "screencap", "-p"])
  Bun.write(resolve(screenshotDir, name), image)
}

const targets = [
  ["dashboard", evidence.importLinks.dashboard, "mobile-03-dashboard.png", 6000],
  [
    "first-product-setup",
    evidence.importLinks.firstProductSetup,
    "mobile-04-first-product-setup.png",
    5000,
  ],
  [
    "create-sale",
    evidence.importLinks.createSale,
    "mobile-05-create-sale-variant-list.png",
    7000,
  ],
]

for (const [, link, filename, delay] of targets) {
  openLink(link)
  wait(delay)
  screenshot(filename)
}

console.log(
  JSON.stringify(
    {
      captured: targets.map((target) => target[2]),
      inventoryUnits: evidence.inventory.length,
      productCount: evidence.products.length,
    },
    null,
    2,
  ),
)
