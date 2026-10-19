import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import { type Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { ensureCatalogFreeOfferingInTransaction } from "./catalog-free-lines"
import { createCommercialOrder } from "./commercial-orders"
import { createFinanceBook } from "./finance/accounts"
import {
  type OfflineCommandEnvelope,
  offlineCommandEnvelopeHash,
  replayOfflineCommands,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"

// Existing-Book coordination only. Both orders are unpaid Quick sales to isolate
// contact creation/FK/unique-index ordering; paid effects and absent-Book policy
// have separate fixtures. All commands and database operations below are real.
const requestedRunId = process.env.QA_OFFLINE_CUSTOMER_BOOK_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_OFFLINE_CUSTOMER_BOOK_RUN_ID must be a UUID")
const transactionOptions = { maxWait: 10000, timeout: 30000 }
type PlannedUser = { id: string; email: string }
async function settledValues<T extends readonly unknown[]>(
  tasks: {
    [K in keyof T]: Promise<T[K]>
  },
): Promise<T> {
  const results = await Promise.allSettled(tasks)
  const errors = results.filter((result) => result.status === "rejected")
  if (errors.length === 1) throw errors[0]?.reason
  if (errors.length > 1)
    throw new AggregateError(
      errors.map((result) => result.reason),
      "Owned QA reads failed",
    )
  return results.map((result) => {
    if (result.status !== "fulfilled") throw Error("Unsettled QA read")
    return result.value
  }) as unknown as T
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }
function barrier() {
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    release,
    async wait() {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          ready,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(Error("Customer coordination barrier deadline")),
              12000,
            )
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

async function disconnectParticipants(
  clients: PrismaClient[],
  pools: pg.Pool[],
) {
  const disconnected = await Promise.allSettled(
    clients.map((client) => client.$disconnect()),
  )
  const ended = await Promise.allSettled(pools.map((pool) => pool.end()))
  for (const result of [...disconnected, ...ended])
    if (result.status === "rejected") throw result.reason
}

describeWithQaAccessDatabase(
  "canonical/offline new-Customer Book lock coordination",
  () => {
    test("Book is held before Customer insertion and concurrent same-contact commands converge without duplicate effects", async () => {
      assertQaAccessAcceptanceDatabase()
      const databaseUrl = process.env.EWATRADE_DATABASE_URL
      if (!databaseUrl) throw Error("Missing verified Development database URL")
      const runId = requestedRunId ?? randomUUID()
      const started = Date.now()
      const progress = (name: string) => {
        console.info(
          `[offline-customer-book QA ${runId}] ${name} ${Date.now() - started}ms`,
        )
        if (Date.now() - started > 720000)
          throw Error("Customer coordination scenario deadline")
      }
      const { prisma: db } = await import("../client")
      const clients: PrismaClient[] = []
      const pools: pg.Pool[] = []
      const jobs = new Set<Promise<unknown>>()
      const beforeInsert = barrier()
      const releaseInsert = barrier()
      const offlinePlan = barrier()
      const releaseOfflineBook = barrier()
      const plannedUsers: PlannedUser[] = []
      const failures: unknown[] = []
      let tenantId: string | undefined
      function tracked<T>(
        promise: Promise<T>,
        commandFailure = true,
      ): Promise<Settled<T>> {
        const settled = promise.then(
          (value): Settled<T> => ({ ok: true, value }),
          (error): Settled<T> => {
            if (commandFailure) failures.push(error)
            return { ok: false, error }
          },
        )
        jobs.add(settled)
        void settled.finally(() => jobs.delete(settled))
        return settled
      }
      function succeeded<T>(result: Settled<T>) {
        if (!result.ok) throw result.error
        return result.value
      }
      function ownClient(label: string) {
        // Bound each test participant's local pool. Backend identity is captured
        // inside each actual transaction; a transaction pooler may switch it.
        const pool = new pg.Pool({
          connectionString: databaseUrl,
          max: 1,
          idleTimeoutMillis: 0,
          connectionTimeoutMillis: 10000,
          application_name: `qa-customer-${label}-${runId}`,
        })
        pools.push(pool)
        const client = new PrismaClient({
          adapter: new PrismaPg(pool, { disposeExternalPool: false }),
          transactionOptions,
        })
        clients.push(client)
        return client
      }
      try {
        progress("setup:start")
        const users = []
        for (const role of ["owner", "rep"]) {
          const id = randomUUID()
          const email = `offline-customer-book-${role}-${runId}@example.invalid`
          plannedUsers.push({ id, email })
          const user = await db.user.create({
            data: {
              id,
              name: `Customer Book QA ${role}`,
              email,
              ageBand: "ADULT",
              ageDeclaredAt: new Date(),
            },
          })
          users.push(user)
        }
        const [owner, rep] = users
        if (!owner || !rep) throw Error("Missing Customer Book QA identities")
        tenantId = randomUUID()
        const tenant = await db.tenant.create({
          data: {
            id: tenantId,
            name: "Customer Book coordination QA",
            slug: `offline-customer-book-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            metadata: {
              retailOps: {
                subscription: { planId: "growth", status: "active" },
              },
              offlineOperationsEnabled: true,
              offlineApprovalRequired: false,
            },
            users: {
              create: [
                { userId: owner.id, role: "OWNER", status: "ACTIVE" },
                {
                  userId: rep.id,
                  role: "CASHIER",
                  status: "ACTIVE",
                  staffAccessMode: "LEGACY",
                },
              ],
            },
          },
        })
        const store = await db.store.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            name: "Customer Book Store",
            slug: "original",
            status: "ACTIVE",
          },
        })
        const ownerScope = { actorUserId: owner.id, tenantId: tenant.id }
        const scope = {
          actorUserId: rep.id,
          tenantId: tenant.id,
          storeId: store.id,
          deviceId: `customer-book-${runId}`,
        }
        await registerOwnedOfflineDevice(db, { ...scope, platform: "ANDROID" })
        await db.$transaction(
          (tx) =>
            ensureCatalogFreeOfferingInTransaction(tx, {
              tenantId: tenant.id,
              storeId: store.id,
              currencyCode: "NGN",
              kind: "quick_sale",
            }),
          transactionOptions,
        )
        const book = await createFinanceBook(db, {
          ...ownerScope,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        })
        const contact = `contact-${runId}@example.invalid`
        const offlineEnvelope: OfflineCommandEnvelope = {
          clientCommandId: `${runId}:offline`,
          createdAtClient: new Date(),
          eventVersion: 1,
          dependencyClientIds: [],
          payload: {
            kind: "commercial_order",
            customerMode: "create",
            customerName: "Offline intended new Customer",
            customerEmail: contact.toUpperCase(),
            fulfillNow: false,
            lines: [
              {
                custom: "quick_sale",
                description: "Offline same-contact sale",
                amountMinor: 200,
              },
            ],
          },
        }
        const webInput = {
          ...ownerScope,
          storeId: store.id,
          clientOrderId: `${runId}:web`,
          schemaVersion: 1,
          customerMode: "create" as const,
          customerName: "Web intended new Customer",
          customerEmail: contact,
          fulfillNow: false,
          lines: [
            {
              custom: "quick_sale" as const,
              description: "Web same-contact sale",
              amountMinor: 100,
            },
          ],
        }
        const snapshot = async () => {
          const where = { tenantId: tenant.id }
          const [
            customers,
            orders,
            lines,
            payments,
            journals,
            ledger,
            stock,
            sequence,
            finance,
          ] = await settledValues([
            db.customer.count({ where }),
            db.commercialOrder.count({ where }),
            db.commercialOrderLine.count({ where: { order: where } }),
            db.commercialOrderPayment.count({ where }),
            db.financeJournalEntry.count({ where: { bookId: book.id } }),
            db.customerLedgerEntry.count({ where }),
            db.stockOperation.count({ where }),
            db.tenant.findUniqueOrThrow({
              where: { id: tenant.id },
              select: { lastCommercialOrderSequence: true },
            }),
            db.financeBook.findUniqueOrThrow({
              where: { id: book.id },
              select: { lastSequence: true },
            }),
          ])
          return {
            customers,
            orders,
            lines,
            payments,
            journals,
            ledger,
            stock,
            sequence: sequence.lastCommercialOrderSequence,
            financeSequence: finance.lastSequence,
          }
        }
        const before = await snapshot()
        expect(before.customers).toBe(0)
        const webBase = ownClient("web")
        const offlineBase = ownClient("offline")
        let checkedInsert = 0
        const webExtended = webBase.$extends({
          query: {
            customer: {
              createMany: async ({ args, query }) => {
                const data = Array.isArray(args.data) ? args.data : [args.data]
                if (
                  data.some(
                    (row) =>
                      row.tenantId === tenant.id &&
                      row.normalizedEmail === contact,
                  )
                ) {
                  checkedInsert++
                  if (checkedInsert === 1) {
                    // Runs BEFORE the actual Customer insert. Exact unique Book scope
                    // has no other writer: a separate transaction must fail NOWAIT.
                    // Pre-fix source fails here safely, before manufacturing any cycle.
                    const proof = await tracked(
                      db.$transaction(
                        (tx) =>
                          tx.$queryRaw`SELECT "id" FROM "FinanceBook" WHERE "id"=${book.id} AND "tenantId"=${tenant.id} FOR UPDATE NOWAIT`,
                        transactionOptions,
                      ),
                      false, // Expected NOWAIT rejection is asserted below.
                    )
                    expect(proof.ok).toBe(false)
                    if (!proof.ok)
                      expect(JSON.stringify(proof.error)).toContain("55P03")
                    beforeInsert.release()
                    await releaseInsert.wait()
                  }
                }
                return query(args)
              },
            },
          },
        })
        const webObservation: {
          pid: number | null
          transaction: object | null
        } = { pid: null, transaction: null }
        const offlineObservation: typeof webObservation = {
          pid: null,
          transaction: null,
        }
        let signalledPlan = false
        let stagedExecution = false
        let executionStarted = false
        async function pidInside(tx: Prisma.TransactionClient) {
          const rows = await tx.$queryRaw<
            Array<{ pid: number }>
          >`SELECT pg_backend_pid() AS pid`
          const pid = rows[0]?.pid
          if (!pid) throw Error("Missing owned transaction backend PID")
          return pid
        }
        function observeTransactions(
          base: PrismaClient,
          participant: "web" | "offline",
        ) {
          return new Proxy(base, {
            get(target, property) {
              if (property === "$transaction")
                return async (
                  run: (tx: Prisma.TransactionClient) => Promise<unknown>,
                  options?: {
                    maxWait?: number
                    timeout?: number
                    isolationLevel?: Prisma.TransactionIsolationLevel
                  },
                ) => {
                  // Pause only after genuine replay admission returned execute:true,
                  // before dispatching its actual execution transaction. No DB
                  // transaction, Book/Tenant lock or timeout runs during this wait.
                  if (
                    participant === "offline" &&
                    stagedExecution &&
                    !executionStarted
                  ) {
                    executionStarted = true
                    offlinePlan.release()
                    await releaseOfflineBook.wait()
                  }
                  return target
                    .$transaction(async (actualTx) => {
                      const observation =
                        participant === "web"
                          ? webObservation
                          : offlineObservation
                      if (participant === "web") {
                        observation.pid = await pidInside(actualTx)
                        observation.transaction = actualTx
                      }
                      const observedTx = new Proxy(actualTx, {
                        get(txTarget, txProperty) {
                          if (
                            participant === "offline" &&
                            txProperty === "$queryRaw"
                          )
                            return async (
                              query: TemplateStringsArray | Prisma.Sql,
                              ...values: unknown[]
                            ) => {
                              const text = Array.isArray(query)
                                ? query.join(" ")
                                : String(Reflect.get(query, "sql"))
                              if (
                                !signalledPlan &&
                                text.includes('FROM "FinanceBook"') &&
                                text.includes("FOR UPDATE") &&
                                values[0] === tenant.id &&
                                values[1] === "NGN"
                              ) {
                                // Capture inside the exact execution transaction,
                                // immediately before its untouched Book lock query.
                                // Replay admission has no Book query and cannot signal.
                                observation.pid = await pidInside(actualTx)
                                observation.transaction = actualTx
                                signalledPlan = true
                                // Observation only: the actual execution starts
                                // after the web lock proof. Forward the original
                                // Book query immediately; no in-TX test barrier.
                              }
                              return actualTx.$queryRaw(query, ...values)
                            }
                          const value = Reflect.get(
                            txTarget,
                            txProperty,
                            txTarget,
                          )
                          return typeof value === "function"
                            ? value.bind(txTarget)
                            : value
                        },
                      })
                      try {
                        return await run(observedTx)
                      } finally {
                        if (observation.transaction === actualTx)
                          observation.transaction = null
                      }
                    }, options)
                    .then((result) => {
                      if (
                        participant === "offline" &&
                        !executionStarted &&
                        result &&
                        typeof result === "object" &&
                        Reflect.get(result, "execute") === true
                      ) {
                        const admitted = Reflect.get(result, "command")
                        if (
                          !admitted ||
                          Reflect.get(admitted, "clientCommandId") !==
                            offlineEnvelope.clientCommandId
                        )
                          throw Error("Unexpected replay admission command")
                        stagedExecution = true
                      }
                      return result
                    })
                }
              const value = Reflect.get(target, property, target)
              return typeof value === "function" ? value.bind(target) : value
            },
          })
        }
        // The extension observes the real Customer insert. Transparent proxies
        // forward real interactive transactions and original query arguments;
        // only the test's own PID reads/barrier signals are added.
        const web = observeTransactions(
          webExtended as unknown as PrismaClient,
          "web",
        )
        const offline = observeTransactions(offlineBase, "offline")
        const upload = () =>
          replayOfflineCommands(offline, {
            ...scope,
            acceptNewCommands: true,
            requiresApproval: false,
            capabilities: { operateOrders: true },
            commands: [offlineEnvelope],
          })
        progress("offline-admitted:pause-before-execution-Book")
        const offlineJob = tracked(upload())
        let webJob:
          | ReturnType<
              typeof tracked<Awaited<ReturnType<typeof createCommercialOrder>>>
            >
          | undefined
        try {
          void offlineJob.then((result) => {
            if (!result.ok) offlinePlan.release()
          })
          await offlinePlan.wait()
          if (!stagedExecution || !executionStarted) {
            succeeded(await offlineJob)
            throw Error(
              "Offline execution ended before its pre-transaction barrier",
            )
          }
          progress("web-before-Customer-insert:Book-proof")
          webJob = tracked(createCommercialOrder(web, webInput))
          // If the web command fails before its signal (the expected pre-fix
          // NOWAIT assertion), release the barrier so we can report its real error.
          void webJob.then((result) => {
            if (!result.ok) beforeInsert.release()
          })
          await beforeInsert.wait()
          if (!webObservation.transaction) {
            succeeded(await webJob)
            throw Error("Web execution ended before Customer insertion proof")
          }
          const early = await db.customer.count({
            where: { tenantId: tenant.id },
          })
          expect(early).toBe(0)
          // A failed pre-fix query never inserted a web Customer. Its true error
          // is surfaced before releasing the paused offline Book query.
          if (checkedInsert !== 1)
            throw Error("Missing intended Customer insertion observation")
          const lockStillHeld = await tracked(
            db.$transaction(
              (tx) =>
                tx.$queryRaw`SELECT "id" FROM "FinanceBook" WHERE "id"=${book.id} AND "tenantId"=${tenant.id} FOR UPDATE NOWAIT`,
              transactionOptions,
            ),
            false, // Expected NOWAIT rejection is asserted below.
          )
          if (lockStillHeld.ok) {
            const failed = await webJob
            if (!failed.ok) throw failed.error
            throw Error("Expected web Book lock before Customer insertion")
          }
          expect(JSON.stringify(lockStillHeld.error)).toContain("55P03")
          progress("offline-waits-on-owned-web-Book")
          releaseOfflineBook.release()
          // Observe only the exact two owned backend PIDs, never session/query
          // text or unrelated waiters. This is a real lock relationship assertion,
          // not an elapsed-time assumption about the second command being blocked.
          const deadline = Date.now() + 6000
          let blocked = false
          while (Date.now() < deadline) {
            // Await only an already-retired participant, so a real command/
            // barrier error is reported without waiting on the live peer that
            // still needs the finally block to release its own barrier.
            if (!webObservation.transaction) succeeded(await webJob)
            if (!offlineObservation.transaction && signalledPlan)
              succeeded(await offlineJob)
            if (!signalledPlan) {
              await new Promise<void>((resolve) => setTimeout(resolve, 25))
              continue
            }
            const webPid = webObservation.pid
            const offlinePid = offlineObservation.pid
            if (
              !webPid ||
              !offlinePid ||
              webPid === offlinePid ||
              !webObservation.transaction ||
              !offlineObservation.transaction
            )
              throw Error(
                "Expected two live, exact owned execution transactions",
              )
            const rows = await db.$queryRaw<
              Array<{ blocked: boolean }>
            >`SELECT ${webPid}::integer = ANY(pg_blocking_pids(${offlinePid}::integer)) AS blocked`
            if (rows[0]?.blocked) {
              blocked = true
              break
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 25))
          }
          expect(blocked).toBe(true)
        } finally {
          releaseOfflineBook.release()
          releaseInsert.release()
        }
        if (!webJob) throw Error("Missing actual web participant")
        const createdWeb = succeeded(await webJob)
        const uploaded = succeeded(await offlineJob)
        expect(uploaded[0]?.status).toBe("APPLIED")
        expect(checkedInsert).toBe(1)
        const customer = await db.customer.findMany({
          where: { tenantId: tenant.id },
          select: { id: true, normalizedEmail: true, name: true },
        })
        expect(customer).toHaveLength(1)
        if (!customer[0]) throw Error("Missing canonical same-contact Customer")
        expect(customer[0]).toMatchObject({
          normalizedEmail: contact,
          name: webInput.customerName,
        })
        const orders = await db.commercialOrder.findMany({
          where: { tenantId: tenant.id },
          select: {
            id: true,
            clientOrderId: true,
            customerId: true,
            createdByUserId: true,
          },
          orderBy: { clientOrderId: "asc" },
        })
        expect(orders).toHaveLength(2)
        for (const order of orders)
          expect(order.customerId).toBe(customer[0]?.id)
        expect(
          orders.find(
            (order) => order.clientOrderId === webInput.clientOrderId,
          ),
        ).toMatchObject({ id: createdWeb.id, createdByUserId: owner.id })
        expect(
          orders.find(
            (order) => order.clientOrderId === offlineEnvelope.clientCommandId,
          ),
        ).toMatchObject({ createdByUserId: rep.id })
        expect(
          await db.offlineCommand.findUniqueOrThrow({
            where: {
              tenantId_clientCommandId: {
                tenantId: tenant.id,
                clientCommandId: offlineEnvelope.clientCommandId,
              },
            },
          }),
        ).toMatchObject({
          status: "APPLIED",
          payloadHash: offlineCommandEnvelopeHash(offlineEnvelope),
          payload: { actorUserId: rep.id },
        })
        const after = await snapshot()
        expect(after).toEqual({
          ...before,
          customers: 1,
          orders: before.orders + 2,
          lines: before.lines + 2,
          sequence: before.sequence + 2,
        })
        progress("exact-idempotent-retry")
        expect((await createCommercialOrder(web, webInput)).id).toBe(
          createdWeb.id,
        )
        expect((await upload())[0]?.status).toBe("APPLIED")
        expect(await snapshot()).toEqual(after)
        progress("scenario:complete")
      } catch (error) {
        failures.push(error)
      } finally {
        beforeInsert.release()
        releaseInsert.release()
        offlinePlan.release()
        releaseOfflineBook.release()
        const settledJobs = await Promise.allSettled([...jobs])
        for (const result of settledJobs) {
          if (result.status === "rejected") failures.push(result.reason)
        }
        try {
          await disconnectParticipants(clients, pools)
        } catch (error) {
          failures.push(error)
        }
        try {
          await dispose(db, runId, tenantId, plannedUsers)
        } catch (error) {
          failures.push(error)
        }
        try {
          await db.$disconnect()
        } catch (error) {
          failures.push(error)
        }
      }
      const distinct = [...new Set(failures)]
      if (distinct.length === 1) throw distinct[0]
      if (distinct.length > 1)
        throw new AggregateError(
          distinct,
          "Customer Book QA failures (original first)",
        )
    }, 900000)
  },
)

async function dispose(
  db: PrismaClient,
  runId: string,
  tenantId: string | undefined,
  plannedUsers: PlannedUser[],
) {
  if (plannedUsers.length === 0 && tenantId === undefined) {
    console.info(
      `[offline-customer-book QA ${runId}] cleanup skipped: no fixture writes attempted`,
    )
    return false
  }
  assertQaAccessAcceptanceDatabase()
  const userIds = plannedUsers.map((user) => user.id)
  const expectedEmails = new Map(
    plannedUsers.map((user) => [user.id, user.email]),
  )
  const [users, tenant] = await settledValues([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    }),
    tenantId
      ? db.tenant.findUnique({
          where: { id: tenantId },
          select: { slug: true, dataClassification: true },
        })
      : Promise.resolve(null),
  ])
  if (users.some((user) => expectedEmails.get(user.id) !== user.email))
    throw Error(`Customer Book QA ${runId}: cleanup User proof failed`)
  if (
    tenant &&
    (tenant.slug !== `offline-customer-book-${runId}` ||
      tenant.dataClassification !== "QA")
  )
    throw Error(`Customer Book QA ${runId}: cleanup Tenant proof failed`)
  // Missing planned rows are valid partial setup, not missing disposal authority.
  // Only an actually observed exact QA Tenant enters these twelve groups.
  if (tenant && tenantId) {
    const ownedTenantId = tenantId
    const where = { tenantId }
    const group = async (
      label: string,
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ) => {
      assertQaAccessAcceptanceDatabase()
      console.info(`[offline-customer-book QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          // Re-prove exact QA identity and hold its row in EVERY disposal
          // transaction; a prior successful group grants no later authority.
          const owned = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId}
              AND "slug"=${`offline-customer-book-${runId}`} AND "dataClassification"='QA'
            FOR UPDATE
          `
          if (owned.length !== 1)
            throw Error(
              `Customer Book QA ${runId}: cleanup Tenant proof failed`,
            )
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(
          `Customer Book QA ${runId}: cleanup group ${label} failed`,
          { cause: error },
        )
      }
    }
    await group("offline-and-activity", async (tx) => {
      await tx.offlineCommand.deleteMany({ where })
      await tx.businessActivityEvent.deleteMany({ where })
    })
    await group("fulfillment-and-reservations", async (tx) => {
      await tx.commercialServiceFulfillment.deleteMany({ where })
      await tx.productFulfillment.deleteMany({
        where: { orderLine: { order: where } },
      })
      await tx.stockReservation.deleteMany({ where })
    })
    await group("payments-and-allocations", async (tx) => {
      await tx.commercialOrderPayment.deleteMany({ where })
      await tx.customerLedgerAllocationRelease.deleteMany({
        where: { allocation: { credit: where } },
      })
      await tx.customerLedgerAllocation.deleteMany({ where: { credit: where } })
    })
    await group("customer-receipts-and-entries", async (tx) => {
      await tx.customerLedgerReceipt.deleteMany({ where: { entry: where } })
      await tx.customerLedgerCommand.deleteMany({ where })
      await tx.customerLedgerEntry.deleteMany({ where })
    })
    await group("customer-accounts-and-orders", async (tx) => {
      await tx.customerLedgerAccount.deleteMany({ where })
      await tx.commercialOrder.deleteMany({ where })
    })
    await group("inventory-valuations", async (tx) => {
      // Remove any owned valuation effect before removing stock provenance;
      // no cross-Tenant rows are touched.
      await tx.financeInventoryValuationEvent.deleteMany({ where })
      await tx.financeInventoryPool.deleteMany({ where })
    })
    await group("catalog-receipts-and-stock-movements", async (tx) => {
      await tx.catalogCommandReceipt.deleteMany({ where })
      await tx.stockMovement.deleteMany({ where: { operation: where } })
    })
    await group("stock-operations-and-balances", async (tx) => {
      await tx.stockOperation.deleteMany({ where })
      await tx.stockBalanceSource.deleteMany({ where })
    })
    await group("finance-commands-and-lines", async (tx) => {
      await tx.financeCommand.deleteMany({ where: { book: where } })
      await tx.financeJournalLine.deleteMany({
        where: { entry: { book: where } },
      })
    })
    await group("finance-journals-and-accounts", async (tx) => {
      await tx.financeJournalEntry.deleteMany({ where: { book: where } })
      await tx.financeAccount.deleteMany({ where: { book: where } })
    })
    await group("finance-Book-and-Catalog", async (tx) => {
      await tx.financeBook.deleteMany({ where })
      await tx.catalogPriceChange.deleteMany({ where })
      await tx.catalogItem.deleteMany({ where })
    })
    await group("Tenant", async (tx) => {
      await tx.tenant.delete({ where: { id: tenantId } })
    })
  }
  await db.$transaction(async (tx) => {
    // Re-read under row locks; validate each exact ID/email pair rather than
    // assuming every attempted insert committed (or accepting swapped emails).
    const owned = await tx.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT "id", "email" FROM "User" WHERE "id"=ANY(${userIds}::text[])
        FOR UPDATE
    `
    if (owned.some((user) => expectedEmails.get(user.id) !== user.email))
      throw Error(`Customer Book QA ${runId}: cleanup User proof failed`)
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error(
        `Customer Book QA ${runId}: foreign membership prevents User disposal`,
      )
    if (owned.length > 0)
      await tx.user.deleteMany({
        where: { OR: owned.map(({ id, email }) => ({ id, email })) },
      })
  }, transactionOptions)
  const residual = await settledValues([
    db.user.count({ where: { id: { in: userIds } } }),
    ...(tenantId
      ? [
          db.tenant.count({ where: { id: tenantId } }),
          db.offlineCommand.count({ where: { tenantId } }),
          db.commercialOrder.count({ where: { tenantId } }),
          db.commercialOrderPayment.count({ where: { tenantId } }),
          db.financeBook.count({ where: { tenantId } }),
          db.catalogItem.count({ where: { tenantId } }),
          db.offlineDevice.count({ where: { tenantId } }),
          db.store.count({ where: { tenantId } }),
          db.stockOperation.count({ where: { tenantId } }),
          db.stockBalanceSource.count({ where: { tenantId } }),
          db.stockReservation.count({ where: { tenantId } }),
          db.customerLedgerEntry.count({ where: { tenantId } }),
          db.catalogPriceChange.count({ where: { tenantId } }),
          db.customer.count({ where: { tenantId } }),
        ]
      : []),
  ])
  if (residual.some((count) => count !== 0))
    throw Error(`Customer Book QA ${runId}: cleanup left owned rows`)
  console.info(`[offline-customer-book QA ${runId}] cleanup zero owned rows`)
  return true
}
