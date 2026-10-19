import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { CatalogError } from "./catalog-errors"
import { ensureCatalogFreeOfferingInTransaction } from "./catalog-free-lines"
import { createFinanceBook } from "./finance/accounts"
import { getFinanceAccountBalances } from "./finance/reads"
import {
  type OfflineCommandEnvelope,
  offlineCommandEnvelopeHash,
  replayOfflineCommands,
  reviewOfflineConflict,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import {
  decideSuspendedOfflineCommand,
  recoverSuspendedOfflineCommands,
} from "./offline-recovery"
import { readOfflineRecoveryRecord } from "./offline-recovery-record"
import {
  getOfflineOperationsPolicy,
  updateOfflineOperationsPolicy,
} from "./offline-settings"
import { updateRetailOpsStaffStatus } from "./retail-ops-staff"

// Actual domain lifecycle/policy/recovery commands. Product language "pause" and
// "suspend" maps to the supported Membership SUSPENDED state; Store PAUSED and
// payment-account pause are different facts. No phone, HTTP or web UI is tested.
const requestedRunId = process.env.QA_OFFLINE_RECOVERY_LIFECYCLE_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_OFFLINE_RECOVERY_LIFECYCLE_RUN_ID must be a UUID")
const transactionOptions = { maxWait: 10000, timeout: 30000 }
const slugFor = (runId: string) => `offline-recovery-lifecycle-${runId}`
const emailFor = (role: string, runId: string) =>
  `offline-recovery-lifecycle-${role}-${runId}@example.invalid`

async function settledValues<T extends readonly unknown[]>(
  tasks: { [K in keyof T]: Promise<T[K]> },
): Promise<T> {
  const results = await Promise.allSettled(tasks)
  const failures = results.filter((result) => result.status === "rejected")
  if (failures.length === 1) throw failures[0]?.reason
  if (failures.length > 1)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Owned lifecycle QA reads failed",
    )
  return results.map((result) => {
    if (result.status !== "fulfilled") throw Error("Unsettled owned QA read")
    return result.value
  }) as unknown as T
}

describeWithQaAccessDatabase(
  "actual staff lifecycle and held offline recovery policy",
  () => {
    test("suspension and policy changes hold exact drafts until explicit recovery approval or rejection", async () => {
      assertQaAccessAcceptanceDatabase()
      const runId = requestedRunId ?? randomUUID()
      const started = Date.now()
      const progress = (stage: string) => {
        console.info(
          `[offline-recovery-lifecycle QA ${runId}] ${stage} ${Date.now() - started}ms`,
        )
        if (Date.now() - started > 720000)
          throw Error("Recovery lifecycle scenario deadline")
      }
      progress("setup:start")
      const { prisma: db } = await import("../client")
      const userIds: string[] = []
      let tenantId: string | undefined
      const failures: unknown[] = []
      try {
        const users = []
        for (const role of ["owner", "admin", "rep"]) {
          progress(`setup:user-${role}`)
          const id = randomUUID()
          userIds.push(id)
          users.push(
            await db.user.create({
              data: {
                id,
                name: `Recovery lifecycle QA ${role}`,
                email: emailFor(role, runId),
                ageBand: "ADULT",
                ageDeclaredAt: new Date(),
              },
            }),
          )
        }
        const [owner, admin, rep] = users
        if (!owner || !admin || !rep) throw Error("Missing exact QA identities")
        tenantId = randomUUID()
        progress("setup:Tenant")
        const tenant = await db.tenant.create({
          data: {
            id: tenantId,
            name: "Recovery lifecycle QA",
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
                { userId: admin.id, role: "ADMIN", status: "ACTIVE" },
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
            name: "Recovery lifecycle original Store",
            slug: "original",
            status: "ACTIVE",
          },
        })
        const actor = { actorUserId: owner.id, tenantId: tenant.id }
        const member = () =>
          db.membership.findUniqueOrThrow({
            where: { tenantId_userId: { tenantId: tenant.id, userId: rep.id } },
          })
        const current = await member()
        expect(current).toMatchObject({
          status: "ACTIVE",
          role: "CASHIER",
          staffAccessMode: "LEGACY",
        })
        const realSession = await db.session.create({
          data: {
            userId: rep.id,
            token: `recovery-lifecycle-session-${runId}`,
            expiresAt: new Date(Date.now() + 3_600_000),
          },
        })
        const scope = {
          ...actor,
          actorUserId: rep.id,
          storeId: store.id,
          deviceId: `recovery-lifecycle-device-${runId}`,
        }
        const device = await registerOwnedOfflineDevice(db, {
          ...scope,
          platform: "ANDROID",
        })
        progress("setup:Finance-and-catalog")
        const book = await createFinanceBook(db, {
          ...actor,
          startsAt: new Date("2026-01-01T00:00:00Z"),
        })
        const cash = await db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: book.id, code: "1000" } },
        })
        // Provision only the existing system Offering during QA setup; no sale,
        // payment or fulfillment is performed before the two captured drafts.
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
        expect(
          await getOfflineOperationsPolicy(db, { tenantId: tenant.id }),
        ).toMatchObject({ enabled: true, approvalRequired: false })
        const policy = (approvalRequired: boolean) =>
          updateOfflineOperationsPolicy(db, {
            tenantId: tenant.id,
            enabled: true,
            approvalRequired,
          })
        expect(await policy(false)).toMatchObject({
          enabled: true,
          approvalRequired: false,
        })
        const draft = (label: string): OfflineCommandEnvelope => ({
          clientCommandId: `${runId}:${label}`,
          createdAtClient: new Date(),
          dependencyClientIds: [],
          eventVersion: 1,
          payload: {
            kind: "commercial_order",
            fulfillNow: true,
            lines: [
              {
                custom: "quick_sale",
                amountMinor: 500,
                description: `Original ${label} sale`,
              },
            ],
            initialPayment: {
              amountMinor: 500,
              clientPaymentId: `${runId}:${label}:payment`,
              method: "cash",
              moneyAccountId: cash.id,
            },
          },
        })
        const a = draft("A")
        const b = draft("B")
        const drafts = [a, b]
        const originals = structuredClone(drafts)
        const hashes = drafts.map(offlineCommandEnvelopeHash)
        const command = (envelope: OfflineCommandEnvelope) =>
          db.offlineCommand.findUniqueOrThrow({
            where: {
              tenantId_clientCommandId: {
                tenantId: tenant.id,
                clientCommandId: envelope.clientCommandId,
              },
            },
          })
        const upload = (commands = drafts) =>
          recoverSuspendedOfflineCommands(db, {
            ...scope,
            sessionId: realSession.id,
            commands,
          })
        const ordinary = (commands = drafts) =>
          replayOfflineCommands(db, {
            ...scope,
            acceptNewCommands: true,
            requiresApproval: false,
            capabilities: { operateOrders: true },
            commands,
          })
        const decide = async (
          envelope: OfflineCommandEnvelope,
          actorUserId: string,
          decision: "approve" | "reject",
        ) =>
          decideSuspendedOfflineCommand(db, {
            tenantId: tenant.id,
            actorUserId,
            commandId: (await command(envelope)).id,
            envelope,
            decision,
            reason: `QA exact lifecycle ${decision}`,
          })
        const snapshot = async () => {
          const [
            orders,
            stockOperations,
            stockMovements,
            performances,
            journals,
            customers,
            finance,
          ] = await settledValues([
            db.commercialOrder.findMany({
              where: { tenantId: tenant.id },
              include: { payments: { orderBy: { id: "asc" } } },
              orderBy: { id: "asc" },
            }),
            db.stockOperation.count({ where: { tenantId: tenant.id } }),
            db.stockMovement.count({
              where: { operation: { tenantId: tenant.id } },
            }),
            db.commercialServiceFulfillment.findMany({
              where: { tenantId: tenant.id },
              orderBy: { id: "asc" },
            }),
            db.financeJournalEntry.findMany({
              where: { bookId: book.id },
              orderBy: { id: "asc" },
            }),
            db.customer.count({ where: { tenantId: tenant.id } }),
            getFinanceAccountBalances(db, { ...actor, bookId: book.id }),
          ])
          return {
            orders,
            stockOperations,
            stockMovements,
            performances,
            journals,
            customers,
            accountBalances: finance.accounts
              .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
              .sort((x, y) => x.id.localeCompare(y.id)),
            financeSequence: finance.snapshotSequence,
          }
        }
        const cashBalance = (state: Awaited<ReturnType<typeof snapshot>>) => {
          const balance = state.accountBalances.find(({ id }) => id === cash.id)
          if (!balance) throw Error("Missing owned cash balance")
          return BigInt(balance.balanceMinor)
        }
        const before = await snapshot()
        expect(before.orders).toHaveLength(0)
        expect(before.stockOperations).toBe(0)
        expect(before.stockMovements).toBe(0)
        expect(before.performances).toHaveLength(0)

        progress("actual-suspension")
        const suspended = await updateRetailOpsStaffStatus(db, {
          ...actor,
          staffUserId: rep.id,
          status: "suspended",
          expectedRevision: current.staffAccessRevision,
          reason: "QA pause/suspend business access while phone is offline",
        })
        expect(suspended).toMatchObject({
          previousStatus: "ACTIVE",
          status: "SUSPENDED",
          staffAccessRevision: current.staffAccessRevision + 1,
          updatedByUserId: owner.id,
        })
        const suspensionEvent =
          await db.retailOpsStaffLifecycleEvent.findUniqueOrThrow({
            where: { id: suspended.lifecycleEventId },
          })
        expect(suspensionEvent).toMatchObject({
          membershipId: current.id,
          staffUserId: rep.id,
          actorUserId: owner.id,
          type: "SUSPENDED",
          fromStatus: "ACTIVE",
          toStatus: "SUSPENDED",
        })
        expect(device.registeredAt.getTime()).toBeLessThanOrEqual(
          suspensionEvent.happenedAt.getTime(),
        )
        expect(await snapshot()).toEqual(before)
        await expect(ordinary()).rejects.toBeInstanceOf(CatalogError)
        progress("stage-with-approval-off")
        expect(await upload()).toEqual(
          drafts.map(({ clientCommandId }) => ({
            clientCommandId,
            status: "held",
          })),
        )
        expect(await snapshot()).toEqual(before)
        const [heldA, heldB] = await settledValues([command(a), command(b)])
        for (const [row, hash] of [
          [heldA, hashes[0]],
          [heldB, hashes[1]],
        ] as const) {
          expect(row).toMatchObject({
            status: "REVIEW_REQUIRED",
            payloadHash: hash,
            offlineDeviceId: device.id,
            payload: { actorUserId: rep.id },
          })
          expect(readOfflineRecoveryRecord(row.payload)).toMatchObject({
            membershipId: current.id,
            lifecycleEventId: suspensionEvent.id,
            accessRevision: suspended.staffAccessRevision,
            accessChangedAt: suspensionEvent.happenedAt.toISOString(),
          })
        }
        progress("policy-on-does-not-apply")
        expect(await policy(true)).toMatchObject({ approvalRequired: true })
        expect(await upload()).toEqual(
          drafts.map(({ clientCommandId }) => ({
            clientCommandId,
            status: "held",
          })),
        )
        expect(await snapshot()).toEqual(before)
        expect(await policy(false)).toMatchObject({ approvalRequired: false })
        await expect(
          reviewOfflineConflict(db, {
            ...actor,
            commandId: heldA.id,
            decision: "approve",
          }),
        ).rejects.toBeInstanceOf(CatalogError)
        expect(await snapshot()).toEqual(before)

        progress("approve-A-still-suspended-policy-off")
        expect((await member()).status).toBe("SUSPENDED")
        expect((await decide(a, owner.id, "approve")).status).toBe("approved")
        const afterA = await snapshot()
        expect(afterA.orders).toHaveLength(1)
        const saved = afterA.orders[0]
        expect(saved).toMatchObject({
          clientOrderId: a.clientCommandId,
          createdByUserId: rep.id,
          totalMinor: 500,
          amountPaidMinor: 500,
          paymentStatus: "PAID",
          status: "COMPLETED",
        })
        expect(saved?.payments).toHaveLength(1)
        expect(saved?.payments[0]).toMatchObject({
          amountMinor: 500,
          recordedByUserId: rep.id,
          moneyAccountId: cash.id,
          clientPaymentId: `${runId}:A:payment`,
        })
        expect(cashBalance(afterA) - cashBalance(before)).toBe(500n)
        expect(afterA.stockOperations).toBe(0)
        expect(afterA.stockMovements).toBe(0)
        expect(afterA.performances).toHaveLength(1)
        expect(afterA.performances[0]).toMatchObject({
          actorUserId: rep.id,
          orderId: saved?.id,
        })
        expect(
          afterA.journals.filter(
            (entry) =>
              entry.sourceKind === "COMMERCIAL_ORDER_COLLECTION" &&
              entry.sourceId === saved?.payments[0]?.id,
          ),
        ).toHaveLength(1)
        expect(await command(a)).toMatchObject({
          status: "APPLIED",
          reviewedByUserId: owner.id,
          payloadHash: hashes[0],
        })
        expect(await member()).toMatchObject({
          status: "SUSPENDED",
          staffAccessRevision: suspended.staffAccessRevision,
        })
        expect((await command(b)).status).toBe("REVIEW_REQUIRED")
        expect((await decide(a, admin.id, "reject")).status).toBe("approved")
        expect((await decide(a, owner.id, "approve")).status).toBe("approved")
        expect(await snapshot()).toEqual(afterA)

        progress("actual-reactivation-held-B-with-policy-on")
        expect(await policy(true)).toMatchObject({ approvalRequired: true })
        const reactivated = await updateRetailOpsStaffStatus(db, {
          actorUserId: admin.id,
          tenantId: tenant.id,
          staffUserId: rep.id,
          status: "active",
          expectedRevision: suspended.staffAccessRevision,
          reason: "QA explicitly reactivate after A approval; B remains held",
        })
        expect(reactivated).toMatchObject({
          previousStatus: "SUSPENDED",
          status: "ACTIVE",
          staffAccessRevision: suspended.staffAccessRevision + 1,
          updatedByUserId: admin.id,
        })
        expect(
          await db.retailOpsStaffLifecycleEvent.findUniqueOrThrow({
            where: { id: reactivated.lifecycleEventId },
          }),
        ).toMatchObject({
          type: "REACTIVATED",
          actorUserId: admin.id,
          fromStatus: "SUSPENDED",
          toStatus: "ACTIVE",
        })
        expect(await upload([b])).toEqual([
          { clientCommandId: b.clientCommandId, status: "held" },
        ])
        expect(await snapshot()).toEqual(afterA)
        expect(await policy(false)).toMatchObject({ approvalRequired: false })
        await expect(ordinary([b])).rejects.toBeInstanceOf(CatalogError)
        await expect(
          reviewOfflineConflict(db, {
            actorUserId: admin.id,
            tenantId: tenant.id,
            commandId: heldB.id,
            decision: "approve",
          }),
        ).rejects.toBeInstanceOf(CatalogError)
        expect((await command(b)).status).toBe("REVIEW_REQUIRED")
        expect(readOfflineRecoveryRecord((await command(b)).payload)).toEqual(
          readOfflineRecoveryRecord(heldB.payload),
        )
        expect(await snapshot()).toEqual(afterA)

        progress("reject-B-after-explicit-reactivation")
        expect((await decide(b, admin.id, "reject")).status).toBe("rejected")
        expect((await decide(b, owner.id, "approve")).status).toBe("rejected")
        expect((await decide(b, admin.id, "reject")).status).toBe("rejected")
        expect(await upload()).toEqual([
          { clientCommandId: a.clientCommandId, status: "approved" },
          { clientCommandId: b.clientCommandId, status: "rejected" },
        ])
        expect(await snapshot()).toEqual(afterA)
        expect(await command(b)).toMatchObject({
          status: "DISCARDED",
          reviewedByUserId: admin.id,
          payloadHash: hashes[1],
        })
        for (const [row, reviewer, decision] of [
          [await command(a), owner.id, "RETRY"],
          [await command(b), admin.id, "DISCARD"],
        ] as const) {
          const audits = await db.offlineConflictReview.findMany({
            where: { commandId: row.id },
          })
          expect(audits).toHaveLength(1)
          expect(audits[0]).toMatchObject({
            reviewedByUserId: reviewer,
            decision,
          })
        }
        expect(await member()).toMatchObject({
          status: "ACTIVE",
          staffAccessRevision: reactivated.staffAccessRevision,
        })
        expect(
          await db.session.findUniqueOrThrow({ where: { id: realSession.id } }),
        ).toEqual(realSession)
        expect(
          await db.offlineDevice.findUniqueOrThrow({
            where: { id: device.id },
          }),
        ).toMatchObject({
          status: "ACTIVE",
          registeredByUserId: rep.id,
          storeId: store.id,
        })
        expect(drafts).toEqual(originals)
        expect(drafts.map(offlineCommandEnvelopeHash)).toEqual(hashes)
        progress("scenario:complete")
      } catch (error) {
        failures.push(error)
        console.error(
          `[offline-recovery-lifecycle QA ${runId}] scenario failed before cleanup`,
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
          `Recovery lifecycle QA ${runId}: original and cleanup failures`,
        )
    }, 900000)
  },
)

/** Twelve small, separately re-authorized exact-Tenant disposal transactions. */
async function dispose(
  db: PrismaClient,
  runId: string,
  tenantId: string | undefined,
  userIds: string[],
) {
  assertQaAccessAcceptanceDatabase()
  const emails = ["owner", "admin", "rep"].map((role) => emailFor(role, runId))
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  })
  if (users.some((user) => !emails.includes(user.email)))
    throw Error(`Recovery lifecycle QA ${runId}: User proof failed`)
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
    throw Error(`Recovery lifecycle QA ${runId}: Tenant proof failed`)
  if (tenant && tenantId) {
    const ownedTenantId = tenantId
    const where = { tenantId: ownedTenantId }
    const group = async (
      label: string,
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ) => {
      assertQaAccessAcceptanceDatabase()
      console.info(`[offline-recovery-lifecycle QA ${runId}] cleanup:${label}`)
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
        throw new Error(
          `Recovery lifecycle QA ${runId}: cleanup ${label} failed`,
          {
            cause: error,
          },
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
    throw Error(`Recovery lifecycle QA ${runId}: cleanup left owned rows`)
  console.info(
    `[offline-recovery-lifecycle QA ${runId}] cleanup:complete zero-owned-rows`,
  )
}
