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
 * These fixed base routes open no proof/job/optional panel. This is not a policy
 * for an active committed job or a private payment-status page.
 * @param {string} phase
 * @param {{started: number, timeline: Record<string, {started: number}>}} requests
 */
export function assertReadActivityBudget(phase, requests) {
  if (!["controlled-hidden", "offline-idle"].includes(phase)) return
  if ((requests.timeline.api?.started ?? 0) !== 0)
    throw Error("An inactive base representative started new API work.")
}

/**
 * Extend the existing QA journey; no login, writes, new runner or service control.
 * @param {import("playwright").Page} page
 * @param {{origin: string, catalogItem: string}} config
 * @param {ReturnType<import("./qa-web-performance.mjs").observeWebPerformance>} observation
 * @param {(update: {status: string, family: string | null, phase: string | null, samples: FamilySample[], diagnosticReads: Awaited<ReturnType<typeof diagnoseFinanceReads>>}) => void} checkpoint
 * @param {"all" | "activity" | "reports" | "finance" | "read-activity"} [selection]
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
      : selection === "reports"
        ? dashboardRouteFamilies.filter((target) => target.family === "DP-409")
        : selection === "finance"
          ? dashboardRouteFamilies.filter(
              (target) => target.family === "DP-405",
            )
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
    assertReadActivityBudget(action, requests)
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
      if (selection === "read-activity") {
        phase = "read-activity-setup"
        publish("running")
        // Headless Chromium keeps background tabs visible. This is controlled DOM
        // visibility, not evidence of native tab occlusion or OS lifecycle handling.
        await page.evaluate(() => {
          if (
            Object.getOwnPropertyDescriptor(document, "visibilityState") ||
            Object.getOwnPropertyDescriptor(document, "hidden")
          )
            throw Error("The document already owns a visibility override.")
        })
        /** @param {boolean} hidden */
        const visibility = (hidden) =>
          page.evaluate((value) => {
            Object.defineProperties(document, {
              visibilityState: {
                configurable: true,
                value: value ? "hidden" : "visible",
              },
              hidden: { configurable: true, value },
            })
            document.dispatchEvent(
              new Event("visibilitychange", { bubbles: true }),
            )
            if (!value) window.dispatchEvent(new Event("focus"))
          }, hidden)
        const idleMs =
          target.family === "DP-402"
            ? 65_000
            : target.family === "DP-406"
              ? 35_000
              : 5_000
        try {
          await measure(target, "visible-idle", () =>
            page.waitForTimeout(idleMs),
          )
          await measure(target, "controlled-hidden", async () => {
            await visibility(true)
            await page.waitForTimeout(idleMs)
          })
          await measure(target, "focus-return", async () => {
            await visibility(false)
            await page.waitForTimeout(4_000)
            await ready(target)
          })
          await measure(target, "offline-idle", async () => {
            await page.context().setOffline(true)
            await page.waitForFunction(() => !navigator.onLine)
            await page.waitForTimeout(
              target.family === "DP-402" ? 65_000 : 5_000,
            )
          })
          await measure(target, "reconnect", async () => {
            await page.context().setOffline(false)
            await page.waitForFunction(() => navigator.onLine)
            await page.waitForTimeout(4_000)
            await ready(target)
          })
          confirmPath(target.path)
        } finally {
          await page.context().setOffline(false)
          await page.evaluate(() => {
            const wasHidden = document.visibilityState !== "visible"
            Reflect.deleteProperty(document, "visibilityState")
            Reflect.deleteProperty(document, "hidden")
            if (wasHidden)
              document.dispatchEvent(
                new Event("visibilitychange", { bubbles: true }),
              )
          })
        }
      }
      if (selection === "reports") {
        phase = "cold-service-entry"
        publish("running")
        const serviceUrl = `${config.origin}/analytics?operationsReportTab=service`
        await page.goto(serviceUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
        if (page.url() !== serviceUrl)
          throw Error("Reports left its fixed Service target.")
        await ready(target)
        await page
          .getByRole("region", { name: "Service jobs", exact: true })
          .waitFor()
        const reportShell = await page
          .locator('aside[aria-label="Dashboard sidebar"]')
          .elementHandle()
        if (!reportShell) throw Error("Report shell is absent.")
        try {
          await measure(
            { ...target, readiness: "stock-metrics" },
            "cold-stock-tab",
            async () => {
              await page
                .getByRole("tab", { name: "Stock", exact: true })
                .click()
              await page.waitForURL(`${config.origin}/analytics`)
              confirmPath("/analytics")
              await page
                .getByRole("region", { name: "Stock", exact: true })
                .waitFor()
              if (await page.locator('main [role="alert"]:visible').count())
                throw Error("Stock has a visible error.")
              if (!(await reportShell.evaluate((node) => node.isConnected)))
                throw Error("Stock activation replaced the shell.")
            },
          )
          const timeline = samples.at(-1)?.requests.timeline
          if (
            timeline?.stockReconciliation?.started !== 1 ||
            timeline.stockBalances?.started !== 1 ||
            timeline.stockReportBatch?.started !== 1
          ) {
            throw Error(
              "Cold Stock activation did not share its two reads in one batch.",
            )
          }
        } finally {
          await reportShell.dispose()
        }
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
