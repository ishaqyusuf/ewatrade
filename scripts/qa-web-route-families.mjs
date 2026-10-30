import { diagnoseFinanceReads } from "./qa-finance-read-diagnostics.mjs"

/** @typedef {ReturnType<import("./qa-web-performance.mjs").observeWebPerformance>} Observation */
/** @typedef {Awaited<ReturnType<Observation["end"]>>} RequestSummary */
/** @typedef {{family: string, path: string, heading: string, readiness: string, phase: string, milliseconds: number, requests: RequestSummary}} FamilySample */

/** Fixed, read-only representatives; paths never come from account data or links. */
export const dashboardRouteFamilies = [
  {
    family: "DP-401",
    path: "/",
    heading: "Overview",
    readiness: "overview-summary",
  },
  {
    family: "DP-402",
    path: "/catalog",
    heading: "Catalog",
    readiness: "configured-catalog-row",
  },
  {
    family: "DP-403",
    path: "/sales",
    heading: "Orders",
    readiness: "orders-content",
  },
  {
    family: "DP-404",
    path: "/customers",
    heading: "Customers",
    readiness: "server-customer-book",
  },
  {
    family: "DP-405",
    path: "/finance",
    heading: "Finance",
    readiness: "three-finance-panels",
  },
  {
    family: "DP-406",
    path: "/website-requests",
    heading: "Website requests",
    readiness: "product-request-list",
  },
  {
    family: "DP-407",
    path: "/activity",
    heading: "Activity",
    readiness: "recorded-activity-list",
  },
  {
    family: "DP-408",
    path: "/settings",
    heading: "General",
    readiness: "server-settings",
  },
  {
    family: "DP-409",
    path: "/analytics",
    heading: "Reports",
    readiness: "sales-headlines",
  },
]

/**
 * Extend the existing QA journey; no login, writes, new runner or service control.
 * @param {import("playwright").Page} page
 * @param {{origin: string, catalogItem: string}} config
 * @param {ReturnType<import("./qa-web-performance.mjs").observeWebPerformance>} observation
 * @param {(update: {status: string, family: string | null, phase: string | null, samples: FamilySample[], diagnosticReads: Awaited<ReturnType<typeof diagnoseFinanceReads>>}) => void} checkpoint
 * @param {"all" | "activity"} [selection]
 */
export async function measureDashboardRouteFamilies(
  page,
  config,
  observation,
  checkpoint,
  selection = "all",
) {
  if (config.origin !== "https://ewatrade-dashboard.localhost")
    throw Error("Route-family measurement is local-only.")
  const targets =
    selection === "activity"
      ? dashboardRouteFamilies.filter((target) => target.family === "DP-407")
      : dashboardRouteFamilies
  /** @type {FamilySample[]} */
  const samples = []
  /** @type {Awaited<ReturnType<typeof diagnoseFinanceReads>>} */
  const diagnosticReads = []
  let family = targets[0]
  let phase = "full-refresh"
  let observing = false
  /** @param {string} status */
  const publish = (status) =>
    checkpoint({
      status,
      family: family?.family ?? null,
      phase,
      samples: [...samples],
      diagnosticReads: [...diagnosticReads],
    })
  /** @param {typeof dashboardRouteFamilies[number]} target */
  const ready = async (target) => {
    await page
      .getByRole("heading", { name: target.heading, exact: true, level: 1 })
      .waitFor()
    if (target.path === "/catalog")
      await page
        .getByText(config.catalogItem, { exact: true })
        .first()
        .waitFor()
    else if (target.path === "/customers")
      await page
        .locator("main [data-summary-grid]:not([data-summary-skeleton])")
        .waitFor()
    else if (target.path === "/settings")
      await page.getByText("Current store", { exact: true }).waitFor()
    else if (target.path === "/finance") {
      for (const title of [
        "Money accounts",
        "Who owes what",
        "Recent spending",
      ]) {
        const panel = page.locator("main section").filter({
          has: page.getByRole("heading", { name: title, exact: true }),
        })
        await panel.waitFor()
        await panel
          .locator(".animate-pulse")
          .first()
          .waitFor({ state: "hidden" })
      }
    } else if (target.path === "/website-requests") {
      const list = page.getByRole("region", {
        name: "Product order requests",
        exact: true,
      })
      await list.waitFor()
      await list
        .getByText("Loading requests…", { exact: true })
        .waitFor({ state: "hidden" })
    } else if (target.path === "/activity")
      await page
        .getByRole("region", { name: "Recorded activity", exact: true })
        .waitFor()
    else if (target.path === "/analytics")
      await page.locator('main dl[aria-label="Sales"]').waitFor()
    else if (target.path === "/")
      await page.waitForFunction(
        () => !document.querySelector("main [data-summary-skeleton]"),
      )
    else if (target.path === "/sales")
      await page.waitForFunction(
        () => !document.querySelector("main .animate-pulse"),
      )
    if (await page.locator('main [role="alert"]:visible').count())
      throw Error("Representative content has a visible error.")
  }
  /** @param {string} path */
  const confirmPath = (path) => {
    const current = new URL(page.url())
    if (
      current.origin !== config.origin ||
      current.pathname !== path ||
      current.search
    )
      throw Error("Representative navigation left its fixed target.")
  }
  /** @param {typeof dashboardRouteFamilies[number]} target */
  const soft = async (target) => {
    await page
      .locator(
        'aside[aria-label="Dashboard sidebar"] nav[aria-label="Main navigation"]',
      )
      .locator(`a[href="${target.path}"]`)
      .first()
      .click()
    await page.waitForURL(`${config.origin}${target.path}`)
    confirmPath(target.path)
    await ready(target)
  }
  /** @param {typeof dashboardRouteFamilies[number]} target @param {string} action @param {() => Promise<void>} run */
  const measure = async (target, action, run) => {
    phase = action
    publish("running")
    observation.begin()
    observing = true
    const started = performance.now()
    await run()
    const milliseconds = Math.round(performance.now() - started)
    const requests = await observation.end()
    observing = false
    samples.push({ ...target, phase: action, milliseconds, requests })
    publish("running")
  }
  try {
    for (const target of targets) {
      family = target
      await measure(target, "full-refresh", async () => {
        await page.goto(`${config.origin}${target.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
        confirmPath(target.path)
        await ready(target)
      })
      const shell = await page
        .locator('aside[aria-label="Dashboard sidebar"]')
        .elementHandle()
      if (!shell) throw Error("Representative shell is absent.")
      const retained = async () => {
        if (!(await shell.evaluate((node) => node.isConnected)))
          throw Error("Representative shell was replaced.")
      }
      try {
        phase = "navigation-away"
        publish("running")
        await soft(dashboardRouteFamilies[target.path === "/" ? 1 : 0])
        await retained()
        await measure(target, "warm-return", async () => {
          await soft(target)
          await retained()
        })
      } finally {
        await shell.dispose()
      }
      if (target.path === "/finance") {
        phase = "isolated-read-diagnostics"
        publish("running")
        diagnosticReads.push(
          ...(await diagnoseFinanceReads(page, config.origin)),
        )
        publish("running")
      }
    }
    publish("passed")
    return samples
  } catch {
    if (observing) await observation.end()
    publish("failed")
    throw Error(
      `Route family ${family?.family} did not complete ${phase}; inspect private QA artifacts.`,
    )
  }
}
