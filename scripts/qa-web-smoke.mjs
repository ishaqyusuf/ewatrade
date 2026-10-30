import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { observeWebPerformance } from "./qa-web-performance.mjs"
import { measureDashboardRouteFamilies } from "./qa-web-route-families.mjs"

export const launchSmokeBrowser = () => chromium.launch({ headless: true })

/**
 * @param {import("playwright").Page} page
 * @param {import("./qa-smoke").SmokeConfig} config
 */
export async function webJourney(page, config) {
  page.setDefaultTimeout(15000)
  const origin = config.web.origin
  const performanceArtifacts = process.env.QA_WEB_NAVIGATION_ARTIFACTS
  const verifyBell = process.env.QA_WEB_NOTIFICATION_COUNTS === "true"
  const verifyFamilies = process.env.QA_WEB_ROUTE_FAMILIES === "true"
  if (
    verifyFamilies &&
    (!performanceArtifacts || origin !== "https://ewatrade-dashboard.localhost")
  )
    throw new Error(
      "Route-family verification requires local navigation artifacts.",
    )
  if (
    verifyBell &&
    (!performanceArtifacts || origin !== "https://ewatrade-dashboard.localhost")
  )
    throw new Error(
      "Bell count verification requires local navigation artifacts.",
    )
  const observation = performanceArtifacts
    ? observeWebPerformance(page, origin)
    : undefined
  const samples = []
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
  // The server renders this button before hydration. The existing mount-time QA
  // capability response proves its client handlers are attached before clicking.
  const qaReady = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/qa-access" &&
      response.request().method() === "GET" &&
      response.status() === 200,
    { timeout: 30000 },
  )
  await go("/login")
  await qaReady
  await page.getByRole("button", { name: "QA Quick Fill", exact: true }).click()
  await page.getByLabel("QA domain", { exact: true }).fill(config.qaDomain)
  await page
    .getByRole("button", { name: "Load QA accounts", exact: true })
    .click()
  await page.getByRole("combobox", { name: "QA profile", exact: true }).click()
  await page
    .getByRole("option", { name: config.web.profileLabel, exact: true })
    .click()
  const loginStarted = performance.now()
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(
    (url) => url.origin === origin && url.pathname !== "/login",
  )
  if (performanceArtifacts) {
    await page.locator('aside[aria-label="Dashboard sidebar"]').waitFor()
    await page.getByRole("heading", { name: "Overview", exact: true }).waitFor()
    samples.push({
      path: "/",
      phase: "initial-shell-after-login",
      milliseconds: Math.round(performance.now() - loginStarted),
    })
  }
  const countFields = [
    ["businessBanking.pendingReportCount", "count"],
    ["businessBanking.notificationChangeCount", "unreadCount"],
    ["storefrontRequests.notificationCount", "unreadCount"],
  ]
  const previews = [
    "businessBanking.pendingReports",
    "businessBanking.notificationChanges",
    "storefrontRequests.notifications",
  ]
  let closedPreviewRequests = 0
  /** @param {import("playwright").Request} request */
  const trackPreview = (request) => {
    const path = decodeURIComponent(new URL(request.url()).pathname)
    if (previews.some((name) => path.includes(name))) closedPreviewRequests++
  }
  const badgeResponses = verifyBell
    ? countFields.map(([name, field]) => ({
        name,
        field,
        response: page
          .waitForResponse((response) =>
            decodeURIComponent(new URL(response.url()).pathname).includes(name),
          )
          .catch(() => null),
      }))
    : []
  if (verifyBell) page.on("request", trackPreview)
  observation?.begin()
  const catalogStarted = performance.now()
  await go("/catalog")
  await page
    .getByText(config.web.catalogItem, { exact: true })
    .first()
    .waitFor({ state: "visible" })
  if (observation)
    samples.push({
      path: "/catalog",
      phase: "full-refresh",
      milliseconds: Math.round(performance.now() - catalogStarted),
      requests: await observation.end(),
    })
  if (
    performanceArtifacts &&
    origin === "https://ewatrade-dashboard.localhost"
  ) {
    mkdirSync(performanceArtifacts, { recursive: true })
    await page.screenshot({
      path: resolve(performanceArtifacts, "catalog-page.png"),
    })
  }
  if (verifyBell && performanceArtifacts) {
    await Promise.all(
      badgeResponses.map(async ({ name, field, response }) => {
        const value = await response
        if (!value?.ok()) throw new Error("A fresh bell count read failed.")
        const names =
          decodeURIComponent(new URL(value.url()).pathname)
            .split("/api/trpc/")[1]
            ?.split(",") ?? []
        const body = await value.json()
        const data = (Array.isArray(body) ? body[names.indexOf(name)] : body)
          ?.result?.data?.json
        if (
          !Number.isSafeInteger(data?.[field]) ||
          data[field] < 0 ||
          (field === "count" && data[field] > 5)
        )
          throw new Error(
            "Bell count response is not its bounded numeric projection.",
          )
      }),
    )
    page.off("request", trackPreview)
    if (closedPreviewRequests)
      throw new Error("Closed bell fetched unused private previews.")
    const previewResponses = previews.map((name) =>
      page.waitForResponse((response) =>
        decodeURIComponent(new URL(response.url()).pathname).includes(name),
      ),
    )
    await page.getByRole("button", { name: /^My notifications/ }).click()
    if (
      (await Promise.all(previewResponses)).some((response) => !response.ok())
    )
      throw new Error("An opened notification preview failed.")
    await page.getByText("My notifications", { exact: true }).first().waitFor()
    await page.screenshot({
      path: resolve(performanceArtifacts, "notification-bell.png"),
    })
    await page.keyboard.press("Escape")
    await page
      .getByText("My notifications", { exact: true })
      .first()
      .waitFor({ state: "hidden" })
  }
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
  if (performanceArtifacts) {
    if (origin !== "https://ewatrade-dashboard.localhost")
      throw new Error("Navigation measurement is local-only.")
    const sidebar = page.locator('aside[aria-label="Dashboard sidebar"]')
    const shell = await sidebar.elementHandle()
    if (!shell)
      throw new Error(
        "Dashboard shell is unavailable for navigation measurement.",
      )
    for (let round = 0; round < 2; round++) {
      for (const path of ["/catalog", "/"]) {
        observation?.begin()
        const started = performance.now()
        await sidebar
          .locator(`nav[aria-label="Main navigation"] a[href="${path}"]`)
          .click()
        await page.waitForURL(`${origin}${path}`)
        if (path === "/catalog")
          await page
            .getByText(config.web.catalogItem, { exact: true })
            .first()
            .waitFor()
        else {
          await page
            .getByRole("heading", { name: "Overview", exact: true })
            .waitFor()
          await page.waitForFunction(
            () => !document.querySelector("main [data-summary-skeleton]"),
          )
        }
        if (!(await shell.evaluate((node) => node.isConnected)))
          throw new Error("Dashboard shell was replaced during navigation.")
        const milliseconds = Math.round(performance.now() - started)
        samples.push({
          path,
          phase: round ? "warm" : "first-measured-transition",
          milliseconds,
          requests: await observation?.end(),
        })
      }
    }
    await page
      .getByRole("button", { name: "New: choose what to add", exact: true })
      .click()
    await page.getByRole("menuitem", { name: "New order", exact: true }).click()
    await page
      .getByRole("heading", { name: "New order", exact: true })
      .waitFor()
    await page.getByRole("button", { name: "Close", exact: true }).click()
    await page
      .getByRole("heading", { name: "New order", exact: true })
      .waitFor({ state: "hidden" })
    await page
      .getByRole("button", { name: "New: choose what to add", exact: true })
      .click()
    await page
      .getByRole("menuitem", { name: "Update stock", exact: true })
      .click()
    await page
      .getByRole("heading", { name: "Correct stock", exact: true })
      .waitFor()
    await page.getByRole("button", { name: "Close", exact: true }).click()
    await page
      .getByRole("heading", { name: "Correct stock", exact: true })
      .waitFor({ state: "hidden" })
    if (mutations.length)
      throw new Error(
        "Unexpected business write blocked during lazy sheet acceptance.",
      )
    if (verifyFamilies && observation) {
      mkdirSync(performanceArtifacts, { recursive: true })
      const familySamples = await measureDashboardRouteFamilies(
        page,
        config.web,
        observation,
        (update) => {
          writeFileSync(
            resolve(performanceArtifacts, "route-families.json"),
            JSON.stringify(
              {
                version: 1,
                scope:
                  "Fixed read-only representatives; full refresh and warm return after navigation away. Existing data only. Shell retention concerns soft navigation; readiness is representative content. No percentile or runtime-source qualification.",
                ...update,
              },
              null,
              2,
            ),
          )
        },
      )
      samples.push(...familySamples)
      await sidebar
        .locator('nav[aria-label="Main navigation"] a[href="/"]')
        .click()
      await page.waitForURL(`${origin}/`)
      await page
        .getByRole("heading", { name: "Overview", exact: true })
        .waitFor()
      await page.waitForFunction(
        () => !document.querySelector("main [data-summary-skeleton]"),
      )
    }
    mkdirSync(performanceArtifacts, { recursive: true })
    await page.screenshot({
      path: resolve(performanceArtifacts, "dashboard-home.png"),
    })
    writeFileSync(
      resolve(performanceArtifacts, "performance.json"),
      JSON.stringify(
        {
          origin,
          runtime: "local runtime; build mode and source recorded separately",
          samples,
          blockedBusinessWrites: mutations.length,
          shellRetained: true,
          ...(verifyBell
            ? {
                bellCounts:
                  "three numeric reads; no closed previews; open/read/close passed",
              }
            : {}),
          overviewSheets:
            "order and stock sheets opened and cancelled without submission",
        },
        null,
        2,
      ),
    )
  }
  observation?.dispose()
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
