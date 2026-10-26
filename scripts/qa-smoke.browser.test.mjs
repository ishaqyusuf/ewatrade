import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { launchSmokeBrowser, webJourney } from "./qa-web-smoke.mjs"

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
