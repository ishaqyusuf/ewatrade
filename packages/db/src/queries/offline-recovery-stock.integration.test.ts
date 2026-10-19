import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { createSimpleCatalogItem } from "./catalog"
import { createCommercialOrder } from "./commercial-orders"
import {
  createFinanceBook,
  updateFinanceMoneyAccountPayments,
} from "./finance/accounts"
import { getFinanceAccountBalances } from "./finance/reads"
import {
  type OfflineCommandEnvelope,
  offlineCommandEnvelopeHash,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import {
  decideSuspendedOfflineCommand,
  recoverSuspendedOfflineCommands,
} from "./offline-recovery"
const requestedRunId = process.env.QA_OFFLINE_RECOVERY_STOCK_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw new Error("QA_OFFLINE_RECOVERY_STOCK_RUN_ID must be a UUID.")
// Isolated QA disposal: every transaction re-proves exact run ownership.
const transactionOptions = { maxWait: 10000, timeout: 30000 }
async function dispose(
  db: PrismaClient,
  runId: string,
  tenantId: string | undefined,
  userIds: string[],
) {
  if (userIds.length === 0 && tenantId === undefined) {
    console.info(
      `[offline-recovery-stock QA ${runId}] cleanup skipped: no created fixture IDs observed`,
    )
    return false
  }
  assertQaAccessAcceptanceDatabase()
  const emails = ["owner", "rep"].map(
    (role) => `offline-recovery-stock-${role}-${runId}@example.invalid`,
  )
  if (
    (await db.user.count({
      where: { id: { in: userIds }, email: { in: emails } },
    })) !== userIds.length
  )
    throw Error(`Recovery stock QA ${runId}: cleanup User proof failed`)
  if (tenantId) {
    const ownedTenantId = tenantId
    const where = { tenantId }
    const group = async (
      label: string,
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ) => {
      assertQaAccessAcceptanceDatabase()
      console.info(`[offline-recovery-stock QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          // Re-prove exact QA identity and hold its row in EVERY disposal
          // transaction; a prior successful group grants no later authority.
          const owned = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId}
              AND "slug"=${`offline-recovery-stock-${runId}`} AND "dataClassification"='QA'
            FOR UPDATE
          `
          if (owned.length !== 1)
            throw Error(
              `Recovery stock QA ${runId}: cleanup Tenant proof failed`,
            )
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(
          `Recovery stock QA ${runId}: cleanup group ${label} failed`,
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
      // Dispose exact owned valuation rows even after a failed assertion.
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
    const owned = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User" WHERE "id"=ANY(${userIds}::text[])
        AND "email"=ANY(${emails}::text[]) FOR UPDATE
    `
    if (owned.length !== userIds.length)
      throw Error(`Recovery stock QA ${runId}: cleanup User proof failed`)
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error(
        `Recovery stock QA ${runId}: foreign membership prevents User disposal`,
      )
    await tx.user.deleteMany({
      where: { id: { in: userIds }, email: { in: emails } },
    })
  }, transactionOptions)
  const residual = await Promise.all([
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
        ]
      : []),
  ])
  if (residual.some((count) => count !== 0))
    throw Error(`Recovery stock QA ${runId}: cleanup left owned rows`)
  console.info(`[offline-recovery-stock QA ${runId}] cleanup zero owned rows`)
  return true
}

describeWithQaAccessDatabase(
  "suspended recovery Product stock integration",
  () => {
    test("web stock changes conflict exactly; approved Product recovery commits one reservation, fulfillment and payment", async () => {
      assertQaAccessAcceptanceDatabase()
      const runId = requestedRunId ?? randomUUID()
      const started = Date.now()
      const stage = (label: string) => {
        console.info(
          `[offline-recovery-stock QA ${runId}] ${label} ${Date.now() - started}ms`,
        )
        // Reserve the final three minutes of the 15-minute test for awaited
        // cleanup. No Promise.race abandons an in-flight database operation.
        if (Date.now() - started > 720000)
          throw new Error(
            `Recovery stock QA ${runId}: scenario deadline reached`,
          )
      }
      stage("setup:start")
      const { prisma } = await import("../client")
      const db = prisma
      const userIds: string[] = []
      let tenantId: string | undefined
      const failures: unknown[] = []
      try {
        const users = []
        for (const role of ["owner", "rep"]) {
          const user = await db.user.create({
            data: {
              name: `Recovery stock QA ${role}`,
              email: `offline-recovery-stock-${role}-${runId}@example.invalid`,
              ageBand: "ADULT",
              ageDeclaredAt: new Date(),
            },
          })
          userIds.push(user.id)
          users.push(user)
        }
        const [owner, rep] = users
        if (!owner || !rep)
          throw new Error("Missing recovery stock QA identities")
        const tenant = await db.tenant.create({
          data: {
            name: "Recovery stock QA",
            slug: `offline-recovery-stock-${runId}`,
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
                },
              ],
            },
          },
        })
        tenantId = tenant.id
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Recovery stock original Store",
            slug: "original",
            status: "ACTIVE",
          },
        })
        const actor = { actorUserId: owner.id, tenantId: tenant.id }
        const stock = async (label: string) => {
          const item = await createSimpleCatalogItem(db, {
            ...actor,
            storeId: store.id,
            kind: "product",
            name: `Recovery ${label} Product`,
            canonicalUnitName: "piece",
            openingStockQuantity: "10",
            priceMinor: 500,
            clientOperationId: `${runId}:product:${label}`,
          })
          const offering = item.variants[0]?.offerings[0]
          const balance = item.product?.stockBalances[0]
          const configuration = item.product?.currentUnitConfiguration
          if (!offering || !balance || !configuration)
            throw new Error("Canonical Product setup omitted inventory proof")
          expect(offering.kind).toBe("product_unit")
          return { offering, balance, configuration }
        }
        const changed = await stock("web-changed")
        const unchanged = await stock("unchanged")
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        const cash = await db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: book.id, code: "1000" } },
        })
        const session = await db.session.create({
          data: {
            userId: rep.id,
            token: `recovery-stock-real-session-${runId}`,
            expiresAt: new Date(Date.now() + 3600000),
          },
        })
        const scope = {
          tenantId: tenant.id,
          storeId: store.id,
          actorUserId: rep.id,
          deviceId: `recovery-stock-device-${runId}`,
        }
        const device = await registerOwnedOfflineDevice(db, {
          ...scope,
          platform: "ANDROID",
        })
        const draft = (
          label: string,
          product: typeof changed,
        ): OfflineCommandEnvelope => ({
          clientCommandId: `${runId}:${label}`,
          createdAtClient: new Date(),
          dependencyClientIds: [],
          eventVersion: 1,
          payload: {
            kind: "commercial_order",
            fulfillNow: true,
            lines: [
              {
                offeringId: product.offering.id,
                quantity: "2",
                expectedBalanceRevision: product.balance.revision,
                expectedConfigurationVersionId: product.configuration.id,
                expectedFixedPriceMinor: 500,
              },
            ],
            initialPayment: {
              amountMinor: 1000,
              clientPaymentId: `${runId}:${label}:payment`,
              method: "cash",
              moneyAccountId: cash.id,
            },
          },
        })
        const staleDraft = draft("stale-stock", changed)
        const eligibleDraft = draft("eligible-stock", unchanged)
        const hashes = [staleDraft, eligibleDraft].map(
          offlineCommandEnvelopeHash,
        )
        const member = await db.membership.findUniqueOrThrow({
          where: { tenantId_userId: { tenantId: tenant.id, userId: rep.id } },
        })
        const lifecycle = await db.$transaction(
          async (tx) => {
            await tx.membership.update({
              where: { id: member.id },
              data: {
                status: "SUSPENDED",
                staffAccessRevision: { increment: 1 },
              },
            })
            return tx.retailOpsStaffLifecycleEvent.create({
              data: {
                tenantId: tenant.id,
                membershipId: member.id,
                staffUserId: rep.id,
                actorUserId: owner.id,
                type: "SUSPENDED",
                fromStatus: "ACTIVE",
                toStatus: "SUSPENDED",
                fromRole: "CASHIER",
                toRole: "CASHIER",
                reason: "Isolated Product recovery acceptance",
              },
            })
          },
          { maxWait: 10000, timeout: 30000 },
        )
        expect(device.registeredAt.getTime()).toBeLessThanOrEqual(
          lifecycle.happenedAt.getTime(),
        )
        const command = (envelope: OfflineCommandEnvelope) =>
          db.offlineCommand.findUniqueOrThrow({
            where: {
              tenantId_clientCommandId: {
                tenantId: tenant.id,
                clientCommandId: envelope.clientCommandId,
              },
            },
          })
        const upload = (commands: OfflineCommandEnvelope[]) =>
          recoverSuspendedOfflineCommands(db, {
            ...scope,
            sessionId: session.id,
            commands,
          })
        const approve = async (envelope: OfflineCommandEnvelope) =>
          decideSuspendedOfflineCommand(db, {
            ...actor,
            commandId: (await command(envelope)).id,
            decision: "approve",
            envelope,
            reason: "QA exact original Product approval",
          })
        const snapshot = async () => {
          const where = { tenantId: tenant.id }
          const [
            orders,
            lines,
            payments,
            reservations,
            fulfillments,
            operations,
            movements,
            journals,
            journalLines,
            inventoryEvents,
            balances,
            orderSequence,
            finance,
          ] = await Promise.all([
            db.commercialOrder.count({ where }),
            db.commercialOrderLine.count({ where: { order: where } }),
            db.commercialOrderPayment.count({ where }),
            db.stockReservation.count({ where }),
            db.productFulfillment.count({
              where: { orderLine: { order: where } },
            }),
            db.stockOperation.count({ where }),
            db.stockMovement.count({ where: { operation: where } }),
            db.financeJournalEntry.count({ where: { bookId: book.id } }),
            db.financeJournalLine.count({ where: { bookId: book.id } }),
            db.financeInventoryValuationEvent.count({ where }),
            db.stockBalanceSource.findMany({
              where,
              select: {
                id: true,
                revision: true,
                onHandQuantity: true,
                reservedQuantity: true,
              },
              orderBy: { id: "asc" },
            }),
            db.tenant.findUniqueOrThrow({
              where: { id: tenant.id },
              select: { lastCommercialOrderSequence: true },
            }),
            getFinanceAccountBalances(db, { ...actor, bookId: book.id }),
          ])
          return {
            orders,
            lines,
            payments,
            reservations,
            fulfillments,
            operations,
            movements,
            journals,
            journalLines,
            inventoryEvents,
            balances: balances.map((balance) => ({
              ...balance,
              onHandQuantity: balance.onHandQuantity.toFixed(),
              reservedQuantity: balance.reservedQuantity.toFixed(),
            })),
            orderSequence: orderSequence.lastCommercialOrderSequence,
            accountBalances: finance.accounts
              .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
              .sort((a, b) => a.id.localeCompare(b.id)),
            financeSequence: finance.snapshotSequence,
          }
        }
        stage("staging:start")
        const beforeStage = await snapshot()
        expect(await upload([staleDraft, eligibleDraft])).toEqual([
          { clientCommandId: staleDraft.clientCommandId, status: "held" },
          { clientCommandId: eligibleDraft.clientCommandId, status: "held" },
        ])
        expect(await snapshot()).toEqual(beforeStage)
        const webBaseline = await (async () => {
          stage("web-stock-change:start")
          const web = await createCommercialOrder(db, {
            ...actor,
            storeId: store.id,
            clientOrderId: `${runId}:web`,
            schemaVersion: 1,
            fulfillNow: true,
            lines: [
              {
                offeringId: changed.offering.id,
                quantity: "1",
                expectedBalanceRevision: changed.balance.revision,
                expectedConfigurationVersionId: changed.configuration.id,
                expectedFixedPriceMinor: 500,
              },
            ],
            initialPayment: {
              amountMinor: 500,
              method: "cash",
              clientPaymentId: `${runId}:web:payment`,
              moneyAccountId: cash.id,
            },
          })
          const webBefore = await db.commercialOrder.findUniqueOrThrow({
            where: { id: web.id },
            include: {
              lines: {
                include: {
                  productFulfillments: true,
                  stockReservation: true,
                },
              },
              payments: true,
            },
          })
          const afterWeb = await snapshot()
          expect(afterWeb.orders).toBe(1)
          expect(afterWeb.fulfillments).toBe(1)
          expect(
            afterWeb.balances.find((entry) => entry.id === changed.balance.id),
          ).toMatchObject({ onHandQuantity: "9", reservedQuantity: "0" })
          expect(
            afterWeb.balances.find((entry) => entry.id === changed.balance.id)
              ?.revision,
          ).toBeGreaterThan(changed.balance.revision)
          return { web, webBefore, afterWeb }
        })()
        const afterWeb = webBaseline.afterWeb
        stage("stale-approval-rollback:start")
        expect((await approve(staleDraft)).status).toBe("held")
        expect(await snapshot()).toEqual(afterWeb)
        const stale = await command(staleDraft)
        expect(stale).toMatchObject({
          status: "REVIEW_REQUIRED",
          conflictCode: "BALANCE_REVISION_CHANGED",
          result: null,
          payloadHash: hashes[0],
        })
        expect(
          await db.commercialOrder.count({
            where: {
              tenantId: tenant.id,
              clientOrderId: staleDraft.clientCommandId,
            },
          }),
        ).toBe(0)
        expect(
          await db.stockReservation.count({
            where: {
              tenantId: tenant.id,
              clientReservationId: {
                startsWith: `${staleDraft.clientCommandId}:line:`,
              },
            },
          }),
        ).toBe(0)
        stage("payment-denial-reservation-rollback:start")
        await updateFinanceMoneyAccountPayments(db, {
          ...actor,
          bookId: book.id,
          accountId: cash.id,
          paymentMethods: ["cash"],
          availableForPayments: false,
        })
        expect((await approve(eligibleDraft)).status).toBe("held")
        expect(await snapshot()).toEqual(afterWeb)
        expect(await command(eligibleDraft)).toMatchObject({
          status: "REVIEW_REQUIRED",
          conflictCode: "INVALID_COMMAND",
          result: null,
          payloadHash: hashes[1],
        })
        expect(
          await db.stockReservation.count({
            where: {
              tenantId: tenant.id,
              clientReservationId: {
                startsWith: `${eligibleDraft.clientCommandId}:line:`,
              },
            },
          }),
        ).toBe(0)
        await updateFinanceMoneyAccountPayments(db, {
          ...actor,
          bookId: book.id,
          accountId: cash.id,
          paymentMethods: ["cash"],
          availableForPayments: true,
        })
        stage("exact-product-approval:start")
        expect((await approve(eligibleDraft)).status).toBe("approved")
        const applied = await command(eligibleDraft)
        expect(applied).toMatchObject({
          status: "APPLIED",
          reviewedByUserId: owner.id,
          offlineDeviceId: device.id,
          storeId: store.id,
          payloadHash: hashes[1],
        })
        expect(applied.payload).toMatchObject({
          actorUserId: rep.id,
          initialPayment: eligibleDraft.payload.initialPayment,
          lines: eligibleDraft.payload.lines,
        })
        const recovered = await db.commercialOrder.findUniqueOrThrow({
          where: {
            tenantId_clientOrderId: {
              tenantId: tenant.id,
              clientOrderId: eligibleDraft.clientCommandId,
            },
          },
          include: {
            lines: {
              include: {
                stockReservation: true,
                productFulfillments: {
                  include: { stockOperation: { include: { movements: true } } },
                },
              },
            },
            payments: true,
          },
        })
        expect(recovered).toMatchObject({
          createdByUserId: rep.id,
          status: "COMPLETED",
        })
        expect(recovered.payments).toHaveLength(1)
        expect(recovered.payments[0]).toMatchObject({
          moneyAccountId: cash.id,
          recordedByUserId: rep.id,
          amountMinor: 1000,
        })
        expect(recovered.lines).toHaveLength(1)
        const line = recovered.lines[0]
        expect(line?.stockReservation?.status).toBe("COMMITTED")
        expect(line?.productFulfillments).toHaveLength(1)
        const operation = line?.productFulfillments[0]?.stockOperation
        expect(operation).toMatchObject({
          actorUserId: rep.id,
          type: "SALE_FULFILLMENT",
          source: "commercial_order",
          storeId: store.id,
        })
        expect(operation?.movements).toHaveLength(1)
        expect(operation?.movements[0]?.signedCanonicalEffect.toFixed()).toBe(
          "-2",
        )
        const afterApproval = await snapshot()
        for (const key of [
          "orders",
          "lines",
          "payments",
          "reservations",
          "fulfillments",
          "operations",
          "movements",
        ] as const)
          expect(afterApproval[key]).toBe(afterWeb[key] + 1)
        expect(
          afterApproval.balances.find(
            (entry) => entry.id === unchanged.balance.id,
          ),
        ).toMatchObject({ onHandQuantity: "8", reservedQuantity: "0" })
        const beforeCash = afterWeb.accountBalances.find(
          ({ id }) => id === cash.id,
        )
        const afterCash = afterApproval.accountBalances.find(
          ({ id }) => id === cash.id,
        )
        if (!beforeCash || !afterCash)
          throw new Error("Missing canonical cash balance")
        expect(
          BigInt(afterCash.balanceMinor) - BigInt(beforeCash.balanceMinor),
        ).toBe(1000n)
        stage("idempotency:start")
        expect((await approve(eligibleDraft)).status).toBe("approved")
        expect(await upload([staleDraft, eligibleDraft])).toEqual([
          { clientCommandId: staleDraft.clientCommandId, status: "held" },
          {
            clientCommandId: eligibleDraft.clientCommandId,
            status: "approved",
          },
        ])
        expect(await snapshot()).toEqual(afterApproval)
        expect(
          await db.commercialOrder.findUniqueOrThrow({
            where: { id: webBaseline.web.id },
            include: {
              lines: {
                include: {
                  productFulfillments: true,
                  stockReservation: true,
                },
              },
              payments: true,
            },
          }),
        ).toEqual(webBaseline.webBefore)
        expect(
          await db.membership.findUniqueOrThrow({
            where: { id: member.id },
            select: { status: true, staffAccessRevision: true },
          }),
        ).toEqual({
          status: "SUSPENDED",
          staffAccessRevision: member.staffAccessRevision + 1,
        })
        expect(
          [staleDraft, eligibleDraft].map(offlineCommandEnvelopeHash),
        ).toEqual(hashes)
        expect(
          await db.offlineConflictReview.count({
            where: { commandId: stale.id },
          }),
        ).toBe(1)
        expect(
          await db.offlineConflictReview.count({
            where: { commandId: applied.id },
          }),
        ).toBe(2)
        stage("scenario:complete")
      } catch (error) {
        failures.push(error)
      } finally {
        console.info(
          `[offline-recovery-stock QA ${runId}] cleanup:start ${Date.now() - started}ms`,
        )
        try {
          const provedClean = await dispose(db, runId, tenantId, userIds)
          if (provedClean)
            console.info(
              `[offline-recovery-stock QA ${runId}] cleanup:complete zero-owned-rows ${Date.now() - started}ms`,
            )
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
          `Recovery stock QA ${runId}: scenario/disposal failures (original first)`,
        )
    }, 900000)
  },
)
