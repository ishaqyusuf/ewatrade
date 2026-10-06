import { randomBytes } from "node:crypto"
import { loadRootEnvironment } from "../environment-profile.mjs"
import {
  loadPerformanceDatabaseUrl,
  performanceRoot,
  performanceTarget,
} from "./target.mjs"

if (
  process.argv.length > 3 ||
  (process.argv[2] && process.argv[2] !== "--recovery")
)
  throw new Error(
    "Usage: bun scripts/performance/request-smoke.ts [--recovery]",
  )
const selectedUrl = new URL(loadPerformanceDatabaseUrl())
if (process.argv[2] === "--recovery")
  selectedUrl.pathname = "/ewatrade_performance_recovery_v1"
const databaseUrl = selectedUrl.href
const loaded = loadRootEnvironment(performanceRoot, { DEV_PROFILE: "dev" }).env
Object.assign(process.env, loaded)
// No external providers participate in this in-process diagnostic.
for (const key of Object.keys(process.env)) {
  if (
    /KEY|SECRET|TOKEN|DSN|REDIS_URL/.test(key) &&
    key !== "EWATRADE_DATABASE_URL"
  )
    delete process.env[key]
}
process.env.EWATRADE_DATABASE_URL = databaseUrl
process.env.APP_ENV = "dev"
process.env.NODE_ENV = "development"
process.env.PERFORMANCE_TRACE = "true"
process.env.DEBUG_PERF = "false"
process.env.EMAIL_DELIVERY_MODE = "console"
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex")

const { prisma } = await import("../../packages/db/src/client")
const { app } = await import("../../apps/api/src/index")
const sessionId = `perf-v1-smoke-${randomBytes(12).toString("hex")}`
const token = randomBytes(32).toString("hex")
try {
  const tenant = await prisma.tenant.findFirstOrThrow({
    where: { slug: { startsWith: "perf-v1-" }, dataClassification: "QA" },
    orderBy: { slug: "asc" },
    include: {
      users: { where: { role: "OWNER" }, take: 1 },
      stores: { orderBy: { slug: "asc" }, take: 1 },
    },
  })
  if (
    !tenant.metadata ||
    typeof tenant.metadata !== "object" ||
    Array.isArray(tenant.metadata) ||
    tenant.metadata.fixtureVersion !== performanceTarget.fixtureVersion
  )
    throw new Error("Fixture ownership mismatch")
  const owner = tenant.users[0]
  const store = tenant.stores[0]
  if (!owner || !store) throw new Error("Fixture owner/store unavailable")
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: owner.userId,
      token,
      expiresAt: new Date(Date.now() + 3600000),
    },
  })
  const routes = [
    {
      journey: "catalog-first-page",
      route: "catalog.listItemsPage",
      input: { limit: 20 },
    },
    {
      journey: "orders-first-page",
      route: "orders.listPage",
      input: { limit: 20, storeId: store.id },
    },
    {
      journey: "inventory-first-page",
      route: "inventory.balanceReport",
      input: { storeId: store.id },
    },
    {
      journey: "scoped-search",
      route: "search.global",
      input: { query: "Synthetic", limit: 6 },
    },
    {
      journey: "dashboard-critical-data-part",
      route: "orders.reportSummary",
      input: { storeId: store.id },
    },
  ]
  for (const scenario of routes) {
    const started = performance.now()
    const response = await app.request(
      `https://ewatrade-performance.localhost/api/trpc/${scenario.route}?input=${encodeURIComponent(JSON.stringify({ json: scenario.input }))}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          "x-tenant-slug": tenant.slug,
          "x-store-id": store.id,
        },
      },
    )
    const body = await response.text()
    const parsed = JSON.parse(body)
    const passed =
      response.ok && parsed.result !== undefined && parsed.error === undefined
    console.log(
      JSON.stringify({
        evidence: "in-process-authenticated-route-smoke-not-load-baseline",
        journey: scenario.journey,
        route: scenario.route,
        status: response.status,
        bytes: Buffer.byteLength(body),
        milliseconds: performance.now() - started,
        traceId: response.headers.get("x-performance-trace-id"),
        errorCode:
          parsed.error?.json?.data?.code ?? parsed.error?.data?.code ?? null,
        passed,
      }),
    )
    if (!passed) process.exitCode = 1
  }
  if (process.argv[2] === "--recovery") {
    const offering = await prisma.sellableOffering.findFirstOrThrow({
      where: { tenantId: tenant.id, kind: "SERVICE", status: "ACTIVE" },
      orderBy: { id: "asc" },
    })
    const input = {
      schemaVersion: 1,
      clientOrderId: sessionId,
      storeId: store.id,
      fulfillNow: false,
      lines: [
        {
          offeringId: offering.id,
          quantity: "1",
          expectedFixedPriceMinor: 10000,
        },
      ],
    }
    for (const attempt of ["create", "replay"]) {
      const response = await app.request(
        "https://ewatrade-performance.localhost/api/trpc/orders.create",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "x-tenant-slug": tenant.slug,
            "x-store-id": store.id,
            "content-type": "application/json",
          },
          body: JSON.stringify({ json: input }),
        },
      )
      const parsed = await response.json()
      const passed =
        response.ok && parsed.result !== undefined && parsed.error === undefined
      console.log(
        JSON.stringify({
          evidence: "recovered-application-write",
          attempt,
          status: response.status,
          passed,
          errorCode: parsed.error?.json?.data?.code ?? null,
        }),
      )
      if (!passed) process.exitCode = 1
    }
    const orders = await prisma.commercialOrder.findMany({
      where: { tenantId: tenant.id, clientOrderId: sessionId },
      select: { totalMinor: true, lines: { select: { id: true } } },
    })
    const passed =
      orders.length === 1 &&
      orders[0]?.totalMinor === 10000 &&
      orders[0]?.lines.length === 1
    console.log(
      JSON.stringify({
        evidence: "recovered-write-idempotency",
        orders: orders.length,
        expectedTotalMinor: 10000,
        passed,
      }),
    )
    if (!passed) process.exitCode = 1
  }
} catch {
  console.error(
    "Authenticated performance request smoke failed; response bodies and provider details withheld.",
  )
  process.exitCode = 1
} finally {
  await prisma.session.deleteMany({ where: { id: sessionId } })
  await prisma.$disconnect()
}
// Imported application SDKs can own background timers; this CLI has finished
// all requests and awaited its database cleanup before terminating.
console.log(JSON.stringify({ evidence: "smoke-cleanup-complete" }))
process.exit(process.exitCode ?? 0)
