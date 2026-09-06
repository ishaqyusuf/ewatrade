import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium } from "/Users/M1PRO/.gstack/repos/gstack/node_modules/playwright/index.mjs"

const directory = path.dirname(fileURLToPath(import.meta.url))
const sourceUrl = pathToFileURL(path.join(directory, "comparison.html"))
const names = [
  ["A", "Dispatch Docket"],
  ["B", "Counter Receipt"],
  ["C", "Fulfilment Route"],
  ["D", "Split Ledger"],
  ["E", "Customer Parcel"],
]
const browser = await chromium.launch({ headless: true })

for (const theme of ["light", "dark"]) {
  for (const [key] of names) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } })
    const url = new URL(sourceUrl)
    url.searchParams.set("option", key.toLowerCase())
    url.searchParams.set("theme", theme)
    await page.goto(url.href, { waitUntil: "domcontentloaded" })
    const metrics = await page.locator(".phone").evaluate((phone) => {
      const rect = phone.getBoundingClientRect()
      return {
        active: phone.querySelectorAll(".screen.active").length,
        height: rect.height,
        statusTop:
          phone.querySelector(".screen.active .status").getBoundingClientRect()
            .top - rect.top,
        width: rect.width,
      }
    })
    if (
      metrics.active !== 1 ||
      metrics.width !== 390 ||
      metrics.height !== 844 ||
      metrics.statusTop !== 0
    ) {
      throw new Error(`${theme} ${key}: invalid phone preview ${JSON.stringify(metrics)}`)
    }
    await page.locator(".phone").screenshot({
      path: path.join(
        directory,
        `option-${key.toLowerCase()}${theme === "dark" ? "-dark" : ""}.png`,
      ),
    })
    await page.close()
  }
}

for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 2140, height: 1020 } })
  const cards = names
    .map(([key, name]) => {
      const suffix = theme === "dark" ? "-dark" : ""
      const source = readFileSync(
        path.join(directory, `option-${key.toLowerCase()}${suffix}.png`),
      ).toString("base64")
      return `<figure><img src="data:image/png;base64,${source}"><figcaption><b>Option ${key}</b><span>${name}</span></figcaption></figure>`
    })
    .join("")
  const dark = theme === "dark"
  await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:${dark ? "#04130f" : "#0b3d32"};font-family:Inter,system-ui;color:#fff3cf}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:20px}h1{margin:0;font-size:34px}p{margin:0;color:#ffdc8a;font-size:11px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase}main{display:flex;gap:18px}figure{margin:0;width:390px;background:#fff3cf}img{display:block;width:390px;height:844px}figcaption{display:flex;height:48px;align-items:center;justify-content:space-between;padding:0 14px;color:${dark ? "#fff3cf" : "#12382d"};background:${dark ? "#12342a" : "#fff3cf"}}figcaption b{color:#ed5637;font-size:10px}figcaption span{font-size:12px;font-weight:850}</style><header><div><p>Market Day · owner review batch</p><h1>Order detail, five ${theme} directions</h1></div><p>A is recommended · both themes available</p></header><main>${cards}</main>`)
  await page.screenshot({ path: path.join(directory, `all-options-${theme}.png`), fullPage: true })
  await page.close()
}

const board = await browser.newPage({ viewport: { width: 1440, height: 1024 } })
await board.goto(sourceUrl.href, { waitUntil: "domcontentloaded" })
await board.screenshot({ path: path.join(directory, "comparison.png"), fullPage: true })
await board.click("#previous")
if ((await board.textContent("#current-name")) !== "Customer Parcel") {
  throw new Error("Previous control did not wrap from A to E")
}
await board.click("#next")
await board.click("#next")
if ((await board.textContent("#current-name")) !== "Counter Receipt") {
  throw new Error("Next control did not advance from A to B")
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
