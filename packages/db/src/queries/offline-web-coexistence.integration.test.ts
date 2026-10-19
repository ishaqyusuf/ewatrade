import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { createSimpleCatalogItem } from "./catalog"
import { createCommercialOrder } from "./commercial-orders"
import { createFinanceBook } from "./finance/accounts"
import { getFinanceAccountBalances } from "./finance/reads"
import {
  type OfflineCommandEnvelope,
  offlineCommandEnvelopeHash,
  replayOfflineCommands,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import { getOfflineOperationsPolicy } from "./offline-settings"

// Backend command proof only: no phone queue, connectivity, HTTP or web UI is
// simulated. M is captured before W; its ordinary replay happens only after W.
const requestedRunId = process.env.QA_OFFLINE_WEB_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_OFFLINE_WEB_RUN_ID must be a UUID")
const transactionOptions = { maxWait: 10000, timeout: 30000 }
const slugFor = (runId: string) => `offline-web-${runId}`
const emailFor = (role: string, runId: string) =>
  `offline-web-${role}-${runId}@example.invalid`

// Promise.all can reject while sibling reads are still using the client. Every
// dispatched read must settle before failure starts cleanup or disconnect.
async function settledValues<T extends readonly unknown[]>(
  tasks: {
    [K in keyof T]: Promise<T[K]>
  },
): Promise<T> {
  const results = await Promise.allSettled(tasks)
  const failures = results.filter((result) => result.status === "rejected")
  if (failures.length === 1) throw failures[0]?.reason
  if (failures.length > 1)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Owned QA reads failed",
    )
  return results.map((result) => {
    if (result.status !== "fulfilled") throw Error("Unsettled QA read")
    return result.value
  }) as unknown as T
}

describeWithQaAccessDatabase("ordinary offline/web Product coexistence", () => {
  test("web part-payment and later ordinary offline replay preserve both exact Product sales once", async () => {
    assertQaAccessAcceptanceDatabase()
    const runId = requestedRunId ?? randomUUID()
    const started = Date.now()
    const progress = (stage: string) => {
      console.info(
        `[offline-web QA ${runId}] ${stage} ${Date.now() - started}ms`,
      )
      // Leave three minutes for awaited exact cleanup; never abandon a DB promise.
      if (Date.now() - started > 720000)
        throw Error("Offline/web scenario deadline")
    }
    progress("setup:start")
    const { prisma: db } = await import("../client")
    const userIds: string[] = []
    let tenantId: string | undefined
    const failures: unknown[] = []
    try {
      const users = []
      for (const role of ["owner", "rep"]) {
        progress(`setup:user-${role}`)
        const id = randomUUID()
        // Retain our chosen identity even if a remote create loses its response.
        userIds.push(id)
        users.push(
          await db.user.create({
            data: {
              id,
              name: `Offline web QA ${role}`,
              email: emailFor(role, runId),
              ageBand: "ADULT",
              ageDeclaredAt: new Date(),
            },
          }),
        )
      }
      const [owner, rep] = users
      if (!owner || !rep) throw Error("Missing owned QA identities")
      tenantId = randomUUID()
      progress("setup:Tenant")
      const tenant = await db.tenant.create({
        data: {
          id: tenantId,
          name: "Offline web coexistence QA",
          slug: slugFor(runId),
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          // Keep the current default offline policy: enabled with approval off.
          metadata: {
            retailOps: { subscription: { planId: "growth", status: "active" } },
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
          name: "Offline web original Store",
          slug: "original",
          status: "ACTIVE",
        },
      })
      const actor = { actorUserId: owner.id, tenantId: tenant.id }
      const product = async (label: string, priceMinor: number) => {
        progress(`setup:Product-${label}`)
        const item = await createSimpleCatalogItem(db, {
          ...actor,
          storeId: store.id,
          kind: "product",
          name: `Offline web ${label}`,
          canonicalUnitName: "piece",
          openingStockQuantity: "10",
          priceMinor,
          clientOperationId: `${runId}:Product:${label}`,
        })
        const offering = item.variants[0]?.offerings[0]
        const balance = item.product?.stockBalances[0]
        const configuration = item.product?.currentUnitConfiguration
        if (!offering || !balance || !configuration)
          throw Error("Product omitted canonical inventory proof")
        return { offering, balance, configuration }
      }
      const mobileProduct = await product("M", 500)
      const webProduct = await product("W", 750)
      progress("setup:Finance")
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      const cash = await db.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId: book.id, code: "1000" } },
      })
      const scope = {
        actorUserId: rep.id,
        tenantId: tenant.id,
        storeId: store.id,
        deviceId: `offline-web-device-${runId}`,
      }
      const device = await registerOwnedOfflineDevice(db, {
        ...scope,
        platform: "ANDROID",
      })
      const policy = await getOfflineOperationsPolicy(db, {
        tenantId: tenant.id,
      })
      expect(policy).toMatchObject({ enabled: true, approvalRequired: false })
      const lineFor = (item: typeof mobileProduct, price: number) => ({
        offeringId: item.offering.id,
        quantity: "1",
        expectedBalanceRevision: item.balance.revision,
        expectedConfigurationVersionId: item.configuration.id,
        expectedFixedPriceMinor: price,
      })
      // Capture immutable M before the subsequent web command. No backend effect
      // or server OfflineCommand exists until upload() below is explicitly called.
      const mobile: OfflineCommandEnvelope = {
        clientCommandId: `${runId}:M`,
        createdAtClient: new Date(),
        dependencyClientIds: [],
        eventVersion: 1,
        payload: {
          kind: "commercial_order",
          fulfillNow: true,
          lines: [lineFor(mobileProduct, 500)],
          initialPayment: {
            amountMinor: 500,
            clientPaymentId: `${runId}:M:payment`,
            method: "cash",
            moneyAccountId: cash.id,
          },
        },
      }
      const original = structuredClone(mobile)
      const mobileHash = offlineCommandEnvelopeHash(mobile)
      const upload = () =>
        replayOfflineCommands(db, {
          ...scope,
          acceptNewCommands: true,
          requiresApproval: false,
          capabilities: { operateOrders: true },
          commands: [mobile],
        })
      const graph = {
        payments: { orderBy: { id: "asc" as const } },
        lines: {
          orderBy: { id: "asc" as const },
          include: {
            snapshot: true,
            stockReservation: true,
            productFulfillments: {
              include: {
                stockOperation: {
                  include: { movements: { orderBy: { id: "asc" as const } } },
                },
              },
            },
          },
        },
      } satisfies Prisma.CommercialOrderInclude
      const snapshot = async () => {
        const [
          orders,
          balances,
          operations,
          issues,
          journals,
          commands,
          finance,
          tenantState,
        ] = await settledValues([
          db.commercialOrder.findMany({
            where: { tenantId: tenant.id },
            include: graph,
            orderBy: { clientOrderId: "asc" },
          }),
          db.stockBalanceSource.findMany({
            where: { tenantId: tenant.id },
            select: {
              id: true,
              onHandQuantity: true,
              reservedQuantity: true,
              revision: true,
            },
            orderBy: { id: "asc" },
          }),
          db.stockOperation.findMany({
            where: { tenantId: tenant.id, type: "SALE_FULFILLMENT" },
            orderBy: { id: "asc" },
          }),
          db.financeInventoryValuationEvent.findMany({
            where: { tenantId: tenant.id, kind: "ISSUE" },
            orderBy: { id: "asc" },
          }),
          db.financeJournalEntry.findMany({
            where: { bookId: book.id },
            include: { lines: { orderBy: { id: "asc" } } },
            orderBy: { id: "asc" },
          }),
          db.offlineCommand.findMany({
            where: { tenantId: tenant.id },
            orderBy: { id: "asc" },
          }),
          getFinanceAccountBalances(db, { ...actor, bookId: book.id }),
          db.tenant.findUniqueOrThrow({
            where: { id: tenant.id },
            select: { lastCommercialOrderSequence: true },
          }),
        ])
        return {
          orders,
          balances,
          operations,
          issues,
          journals,
          commands,
          accountBalances: finance.accounts
            .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
            .sort((a, b) => a.id.localeCompare(b.id)),
          financeSequence: finance.snapshotSequence,
          orderSequence: tenantState.lastCommercialOrderSequence,
        }
      }
      const cashBalance = (state: Awaited<ReturnType<typeof snapshot>>) => {
        const account = state.accountBalances.find(({ id }) => id === cash.id)
        if (!account) throw Error("Missing owned cash balance")
        return BigInt(account.balanceMinor)
      }
      const stockBalance = (
        state: Awaited<ReturnType<typeof snapshot>>,
        id: string,
      ) => {
        const balance = state.balances.find((value) => value.id === id)
        if (!balance) throw Error("Missing owned stock balance")
        return {
          onHand: balance.onHandQuantity.toFixed(),
          reserved: balance.reservedQuantity.toFixed(),
        }
      }
      progress("M-captured:before-web")
      const before = await snapshot()
      expect(before.orders).toHaveLength(0)
      expect(before.commands).toHaveLength(0)
      expect(before.operations).toHaveLength(0)
      expect(before.issues).toHaveLength(0)
      expect(stockBalance(before, mobileProduct.balance.id)).toEqual({
        onHand: "10",
        reserved: "0",
      })
      expect(stockBalance(before, webProduct.balance.id)).toEqual({
        onHand: "10",
        reserved: "0",
      })

      progress("web-part-payment:create")
      const web = await createCommercialOrder(db, {
        ...actor,
        storeId: store.id,
        schemaVersion: 1,
        clientOrderId: `${runId}:W`,
        fulfillNow: true,
        lines: [lineFor(webProduct, 750)],
        initialPayment: {
          amountMinor: 250,
          clientPaymentId: `${runId}:W:payment`,
          method: "cash",
          moneyAccountId: cash.id,
        },
      })
      const afterWeb = await snapshot()
      expect(afterWeb.orders).toHaveLength(1)
      expect(afterWeb.orders[0]?.id).toBe(web.id)
      const webBefore = afterWeb.orders[0]
      if (!webBefore) throw Error("Missing authoritative W graph")
      expect(webBefore).toMatchObject({
        createdByUserId: owner.id,
        totalMinor: 750,
        amountPaidMinor: 250,
        paymentStatus: "PARTIALLY_PAID",
        status: "COMPLETED",
      })
      expect(webBefore.payments).toHaveLength(1)
      expect(webBefore.payments[0]).toMatchObject({
        amountMinor: 250,
        moneyAccountId: cash.id,
        recordedByUserId: owner.id,
        clientPaymentId: `${runId}:W:payment`,
      })
      expect(afterWeb.commands).toHaveLength(0)
      expect(afterWeb.operations).toHaveLength(1)
      expect(afterWeb.issues).toHaveLength(1)
      expect(cashBalance(afterWeb) - cashBalance(before)).toBe(250n)
      expect(stockBalance(afterWeb, mobileProduct.balance.id)).toEqual({
        onHand: "10",
        reserved: "0",
      })
      expect(stockBalance(afterWeb, webProduct.balance.id)).toEqual({
        onHand: "9",
        reserved: "0",
      })
      expect(mobile).toEqual(original)
      expect(offlineCommandEnvelopeHash(mobile)).toBe(mobileHash)

      progress("ordinary-M:replay-after-web")
      const replayed = await upload()
      expect(replayed).toHaveLength(1)
      expect(replayed[0]).toMatchObject({
        clientCommandId: mobile.clientCommandId,
        status: "APPLIED",
        result: { id: expect.any(String) },
      })
      const after = await snapshot()
      expect(after.orders).toHaveLength(2)
      expect(after.orders.flatMap((order) => order.payments)).toHaveLength(2)
      expect(
        new Set(
          after.orders.flatMap((order) =>
            order.payments.map((payment) => payment.clientPaymentId),
          ),
        ).size,
      ).toBe(2)
      expect(after.commands).toHaveLength(1)
      expect(after.commands[0]).toMatchObject({
        clientCommandId: mobile.clientCommandId,
        status: "APPLIED",
        payloadHash: mobileHash,
        offlineDeviceId: device.id,
        storeId: store.id,
        payload: {
          actorUserId: rep.id,
          initialPayment: mobile.payload.initialPayment,
        },
      })
      expect(after.orders.find((order) => order.id === web.id)).toEqual(
        webBefore,
      )
      const savedMobile = after.orders.find(
        (order) => order.clientOrderId === mobile.clientCommandId,
      )
      if (!savedMobile) throw Error("Missing authoritative M graph")
      expect(savedMobile).toMatchObject({
        createdByUserId: rep.id,
        totalMinor: 500,
        amountPaidMinor: 500,
        paymentStatus: "PAID",
        status: "COMPLETED",
      })
      expect(savedMobile.payments).toHaveLength(1)
      expect(savedMobile.payments[0]).toMatchObject({
        amountMinor: 500,
        moneyAccountId: cash.id,
        recordedByUserId: rep.id,
        clientPaymentId: `${runId}:M:payment`,
      })
      expect(cashBalance(after) - cashBalance(before)).toBe(750n)
      expect(cashBalance(after) - cashBalance(afterWeb)).toBe(500n)
      expect(after.operations).toHaveLength(2)
      expect(after.issues).toHaveLength(2)
      for (const [order, item, authorId] of [
        [savedMobile, mobileProduct, rep.id],
        [webBefore, webProduct, owner.id],
      ] as const) {
        expect(order.lines).toHaveLength(1)
        const line = order.lines[0]
        expect(line?.stockReservation).toMatchObject({
          status: "COMMITTED",
          offeringId: item.offering.id,
        })
        expect(line?.productFulfillments).toHaveLength(1)
        const fulfillment = line?.productFulfillments[0]
        expect(fulfillment?.quantity.toFixed()).toBe("1")
        expect(fulfillment?.stockOperation).toMatchObject({
          type: "SALE_FULFILLMENT",
          source: "commercial_order",
          actorUserId: authorId,
          storeId: store.id,
        })
        expect(fulfillment?.stockOperation.movements).toHaveLength(1)
        expect(
          fulfillment?.stockOperation.movements[0]?.signedCanonicalEffect.toFixed(),
        ).toBe("-1")
        expect(
          after.issues.filter(
            (issue) =>
              issue.sourceKind === "PRODUCT_FULFILLMENT" &&
              issue.sourceId === fulfillment?.id,
          ),
        ).toHaveLength(1)
        expect(stockBalance(after, item.balance.id)).toEqual({
          onHand: "9",
          reserved: "0",
        })
        const payment = order.payments[0]
        const collection = after.journals.filter(
          (journal) =>
            journal.sourceKind === "COMMERCIAL_ORDER_COLLECTION" &&
            journal.sourceId === payment?.id,
        )
        expect(collection).toHaveLength(1)
        const cashLines =
          collection[0]?.lines.filter((entry) => entry.accountId === cash.id) ??
          []
        expect(
          cashLines.reduce(
            (total, entry) => total + entry.debitMinor - entry.creditMinor,
            0n,
          ),
        ).toBe(BigInt(payment?.amountMinor ?? -1))
      }
      expect(
        after.journals.filter(
          (journal) => journal.sourceKind === "COMMERCIAL_ORDER_COLLECTION",
        ),
      ).toHaveLength(2)
      expect(mobile).toEqual(original)
      expect(offlineCommandEnvelopeHash(mobile)).toBe(mobileHash)
      progress("ordinary-M:second-sync")
      expect((await upload())[0]?.status).toBe("APPLIED")
      expect(await snapshot()).toEqual(after)
      expect(mobile).toEqual(original)
      expect(offlineCommandEnvelopeHash(mobile)).toBe(mobileHash)
      expect(
        await db.membership.findUniqueOrThrow({
          where: { tenantId_userId: { tenantId: tenant.id, userId: rep.id } },
          select: { status: true, role: true, staffAccessMode: true },
        }),
      ).toEqual({
        status: "ACTIVE",
        role: "CASHIER",
        staffAccessMode: "LEGACY",
      })
      progress("scenario:complete")
    } catch (error) {
      failures.push(error)
      console.error(
        `[offline-web QA ${runId}] scenario failed before cleanup`,
        error,
      )
    } finally {
      try {
        await dispose(db, runId, tenantId, userIds)
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
        `Offline web QA ${runId}: original and cleanup failures`,
      )
  }, 900000)
})

/** Twelve small, separately re-authorized exact-Tenant disposal transactions. */
async function dispose(
  db: PrismaClient,
  runId: string,
  tenantId: string | undefined,
  userIds: string[],
) {
  assertQaAccessAcceptanceDatabase()
  const emails = ["owner", "rep"].map((role) => emailFor(role, runId))
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  })
  if (users.some((user) => !emails.includes(user.email)))
    throw Error(`Offline web QA ${runId}: User proof failed`)
  const tenant = tenantId
    ? await db.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true, dataClassification: true },
      })
    : null
  if (
    tenant &&
    (tenant.slug !== slugFor(runId) || tenant.dataClassification !== "QA")
  )
    throw Error(`Offline web QA ${runId}: Tenant proof failed`)
  if (tenant && tenantId) {
    const ownedTenantId = tenantId
    const where = { tenantId: ownedTenantId }
    const group = async (
      label: string,
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ) => {
      assertQaAccessAcceptanceDatabase()
      console.info(`[offline-web QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          const owned = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId} AND "slug"=${slugFor(runId)} AND "dataClassification"='QA' FOR UPDATE`
          if (owned.length !== 1)
            throw Error("Exact QA Tenant disposal proof failed")
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(`Offline web QA ${runId}: cleanup ${label} failed`, {
          cause: error,
        })
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
      await tx.financeInventoryValuationEvent.deleteMany({ where })
      await tx.financeInventoryPool.deleteMany({ where })
    })
    await group("catalog-receipts-and-movements", async (tx) => {
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
      await tx.tenant.delete({ where: { id: ownedTenantId } })
    })
  }
  await db.$transaction(async (tx) => {
    const owned = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "User" WHERE "id"=ANY(${userIds}::text[]) AND "email"=ANY(${emails}::text[]) FOR UPDATE`
    if (owned.length !== users.length)
      throw Error("Exact QA User disposal proof failed")
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error("Foreign membership prevents QA User disposal")
    await tx.user.deleteMany({
      where: { id: { in: userIds }, email: { in: emails } },
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
        ]
      : []),
  ])
  if (residual.some((count) => count !== 0))
    throw Error(`Offline web QA ${runId}: cleanup left owned rows`)
  console.info(`[offline-web QA ${runId}] cleanup:complete zero-owned-rows`)
}
