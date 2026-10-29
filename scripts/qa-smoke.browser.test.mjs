import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { observeWebPerformance } from "./qa-web-performance.mjs"
import { launchSmokeBrowser, webJourney } from "./qa-web-smoke.mjs"

test(
  "request diagnostics observe browser counts/bytes and fixed phases without retaining payloads",
  { timeout: 30000 },
  async () => {
    const browser = await launchSmokeBrowser()
    try {
      const page = await browser.newPage({ serviceWorkers: "block" })
      await page.route("**/*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "server-timing": 'ew_sql;dur=4.2;desc="2 calls"' },
          body: '{"private":"response-sentinel"}',
        }),
      )
      const observer = observeWebPerformance(
        page,
        "https://ewatrade-dashboard.localhost",
      )
      assert.throws(
        () =>
          observeWebPerformance(page, "https://preview-dashboard.ewatrade.com"),
        /local-only/,
      )
      observer.begin()
      await page.goto(
        "https://ewatrade-dashboard.localhost/api/read?secret=url-sentinel",
        { waitUntil: "load" },
      )
      const result = await observer.end()
      assert.equal(result.started, 1)
      assert.equal(result.inFlightAtReadiness, 0)
      assert.equal(result.byKind.api.completed, 1)
      assert.equal(result.byKind.api.byteMeasurements, 1)
      assert.ok(result.byKind.api.responseBodyBytes > 0)
      assert.deepEqual(result.byKind.api.serverPhases.sql, {
        milliseconds: 4.2,
        count: 2,
      })
      assert.ok(!JSON.stringify(result).includes("sentinel"))
      /** @type {() => void} */
      let release = () => {
        throw new Error("Held request is not initialized.")
      }
      const held = new Promise((resolve) => {
        release = () => resolve(undefined)
      })
      await page.route("**/api/slow", async (route) => {
        await held
        await route.fulfill({ body: "private-sentinel" })
      })
      observer.begin()
      const requested = page.waitForRequest("**/api/slow")
      const navigation = page.goto(
        "https://ewatrade-dashboard.localhost/api/slow",
      )
      await requested
      const beforeCompletion = await observer.end()
      assert.equal(beforeCompletion.started, 1)
      assert.equal(beforeCompletion.inFlightAtReadiness, 1)
      release()
      await navigation
      assert.equal(beforeCompletion.inFlightAtReadiness, 1)
      observer.begin()
      assert.equal((await observer.end()).started, 0)
      await page.route("**/api/cancelled", (route) => route.abort("aborted"))
      observer.begin()
      await page
        .goto("https://ewatrade-dashboard.localhost/api/cancelled")
        .catch(() => undefined)
      const cancelled = await observer.end()
      assert.equal(cancelled.byKind.api.failed, 1)
      assert.equal(cancelled.byKind.api.cancelled, 1)
      assert.equal(cancelled.byKind.api.byteMeasurements, 0)
      observer.dispose()
    } finally {
      await browser.close()
    }
  },
)

test(
  "browser driver covers QA login, catalog, draft total and cancel against an intercepted fixture",
  { timeout: 30000 },
  async () => {
    const browser = await launchSmokeBrowser()
    try {
      const context = await browser.newContext({ serviceWorkers: "block" })
      const page = await context.newPage()
      const html = readFileSync(
        new URL("./fixtures/qa-smoke.html", import.meta.url),
        "utf8",
      )
      await page.route("**/*", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
      )
      const config = {
        qaDomain: "fixture.qa.test",
        web: {
          origin: "https://ewatrade-dashboard.localhost",
          profileLabel: "Owner · Fixture · OWNER",
          catalogItem: "Fixture item",
          expectedTotal: "₦500",
        },
      }
      assert.equal((await webJourney(page, config)).length, 4)
      assert.equal(
        await page.getByRole("heading", { name: "New order" }).isVisible(),
        false,
      )
      assert.deepEqual(await context.cookies(), [])
    } finally {
      await browser.close()
    }
  },
)

test(
  "browser driver blocks business writes rather than persisting an order",
  { timeout: 30000 },
  async () => {
    const browser = await launchSmokeBrowser()
    try {
      const page = await browser.newPage({ serviceWorkers: "block" })
      const html = readFileSync(
        new URL("./fixtures/qa-smoke.html", import.meta.url),
        "utf8",
      ).replace('location.hash === "#mutation"', "true")
      await page.route("**/*", (route) =>
        route.fulfill({ contentType: "text/html", body: html }),
      )
      const config = {
        qaDomain: "fixture.qa.test",
        web: {
          origin: "https://ewatrade-dashboard.localhost",
          profileLabel: "Owner · Fixture · OWNER",
          catalogItem: "Fixture item",
          expectedTotal: "₦500",
        },
      }
      await assert.rejects(
        () => webJourney(page, config),
        /unexpected business mutation/,
      )
    } finally {
      await browser.close()
    }
  },
)
