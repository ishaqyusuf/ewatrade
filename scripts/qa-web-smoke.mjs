import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

export const launchSmokeBrowser = () => chromium.launch({ headless: true })

/**
 * @param {import("playwright").Page} page
 * @param {import("./qa-smoke").SmokeConfig} config
 */
export async function webJourney(page, config) {
  page.setDefaultTimeout(15000)
  const origin = config.web.origin
  const mutations = []
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      !["GET", "HEAD"].includes(request.method()) &&
      url.pathname !== "/api/qa-access"
    ) {
      mutations.push(url.pathname)
      await route.abort("blockedbyclient")
    } else await route.continue()
  })
  /** @param {string} path */
  const go = async (path) => {
    await page.goto(`${origin}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
    if (new URL(page.url()).origin !== origin)
      throw new Error(
        "Dashboard redirected away from the selected smoke target.",
      )
  }
  await go("/login")
  await page.getByRole("button", { name: "QA Quick Fill", exact: true }).click()
  await page.getByLabel("QA domain", { exact: true }).fill(config.qaDomain)
  await page
    .getByRole("button", { name: "Load QA accounts", exact: true })
    .click()
  await page
    .getByRole("combobox", { name: "Email address", exact: true })
    .click()
  await page
    .getByRole("option", { name: config.web.profileLabel, exact: true })
    .click()
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(
    (url) => url.origin === origin && url.pathname !== "/login",
  )
  await go("/catalog")
  await page
    .getByText(config.web.catalogItem, { exact: true })
    .first()
    .waitFor({ state: "visible" })
  await go("/sales?orderSheet=create")
  await page
    .getByRole("heading", { name: "New order", exact: true })
    .waitFor({ state: "visible" })
  await page
    .getByRole("combobox", { name: "Add catalog item", exact: true })
    .fill(config.web.catalogItem)
  await page
    .getByRole("option", { name: config.web.catalogItem, exact: true })
    .click()
  await page
    .getByLabel(`${config.web.catalogItem} item 1 quantity`, { exact: true })
    .waitFor({ state: "visible" })
  await page
    .getByText(config.web.expectedTotal, { exact: true })
    .first()
    .waitFor({ state: "visible" })
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page
    .getByRole("heading", { name: "New order", exact: true })
    .waitFor({ state: "hidden" })
  if (mutations.length)
    throw new Error(
      "An unexpected business mutation was attempted; the browser blocked it.",
    )
  return [
    "QA login and exact account selection",
    "populated catalog",
    "sale draft item and total",
    "cancel without submitting",
  ]
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [configFile, artifacts] = process.argv.slice(2)
  let browser
  let page
  try {
    if (!configFile || !artifacts)
      throw new Error("Expected smoke config and private artifact directory.")
    const config = JSON.parse(readFileSync(configFile, "utf8"))
    if (
      ![
        "https://ewatrade-dashboard.localhost",
        "https://preview-dashboard.ewatrade.com",
      ].includes(config.web?.origin)
    )
      throw new Error("Non-production smoke origin required.")
    browser = await launchSmokeBrowser()
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    })
    page = await context.newPage()
    const checks = await webJourney(page, config)
    console.log(JSON.stringify({ checks }))
  } catch {
    if (page)
      await page
        .screenshot({ path: resolve(artifacts, "failure.png") })
        .catch(() => {})
    console.error(
      "Web smoke did not pass. Inspect the private failure screenshot and configured QA account/item.",
    )
    process.exitCode = 1
  } finally {
    await browser?.close()
  }
}
