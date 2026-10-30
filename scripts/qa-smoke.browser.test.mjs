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

// The runner's readiness/checkpoint contract, not product rendering or latency.
for (const scenario of [
  { name: "all nine representatives", options: {}, expected: "passed" },
  {
    name: "isolated Finance refusal",
    options: { diagnosticRefusal: true },
    expected: "DP-405",
  },
  {
    name: "malformed Finance summary",
    options: { diagnosticMalformed: true },
    expected: "DP-405",
  },
  {
    name: "missing Finance Book",
    options: { diagnosticNoBook: true },
    expected: "DP-405",
  },
  {
    name: "header without customer data",
    options: { omitReady: "/customers" },
    expected: "DP-404",
  },
  {
    name: "visible Finance error",
    options: { errorOn: "/finance" },
    expected: "DP-405",
  },
  {
    name: "replaced shell",
    options: { replaceShell: true },
    expected: "DP-401",
  },
  {
    name: "shell replaced on return",
    options: { replaceShellOn: "/" },
    expected: "DP-401",
  },
  {
    name: "session redirect",
    options: { redirectOn: "/customers" },
    expected: "DP-404",
  },
]) {
  test(
    `route-family diagnostics reject false readiness: ${scenario.name}`,
    { timeout: 30000 },
    async () => {
      const { dashboardRouteFamilies, measureDashboardRouteFamilies } =
        await import("./qa-web-route-families.mjs")
      const browser = await launchSmokeBrowser()
      try {
        const page = await browser.newPage({ serviceWorkers: "block" })
        page.setDefaultTimeout(800)
        const origin = "https://ewatrade-dashboard.localhost"
        /** @type {string[]} */
        const unexpected = []
        const html = readFileSync(
          new URL("./fixtures/qa-route-families.html", import.meta.url),
          "utf8",
        ).replace(
          "const options = {} // fixture-options",
          `const options = ${JSON.stringify(scenario.options)}`,
        )
        await page.route("**/*", async (route) => {
          const request = route.request()
          const url = new URL(request.url())
          if (request.method() !== "GET" || url.origin !== origin) {
            unexpected.push(request.method())
            await route.abort()
          } else if (url.pathname === "/api/fixture-read") {
            await route.fulfill({
              contentType: "application/json",
              headers: { "server-timing": "ew_sql;dur=2" },
              body: '{"private":"private-body-sentinel"}',
            })
          } else if (url.pathname === "/api/trpc/finance.book") {
            await route.fulfill({
              contentType: "application/json",
              headers: {
                "server-timing": 'ew_sql;dur=2;desc="11 calls",ew_actor;dur=9',
              },
              body: JSON.stringify({
                result: {
                  data: {
                    json: {
                      id:
                        "diagnosticNoBook" in scenario.options
                          ? null
                          : "private-book-sentinel",
                      accounts: [{ name: "private-name-sentinel" }],
                    },
                  },
                },
              }),
            })
          } else if (url.pathname === "/api/trpc/finance.owedSummary") {
            if ("diagnosticRefusal" in scenario.options) {
              await route.fulfill({
                status: 403,
                body: "private-refusal-sentinel",
              })
              return
            }
            assert.equal(
              JSON.parse(url.searchParams.get("input") ?? "").json.bookId,
              "private-book-sentinel",
            )
            await route.fulfill({
              contentType: "application/json",
              headers: { "server-timing": 'ew_sql;dur=3;desc="11 calls"' },
              body: JSON.stringify({
                result: {
                  data: {
                    json: {
                      customers: {
                        count: 1,
                        owedMinor:
                          "diagnosticMalformed" in scenario.options
                            ? 1
                            : "9007199254740993",
                        top: [
                          {
                            id: "private-customer-sentinel",
                            name: "private-name-sentinel",
                            owedMinor: "9007199254740993",
                          },
                        ],
                      },
                      suppliers: { count: 0, owedMinor: "0", top: [] },
                    },
                  },
                },
              }),
            })
          } else if (url.pathname === "/favicon.ico")
            await route.fulfill({ status: 204 })
          else await route.fulfill({ contentType: "text/html", body: html })
        })
        const observation = observeWebPerformance(page, origin)
        /** @type {Array<{status: string, family: string | null, phase: string | null, samples: object[], diagnosticReads: Awaited<ReturnType<typeof import("./qa-finance-read-diagnostics.mjs").diagnoseFinanceReads>>}>} */
        const checkpoints = []
        const run = () =>
          measureDashboardRouteFamilies(
            page,
            { origin, catalogItem: "Fixture item" },
            observation,
            (update) => checkpoints.push(update),
          )
        if (scenario.expected === "passed") {
          const samples = await run()
          assert.equal(samples.length, 18)
          assert.equal(dashboardRouteFamilies.length, 9)
          assert.deepEqual(
            checkpoints.at(-1)?.diagnosticReads.map((read) => read.procedure),
            ["finance.book", "finance.owedSummary"],
          )
          assert.equal(
            checkpoints.at(-1)?.diagnosticReads[1]?.serverPhases.sql.count,
            11,
          )
          assert.ok(
            checkpoints
              .at(-1)
              ?.diagnosticReads.every(
                (read) => read.decodedBodyBytes > 0 && read.status === 200,
              ),
          )

          for (const { family } of dashboardRouteFamilies) {
            const pair = samples.filter((sample) => sample.family === family)
            assert.deepEqual(
              pair.map((sample) => sample.phase),
              ["full-refresh", "warm-return"],
            )
            assert.ok(pair.every((sample) => sample.milliseconds >= 0))
            assert.ok(pair[0].requests.started > 0)
          }
        } else await assert.rejects(run, new RegExp(scenario.expected))
        assert.equal(
          checkpoints.at(-1)?.status,
          scenario.expected === "passed" ? "passed" : "failed",
        )
        if (scenario.expected !== "passed")
          assert.equal(checkpoints.at(-1)?.family, scenario.expected)
        if (scenario.name === "shell replaced on return")
          assert.equal(checkpoints.at(-1)?.phase, "warm-return")
        assert.ok(!JSON.stringify(checkpoints).includes("sentinel"))
        assert.deepEqual(unexpected, [])
        observation.dispose()
        await observation.begin()
        assert.equal((await observation.end()).started, 0)
      } finally {
        await browser.close()
      }
    },
  )
}

test(
  "route-family opt-in requires canonical local artifacts before page activity",
  { timeout: 30000 },
  async () => {
    const browser = await launchSmokeBrowser()
    const oldFamilies = process.env.QA_WEB_ROUTE_FAMILIES
    const oldArtifacts = process.env.QA_WEB_NAVIGATION_ARTIFACTS
    try {
      const page = await browser.newPage()
      let requests = 0
      page.on("request", () => requests++)
      process.env.QA_WEB_ROUTE_FAMILIES = "true"
      const config = {
        qaDomain: "fixture.qa.test",
        web: {
          origin: "https://ewatrade-dashboard.localhost",
          profileLabel: "Inert",
          catalogItem: "Inert",
          expectedTotal: "Inert",
        },
      }
      Reflect.deleteProperty(process.env, "QA_WEB_NAVIGATION_ARTIFACTS")
      await assert.rejects(
        () => webJourney(page, config),
        /requires local navigation artifacts/,
      )
      process.env.QA_WEB_NAVIGATION_ARTIFACTS = "/tmp/inert-not-written"
      await assert.rejects(
        () =>
          webJourney(page, {
            ...config,
            web: {
              ...config.web,
              origin: "https://preview-dashboard.ewatrade.com",
            },
          }),
        /requires local navigation artifacts/,
      )
      const { diagnoseFinanceReads } = await import(
        "./qa-finance-read-diagnostics.mjs"
      )
      await assert.rejects(
        () =>
          diagnoseFinanceReads(page, "https://preview-dashboard.ewatrade.com"),
        /local-only/,
      )
      assert.equal(requests, 0)
    } finally {
      if (oldFamilies === undefined)
        Reflect.deleteProperty(process.env, "QA_WEB_ROUTE_FAMILIES")
      else process.env.QA_WEB_ROUTE_FAMILIES = oldFamilies
      if (oldArtifacts === undefined)
        Reflect.deleteProperty(process.env, "QA_WEB_NAVIGATION_ARTIFACTS")
      else process.env.QA_WEB_NAVIGATION_ARTIFACTS = oldArtifacts
      await browser.close()
    }
  },
)
