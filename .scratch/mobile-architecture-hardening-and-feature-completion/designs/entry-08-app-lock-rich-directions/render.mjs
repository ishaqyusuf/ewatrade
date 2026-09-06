import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { chromium } from "/Users/M1PRO/.gstack/repos/gstack/node_modules/playwright/index.mjs"

const directory = path.dirname(fileURLToPath(import.meta.url))
const sourceUrl = pathToFileURL(path.join(directory, "comparison.html"))
const browser = await chromium.launch({ headless: true })

for (const theme of ["light", "dark"]) {
  for (const option of ["a", "b", "c", "d", "e"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1024 },
      deviceScaleFactor: 1,
    })
    const url = new URL(sourceUrl)
    url.searchParams.set("option", option)
    url.searchParams.set("theme", theme)
    await page.goto(url.href, { waitUntil: "domcontentloaded" })
    await page.locator(".phone").screenshot({
      path: path.join(
        directory,
        `option-${option}${theme === "dark" ? "-dark" : ""}.png`,
      ),
    })
    await page.close()
  }
}

for (const theme of ["light", "dark"]) {
  const overview = await browser.newPage({
    viewport: { width: 2140, height: 980 },
  })
  const overviewCards = [
    ["A", "Market Vault"],
    ["B", "Ledger Lock"],
    ["C", "Night Safe"],
    ["D", "Counter Shutter"],
    ["E", "Quiet Seal"],
  ]
    .map(([key, name]) => {
      const suffix = theme === "dark" ? "-dark" : ""
      const imageData = readFileSync(
        path.join(directory, `option-${key.toLowerCase()}${suffix}.png`),
      ).toString("base64")
      return `<figure><img src="data:image/png;base64,${imageData}" alt="Option ${key}, ${name}, ${theme}"><figcaption><b>Option ${key}</b><span>${name}</span></figcaption></figure>`
    })
    .join("")
  const isDark = theme === "dark"
  await overview.setContent(
    `<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;padding:34px;background:${isDark ? "#04130f" : "#0b3d32"};font-family:Inter,system-ui,sans-serif;color:#fff3cf}
    header{display:flex;align-items:end;justify-content:space-between;margin-bottom:22px}h1{margin:0;font-size:34px;letter-spacing:-1px}p{margin:0;color:#ffdc8a;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase}
    main{display:flex;gap:18px}figure{margin:0;width:390px;background:#fffaf0;box-shadow:0 14px 30px rgb(0 0 0 / 22%)}img{display:block;width:390px;height:844px;object-fit:cover}figcaption{display:flex;align-items:center;justify-content:space-between;height:50px;padding:0 14px;color:${isDark ? "#fff3cf" : "#15372d"};background:${isDark ? "#15372d" : "#fff3cf"}}figcaption b{color:#ed5637;font-size:11px;text-transform:uppercase}figcaption span{font-size:13px;font-weight:800}
  </style></head><body><header><div><p>Market Day · owner review batch</p><h1>App Lock, five ${isDark ? "Dark" : "Light"} directions</h1></div><p>A is recommended · interactive board includes both themes</p></header><main>${overviewCards}</main></body></html>`,
    { waitUntil: "load" },
  )
  await overview.screenshot({
    path: path.join(directory, `all-options-${theme}.png`),
    fullPage: true,
  })
  await overview.close()
}

const alignmentReview = await browser.newPage({
  viewport: { width: 1840, height: 1060 },
})
const alignmentFrames = [
  ["Before", "Light", "option-a-v1-before-alignment.png"],
  ["Refined", "Light", "option-a.png"],
  ["Before", "Dark", "option-a-v1-before-alignment-dark.png"],
  ["Refined", "Dark", "option-a-dark.png"],
]
  .map(([version, theme, file]) => {
    const imageData = readFileSync(path.join(directory, file)).toString(
      "base64",
    )
    return `<figure><img src="data:image/png;base64,${imageData}" alt="Option A ${version.toLowerCase()} alignment in ${theme.toLowerCase()} mode"><figcaption><b>${version}</b><span>${theme}</span></figcaption></figure>`
  })
  .join("")
await alignmentReview.setContent(
  `<!doctype html><html><head><style>
  *{box-sizing:border-box}body{margin:0;padding:34px;background:#0b3d32;font-family:Inter,system-ui,sans-serif;color:#fff3cf}
  header{display:flex;align-items:end;justify-content:space-between;margin-bottom:22px}h1{margin:0;font-size:34px;letter-spacing:-1px}p{max-width:620px;margin:0;color:#ffdc8a;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase}
  main{display:flex;gap:22px}figure{margin:0;width:390px;background:#fffaf0;box-shadow:0 14px 30px rgb(0 0 0 / 22%)}img{display:block;width:390px;height:844px;object-fit:cover}figcaption{display:flex;align-items:center;justify-content:space-between;height:50px;padding:0 14px;color:#15372d;background:#fff3cf}figcaption b{color:#ed5637;font-size:11px;text-transform:uppercase}figcaption span{font-size:13px;font-weight:800}
  </style></head><body><header><div><p>Owner feedback round 2 · Option A</p><h1>Market Vault alignment refinement</h1></div><p>Same character, one shared content grid</p></header><main>${alignmentFrames}</main></body></html>`,
  { waitUntil: "load" },
)
await alignmentReview.screenshot({
  path: path.join(directory, "option-a-alignment-review.png"),
  fullPage: true,
})
await alignmentReview.close()

const board = await browser.newPage({ viewport: { width: 1440, height: 1024 } })
await board.goto(sourceUrl.href, { waitUntil: "domcontentloaded" })
await board.screenshot({
  path: path.join(directory, "comparison.png"),
  fullPage: true,
})

await board.click("#previous")
if ((await board.textContent("#current-name")) !== "Quiet Seal") {
  throw new Error("Previous chevron did not wrap from A to E")
}
await board.click("#next")
await board.click("#next")
if ((await board.textContent("#current-name")) !== "Ledger Lock") {
  throw new Error("Next chevron did not advance from A to B")
}
await board.click("#theme-toggle")
if ((await board.getAttribute("html", "data-theme")) !== "dark") {
  throw new Error("Theme control did not activate Dark preview")
}

await board.close()
await browser.close()
