import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import test from "node:test"
import { observeWebPerformance } from "./qa-web-performance.mjs"
import { launchSmokeBrowser, webJourney } from "./qa-web-smoke.mjs"

test(
  "received-byte counters survive a cancelled inert stream and freeze at the window boundary",
  { timeout: 30000 },
  async () => {
    /** @type {() => void} */
    let finishLate = () => {
      throw Error("Late fixture is not initialized")
    }
    const server = createServer((request, response) => {
      if (request.url === "/favicon.ico") {
        response.writeHead(204)
        response.end()
        return
      }
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "/redirected" })
        response.end()
        return
      }
      if (request.url === "/redirected") {
        response.end("ok")
        return
      }
      if (request.url === "/") {
        response.end('<html><link rel="icon" href="data:,"></html>')
        return
      }
      response.writeHead(200, { "content-type": "application/x-ndjson" })
      response.write(`${"x".repeat(2048)}\n`)
      if (request.url === "/late") {
        finishLate = () => {
          response.end("y".repeat(2048))
        }
        return
      }
      const timer = setInterval(() => response.write("z".repeat(2048)), 1000)
      response.on("close", () => clearInterval(timer))
    })
    await new Promise((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve(undefined)),
    )
    const address = server.address()
    if (!address || typeof address === "string")
      throw Error("Missing inert listener")
    const base = `http://127.0.0.1:${address.port}`
    const browser = await launchSmokeBrowser()
    try {
      const page = await browser.newPage({ serviceWorkers: "block" })
      const observer = observeWebPerformance(
        page,
        "https://ewatrade-dashboard.localhost",
      )
      await observer.ready()
      await page.goto(base)
      observer.begin()
      const requested = page.waitForRequest(`${base}/stream`)
      const failed = page.waitForEvent("requestfailed", {
        predicate: (request) => request.url() === `${base}/stream`,
      })
      await page.evaluate(async () => {
        const controller = new AbortController()
        const response = await fetch("/stream", { signal: controller.signal })
        await response.body?.getReader().read()
        controller.abort()
      })
      const request = await requested
      await failed
      await page.waitForTimeout(50)
      const result = await observer.end()
      assert.equal((await request.sizes()).responseBodySize, 0)
      assert.equal(result.byKind.other.byteMeasurements, 0)
      assert.equal(result.receivedBodies.byKind.other.measurements, 1)
      assert.ok(result.receivedBodies.byKind.other.decodedBytes >= 2049)
      assert.equal(result.receivedBodies.byKind.other.failed, 1)
      assert.ok(!JSON.stringify(result).includes(base))

      observer.begin()
      const started = page.waitForResponse(`${base}/late`)
      await page.evaluate(() => {
        void fetch("/late").then((response) => response.text())
      })
      await started
      await page.waitForTimeout(50)
      const partial = await observer.end()
      assert.equal(partial.receivedBodies.byKind.other.inFlight, 1)
      assert.equal(partial.receivedBodies.byKind.other.decodedBytes, 2049)
      const frozen = structuredClone(partial)
      const finished = page.waitForEvent("requestfinished", {
        predicate: (request) => request.url() === `${base}/late`,
      })
      finishLate()
      await finished
      assert.deepEqual(partial, frozen)
      observer.begin()
      await page.goto(`${base}/redirect`)
      await page.waitForTimeout(50)
      const redirected = await observer.end()
      assert.equal(redirected.receivedBodies.byKind.document.requests, 2)
      assert.equal(redirected.receivedBodies.byKind.document.completed, 2)
      assert.equal(redirected.receivedBodies.byKind.document.inFlight, 0)
      assert.equal(redirected.receivedBodies.byKind.document.decodedBytes, 2)
      observer.dispose()
    } finally {
      await browser.close()
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  },
)

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
      await observer.ready()
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
      observer.begin()
      await page.goto(
        "https://ewatrade-dashboard.localhost/api/trpc/tenant.current,tenant.current,businessBanking.pendingReportCount?input=private-sentinel",
        { waitUntil: "load" },
      )
      const batched = await observer.end()
      assert.equal(batched.started, 1)
      assert.deepEqual(batched.rpcOperations, {
        workspaceScope: 2,
        notificationCounts: 1,
      })
      assert.ok(!JSON.stringify(batched).includes("sentinel"))
      assert.equal(result.timeline.api.started, 1)
      assert.equal(result.timeline.api.responseHeaders, 1)
      assert.equal(result.timeline.api.finished, 1)
      assert.ok(result.timeline.api.firstStartMs >= 0)
      assert.ok(result.timeline.api.firstResponseHeadersMs !== null)
      assert.ok(result.timeline.api.lastFinishMs !== null)
      assert.ok(
        result.timeline.api.firstResponseHeadersMs >=
          result.timeline.api.firstStartMs,
      )
      assert.ok(
        result.timeline.api.lastFinishMs >=
          result.timeline.api.firstResponseHeadersMs,
      )
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
      assert.equal(beforeCompletion.timeline.api.started, 1)
      assert.equal(beforeCompletion.timeline.api.responseHeaders, 0)
      assert.equal(beforeCompletion.timeline.api.finished, 0)
      assert.equal(beforeCompletion.timeline.api.firstResponseHeadersMs, null)
      assert.equal(beforeCompletion.timeline.api.lastFinishMs, null)
      release()
      await navigation
      assert.equal(beforeCompletion.inFlightAtReadiness, 1)
      assert.equal(beforeCompletion.timeline.api.finished, 0)
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
  "startup timeline recognizes only fixed same-origin Activity reads and stream negotiation",
  { timeout: 30000 },
  async () => {
    const browser = await launchSmokeBrowser()
    try {
      const page = await browser.newPage({ serviceWorkers: "block" })
      await page.setExtraHTTPHeaders({
        "trpc-accept": "application/jsonl",
        "private-header": "header-sentinel",
      })
      await page.route("**/*", (route) =>
        route.fulfill({ contentType: "application/json", body: "{}" }),
      )
      const observer = observeWebPerformance(
        page,
        "https://ewatrade-dashboard.localhost",
      )
      await observer.ready()
      observer.begin()
      await page.goto(
        "https://ewatrade-dashboard.localhost/api/trpc/activity.filters,activity.listPage?input=private-query-sentinel",
        { waitUntil: "load" },
      )
      const result = await observer.end()
      for (const label of [
        "api",
        "streamingApi",
        "activityList",
        "activityFilters",
      ])
        assert.equal(result.timeline[label].started, 1)
      assert.deepEqual(
        result.timeline.activityList,
        result.timeline.activityFilters,
      )
      assert.ok(!JSON.stringify(result).includes("sentinel"))

      observer.begin()
      await page.goto(
        "https://ewatrade-dashboard.localhost/api/trpc/inventory.reconciliationReport,inventory.balanceReport?input=private-stock-sentinel",
        { waitUntil: "load" },
      )
      const stock = await observer.end()
      for (const label of [
        "stockReconciliation",
        "stockBalances",
        "stockReportBatch",
      ])
        assert.equal(stock.timeline[label].started, 1)
      assert.deepEqual(
        stock.timeline.stockReconciliation,
        stock.timeline.stockBalances,
      )
      assert.ok(!JSON.stringify(stock).includes("sentinel"))

      for (const url of [
        "https://foreign.invalid/api/trpc/activity.listPage,inventory.reconciliationReport,inventory.balanceReport?secret=foreign-sentinel",
        "https://ewatrade-dashboard.localhost/api/trpc/inventory.reconciliationReportExtra,inventory.balanceReportExtra?secret=lookalike-sentinel",
        "https://ewatrade-dashboard.localhost/api/trpc/activity.listPageExtra?secret=lookalike-sentinel",
        "https://ewatrade-dashboard.localhost/api/trpc/private-procedure-sentinel?procedure=activity.listPage",
      ]) {
        observer.begin()
        await page.goto(url, { waitUntil: "load" })
        const unrelated = await observer.end()
        assert.equal(unrelated.timeline.activityList, undefined)
        assert.equal(unrelated.timeline.activityFilters, undefined)
        assert.equal(unrelated.timeline.stockReconciliation, undefined)
        assert.equal(unrelated.timeline.stockBalances, undefined)
        assert.equal(unrelated.timeline.stockReportBatch, undefined)
        assert.ok(!JSON.stringify(unrelated).includes("sentinel"))
      }
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
    name: "all nine read activity",
    options: { probeLifecycle: true },
    expected: "passed",
  },
  { name: "focused Activity startup", options: {}, expected: "passed" },
  {
    name: "all nine read activity offline failure",
    options: { probeLifecycle: true, failOffline: true },
    expected: "DP-401",
  },
  {
    name: "all nine read activity hidden regression",
    options: { probeLifecycle: true, hiddenRead: true },
    expected: "DP-401",
  },
  {
    name: "all nine read activity offline regression",
    options: { probeLifecycle: true, offlineRead: true },
    expected: "DP-401",
  },
  { name: "focused Reports cold Stock", options: {}, expected: "passed" },
  {
    name: "focused Reports serial Stock",
    options: { serialStock: true },
    expected: "DP-409",
  },
  {
    name: "focused Reports missing Stock",
    options: { omitStock: true },
    expected: "DP-409",
  },
  {
    name: "focused Activity missing content",
    options: { omitReady: "/activity" },
    expected: "DP-407",
  },
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
    name: "mismatched current Finance Book",
    options: { diagnosticBookMismatch: true },
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
        /** @type {number[]} */
        const waits = []
        if (scenario.name.startsWith("all nine read activity")) {
          const wait = page.waitForTimeout.bind(page)
          page.waitForTimeout = async (milliseconds) => {
            waits.push(milliseconds)
            await wait(5)
          }
        }
        if ("failOffline" in scenario.options && scenario.options.failOffline) {
          const context = page.context()
          const setOffline = context.setOffline.bind(context)
          context.setOffline = async (offline) => {
            await setOffline(offline)
            if (offline) throw Error("Inert offline phase interruption")
          }
        }
        page.setDefaultTimeout(800)
        const origin = "https://ewatrade-dashboard.localhost"
        /** @type {string[]} */
        const unexpected = []
        let lifecycleRequests = 0
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
                      currencyCode: "NGN",
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
              JSON.parse(url.searchParams.get("input") ?? "").json
                .currentCurrency,
              "NGN",
            )
            await route.fulfill({
              contentType: "application/json",
              headers: { "server-timing": 'ew_sql;dur=3;desc="11 calls"' },
              body: JSON.stringify({
                result: {
                  data: {
                    json: {
                      resolvedBookId:
                        "diagnosticBookMismatch" in scenario.options
                          ? "private-other-book-sentinel"
                          : "private-book-sentinel",
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
          else if (
            url.pathname ===
            "/api/trpc/businessBanking.pendingReportCount,tenant.current"
          ) {
            lifecycleRequests++
            await route.fulfill({ contentType: "application/json", body: "{}" })
          } else await route.fulfill({ contentType: "text/html", body: html })
        })
        const observation = observeWebPerformance(page, origin)
        await observation.ready()
        /** @type {Array<{status: string, family: string | null, phase: string | null, samples: object[], diagnosticReads: Awaited<ReturnType<typeof import("./qa-finance-read-diagnostics.mjs").diagnoseFinanceReads>>}>} */
        const checkpoints = []
        const run = () =>
          measureDashboardRouteFamilies(
            page,
            { origin, catalogItem: "Fixture item" },
            observation,
            (update) => checkpoints.push(update),
            scenario.name.startsWith("focused Activity")
              ? "activity"
              : scenario.name.startsWith("focused Reports")
                ? "reports"
                : scenario.name.startsWith("all nine read activity")
                  ? "read-activity"
                  : "all",
          )
        if (scenario.expected === "passed") {
          const samples = await run()
          const activityOnly = scenario.name.startsWith("focused Activity")
          const reportsOnly = scenario.name.startsWith("focused Reports")
          const readActivity = scenario.name === "all nine read activity"
          const selectedFamilies =
            activityOnly || reportsOnly
              ? dashboardRouteFamilies.filter(
                  (target) =>
                    target.family === (reportsOnly ? "DP-409" : "DP-407"),
                )
              : dashboardRouteFamilies
          assert.equal(
            samples.length,
            selectedFamilies.length * (readActivity ? 7 : 2) +
              (reportsOnly ? 1 : 0),
          )
          assert.equal(dashboardRouteFamilies.length, 9)
          assert.deepEqual(
            checkpoints.at(-1)?.diagnosticReads.map((read) => read.procedure),
            activityOnly || reportsOnly
              ? []
              : ["finance.book", "finance.owedSummary"],
          )
          if (!activityOnly && !reportsOnly)
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

          for (const { family } of selectedFamilies) {
            const pair = samples.filter((sample) => sample.family === family)
            assert.deepEqual(
              pair.map((sample) => sample.phase),
              reportsOnly
                ? ["full-refresh", "warm-return", "cold-stock-tab"]
                : readActivity
                  ? [
                      "full-refresh",
                      "warm-return",
                      "visible-idle",
                      "controlled-hidden",
                      "focus-return",
                      "offline-idle",
                      "reconnect",
                    ]
                  : ["full-refresh", "warm-return"],
            )
            assert.ok(pair.every((sample) => sample.milliseconds >= 0))
            assert.ok(pair[0].requests.started > 0)
          }
          if (readActivity) {
            await new Promise((resolve) => setTimeout(resolve, 20))
            assert.equal(lifecycleRequests, 18)
            for (const sample of samples.filter((sample) =>
              ["focus-return", "reconnect"].includes(sample.phase),
            ))
              assert.deepEqual(sample.requests.rpcOperations, {
                notificationCounts: 1,
                workspaceScope: 1,
              })
            assert.equal(waits.length, 45)
            assert.equal(waits.filter((value) => value === 65_000).length, 3)
            assert.equal(waits.filter((value) => value === 35_000).length, 2)
            assert.equal(
              await page.evaluate(() => document.visibilityState),
              "visible",
            )
            assert.equal(
              await page.evaluate(() =>
                Object.hasOwn(document, "visibilityState"),
              ),
              false,
            )
            assert.equal(await page.evaluate(() => navigator.onLine), true)
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
        if (scenario.name === "all nine read activity offline failure") {
          assert.equal(checkpoints.at(-1)?.phase, "offline-idle")
          assert.equal(await page.evaluate(() => navigator.onLine), true)
          assert.equal(
            await page.evaluate(() =>
              Object.hasOwn(document, "visibilityState"),
            ),
            false,
          )
          assert.equal(
            await page.evaluate(() => Object.hasOwn(document, "hidden")),
            false,
          )
        }
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

for (const flag of [
  "QA_WEB_ROUTE_FAMILIES",
  "QA_WEB_ACTIVITY_STARTUP",
  "QA_WEB_REPORT_TABS",
  "QA_WEB_READ_ACTIVITY",
])
  test(
    `route-family opt-in requires canonical local artifacts before page activity: ${flag}`,
    { timeout: 30000 },
    async () => {
      const browser = await launchSmokeBrowser()
      const oldFamilies = process.env[flag]
      const oldArtifacts = process.env.QA_WEB_NAVIGATION_ARTIFACTS
      try {
        const page = await browser.newPage()
        let requests = 0
        page.on("request", () => requests++)
        process.env[flag] = "true"
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
            diagnoseFinanceReads(
              page,
              "https://preview-dashboard.ewatrade.com",
            ),
          /local-only/,
        )
        assert.equal(requests, 0)
      } finally {
        if (oldFamilies === undefined) Reflect.deleteProperty(process.env, flag)
        else process.env[flag] = oldFamilies
        if (oldArtifacts === undefined)
          Reflect.deleteProperty(process.env, "QA_WEB_NAVIGATION_ARTIFACTS")
        else process.env.QA_WEB_NAVIGATION_ARTIFACTS = oldArtifacts
        await browser.close()
      }
    },
  )

for (const scenario of ["valid", "refused", "malformed", "missing-trace"]) {
  test(
    `isolated Activity diagnostics preserve GET scope and redact data: ${scenario}`,
    { timeout: 30000 },
    async () => {
      const { diagnoseActivityReads } = await import(
        "./qa-activity-read-diagnostics.mjs"
      )
      const browser = await launchSmokeBrowser()
      const origin = "https://ewatrade-dashboard.localhost"
      try {
        const page = await browser.newPage({ serviceWorkers: "block" })
        /** @type {Array<{path: string, method: string, input: {json: {limit?: number, from?: string, to?: string}}}>} */
        const requested = []
        await page.route("**/*", (route) => {
          const request = route.request()
          const url = new URL(request.url())
          if (url.pathname === "/")
            return route.fulfill({
              contentType: "text/html",
              body: "<main>Inert</main>",
            })
          requested.push({
            path: url.pathname,
            method: request.method(),
            input: JSON.parse(url.searchParams.get("input") ?? "null"),
          })
          const filters = url.pathname === "/api/trpc/activity.filters"
          const names = [
            "activityAdmission",
            filters ? "activityFilters" : "activityList",
            filters ? "activityFilterSql" : "activityPageSql",
          ]
          const timing = [
            names.map((name) => `ew_${name};dur=200;desc="1 calls"`).join(","),
            'ew_transactionSql;dur=600;desc="3 calls",ew_secret;dur=1;desc="private-sentinel"',
          ].join(",")
          const data = filters
            ? {
                actors: [
                  {
                    membershipId: "private-sentinel",
                    name: "private-sentinel",
                  },
                ],
                types: [],
              }
            : { items: [{ private: "private-sentinel" }], total: 1 }
          return route.fulfill({
            status: scenario === "refused" ? 403 : 200,
            contentType: "application/json",
            headers: {
              "server-timing": scenario === "missing-trace" ? "" : timing,
            },
            body: JSON.stringify({
              result: { data: { json: scenario === "malformed" ? {} : data } },
            }),
          })
        })
        await page.goto(origin)
        if (scenario === "valid") {
          const result = await diagnoseActivityReads(page, origin)
          assert.deepEqual(
            result.map((read) => read.procedure),
            ["activity.filters", "activity.listPage"],
          )
          assert.equal(result[0].serverPhases.transactionSql.count, 3)
          assert.equal(result[1].serverPhases.activityPageSql.count, 1)
          assert.ok(!JSON.stringify(result).includes("private-sentinel"))
          assert.ok(
            result.every(
              (read) => read.status === 200 && read.decodedBodyBytes > 0,
            ),
          )
          assert.deepEqual(
            requested.map((read) => read.method),
            ["GET", "GET"],
          )
          assert.deepEqual(requested[0].input, { json: {} })
          assert.equal(requested[1].input.json.limit, 25)
          assert.equal(
            Date.parse(requested[1].input.json.to ?? "") -
              Date.parse(requested[1].input.json.from ?? ""),
            7 * 24 * 60 * 60 * 1000,
          )
        } else
          await assert.rejects(
            () => diagnoseActivityReads(page, origin),
            /current tracing is required/,
          )
        const count = requested.length
        await assert.rejects(
          () =>
            diagnoseActivityReads(
              page,
              "https://preview-dashboard.ewatrade.com",
            ),
          /local-only/,
        )
        assert.equal(requested.length, count)
      } finally {
        await browser.close()
      }
    },
  )
}
