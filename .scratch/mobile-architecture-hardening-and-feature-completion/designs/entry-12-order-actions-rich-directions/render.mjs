import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium } from "/Users/M1PRO/.gstack/repos/gstack/node_modules/playwright/index.mjs"

const directory = path.dirname(fileURLToPath(import.meta.url))
const sourceUrl = pathToFileURL(path.join(directory, "comparison.html"))
const names = [
  ["A", "Action Docket"],
  ["B", "Counter Receipt"],
  ["C", "Guided Checkpoint"],
  ["D", "Quick Desk"],
  ["E", "Final Handoff"],
  ["F", "Quiet Sheet"],
]
const browser = await chromium.launch({ headless: true })

const current = await browser.newPage({ viewport: { width: 1440, height: 1040 } })
await current.goto(pathToFileURL(path.join(directory, "current-state.html")).href, {
  waitUntil: "domcontentloaded",
})
await current.screenshot({ path: path.join(directory, "current-state.png"), fullPage: true })
await current.close()

for (const theme of ["light", "dark"]) {
  for (const [key] of names) {
    for (const state of ["payment", "fulfil", "fulfil-all", "customer"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } })
      const url = new URL(sourceUrl)
      url.searchParams.set("option", key.toLowerCase())
      url.searchParams.set("theme", theme)
      url.searchParams.set("state", state)
      await page.goto(url.href, { waitUntil: "domcontentloaded" })
      const metrics = await page.locator(".phone").evaluate((phone) => {
        const rect = phone.getBoundingClientRect()
        return {
          activeOption: phone.querySelectorAll(".sheet.active-option").length,
          activeState: phone.querySelectorAll(".sheet.active-option .sheet-state.active").length,
          customerSurface: phone.querySelectorAll(".customer-shell.active").length,
          height: rect.height,
          width: rect.width,
        }
      })
      if (
        metrics.activeOption !== (state === "customer" ? 0 : 1) ||
        metrics.activeState !== (state === "customer" ? 0 : 1) ||
        metrics.customerSurface !== (state === "customer" ? 1 : 0) ||
        metrics.width !== 390 ||
        metrics.height !== 844
      ) {
        throw new Error(`${theme} ${key} ${state}: invalid preview ${JSON.stringify(metrics)}`)
      }
      await page.locator(".phone").screenshot({
        path: path.join(
          directory,
          `option-${key.toLowerCase()}-${state}${theme === "dark" ? "-dark" : ""}.png`,
        ),
      })
      await page.close()
    }
  }
}

for (const theme of ["light", "dark"]) {
  for (const state of ["payment", "fulfil", "fulfil-all", "customer"]) {
    const page = await browser.newPage({ viewport: { width: 2548, height: 1020 } })
    const cards = names
      .map(([key, name]) => {
        const suffix = theme === "dark" ? "-dark" : ""
        const source = readFileSync(
          path.join(directory, `option-${key.toLowerCase()}-${state}${suffix}.png`),
        ).toString("base64")
        return `<figure><img src="data:image/png;base64,${source}"><figcaption><b>Option ${key}</b><span>${name}</span></figcaption></figure>`
      })
      .join("")
    const dark = theme === "dark"
    const stateTitle = state === "payment" ? "Record payment" : state === "fulfil" ? "Fulfil line" : state === "fulfil-all" ? "Fulfil all ready" : "Customer record"
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:${dark ? "#04130f" : "#0b3d32"};font-family:Inter,system-ui;color:#fff3cf}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:20px}h1{margin:0;font-size:34px}p{margin:0;color:#ffdc8a;font-size:11px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase}main{display:flex;gap:18px}figure{margin:0;width:390px;background:#fff3cf}img{display:block;width:390px;height:844px}figcaption{display:flex;height:48px;align-items:center;justify-content:space-between;padding:0 14px;color:${dark ? "#fff3cf" : "#12382d"};background:${dark ? "#12342a" : "#fff3cf"}}figcaption b{color:#ed5637;font-size:10px}figcaption span{font-size:12px;font-weight:850}</style><header><div><p>Market Day · Order detail companion batch</p><h1>${stateTitle}, six ${theme} directions</h1></div><p>F is the minimalist recommendation · inspect every direct surface in the live board</p></header><main>${cards}</main>`)
    await page.screenshot({
      path: path.join(directory, `all-options-${state}-${theme}.png`),
      fullPage: true,
    })
    await page.close()
  }
}

for (const theme of ["light", "dark"]) {
  const dark = theme === "dark"
  const states = [
    ["payment", "Record payment"],
    ["fulfil", "Fulfil line"],
    ["fulfil-all", "Fulfil all ready"],
    ["customer", "Customer record"],
  ]
  const cards = states
    .map(([state, label]) => {
      const suffix = theme === "dark" ? "-dark" : ""
      const source = readFileSync(
        path.join(directory, `option-f-${state}${suffix}.png`),
      ).toString("base64")
      return `<figure><img src="data:image/png;base64,${source}"><figcaption>${label}</figcaption></figure>`
    })
    .join("")
  const page = await browser.newPage({ viewport: { width: 1720, height: 1020 } })
  await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:${dark ? "#04130f" : "#0b3d32"};font-family:Inter,system-ui;color:#fff3cf}header{display:flex;align-items:end;justify-content:space-between;margin-bottom:20px}h1{margin:0;font-size:34px}p{margin:0;color:#ffdc8a;font-size:11px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase}main{display:flex;gap:18px}figure{width:390px;margin:0;background:${dark ? "#12342a" : "#fff3cf"}}img{display:block;width:390px;height:844px}figcaption{display:grid;height:48px;place-items:center;color:${dark ? "#fff3cf" : "#12382d"};font-size:12px;font-weight:850}</style><header><div><p>Option F · Minimalist replacement direction</p><h1>Quiet Sheet, complete ${theme} interaction</h1></div><p>Existing bottom-sheet behavior, carefully simplified</p></header><main>${cards}</main>`)
  await page.screenshot({
    path: path.join(directory, `minimalist-option-f-${theme}.png`),
    fullPage: true,
  })
  await page.close()
}

const board = await browser.newPage({ viewport: { width: 1440, height: 1024 } })
await board.goto(sourceUrl.href, { waitUntil: "domcontentloaded" })
await board.screenshot({ path: path.join(directory, "comparison.png"), fullPage: true })
await board.click("#previous")
if ((await board.textContent("#current-name")) !== "Quiet Sheet") {
  throw new Error("Previous control did not wrap from A to F")
}
await board.click("#next")
await board.click("#next")
if ((await board.textContent("#current-name")) !== "Counter Receipt") {
  throw new Error("Next control did not advance from A to B")
}
await board.click("#fulfil-state")
if ((await board.locator(".sheet.active-option .sheet-state.active").getAttribute("data-state")) !== "fulfil") {
  throw new Error("Fulfil-state control did not activate")
}
await board.click("#fulfil-all-state")
if ((await board.getAttribute(".phone", "data-state")) !== "fulfil-all") {
  throw new Error("Fulfil-all control did not activate")
}
await board.click("#customer-state")
if ((await board.locator(".customer-shell.active").count()) !== 1) {
  throw new Error("Customer control did not activate")
}
await board.click("#theme-toggle")
if ((await board.getAttribute("html", "data-theme")) !== "dark") {
  throw new Error("Theme control did not activate Dark")
}
await board.close()

for (const [label, width, height] of [
  ["mobile", 375, 900],
  ["tablet", 768, 1100],
  ["desktop", 1440, 1024],
]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(sourceUrl.href, { waitUntil: "domcontentloaded" })
  await page.screenshot({ path: path.join(directory, `review-${label}.png`), fullPage: true })
  await page.close()
}

await browser.close()
