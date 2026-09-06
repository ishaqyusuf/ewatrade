import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium } from "/Users/M1PRO/.gstack/repos/gstack/node_modules/playwright/index.mjs"

const directory = path.dirname(fileURLToPath(import.meta.url))
const sourceUrl = pathToFileURL(path.join(directory, "comparison.html"))
const browser = await chromium.launch({ headless: true })
const names = [
  ["A", "Shift Ledger"],
  ["B", "Counter Shift"],
  ["C", "Pocket Till"],
  ["D", "Day Route"],
  ["E", "Trade Ticket"],
]

for (const theme of ["light", "dark"]) {
  for (const [key] of names) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1 })
    const url = new URL(sourceUrl)
    url.searchParams.set("option", key.toLowerCase())
    url.searchParams.set("theme", theme)
    await page.goto(url.href, { waitUntil: "domcontentloaded" })
    const layout = await page.evaluate(() => {
      const phone = document.querySelector(".phone").getBoundingClientRect()
      const active = document.querySelectorAll(".screen.active")
      const status = active[0].querySelector(".status").getBoundingClientRect()
      const nav = active[0].querySelector(".bottom-nav").getBoundingClientRect()
      return {
        activeCount: active.length,
        phoneWidth: phone.width,
        phoneHeight: phone.height,
        statusTop: status.top - phone.top,
        navBottom: nav.bottom - phone.top,
      }
    })
    if (layout.activeCount !== 1) throw new Error(`${theme} ${key}: expected one active direction`)
    if (layout.phoneWidth !== 390 || layout.phoneHeight !== 844) throw new Error(`${theme} ${key}: phone canvas changed`)
    if (layout.statusTop !== 0) throw new Error(`${theme} ${key}: status bar does not start at the screen edge`)
    if (layout.navBottom > 832) throw new Error(`${theme} ${key}: bottom navigation exceeds safe screen bounds`)
    await page.locator(".phone").screenshot({ path: path.join(directory, `option-${key.toLowerCase()}${theme === "dark" ? "-dark" : ""}.png`) })
    await page.close()
  }
}

for (const theme of ["light", "dark"]) {
  const overview = await browser.newPage({ viewport: { width: 2140, height: 980 } })
  const cards = names.map(([key, name]) => {
    const suffix = theme === "dark" ? "-dark" : ""
    const image = readFileSync(path.join(directory, `option-${key.toLowerCase()}${suffix}.png`)).toString("base64")
    return `<figure><img src="data:image/png;base64,${image}" alt="Option ${key}, ${name}, ${theme}"><figcaption><b>Option ${key}</b><span>${name}</span></figcaption></figure>`
  }).join("")
  const dark = theme === "dark"
  await overview.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;padding:34px;background:${dark ? "#04130f" : "#0b3d32"};font-family:Inter,system-ui,sans-serif;color:#fff3cf}header{display:flex;align-items:end;justify-content:space-between;margin-bottom:22px}h1{margin:0;font-size:34px;letter-spacing:-1px}p{margin:0;color:#ffdc8a;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase}main{display:flex;gap:18px}figure{margin:0;width:390px;background:#fffaf0;box-shadow:0 14px 30px rgb(0 0 0 / 22%)}img{display:block;width:390px;height:844px;object-fit:cover}figcaption{display:flex;align-items:center;justify-content:space-between;height:50px;padding:0 14px;color:${dark ? "#fff3cf" : "#15372d"};background:${dark ? "#15372d" : "#fff3cf"}}figcaption b{color:#ed5637;font-size:11px;text-transform:uppercase}figcaption span{font-size:13px;font-weight:800}</style></head><body><header><div><p>Market Day · owner review batch</p><h1>Sales Rep Home, five ${dark ? "Dark" : "Light"} directions</h1></div><p>A is recommended · interactive board includes both themes</p></header><main>${cards}</main></body></html>`, { waitUntil: "load" })
  await overview.screenshot({ path: path.join(directory, `all-options-${theme}.png`), fullPage: true })
  await overview.close()
}

const board = await browser.newPage({ viewport: { width: 1440, height: 1024 } })
await board.goto(sourceUrl.href, { waitUntil: "domcontentloaded" })
await board.screenshot({ path: path.join(directory, "comparison.png"), fullPage: true })
await board.click("#previous")
if ((await board.textContent("#current-name")) !== "Trade Ticket") throw new Error("Previous chevron did not wrap from A to E")
await board.click("#next")
await board.click("#next")
if ((await board.textContent("#current-name")) !== "Counter Shift") throw new Error("Next chevron did not advance from A to B")
await board.click("#theme-toggle")
if ((await board.getAttribute("html", "data-theme")) !== "dark") throw new Error("Theme control did not activate Dark preview")
await board.close()

for (const [label, width, height] of [["mobile", 375, 900], ["tablet", 768, 1100], ["desktop", 1440, 1024]]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(sourceUrl.href, { waitUntil: "domcontentloaded" })
  await page.screenshot({ path: path.join(directory, `review-${label}.png`), fullPage: true })
  await page.close()
}
await browser.close()
