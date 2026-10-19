import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { createCommercialOrder } from "./commercial-orders"
import {
  createFinanceBook,
  updateFinanceMoneyAccountPayments,
} from "./finance/accounts"
import { getFinanceAccountBalances } from "./finance/reads"
import {
  type OfflineCommandEnvelope,
  replayOfflineCommands,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import {
  decideSuspendedOfflineCommand,
  recoverSuspendedOfflineCommands,
} from "./offline-recovery"

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  setDefaultTimeout(900_000)
}

const requestedRunId = process.env.QA_OFFLINE_RECOVERY_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
) {
  throw new Error("QA_OFFLINE_RECOVERY_RUN_ID must be a UUID.")
}

describeWithQaAccessDatabase("suspended staff offline recovery", () => {
  test("holds drafts, applies exact approved records once, and serializes financial decisions", async () => {
    assertQaAccessAcceptanceDatabase()
    const runId = requestedRunId ?? randomUUID()
    const progress = (stage: string) =>
      console.info(`[offline-recovery QA ${runId}] ${stage}`)
    progress("setup:start")
    const { prisma: db } = await import("../client")
    const userIds: string[] = []
    let tenantId: string | undefined
    let bookId: string | undefined
    try {
      const users = []
      for (const role of ["owner", "admin", "rep"]) {
        const user = await db.user.create({
          data: {
            name: `Offline recovery QA ${role}`,
            email: `offline-recovery-${role}-${runId}@example.invalid`,
            ageBand: "ADULT",
            ageDeclaredAt: new Date(),
          },
        })
        userIds.push(user.id)
        users.push(user)
      }
      const [owner, admin, rep] = users
      if (!owner || !admin || !rep) throw new Error("Missing QA identities")
      const tenant = await db.tenant.create({
        data: {
          name: "Offline recovery QA",
          slug: `offline-recovery-${runId}`,
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          metadata: {
            retailOps: { subscription: { planId: "growth", status: "active" } },
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
              },
            ],
          },
        },
      })
      tenantId = tenant.id
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Recovery original Store",
          slug: "recovery-original",
          status: "ACTIVE",
        },
      })
      const customer = await db.customer.create({
        data: { tenantId: tenant.id, name: "Recovery ledger customer" },
      })
      const session = await db.session.create({
        data: {
          userId: rep.id,
          token: `offline-recovery-real-session-${runId}`,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      })
      const financeActor = { tenantId: tenant.id, actorUserId: owner.id }
      const book = await createFinanceBook(db, {
        ...financeActor,
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
      })
      bookId = book.id
      const cash = await db.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId: book.id, code: "1000" } },
      })
      const scope = {
        tenantId: tenant.id,
        actorUserId: rep.id,
        storeId: store.id,
        deviceId: `offline-recovery-device-${runId}`,
      }
      const device = await registerOwnedOfflineDevice(db, {
        ...scope,
        platform: "ANDROID",
      })
      const draft = (
        name: string,
        amountMinor: number,
      ): OfflineCommandEnvelope => ({
        clientCommandId: `${runId}:${name}`,
        createdAtClient: new Date(),
        dependencyClientIds: [],
        eventVersion: 1,
        payload: {
          kind: "commercial_order",
          customerId: customer.id,
          fulfillNow: true,
          lines: [{ custom: "quick_sale", amountMinor, description: name }],
          initialPayment: {
            amountMinor,
            clientPaymentId: `${runId}:${name}:payment`,
            method: "cash",
            moneyAccountId: cash.id,
          },
        },
      })
      const ownerDraft = draft("owner approved", 500)
      const adminDraft = draft("admin approved", 600)
      const rejectedDraft = draft("rejected", 700)
      const pausedDraft = draft("paused account", 800)
      const raceDraft = draft("parallel decision", 900)
      const revokedClosureDraft = draft("revoked device rejection", 950)
      const lostResultDraft = draft("lost canonical result", 1_000)
      const replayedDraft = draft("ordinary replay", 1_100)
      const canonicalInput = (envelope: OfflineCommandEnvelope) => ({
        // This is the public canonical input used by ordinary replay, including
        // kind. It does not duplicate the private canonical digest algorithm.
        ...envelope.payload,
        actorUserId: rep.id,
        tenantId: tenant.id,
        storeId: store.id,
        clientOrderId: envelope.clientCommandId,
        schemaVersion: 1,
      })
      const replayed = await replayOfflineCommands(db, {
        ...scope,
        acceptNewCommands: true,
        capabilities: { operateOrders: true },
        requiresApproval: false,
        commands: [replayedDraft],
      })
      expect(replayed[0]?.status).toBe("APPLIED")
      // Simulate only the durable boundary: canonical commit succeeded, but the
      // replay result/OfflineCommand persistence was lost. No network is faked.
      const committedBeforeLostResult = await createCommercialOrder(
        db,
        canonicalInput(lostResultDraft),
      )
      expect(
        await db.offlineCommand.count({
          where: {
            tenantId: tenant.id,
            clientCommandId: lostResultDraft.clientCommandId,
          },
        }),
      ).toBe(0)
      const webOrder = await createCommercialOrder(db, {
        ...canonicalInput(draft("web dashboard sale", 1_200)),
        actorUserId: owner.id,
      })
      const webBefore = await db.commercialOrder.findUniqueOrThrow({
        where: { id: webOrder.id },
      })
      const membership = await db.membership.findUniqueOrThrow({
        where: { tenantId_userId: { tenantId: tenant.id, userId: rep.id } },
      })
      const lifecycle = await db.$transaction(async (tx) => {
        await tx.membership.update({
          where: { id: membership.id },
          data: { status: "SUSPENDED", staffAccessRevision: { increment: 1 } },
        })
        return tx.retailOpsStaffLifecycleEvent.create({
          data: {
            tenantId: tenant.id,
            membershipId: membership.id,
            staffUserId: rep.id,
            actorUserId: owner.id,
            type: "SUSPENDED",
            fromStatus: "ACTIVE",
            toStatus: "SUSPENDED",
            fromRole: "CASHIER",
            toRole: "CASHIER",
            reason: "Isolated offline recovery acceptance fixture",
          },
        })
      })
      expect(device.registeredAt.getTime()).toBeLessThanOrEqual(
        lifecycle.happenedAt.getTime(),
      )
      progress("setup:complete")
      const snapshot = async () => ({
        orders: await db.commercialOrder.count({
          where: { tenantId: tenant.id },
        }),
        lines: await db.commercialOrderLine.count({
          where: { order: { tenantId: tenant.id } },
        }),
        payments: await db.commercialOrderPayment.count({
          where: { tenantId: tenant.id },
        }),
        stockOperations: await db.stockOperation.count({
          where: { tenantId: tenant.id },
        }),
        stockMovements: await db.stockMovement.count({
          where: { operation: { tenantId: tenant.id } },
        }),
        fulfillment: await db.commercialServiceFulfillment.count({
          where: { tenantId: tenant.id },
        }),
        journals: await db.financeJournalEntry.count({
          where: { bookId: book.id },
        }),
        journalLines: await db.financeJournalLine.count({
          where: { bookId: book.id },
        }),
        ledger: await db.customerLedgerEntry.count({
          where: { tenantId: tenant.id },
        }),
        allocations: await db.customerLedgerAllocation.count({
          where: { credit: { tenantId: tenant.id } },
        }),
        bookSequence: (
          await db.financeBook.findUniqueOrThrow({ where: { id: book.id } })
        ).lastSequence,
        customerAccounts: await db.customerLedgerAccount.findMany({
          where: { tenantId: tenant.id },
          select: { id: true, lastSequence: true, revision: true },
          orderBy: { id: "asc" },
        }),
        balances: (
          await getFinanceAccountBalances(db, {
            ...financeActor,
            bookId: book.id,
          })
        ).accounts
          .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      })
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
          reason: `QA ${decision} exact original record`,
        })
      const originals = [
        ownerDraft,
        adminDraft,
        rejectedDraft,
        pausedDraft,
        raceDraft,
        revokedClosureDraft,
        lostResultDraft,
      ]
      progress("staging:start")
      const beforeUpload = await snapshot()
      expect(beforeUpload.orders).toBe(3)
      expect(beforeUpload.payments).toBe(3)
      expect(beforeUpload.stockOperations).toBe(0)
      expect(beforeUpload.stockMovements).toBe(0)
      // These Orders are unbilled collections: journals/cash project now,
      // while customer-ledger billing/payment projection remains untouched.
      expect(beforeUpload.ledger).toBe(0)
      expect(beforeUpload.journals).toBeGreaterThan(0)
      expect(await upload(originals)).toEqual(
        originals.map(({ clientCommandId }) => ({
          clientCommandId,
          status: "held",
        })),
      )
      expect(await snapshot()).toEqual(beforeUpload)
      expect(await upload(originals)).toEqual(
        originals.map(({ clientCommandId }) => ({
          clientCommandId,
          status: "held",
        })),
      )
      expect(await snapshot()).toEqual(beforeUpload)
      expect(await upload([replayedDraft])).toEqual([
        { clientCommandId: replayedDraft.clientCommandId, status: "approved" },
      ])
      expect(await snapshot()).toEqual(beforeUpload)

      progress("staging:complete")
      for (const [envelope, reviewer, stage] of [
        [ownerDraft, owner, "owner-approval"],
        [adminDraft, admin, "admin-approval"],
      ] as const) {
        progress(`${stage}:start`)
        const beforeApproval = await snapshot()
        const approval = await decide(envelope, reviewer.id, "approve")
        const applied = await command(envelope)
        if (approval.status !== "approved") {
          throw new Error(
            `QA recovery approval did not apply: ${JSON.stringify({
              conflictCode: applied.conflictCode,
              conflictMessage: applied.conflictMessage,
              status: applied.status,
            })}`,
          )
        }
        expect(approval.status).toBe("approved")
        const order = await db.commercialOrder.findUniqueOrThrow({
          where: {
            tenantId_clientOrderId: {
              tenantId: tenant.id,
              clientOrderId: envelope.clientCommandId,
            },
          },
          include: { payments: true },
        })
        expect(order.createdByUserId).toBe(rep.id)
        expect(order.payments).toHaveLength(1)
        expect(order.payments[0]?.recordedByUserId).toBe(rep.id)
        expect(order.payments[0]?.moneyAccountId).toBe(cash.id)
        const initialPayment = envelope.payload.initialPayment
        if (!initialPayment) throw new Error("Missing original payment fixture")
        expect(order.payments[0]?.amountMinor).toBe(initialPayment.amountMinor)
        expect(applied.offlineDeviceId).toBe(device.id)
        expect(applied.reviewedByUserId).toBe(reviewer.id)
        const after = await snapshot()
        expect(after.orders).toBe(beforeApproval.orders + 1)
        expect(after.payments).toBe(beforeApproval.payments + 1)
        expect(after.ledger).toBe(beforeApproval.ledger)
        expect(after.allocations).toBe(beforeApproval.allocations)
        expect(after.customerAccounts).toEqual(beforeApproval.customerAccounts)
        expect(after.journals).toBeGreaterThan(beforeApproval.journals)
        const cashBefore = beforeApproval.balances.find(
          ({ id }) => id === cash.id,
        )
        const cashAfter = after.balances.find(({ id }) => id === cash.id)
        if (!cashBefore || !cashAfter)
          throw new Error("Missing cash balance fixture")
        expect(
          BigInt(cashAfter.balanceMinor) - BigInt(cashBefore.balanceMinor),
        ).toBe(BigInt(initialPayment.amountMinor))
        expect((await decide(envelope, reviewer.id, "approve")).status).toBe(
          "approved",
        )
        expect((await upload([envelope]))[0]?.status).toBe("approved")
        expect(await snapshot()).toEqual(after)
        expect(
          await db.offlineConflictReview.count({
            where: { commandId: applied.id },
          }),
        ).toBe(1)
        progress(`${stage}:complete`)
      }

      progress("rejection:start")
      const beforeReject = await snapshot()
      expect((await decide(rejectedDraft, admin.id, "reject")).status).toBe(
        "rejected",
      )
      expect((await decide(rejectedDraft, owner.id, "approve")).status).toBe(
        "rejected",
      )
      expect((await upload([rejectedDraft]))[0]?.status).toBe("rejected")
      expect(await snapshot()).toEqual(beforeReject)
      const rejected = await command(rejectedDraft)
      expect(
        await db.offlineConflictReview.findMany({
          where: { commandId: rejected.id },
          select: { decision: true, reason: true },
        }),
      ).toEqual([
        {
          decision: "DISCARD",
          reason:
            "[suspended_staff:reject:rejected] QA reject exact original record",
        },
      ])

      progress("rejection:complete")
      progress("paused-account-rollback:start")
      await updateFinanceMoneyAccountPayments(db, {
        ...financeActor,
        bookId: book.id,
        accountId: cash.id,
        paymentMethods: ["cash"],
        availableForPayments: false,
      })
      const beforePausedApproval = await snapshot()
      expect((await decide(pausedDraft, owner.id, "approve")).status).toBe(
        "held",
      )
      expect(await snapshot()).toEqual(beforePausedApproval)
      const held = await command(pausedDraft)
      expect(held.status).toBe("REVIEW_REQUIRED")
      expect(held.conflictCode).toBe("INVALID_COMMAND")
      expect(held.conflictMessage).toContain("paused")
      expect(held.result).toBeNull()
      expect(
        await db.commercialOrder.count({
          where: {
            tenantId: tenant.id,
            clientOrderId: pausedDraft.clientCommandId,
          },
        }),
      ).toBe(0)
      progress("paused-account-rollback:complete")
      progress("paused-account-retry:start")
      await updateFinanceMoneyAccountPayments(db, {
        ...financeActor,
        bookId: book.id,
        accountId: cash.id,
        paymentMethods: ["cash"],
        availableForPayments: true,
      })
      expect((await upload([pausedDraft]))[0]?.status).toBe("held")
      expect(await snapshot()).toEqual(beforePausedApproval)
      expect((await decide(pausedDraft, admin.id, "approve")).status).toBe(
        "approved",
      )
      const afterRetry = await snapshot()
      expect(afterRetry.orders).toBe(beforePausedApproval.orders + 1)
      expect(afterRetry.payments).toBe(beforePausedApproval.payments + 1)
      expect((await decide(pausedDraft, owner.id, "approve")).status).toBe(
        "approved",
      )
      expect(await snapshot()).toEqual(afterRetry)
      expect(
        (
          await db.offlineConflictReview.findMany({
            where: { commandId: held.id },
            orderBy: { createdAt: "asc" },
          })
        ).map(({ reason }) => reason),
      ).toEqual([
        "[suspended_staff:approve:conflict] QA approve exact original record",
        "[suspended_staff:approve:applied] QA approve exact original record",
      ])

      progress("paused-account-retry:complete")
      progress("lost-result:start")
      const beforeLostApproval = await snapshot()
      expect((await decide(lostResultDraft, admin.id, "approve")).status).toBe(
        "approved",
      )
      expect(await snapshot()).toEqual(beforeLostApproval)
      expect(
        (
          await db.commercialOrder.findUniqueOrThrow({
            where: { id: committedBeforeLostResult.id },
          })
        ).clientOrderId,
      ).toBe(lostResultDraft.clientCommandId)
      expect((await upload([lostResultDraft]))[0]?.status).toBe("approved")
      expect(await snapshot()).toEqual(beforeLostApproval)

      progress("lost-result:complete")
      progress("concurrency:start")
      const beforeRace = await snapshot()
      const racing = await Promise.all([
        decide(raceDraft, owner.id, "approve"),
        decide(raceDraft, admin.id, "reject"),
      ])
      const raced = await command(raceDraft)
      expect(["APPLIED", "DISCARDED"]).toContain(raced.status)
      const approved = raced.status === "APPLIED"
      expect(racing.map(({ status }) => status)).toEqual([
        approved ? "approved" : "rejected",
        approved ? "approved" : "rejected",
      ])
      const raceOrders = await db.commercialOrder.findMany({
        where: {
          tenantId: tenant.id,
          clientOrderId: raceDraft.clientCommandId,
        },
        include: { payments: true },
      })
      expect(raceOrders).toHaveLength(approved ? 1 : 0)
      expect(raceOrders.flatMap(({ payments }) => payments)).toHaveLength(
        approved ? 1 : 0,
      )
      const afterRace = await snapshot()
      expect(afterRace.orders).toBe(beforeRace.orders + (approved ? 1 : 0))
      expect(afterRace.payments).toBe(beforeRace.payments + (approved ? 1 : 0))
      if (!approved) expect(afterRace).toEqual(beforeRace)
      const reviews = await db.offlineConflictReview.findMany({
        where: { commandId: raced.id },
      })
      expect(reviews).toHaveLength(1)
      expect(reviews[0]?.decision).toBe(approved ? "RETRY" : "DISCARD")
      expect(reviews[0]?.reason).toContain(
        approved ? ":approve:applied]" : ":reject:rejected]",
      )
      const raceReview = reviews[0]
      if (!raceReview) throw new Error("Missing durable race review")
      expect(raced.reviewedByUserId).toBe(raceReview.reviewedByUserId)
      expect(
        await db.commercialOrder.findUniqueOrThrow({
          where: { id: webOrder.id },
        }),
      ).toEqual(webBefore)
      expect(
        (
          await db.membership.findUniqueOrThrow({
            where: { id: membership.id },
          })
        ).status,
      ).toBe("SUSPENDED")
      expect(
        (await db.offlineDevice.findUniqueOrThrow({ where: { id: device.id } }))
          .registeredByUserId,
      ).toBe(rep.id)
      progress("concurrency:complete")

      // Closing a held draft must not require reviving its author/device/Store.
      progress("unavailable-origin-rejection:start")
      await db.offlineDevice.update({
        where: { id: device.id },
        data: { status: "REVOKED" },
      })
      await db.store.update({
        where: { id: store.id },
        data: { status: "PAUSED" },
      })
      const beforeRevokedRejection = await snapshot()
      expect(
        (await decide(revokedClosureDraft, admin.id, "reject")).status,
      ).toBe("rejected")
      expect(
        (await decide(revokedClosureDraft, owner.id, "approve")).status,
      ).toBe("rejected")
      expect(await snapshot()).toEqual(beforeRevokedRejection)
      expect(
        await db.offlineConflictReview.count({
          where: { commandId: (await command(revokedClosureDraft)).id },
        }),
      ).toBe(1)
      progress("unavailable-origin-rejection:complete")
    } finally {
      progress("cleanup:start")
      try {
        if (tenantId) {
          const ownedTenantId = tenantId
          const ownedBookId = bookId
          await db.$transaction(
            async (tx) => {
              // Delete only this unique QA fixture, in dependency order. Command
              // reviews and device relations are retained until assertions end.
              await tx.offlineCommand.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.businessActivityEvent.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.commercialServiceFulfillment.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.commercialOrderPayment.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.customerLedgerAllocationRelease.deleteMany({
                where: { allocation: { credit: { tenantId: ownedTenantId } } },
              })
              await tx.customerLedgerAllocation.deleteMany({
                where: { credit: { tenantId: ownedTenantId } },
              })
              await tx.customerLedgerReceipt.deleteMany({
                where: { entry: { tenantId: ownedTenantId } },
              })
              await tx.customerLedgerCommand.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.customerLedgerEntry.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.customerLedgerAccount.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.serviceJobLine.deleteMany({
                where: { serviceJob: { tenantId: ownedTenantId } },
              })
              await tx.serviceJob.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.commercialOrder.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.sellableOffering.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              await tx.sellableVariant.deleteMany({
                where: { catalogItem: { tenantId: ownedTenantId } },
              })
              await tx.catalogItem.deleteMany({
                where: { tenantId: ownedTenantId },
              })
              if (ownedBookId) {
                await tx.financeCommand.deleteMany({
                  where: { bookId: ownedBookId },
                })
                await tx.financeJournalLine.deleteMany({
                  where: { bookId: ownedBookId },
                })
                await tx.financeJournalEntry.deleteMany({
                  where: { bookId: ownedBookId },
                })
                await tx.financeAccount.deleteMany({
                  where: { bookId: ownedBookId },
                })
                await tx.financeBook.delete({ where: { id: ownedBookId } })
              }
              await tx.tenant.delete({ where: { id: ownedTenantId } })
            },
            { maxWait: 10_000, timeout: 30_000 },
          )
        }
        for (const id of userIds) await db.user.delete({ where: { id } })
        progress("cleanup:complete")
      } finally {
        await db.$disconnect()
      }
    }
  })
})
