import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { offlineReplaySchema } from "../../../../apps/api/src/schemas/offline"
import { buildOfflineOrderCommand } from "../../../../apps/mobile/src/lib/offline-order"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { ensureCatalogFreeOfferingInTransaction } from "./catalog-free-lines"
import { createCommercialOrder } from "./commercial-orders"
import {
  createFinanceBook,
  createFinanceMoneyAccount,
} from "./finance/accounts"
import { getFinanceAccountBalances } from "./finance/reads"
import {
  offlineCommandEnvelopeHash,
  replayOfflineCommands,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import { getOfflineOperationsPolicy } from "./offline-settings"

// Real mobile/shared command seam: canonical Order create plus the actual mobile
// offline builder, strict API envelope and canonical ordinary replay. This does
// not execute assistant composition, UI, native storage/connectivity or providers.
const requestedRunId = process.env.QA_PAYMENT_ACCOUNT_MATRIX_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_PAYMENT_ACCOUNT_MATRIX_RUN_ID must be a UUID")
const transactionOptions = { maxWait: 10000, timeout: 30000 }
const slugFor = (runId: string) => `payment-account-matrix-${runId}`
const emailFor = (role: string, runId: string) =>
  `payment-account-matrix-${role}-${runId}@example.invalid`
type PlannedUser = { id: string; email: string }

async function settledValues<T extends readonly unknown[]>(
  tasks: { [K in keyof T]: Promise<T[K]> },
): Promise<T> {
  const results = await Promise.allSettled(tasks)
  const errors = results.filter((result) => result.status === "rejected")
  if (errors.length === 1) throw errors[0]?.reason
  if (errors.length > 1)
    throw new AggregateError(
      errors.map((result) => result.reason),
      "Owned account matrix QA reads failed",
    )
  return results.map((result) => {
    if (result.status !== "fulfilled")
      throw Error("Unsettled account matrix QA read")
    return result.value
  }) as unknown as T
}

describeWithQaAccessDatabase(
  "receiving-account full/part/pending and offline canonical matrix",
  () => {
    test("full and initial-part payments reach the chosen nondefault bank exactly once; pending needs no account and offline preserves its destination", async () => {
      assertQaAccessAcceptanceDatabase()
      const runId = requestedRunId ?? randomUUID()
      const started = Date.now()
      const progress = (stage: string) => {
        console.info(
          `[payment-account-matrix QA ${runId}] ${stage} ${Date.now() - started}ms`,
        )
        // Reserve three minutes for exact awaited cleanup; no abandoned DB promise.
        if (Date.now() - started > 720000)
          throw Error("Payment account matrix scenario deadline")
      }
      progress("setup:start")
      const { prisma: db } = await import("../client")
      const plannedUsers: PlannedUser[] = []
      let tenantId: string | undefined
      const failures: unknown[] = []
      try {
        const users = []
        for (const role of ["owner", "rep"]) {
          progress(`setup:user-${role}`)
          const identity = { id: randomUUID(), email: emailFor(role, runId) }
          plannedUsers.push(identity)
          users.push(
            await db.user.create({
              data: {
                ...identity,
                name: `Payment account matrix QA ${role}`,
                ageBand: "ADULT",
                ageDeclaredAt: new Date(),
              },
            }),
          )
        }
        const [owner, rep] = users
        if (!owner || !rep) throw Error("Missing owned QA identities")
        tenantId = randomUUID()
        progress("setup:Tenant-and-Store")
        const tenant = await db.tenant.create({
          data: {
            id: tenantId,
            name: "Payment account matrix QA",
            slug: slugFor(runId),
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            metadata: {
              retailOps: {
                subscription: { planId: "growth", status: "active" },
              },
            },
            users: {
              create: [
                { userId: owner.id, role: "OWNER", status: "ACTIVE" },
                {
                  userId: rep.id,
                  role: "CASHIER",
                  status: "ACTIVE",
                  staffAccessMode: "LEGACY",
                  acceptedAt: new Date(),
                },
              ],
            },
          },
        })
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Payment account matrix original Store",
            slug: "original",
            status: "ACTIVE",
          },
        })
        const ownerScope = { tenantId: tenant.id, actorUserId: owner.id }
        const repScope = { tenantId: tenant.id, actorUserId: rep.id }
        progress("setup:hidden-Quick-sale-Offering")
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
        const saleInput = (label: string, amountMinor: number) => ({
          ...repScope,
          storeId: store.id,
          clientOrderId: `${runId}:${label}`,
          schemaVersion: 1,
          fulfillNow: true,
          lines: [
            {
              custom: "quick_sale" as const,
              amountMinor,
              description: `Recorded ${label} sale`,
            },
          ],
        })
        const graph = {
          payments: { orderBy: { id: "asc" as const } },
          lines: {
            orderBy: { id: "asc" as const },
            include: {
              snapshot: true,
              serviceFulfillment: true,
              stockReservation: true,
              productFulfillments: true,
            },
          },
        } satisfies Prisma.CommercialOrderInclude
        const readOrders = () =>
          db.commercialOrder.findMany({
            where: { tenantId: tenant.id },
            include: graph,
            orderBy: { id: "asc" },
          })

        // Pending is deliberately recorded BEFORE any Finance Book or MoneyAccount
        // exists, with no payment or destination property in the canonical input.
        progress("pending:no-Book-no-account")
        const pendingInput = saleInput("pending", 800)
        expect("initialPayment" in pendingInput).toBe(false)
        const beforePending = await settledValues([
          db.financeBook.count({ where: { tenantId: tenant.id } }),
          db.financeAccount.count({ where: { book: { tenantId: tenant.id } } }),
        ])
        expect(beforePending).toEqual([0, 0])
        const pending = await createCommercialOrder(db, pendingInput)
        expect(pending).toMatchObject({
          createdByUserId: rep.id,
          totalMinor: 800,
          amountPaidMinor: 0,
          balanceDueMinor: 800,
          paymentStatus: "PENDING",
          status: "COMPLETED",
          payments: [],
        })
        expect((await createCommercialOrder(db, pendingInput)).id).toBe(
          pending.id,
        )
        const afterPending = await settledValues([
          db.financeBook.count({ where: { tenantId: tenant.id } }),
          db.financeAccount.count({ where: { book: { tenantId: tenant.id } } }),
          db.commercialOrderPayment.count({ where: { tenantId: tenant.id } }),
          db.financeJournalEntry.count({
            where: { book: { tenantId: tenant.id } },
          }),
          db.customerLedgerEntry.count({ where: { tenantId: tenant.id } }),
          db.customerLedgerAccount.count({ where: { tenantId: tenant.id } }),
        ])
        expect(afterPending).toEqual([0, 0, 0, 0, 0, 0])
        const pendingGraph = (await readOrders()).find(
          (order) => order.id === pending.id,
        )
        if (!pendingGraph) throw Error("Missing canonical pending Order")

        progress("setup:Finance-and-nondefault-bank")
        const book = await createFinanceBook(db, {
          ...ownerScope,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        const cash = await db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: book.id, code: "1000" } },
        })
        const defaultBank = await db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: book.id, code: "1100" } },
        })
        const bank = await createFinanceMoneyAccount(db, {
          ...ownerScope,
          bookId: book.id,
          code: "1191",
          name: "QA explicitly chosen bank",
          purpose: "BANK",
          paymentMethods: ["bank_transfer"],
        })
        expect(bank.id).not.toBe(cash.id)
        expect(bank.id).not.toBe(defaultBank.id)
        const scope = {
          ...repScope,
          storeId: store.id,
          deviceId: `payment-account-matrix-device-${runId}`,
        }
        const device = await registerOwnedOfflineDevice(db, {
          ...scope,
          platform: "ANDROID",
        })
        expect(
          await getOfflineOperationsPolicy(db, { tenantId: tenant.id }),
        ).toMatchObject({ enabled: true, approvalRequired: false })
        const built = {
          ...buildOfflineOrderCommand({
            clientCommandId: `${runId}:offline-bank-part`,
            fulfillNow: true,
            lines: [
              {
                custom: "quick_sale",
                amountMinor: 2000,
                description: "Offline packed lunch sale",
              },
            ],
            payment: {
              amountMinor: 600,
              method: "bank_transfer",
              moneyAccountId: bank.id,
              clientPaymentId: `${runId}:offline-bank-part:payment`,
            },
          }),
          createdAtClient: new Date(),
        }
        if (!built.payload.initialPayment)
          throw Error("Mobile builder omitted the original payment")
        expect(built.payload.initialPayment.moneyAccountId).toBe(bank.id)
        // Actual JSON transport and strict API parsing preserve the selected ID.
        const transport = offlineReplaySchema.parse(
          JSON.parse(
            JSON.stringify({
              deviceId: scope.deviceId,
              storeId: store.id,
              commands: [built],
            }),
          ),
        )
        const offline = transport.commands[0]
        if (!offline?.payload.initialPayment)
          throw Error("Offline payment did not survive strict transport")
        expect(offline.payload.initialPayment).toEqual(
          built.payload.initialPayment,
        )
        const captured = structuredClone(offline)
        const capturedHash = offlineCommandEnvelopeHash(captured)
        const upload = () =>
          replayOfflineCommands(db, {
            ...scope,
            commands: [offline],
            acceptNewCommands: true,
            requiresApproval: false,
            capabilities: { operateOrders: true },
          })
        const snapshot = async () => {
          const where = { tenantId: tenant.id }
          const [
            orders,
            journals,
            financeCommands,
            finance,
            offlineCommands,
            ledgerEntries,
            ledgerAccounts,
            ledgerCommands,
            stockCount,
            reservationCount,
            fulfillmentCount,
            sequence,
          ] = await settledValues([
            readOrders(),
            db.financeJournalEntry.findMany({
              where: { bookId: book.id },
              include: { lines: { orderBy: { id: "asc" } } },
              orderBy: { id: "asc" },
            }),
            db.financeCommand.findMany({
              where: { bookId: book.id },
              orderBy: { id: "asc" },
            }),
            getFinanceAccountBalances(db, { ...ownerScope, bookId: book.id }),
            db.offlineCommand.findMany({ where, orderBy: { id: "asc" } }),
            db.customerLedgerEntry.findMany({ where, orderBy: { id: "asc" } }),
            db.customerLedgerAccount.findMany({
              where,
              orderBy: { id: "asc" },
            }),
            db.customerLedgerCommand.findMany({
              where,
              orderBy: { id: "asc" },
            }),
            db.stockOperation.count({ where }),
            db.stockReservation.count({ where }),
            db.productFulfillment.count({
              where: { orderLine: { order: where } },
            }),
            db.tenant.findUniqueOrThrow({
              where: { id: tenant.id },
              select: { lastCommercialOrderSequence: true },
            }),
          ])
          return {
            orders,
            journals,
            financeCommands,
            offlineCommands,
            ledgerEntries,
            ledgerAccounts,
            ledgerCommands,
            stockCount,
            reservationCount,
            fulfillmentCount,
            financeSequence: finance.snapshotSequence,
            orderSequence: sequence.lastCommercialOrderSequence,
            accountBalances: finance.accounts
              .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
              .sort((a, b) => a.id.localeCompare(b.id)),
          }
        }
        const bankBalance = (
          state: Awaited<ReturnType<typeof snapshot>>,
          id: string,
        ) => {
          const account = state.accountBalances.find(
            (account) => account.id === id,
          )
          if (!account) throw Error("Missing scoped receiving account balance")
          return BigInt(account.balanceMinor)
        }
        progress("captured:offline-before-online-sales")
        const baseline = await snapshot()
        expect(baseline.orders).toHaveLength(1)
        expect(baseline.journals).toEqual([])
        expect(baseline.financeCommands).toEqual([])
        expect(baseline.offlineCommands).toEqual([])
        expect(bankBalance(baseline, bank.id)).toBe(0n)
        expect(bankBalance(baseline, cash.id)).toBe(0n)
        expect(bankBalance(baseline, defaultBank.id)).toBe(0n)
        const fullInput = {
          ...saleInput("full-bank", 1000),
          initialPayment: {
            amountMinor: 1000,
            method: "bank_transfer" as const,
            moneyAccountId: bank.id,
            clientPaymentId: `${runId}:full-bank:payment`,
          },
        }
        const partInput = {
          ...saleInput("part-bank", 1500),
          initialPayment: {
            amountMinor: 400,
            method: "bank_transfer" as const,
            moneyAccountId: bank.id,
            clientPaymentId: `${runId}:part-bank:payment`,
          },
        }
        progress("online:paid-in-full-to-selected-bank")
        const full = await createCommercialOrder(db, fullInput)
        expect(full).toMatchObject({
          createdByUserId: rep.id,
          totalMinor: 1000,
          amountPaidMinor: 1000,
          balanceDueMinor: 0,
          paymentStatus: "PAID",
          status: "COMPLETED",
        })
        expect(full.payments).toHaveLength(1)
        expect(full.payments[0]).toMatchObject({
          amountMinor: 1000,
          moneyAccountId: bank.id,
          method: "BANK_TRANSFER",
          recordedByUserId: rep.id,
        })
        progress("online:initial-part-payment-to-selected-bank")
        const part = await createCommercialOrder(db, partInput)
        expect(part).toMatchObject({
          createdByUserId: rep.id,
          totalMinor: 1500,
          amountPaidMinor: 400,
          balanceDueMinor: 1100,
          paymentStatus: "PARTIALLY_PAID",
          status: "COMPLETED",
        })
        expect(part.payments).toHaveLength(1)
        expect(part.payments[0]).toMatchObject({
          amountMinor: 400,
          moneyAccountId: bank.id,
          method: "BANK_TRANSFER",
          recordedByUserId: rep.id,
        })
        const online = await snapshot()
        expect(online.orders).toHaveLength(3)
        // The public create DTO intentionally omits clientPaymentId. Prove the
        // exact immutable payment identities against the actual stored rows.
        expect(
          online.orders.find((order) => order.id === full.id)?.payments[0],
        ).toMatchObject({
          id: full.payments[0]?.id,
          clientPaymentId: fullInput.initialPayment.clientPaymentId,
          moneyAccountId: bank.id,
          recordedByUserId: rep.id,
          amountMinor: 1000,
        })
        expect(
          online.orders.find((order) => order.id === part.id)?.payments[0],
        ).toMatchObject({
          id: part.payments[0]?.id,
          clientPaymentId: partInput.initialPayment.clientPaymentId,
          moneyAccountId: bank.id,
          recordedByUserId: rep.id,
          amountMinor: 400,
        })
        expect(online.orders.find((order) => order.id === pending.id)).toEqual(
          pendingGraph,
        )
        expect(online.orders.flatMap((order) => order.payments)).toHaveLength(2)
        expect(
          bankBalance(online, bank.id) - bankBalance(baseline, bank.id),
        ).toBe(1400n)
        expect(bankBalance(online, cash.id)).toBe(0n)
        expect(bankBalance(online, defaultBank.id)).toBe(0n)
        progress("online:exact-retries-no-extra-effects")
        expect((await createCommercialOrder(db, fullInput)).id).toBe(full.id)
        expect((await createCommercialOrder(db, partInput)).id).toBe(part.id)
        expect((await createCommercialOrder(db, pendingInput)).id).toBe(
          pending.id,
        )
        expect(await snapshot()).toEqual(online)
        progress("offline:strict-envelope-to-original-bank")
        const replayed = await upload()
        expect(replayed).toHaveLength(1)
        expect(replayed[0]).toMatchObject({
          clientCommandId: captured.clientCommandId,
          status: "APPLIED",
          result: { id: expect.any(String) },
        })
        const after = await snapshot()
        expect(after.orders).toHaveLength(4)
        expect(after.offlineCommands).toHaveLength(1)
        expect(after.offlineCommands[0]).toMatchObject({
          clientCommandId: captured.clientCommandId,
          offlineDeviceId: device.id,
          tenantId: tenant.id,
          storeId: store.id,
          status: "APPLIED",
          payloadHash: capturedHash,
          createdAtClient: captured.createdAtClient,
          eventVersion: captured.eventVersion,
          dependencyClientIds: captured.dependencyClientIds,
          payload: JSON.parse(
            JSON.stringify({ ...captured.payload, actorUserId: rep.id }),
          ),
        })
        const savedOffline = after.orders.find(
          (order) => order.clientOrderId === captured.clientCommandId,
        )
        if (!savedOffline) throw Error("Missing canonical offline Order")
        expect(replayed[0]).toMatchObject({ result: { id: savedOffline.id } })
        expect(savedOffline).toMatchObject({
          createdByUserId: rep.id,
          totalMinor: 2000,
          amountPaidMinor: 600,
          paymentStatus: "PARTIALLY_PAID",
          status: "COMPLETED",
        })
        expect(savedOffline.totalMinor - savedOffline.amountPaidMinor).toBe(
          1400,
        )
        expect(savedOffline.payments).toHaveLength(1)
        expect(savedOffline.payments[0]).toMatchObject({
          amountMinor: 600,
          method: "BANK_TRANSFER",
          moneyAccountId: bank.id,
          recordedByUserId: rep.id,
          clientPaymentId: captured.payload.initialPayment?.clientPaymentId,
        })
        expect(
          after.orders.filter((order) => order.id !== savedOffline.id),
        ).toEqual(online.orders)
        expect(after.orders.find((order) => order.id === pending.id)).toEqual(
          pendingGraph,
        )
        expect(bankBalance(after, bank.id) - bankBalance(online, bank.id)).toBe(
          600n,
        )
        expect(bankBalance(after, bank.id)).toBe(2000n)
        expect(bankBalance(after, cash.id)).toBe(0n)
        expect(bankBalance(after, defaultBank.id)).toBe(0n)
        const payments = after.orders.flatMap((order) => order.payments)
        expect(payments).toHaveLength(3)
        expect(
          new Set(payments.map((payment) => payment.clientPaymentId)).size,
        ).toBe(3)
        expect(
          payments.every(
            (payment) =>
              payment.moneyAccountId === bank.id &&
              payment.recordedByUserId === rep.id,
          ),
        ).toBe(true)
        expect(
          after.orders.reduce(
            (sum, order) => sum + order.totalMinor - order.amountPaidMinor,
            0,
          ),
        ).toBe(3300)
        // Unbilled Order collections use the canonical collection journal. They
        // do not fabricate receivable/customer-ledger entries or manual Money in.
        expect(after.journals).toHaveLength(3)
        expect(after.financeCommands).toHaveLength(3)
        expect(
          after.journals.every(
            (journal) => journal.sourceKind === "COMMERCIAL_ORDER_COLLECTION",
          ),
        ).toBe(true)
        expect(
          after.journals.map((journal) => journal.sourceId).sort(),
        ).toEqual(payments.map((payment) => payment.id).sort())
        for (const payment of payments) {
          const journal = after.journals.find(
            (journal) => journal.sourceId === payment.id,
          )
          if (!journal) throw Error("Missing canonical collection journal")
          expect(journal).toMatchObject({
            actorUserId: rep.id,
            storeId: store.id,
          })
          expect(journal.lines).toHaveLength(2)
          expect(
            journal.lines.find((line) => line.accountId === bank.id),
          ).toMatchObject({
            debitMinor: BigInt(payment.amountMinor),
            creditMinor: 0n,
          })
          expect(
            journal.lines.reduce((sum, line) => sum + line.debitMinor, 0n),
          ).toBe(BigInt(payment.amountMinor))
          expect(
            journal.lines.reduce((sum, line) => sum + line.creditMinor, 0n),
          ).toBe(BigInt(payment.amountMinor))
        }
        expect(after.ledgerEntries).toEqual([])
        expect(after.ledgerAccounts).toEqual([])
        expect(after.ledgerCommands).toEqual([])
        expect([
          after.stockCount,
          after.reservationCount,
          after.fulfillmentCount,
        ]).toEqual([0, 0, 0])
        for (const order of after.orders) {
          expect(order.lines).toHaveLength(1)
          expect(order.lines[0]?.snapshot).toMatchObject({
            customLineRole: "QUICK_SALE",
          })
          expect(order.lines[0]?.serviceFulfillment).toMatchObject({
            actorUserId: rep.id,
            orderId: order.id,
          })
        }
        expect(offline).toEqual(captured)
        expect(offlineCommandEnvelopeHash(offline)).toBe(capturedHash)
        progress("offline:second-sync-exactly-once")
        expect(await upload()).toEqual(replayed)
        expect(await snapshot()).toEqual(after)
        expect(offline).toEqual(captured)
        expect(offlineCommandEnvelopeHash(offline)).toBe(capturedHash)
        progress("scenario:complete")
      } catch (error) {
        failures.push(error)
        console.error(
          `[payment-account-matrix QA ${runId}] scenario failure before cleanup`,
          error,
        )
      } finally {
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
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1)
        throw new AggregateError(
          failures,
          `Payment account matrix QA ${runId}: scenario/disposal failures (original first)`,
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
      `[payment-account-matrix QA ${runId}] cleanup skipped: no fixture writes attempted`,
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
    throw Error(`Payment account matrix QA ${runId}: cleanup User proof failed`)
  if (
    tenant &&
    (tenant.slug !== `payment-account-matrix-${runId}` ||
      tenant.dataClassification !== "QA")
  )
    throw Error(
      `Payment account matrix QA ${runId}: cleanup Tenant proof failed`,
    )
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
      console.info(`[payment-account-matrix QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          // Re-prove exact QA identity and hold its row in EVERY disposal
          // transaction; a prior successful group grants no later authority.
          const owned = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId}
              AND "slug"=${`payment-account-matrix-${runId}`} AND "dataClassification"='QA'
            FOR UPDATE
          `
          if (owned.length !== 1)
            throw Error(
              `Payment account matrix QA ${runId}: cleanup Tenant proof failed`,
            )
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(
          `Payment account matrix QA ${runId}: cleanup group ${label} failed`,
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
      // Expected empty for these Quick sales; remove any unexpected owned
      // costing before its stock provenance without touching another Tenant.
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
      throw Error(
        `Payment account matrix QA ${runId}: cleanup User proof failed`,
      )
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error(
        `Payment account matrix QA ${runId}: foreign membership prevents User disposal`,
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
        ]
      : []),
  ])
  if (residual.some((count) => count !== 0))
    throw Error(`Payment account matrix QA ${runId}: cleanup left owned rows`)
  console.info(`[payment-account-matrix QA ${runId}] cleanup zero owned rows`)
  return true
}
