import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { recordCommercialOrderPaymentInTransaction } from "./commercial-payments"
import {
  type StaffActivityStream,
  listStaffActivityPageInTransaction,
  readStaffActivityShownInTransaction,
  staffActivityStreams,
} from "./staff-activity"

// S05 on the authorized Development QA target (run only through
// scripts/qa-staff-activity.mjs). Every synthetic Tenant, Store, user,
// membership, record and authority change lives inside one RepeatableRead
// transaction per case (maxWait 10 s, timeout 30 s) that always throws the
// rollback sentinel. Fixture IDs are chosen before the transaction, so their
// absence is re-checked read-only after every case, including failed ones.
//
// Provenance and limits, stated rather than implied:
// - One baseline case seeds an order and a payment through the canonical
//   commands. All other cases seed synthetic order/payment rows directly:
//   they are source-query controls (loader output against direct reads with
//   identical predicates), not canonical-command evidence.
// - The public RepeatableRead wrappers and cross-transaction authority or
//   concurrency are not exercised; the cases call the *InTransaction reads.
// - Store and Book scopes are caller-derived at the protected API seam;
//   changing them here is scope-filter evidence, not grant revocation.
// - Only orders and payments are seeded; the other ten streams are read in
//   one isolated sweep and must be empty. No finance Book exists.
//
// Budget: the endpoint's measured round trip (run 2: median 426 ms, max
// 2,827 ms, first connect 9,413 ms) decides what fits in 30 s. Each case
// declares its statement estimate, counted from the source below; before any
// transaction starts, a case whose estimate × median exceeds 20 s (10 s left
// for outliers) stops as unrun with no writes.
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const describeConnected = enabled ? describe : describe.skip
/** Bun's per-case deadline: transaction wait + timeout + absence check. */
const caseDeadline = 50_000
const statementBudgetMs = 20_000
class Rollback extends Error {}

/**
 * Statement estimates. Reads: viewer 1, Store check 1, subject 1, each
 * stream loader 2 (rows + count), projection ≤ 3. Transaction: begin,
 * isolation, two SET LOCAL, rollback.
 */
const estimate = {
  transaction: 5,
  directSeed: 6,
  canonicalSeed: 30,
  pageOneStream: 6,
  pageAllStreams: 26,
  shownTwoStreams: 8,
}

function assertAuthorizedTarget() {
  assertQaAccessAcceptanceDatabase()
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    process.env.QA_STAFF_ACTIVITY_DATABASE !== "/ewatrade_qa_v1" ||
    target.pathname !== "/ewatrade_qa_v1"
  )
    throw new Error("S05 checks run only on the authorized ewatrade_qa_v1.")
}

// A fixture-owned client with its own connection and query deadlines and a
// query counter; the shared product client is untouched. One connection,
// kept warm, because opening one measured 9.4 s.
let db: PrismaClient
let medianMs = Number.POSITIVE_INFINITY
let queries = 0
const statements: Array<{ query: string; params: string }> = []
let capturing = false
const ms = (started: number) => Math.round(performance.now() - started)
const report = (value: unknown) => console.info(JSON.stringify({ s05: value }))

async function connect() {
  assertAuthorizedTarget()
  const { PrismaClient } = await import("../../generated/prisma/client")
  const { PrismaPg } = await import("@prisma/adapter-pg")
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.EWATRADE_DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 20_000,
      // Client-side: a stuck statement fails visibly instead of silently
      // consuming the case.
      query_timeout: 25_000,
    }),
    log: [{ emit: "event", level: "query" }],
  })
  client.$on("query", (event) => {
    queries++
    if (capturing) statements.push(event)
  })
  return client
}

/** Bounded read-only preflight: connection start and round-trip latency. */
async function preflight(client: PrismaClient) {
  const started = performance.now()
  await client.$queryRawUnsafe("SELECT 1")
  const connectMs = ms(started)
  const pings: number[] = []
  for (let index = 0; index < 5; index++) {
    const ping = performance.now()
    await client.$queryRawUnsafe("SELECT 1")
    pings.push(ms(ping))
  }
  pings.sort((a, b) => a - b)
  medianMs = pings[2] ?? Number.POSITIVE_INFINITY
  report({ preflight: { connectMs, pingMedianMs: medianMs, pings } })
}

/** Stops a case before any transaction when its work cannot fit. */
function assertFits(name: string, statementCount: number, extraMs = 0) {
  const projected = Math.round(statementCount * medianMs + extraMs)
  report({ budget: { case: name, statementCount, extraMs, projected } })
  if (projected > statementBudgetMs)
    throw new Error(
      `Unrun: ${name} needs ~${statementCount} statements × ${medianMs} ms (+${extraMs} ms) = ${projected} ms, over the ${statementBudgetMs} ms budget. No transaction was started.`,
    )
}

type Ids = ReturnType<typeof plannedIds>
/** Every fixture identity, known before the transaction starts. */
function plannedIds() {
  const run = randomUUID().slice(0, 12)
  const id = (): string => randomUUID()
  return {
    run,
    tenantId: id(),
    foreignTenantId: id(),
    users: {
      owner: id(),
      manager: id(),
      cashier: id(),
      amina: id(),
      departed: id(),
      foreign: id(),
    },
    memberships: {
      owner: id(),
      manager: id(),
      cashier: id(),
      amina: id(),
      foreign: id(),
    },
    stores: { a: id(), b: id(), foreign: id() },
    orders: { aminaA: id(), aminaB: id(), departedA: id(), foreign: id() },
    paymentId: id(),
  }
}

/** Tenants, users, memberships and Stores: four batched statements. */
async function seedPeople(tx: Prisma.TransactionClient, ids: Ids) {
  const qa = {
    type: "MERCHANT" as const,
    enabledModes: ["MERCHANT" as const],
    dataClassification: "QA" as const,
    qaSourceDomain: "staff-activity.test",
    qaMarkedAt: new Date(),
  }
  await tx.tenant.createMany({
    data: [
      { ...qa, id: ids.tenantId, slug: `s05-${ids.run}`, name: "S05 QA" },
      {
        ...qa,
        id: ids.foreignTenantId,
        slug: `s05-foreign-${ids.run}`,
        name: "S05 foreign QA",
      },
    ],
  })
  await tx.user.createMany({
    data: Object.entries(ids.users).map(([name, id]) => ({
      id,
      name,
      email: `s05-${name}-${ids.run}@example.test`,
    })),
  })
  // The departed person has no membership or profile in this business.
  const roles = [
    ["owner", "OWNER", ids.tenantId],
    ["manager", "MANAGER", ids.tenantId],
    ["cashier", "CASHIER", ids.tenantId],
    ["amina", "CASHIER", ids.tenantId],
    ["foreign", "OWNER", ids.foreignTenantId],
  ] as const
  await tx.membership.createMany({
    data: roles.map(([name, role, tenantId]) => ({
      id: ids.memberships[name],
      userId: ids.users[name],
      role,
      status: "ACTIVE" as const,
      tenantId,
    })),
  })
  await tx.store.createMany({
    data: [
      { id: ids.stores.a, name: "Wuse", tenantId: ids.tenantId },
      { id: ids.stores.b, name: "Garki", tenantId: ids.tenantId },
      {
        id: ids.stores.foreign,
        name: "Elsewhere",
        tenantId: ids.foreignTenantId,
      },
    ].map((store) => ({ ...store, slug: store.id })),
  })
}

const window = () => {
  const now = Date.now()
  return {
    from: new Date(now - 3_600_000).toISOString(),
    to: new Date(now + 3_600_000).toISOString(),
  }
}

/** Synthetic order/payment rows: two batched statements, no commands. */
async function seedDirect(tx: Prisma.TransactionClient, ids: Ids) {
  await seedPeople(tx, ids)
  const order = (
    id: string,
    tenantId: string,
    storeId: string,
    createdByUserId: string,
  ) => ({
    id,
    tenantId,
    storeId,
    createdByUserId,
    clientOrderId: `s05-${id}`,
    payloadHash: id,
    orderNumber: `S05-${id.slice(0, 8)}`,
    currencyCode: "NGN",
    subtotalMinor: 10_000,
    totalMinor: 10_000,
  })
  await tx.commercialOrder.createMany({
    data: [
      order(ids.orders.aminaA, ids.tenantId, ids.stores.a, ids.users.amina),
      order(ids.orders.aminaB, ids.tenantId, ids.stores.b, ids.users.amina),
      order(
        ids.orders.departedA,
        ids.tenantId,
        ids.stores.a,
        ids.users.departed,
      ),
      order(
        ids.orders.foreign,
        ids.foreignTenantId,
        ids.stores.foreign,
        ids.users.foreign,
      ),
    ],
  })
  await tx.commercialOrderPayment.createMany({
    data: [
      {
        id: ids.paymentId,
        tenantId: ids.tenantId,
        storeId: ids.stores.a,
        orderId: ids.orders.aminaA,
        clientPaymentId: `s05-${ids.run}`,
        method: "CASH",
        amountMinor: 4_000,
        recordedByUserId: ids.users.amina,
      },
    ],
  })
  return {
    aminaA: ids.orders.aminaA,
    paymentId: ids.paymentId,
    window: window(),
  }
}
type Seeded = Awaited<ReturnType<typeof seedDirect>>

/** The canonical baseline: one order and one payment through the commands. */
async function seedCanonical(
  tx: Prisma.TransactionClient,
  ids: Ids,
): Promise<Seeded> {
  await seedPeople(tx, ids)
  const order = await createCommercialOrderInTransaction(tx, {
    actorUserId: ids.users.amina,
    clientOrderId: `s05-${ids.run}`,
    lines: [{ amountMinor: 10_000, custom: "quick_sale" }],
    schemaVersion: 1,
    storeId: ids.stores.a,
    tenantId: ids.tenantId,
  })
  await recordCommercialOrderPaymentInTransaction(tx, {
    actorUserId: ids.users.amina,
    amountMinor: 4_000,
    clientPaymentId: `s05-${ids.run}`,
    method: "cash",
    orderId: order.id,
    tenantId: ids.tenantId,
  })
  const payment = await tx.commercialOrderPayment.findFirstOrThrow({
    where: { tenantId: ids.tenantId, orderId: order.id },
    select: { id: true },
  })
  return { aminaA: order.id, paymentId: payment.id, window: window() }
}

/**
 * One case: budget gate, planned IDs, fixture, assertions, forced rollback,
 * then a read-only absence check that also runs when the case failed. Stage,
 * setup time and statement counts are reported either way.
 */
async function inRollback(
  name: string,
  plan: { statements: number; extraMs?: number; canonical?: boolean },
  run: (
    tx: Prisma.TransactionClient,
    ids: Ids,
    seeded: Seeded,
  ) => Promise<void>,
) {
  assertAuthorizedTarget()
  assertFits(name, plan.statements, plan.extraMs)
  const ids = plannedIds()
  const metrics: Record<string, unknown> = { case: name, stage: "start" }
  const started = performance.now()
  const startQueries = queries
  let failure: unknown
  try {
    await db.$transaction(
      async (tx) => {
        metrics.stage = "setup"
        // Server-side guards scoped to this transaction only.
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20s'")
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'")
        const setup = performance.now()
        const setupQueries = queries
        const seeded = plan.canonical
          ? await seedCanonical(tx, ids)
          : await seedDirect(tx, ids)
        metrics.setupMs = ms(setup)
        metrics.setupStatements = queries - setupQueries
        metrics.stage = "assertions"
        const reads = queries
        await run(tx, ids, seeded)
        metrics.readStatements = queries - reads
        metrics.stage = "rollback"
        throw new Rollback()
      },
      { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) failure = error
  }
  metrics.caseMs = ms(started)
  metrics.statements = queries - startQueries
  metrics.outcome = failure ? "failed" : "rolled_back"
  // Read-only: nothing the fixture planned may exist.
  let absent: boolean | string
  try {
    const tenants = await db.tenant.count({
      where: { id: { in: [ids.tenantId, ids.foreignTenantId] } },
    })
    const users = await db.user.count({
      where: { id: { in: Object.values(ids.users) } },
    })
    absent = tenants === 0 && users === 0
  } catch (error) {
    absent = `absence check failed: ${(error as Error).message}`
  }
  metrics.absent = absent
  report(metrics)
  if (failure) throw failure
  expect(absent).toBe(true)
}

const owner = (ids: Ids) => ({
  tenantId: ids.tenantId,
  viewerUserId: ids.users.owner,
  storeIds: null,
  financeBookIds: null,
})
const identities = (rows: Array<{ stream: StaffActivityStream; id: string }>) =>
  rows.map(({ stream, id }) => ({ stream, id }))

/** Direct rows for one stream under the loader's exact predicates. */
async function direct(
  tx: Prisma.TransactionClient,
  ids: Ids,
  seeded: Seeded,
  stream: "ORDER" | "PAYMENT",
  filter: { subjectUserId?: string; storeIds?: string[] } = {},
) {
  const time = {
    gte: new Date(seeded.window.from),
    lt: new Date(seeded.window.to),
  }
  const stores = filter.storeIds ? { storeId: { in: filter.storeIds } } : {}
  const rows =
    stream === "ORDER"
      ? (
          await tx.commercialOrder.findMany({
            where: {
              tenantId: ids.tenantId,
              ...stores,
              ...(filter.subjectUserId
                ? { createdByUserId: filter.subjectUserId }
                : {}),
              createdAt: time,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true },
          })
        ).map((row) => row.id)
      : (
          await tx.commercialOrderPayment.findMany({
            where: {
              tenantId: ids.tenantId,
              ...stores,
              ...(filter.subjectUserId
                ? { recordedByUserId: filter.subjectUserId }
                : {}),
              recordedAt: time,
            },
            orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
            select: { id: true },
          })
        ).map((row) => row.id)
  return rows.map((id) => ({ stream, id }))
}

describeConnected("S05 staff activity on Development QA (rolled back)", () => {
  beforeAll(async () => {
    db = await connect()
    await preflight(db)
  }, 40_000)
  afterAll(async () => {
    await db?.$disconnect()
  })

  test(
    "canonical baseline: a command-made order and payment read back exactly",
    async () => {
      await inRollback(
        "canonical-baseline",
        {
          statements:
            estimate.transaction +
            estimate.canonicalSeed +
            estimate.shownTwoStreams,
          canonical: true,
        },
        async (tx, ids, seeded) => {
          const events = [
            { stream: "ORDER" as const, id: seeded.aminaA },
            { stream: "PAYMENT" as const, id: seeded.paymentId },
          ]
          const shown = await readStaffActivityShownInTransaction(tx, {
            ...owner(ids),
            ...seeded.window,
            events,
          })
          expect(identities(shown.data)).toEqual(events)
          expect(shown.withheld).toEqual([])
          for (const event of shown.data) {
            expect(event.store?.id).toBe(ids.stores.a)
            expect(event.actor).toMatchObject({
              coverage: "available",
              membershipId: ids.memberships.amina,
              userId: ids.users.amina,
            })
          }
          expect(shown.data[1]?.record).toMatchObject({
            kind: "payment",
            id: seeded.paymentId,
            orderId: seeded.aminaA,
          })
        },
      )
    },
    caseDeadline,
  )

  test(
    "order and payment pages match direct rows; departed and foreign stay out",
    async () => {
      await inRollback(
        "order-payment-pages",
        {
          statements:
            estimate.transaction +
            estimate.directSeed +
            2 * (estimate.pageOneStream + 1),
        },
        async (tx, ids, seeded) => {
          for (const stream of ["ORDER", "PAYMENT"] as const) {
            const page = await listStaffActivityPageInTransaction(tx, {
              ...owner(ids),
              ...seeded.window,
              stream,
              limit: 25,
            })
            const expected = await direct(tx, ids, seeded, stream)
            expect(identities(page.data)).toEqual(expected)
            expect(page.total).toBe(expected.length)
            expect(page.byStream).toEqual({ [stream]: expected.length })
            if (stream === "ORDER") {
              expect(expected).toHaveLength(3)
              expect(page.data.map((event) => event.id)).not.toContain(
                ids.orders.foreign,
              )
              // Departed: unavailable, never the viewer or anyone else.
              expect(
                page.data.find((event) => event.id === ids.orders.departedA)
                  ?.actor,
              ).toEqual({
                coverage: "unavailable",
                membershipId: null,
                userId: null,
                name: null,
              })
              expect(
                page.data.filter(
                  (event) => event.actor.userId === ids.users.owner,
                ),
              ).toEqual([])
            }
          }
        },
      )
    },
    caseDeadline,
  )

  test(
    "subject filter, exact-ID re-read and foreign records",
    async () => {
      await inRollback(
        "subject-shown-foreign",
        {
          statements:
            estimate.transaction +
            estimate.directSeed +
            (estimate.pageOneStream + 1) +
            1 +
            estimate.shownTwoStreams +
            2,
        },
        async (tx, ids, seeded) => {
          const amina = await listStaffActivityPageInTransaction(tx, {
            ...owner(ids),
            ...seeded.window,
            membershipId: ids.memberships.amina,
            stream: "ORDER",
            limit: 25,
          })
          expect(identities(amina.data)).toEqual(
            await direct(tx, ids, seeded, "ORDER", {
              subjectUserId: ids.users.amina,
            }),
          )
          // Exact-ID re-read: requested identities in order, nothing added;
          // the genuine foreign-Tenant order is withheld.
          const foreign = { stream: "ORDER" as const, id: ids.orders.foreign }
          const readable = [
            { stream: "PAYMENT" as const, id: seeded.paymentId },
            { stream: "ORDER" as const, id: ids.orders.departedA },
            { stream: "ORDER" as const, id: seeded.aminaA },
          ]
          const events = [
            readable[0],
            readable[1],
            foreign,
            readable[2],
          ].filter((event) => event !== undefined)
          const shown = await readStaffActivityShownInTransaction(tx, {
            ...owner(ids),
            ...seeded.window,
            events,
          })
          expect(identities(shown.data)).toEqual(readable)
          expect(shown.withheld).toEqual([foreign])
          await expect(
            listStaffActivityPageInTransaction(tx, {
              ...owner(ids),
              ...seeded.window,
              membershipId: ids.memberships.foreign,
            }),
          ).rejects.toThrow("Staff membership not found for this business.")
        },
      )
    },
    caseDeadline,
  )

  test(
    "current role, membership and Store scope decide each re-read",
    async () => {
      await inRollback(
        "authority",
        {
          statements:
            estimate.transaction +
            estimate.directSeed +
            (estimate.shownTwoStreams + 1) +
            6,
        },
        async (tx, ids, seeded) => {
          const manager = {
            tenantId: ids.tenantId,
            viewerUserId: ids.users.manager,
            storeIds: [ids.stores.a],
            financeBookIds: null,
          }
          const events = [
            { stream: "ORDER" as const, id: seeded.aminaA },
            { stream: "ORDER" as const, id: ids.orders.aminaB },
            { stream: "PAYMENT" as const, id: seeded.paymentId },
          ]
          const storeA = await readStaffActivityShownInTransaction(tx, {
            ...manager,
            ...seeded.window,
            events,
          })
          expect(storeA.data.map((event) => event.id)).toEqual([
            seeded.aminaA,
            seeded.paymentId,
          ])
          expect(storeA.data.every((e) => e.store?.id === ids.stores.a)).toBe(
            true,
          )
          expect(storeA.withheld).toEqual([
            { stream: "ORDER", id: ids.orders.aminaB },
          ])
          await expect(
            readStaffActivityShownInTransaction(tx, {
              ...manager,
              storeIds: null,
              ...seeded.window,
              events,
            }),
          ).rejects.toThrow("Choose a Store you manage to read staff activity.")
          await expect(
            readStaffActivityShownInTransaction(tx, {
              ...owner(ids),
              viewerUserId: ids.users.cashier,
              ...seeded.window,
              events,
            }),
          ).rejects.toThrow("Owner, Admin or Manager access is required")
          // Demotion and suspension take effect on the next read.
          await tx.membership.update({
            where: { id: ids.memberships.manager },
            data: { role: "CASHIER" },
          })
          await expect(
            readStaffActivityShownInTransaction(tx, {
              ...manager,
              ...seeded.window,
              events,
            }),
          ).rejects.toThrow("Owner, Admin or Manager access is required")
          await tx.membership.update({
            where: { id: ids.memberships.manager },
            data: { role: "MANAGER", status: "SUSPENDED" },
          })
          await expect(
            readStaffActivityShownInTransaction(tx, {
              ...manager,
              ...seeded.window,
              events,
            }),
          ).rejects.toThrow("Owner, Admin or Manager access is required")
        },
      )
    },
    caseDeadline,
  )

  test(
    "all-stream sweep: unseeded streams are empty, totals match",
    async () => {
      await inRollback(
        "all-stream-sweep",
        {
          statements:
            estimate.transaction +
            estimate.directSeed +
            estimate.pageAllStreams +
            2,
        },
        async (tx, ids, seeded) => {
          const page = await listStaffActivityPageInTransaction(tx, {
            ...owner(ids),
            ...seeded.window,
            limit: 25,
          })
          const orders = await direct(tx, ids, seeded, "ORDER")
          const payments = await direct(tx, ids, seeded, "PAYMENT")
          expect(page.total).toBe(orders.length + payments.length)
          expect(page.byStream).toEqual({
            ...Object.fromEntries(staffActivityStreams.map((s) => [s, 0])),
            ORDER: orders.length,
            PAYMENT: payments.length,
            // Finance is left out without Books, so it has no count at all.
            FINANCE_POSTING: undefined,
          })
          expect(page.coverage.notIncluded).toContain("finance_actions")
          expect(
            [...identities(page.data)].sort((a, b) => (a.id < b.id ? -1 : 1)),
          ).toEqual(
            [...orders, ...payments].sort((a, b) => (a.id < b.id ? -1 : 1)),
          )
        },
      )
    },
    caseDeadline,
  )

  test(
    "bounded reads on a busier Store (indicative, time-boxed samples)",
    async () => {
      const sampleBudgetMs = 2_000
      await inRollback(
        "timing",
        {
          statements:
            estimate.transaction +
            estimate.directSeed +
            1 +
            estimate.pageOneStream,
          extraMs: 2 * sampleBudgetMs + 2 * 8 * medianMs,
        },
        async (tx, ids, seeded) => {
          // Test-only volume through createMany, not canonical commands.
          const volume = 1_000
          const base = Date.now() - 1_800_000
          await tx.commercialOrder.createMany({
            data: Array.from({ length: volume }, (_, index) => {
              const id = randomUUID()
              return {
                id,
                tenantId: ids.tenantId,
                storeId: ids.stores.a,
                clientOrderId: `s05-volume-${id}`,
                payloadHash: id,
                orderNumber: `S05-V-${id.slice(0, 12)}`,
                currencyCode: "NGN",
                subtotalMinor: 100,
                totalMinor: 100,
                createdByUserId: ids.users.amina,
                createdAt: new Date(base + index * 1_000),
              }
            }),
          })
          const pageInput = {
            ...owner(ids),
            ...seeded.window,
            stream: "ORDER" as const,
            limit: 10,
          }
          const page = await listStaffActivityPageInTransaction(tx, pageInput)
          expect(page.data).toHaveLength(10)
          expect(page.total).toBe(volume + 3)
          const events = identities(page.data)
          // Each measurement gets a fixed budget (at least one sample, at
          // most 10); the actual sample count is reported.
          const sample = async (work: () => Promise<unknown>) => {
            const budget = performance.now() + sampleBudgetMs
            const runs: number[] = []
            while (
              runs.length < 10 &&
              (runs.length === 0 || performance.now() < budget)
            ) {
              const started = performance.now()
              await work()
              runs.push(ms(started))
            }
            runs.sort((a, b) => a - b)
            return {
              samples: runs.length,
              p50: runs[Math.floor(runs.length / 2)] ?? null,
              max: runs.at(-1) ?? null,
            }
          }
          const shown10 = await sample(() =>
            readStaffActivityShownInTransaction(tx, {
              ...owner(ids),
              ...seeded.window,
              events,
            }),
          )
          const orderPage10 = await sample(() =>
            listStaffActivityPageInTransaction(tx, pageInput),
          )
          report({
            timing: {
              rowsInWindow: page.total,
              roundTripMedianMs: medianMs,
              shown10,
              orderPage10,
            },
          })
          expect(shown10.samples).toBeGreaterThan(0)
        },
      )
    },
    caseDeadline,
  )

  test(
    "query plans for the actual ORDER and PAYMENT loader statements",
    async () => {
      await inRollback(
        "plans",
        {
          statements:
            estimate.transaction +
            estimate.directSeed +
            estimate.shownTwoStreams +
            estimate.pageOneStream +
            4,
        },
        async (tx, ids, seeded) => {
          // The fixture client logs the exact statements Prisma sends, so
          // the plans use the loaders' real SQL and bound values.
          statements.length = 0
          capturing = true
          await readStaffActivityShownInTransaction(tx, {
            ...owner(ids),
            ...seeded.window,
            events: [
              { stream: "ORDER", id: seeded.aminaA },
              { stream: "PAYMENT", id: seeded.paymentId },
            ],
          })
          await listStaffActivityPageInTransaction(tx, {
            ...owner(ids),
            ...seeded.window,
            stream: "ORDER",
            limit: 10,
          })
          capturing = false
          const loaderStatements = statements.filter(
            (statement) =>
              /^SELECT/i.test(statement.query) &&
              /"CommercialOrder(Payment)?"/.test(statement.query) &&
              /ORDER BY/i.test(statement.query),
          )
          expect(loaderStatements.length).toBeGreaterThanOrEqual(3)
          const plans = []
          for (const statement of loaderStatements.slice(0, 4)) {
            const rows = await tx.$queryRawUnsafe<
              Array<{ "QUERY PLAN": string }>
            >(
              `EXPLAIN (ANALYZE, BUFFERS) ${statement.query}`,
              ...(JSON.parse(statement.params) as unknown[]),
            )
            plans.push(rows.map((row) => row["QUERY PLAN"]).join("\n"))
          }
          report({ plans })
        },
      )
    },
    caseDeadline,
  )
})
