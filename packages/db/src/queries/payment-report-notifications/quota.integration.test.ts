import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { emptyPaymentNotificationPolicy } from "@ewatrade/utils/payment-report-notification-policy"
import type { PrismaClient } from "../../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import {
  loadPaymentNotificationPolicy,
  savePaymentNotificationPolicy,
} from "./policy"
import {
  listPaymentNotificationChanges,
  markPaymentNotificationChangesRead,
  processPaymentNotificationPolicyChange,
} from "./policy-changes"
import {
  cancelPaymentNotificationReservation,
  reservePaymentNotificationGroup,
  retryPaymentNotificationDispatch,
  settlePaymentNotificationDispatch,
  startPaymentNotificationDispatch,
} from "./quota"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
;(enabled ? test : test.skip)(
  "real SQL sessions serialize quota; intent replay, destination change, outcomes and month groups retain authority",
  async () => {
    assertQaAccessAcceptanceDatabase()
    const { prisma } = await import("../../client")
    const nonce = randomUUID()
    const tenantId = `alert-quota-${nonce}`
    const userId = `alert-owner-${nonce}`
    const otherUserId = `alert-admin-${nonce}`
    const policy = emptyPaymentNotificationPolicy()
    policy.revision = 1
    policy.tiers.starter.email = { enabled: true, limit: 1 }
    let policyValue: unknown = policy
    let collectSessions = false
    const sessions = new Set<number>()
    // Only policy reads are simulated; locks, memberships, groups, intent uniqueness and counters use real PostgreSQL.
    function bound<T extends object>(target: T): T {
      return new Proxy(target, {
        get(obj, key) {
          if (key === "systemConfiguration")
            return {
              findUnique: async () =>
                policyValue === null
                  ? null
                  : { revision: 1, value: policyValue },
            }
          if (key === "$transaction")
            return (
              run: (tx: object) => Promise<unknown>,
              options: unknown,
            ) => {
              const method: unknown = Reflect.get(obj, key)
              if (typeof method !== "function")
                throw new Error("Transaction method unavailable")
              return Reflect.apply(method, obj, [
                async (tx: object) => {
                  if (collectSessions) {
                    const query: unknown = Reflect.get(tx, "$queryRawUnsafe")
                    if (typeof query !== "function")
                      throw new Error("SQL query unavailable")
                    const rows: Array<{ pid: number }> = await Reflect.apply(
                      query,
                      tx,
                      ["SELECT pg_backend_pid() AS pid"],
                    )
                    for (const row of rows) sessions.add(row.pid)
                  }
                  return run(bound(tx))
                },
                options,
              ])
            }
          const value = Reflect.get(obj, key)
          return typeof value === "function" ? value.bind(obj) : value
        },
      })
    }
    const db = bound(prisma)
    let accountId = ""
    let linkId = ""
    let bookId = ""
    const now = new Date("2026-10-27T12:00:00Z")
    const newReport = async () =>
      prisma.manualPaymentReport.create({
        data: {
          linkId,
          clientReportId: randomUUID(),
          status: "SUBMITTED",
          payerName: "Synthetic quota payer",
          claimedAmountMinor: 100,
          submittedAt: now,
        },
      })
    try {
      const fixture = await prisma.$transaction(
        async (tx) => {
          await tx.tenant.create({
            data: {
              id: tenantId,
              slug: tenantId,
              name: "Isolated notification quota QA",
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              qaSourceDomain: "notification-quota.test",
              qaMarkedAt: new Date(),
            },
          })
          await tx.user.createMany({
            data: [
              {
                id: userId,
                email: `${nonce}@example.test`,
                emailVerified: true,
              },
              {
                id: otherUserId,
                email: `admin-${nonce}@example.test`,
                emailVerified: true,
              },
            ],
          })
          await tx.membership.createMany({
            data: [
              { tenantId, userId, role: "OWNER", status: "ACTIVE" },
              {
                tenantId,
                userId: otherUserId,
                role: "ADMIN",
                status: "ACTIVE",
              },
            ],
          })
          const store = await tx.store.create({
            data: {
              tenantId,
              name: "Synthetic Store",
              slug: nonce,
              status: "ACTIVE",
            },
          })
          const book = await tx.financeBook.create({
            data: {
              tenantId,
              currencyCode: "NGN",
              timezone: "Africa/Lagos",
              startsAt: new Date("2026-01-01T00:00:00Z"),
              createdById: userId,
            },
          })
          const account = await tx.financeAccount.create({
            data: {
              bookId: book.id,
              code: "TEST",
              name: "Synthetic receiving account",
              kind: "ASSET",
              purpose: "BANK",
            },
          })
          const order = await tx.commercialOrder.create({
            data: {
              tenantId,
              storeId: store.id,
              clientOrderId: nonce,
              payloadHash: nonce,
              orderNumber: "QUOTA-TEST",
              currencyCode: "NGN",
              subtotalMinor: 100,
              totalMinor: 100,
              createdByUserId: userId,
            },
          })
          const link = await tx.manualPaymentLink.create({
            data: {
              tenantId,
              orderId: order.id,
              bankAccountId: account.id,
              clientLinkId: nonce,
              amountMinor: 100,
              currencyCode: "NGN",
              bankName: "Synthetic bank",
              bankAccountNumber: "0000000000",
              bankAccountHolder: "Synthetic business",
              createdByUserId: userId,
              expiresAt: new Date("2027-01-01T00:00:00Z"),
            },
          })
          await tx.manualPaymentAlertSetting.create({
            data: {
              tenantId,
              accountId: account.id,
              channel: "email",
              effectiveChannel: "email",
              recipientUserIds: [userId],
              updatedByUserId: userId,
            },
          })
          return { accountId: account.id, linkId: link.id, bookId: book.id }
        },
        { maxWait: 10000, timeout: 30000 },
      )
      ;({ accountId, linkId, bookId } = fixture)
      const a = await newReport()
      const b = await newReport()
      policyValue = { bad: "policy" }
      expect(
        await reservePaymentNotificationGroup(db, {
          tenantId,
          reportId: a.id,
          now,
        }),
      ).toMatchObject({ state: "blocked", reason: "policy_invalid" })
      policyValue = null
      expect(
        await reservePaymentNotificationGroup(db, {
          tenantId,
          reportId: a.id,
          now,
        }),
      ).toMatchObject({ state: "blocked", reason: "policy_missing" })
      expect(
        await prisma.paymentNotificationQuota.count({ where: { tenantId } }),
      ).toBe(0)
      policyValue = policy
      collectSessions = true
      const pair = await Promise.all([
        reservePaymentNotificationGroup(db, { tenantId, reportId: a.id, now }),
        reservePaymentNotificationGroup(db, { tenantId, reportId: b.id, now }),
      ])
      collectSessions = false
      expect(sessions.size).toBe(2)
      expect(pair.filter((r) => r.state === "reserved")).toHaveLength(1)
      expect(pair.filter((r) => r.state === "blocked")).toHaveLength(1)
      const winner = pair.find((r) => r.state === "reserved")?.intentIds[0]
      expect(winner).toBeDefined()
      if (!winner) throw new Error("Missing winner")
      const intent = await prisma.paymentNotificationIntent.findUniqueOrThrow({
        where: { id: winner },
      })
      expect(
        (
          await reservePaymentNotificationGroup(db, {
            tenantId,
            reportId: intent.reportId,
            now,
          })
        ).intentIds,
      ).toEqual([winner])
      expect(
        await prisma.paymentNotificationQuota.findFirst({
          where: { tenantId },
        }),
      ).toMatchObject({ used: 0, reserved: 1 })
      expect(
        (
          await startPaymentNotificationDispatch(db, {
            tenantId,
            intentId: winner,
            claimId: randomUUID(),
            expectedDestination: "stale@example.test",
            now,
          })
        ).maySend,
      ).toBe(false)
      expect(
        await prisma.paymentNotificationQuota.findFirst({
          where: { tenantId },
        }),
      ).toMatchObject({ used: 0, reserved: 0 })
      const c = await newReport()
      const reservation = await reservePaymentNotificationGroup(db, {
        tenantId,
        reportId: c.id,
        now,
      })
      const id = reservation.intentIds[0]
      if (!id) throw new Error("Missing reservation")
      const claimId = randomUUID()
      const expectedDestination = `${nonce}@example.test`
      expect(
        (
          await startPaymentNotificationDispatch(db, {
            tenantId,
            intentId: id,
            claimId,
            expectedDestination,
            now,
          })
        ).maySend,
      ).toBe(true)
      expect(
        (
          await startPaymentNotificationDispatch(db, {
            tenantId,
            intentId: id,
            claimId,
            expectedDestination,
            now,
          })
        ).maySend,
      ).toBe(false)
      await settlePaymentNotificationDispatch(db, {
        tenantId,
        intentId: id,
        claimId,
        outcome: "unknown",
      })
      expect(
        (
          await cancelPaymentNotificationReservation(db, {
            tenantId,
            intentId: id,
          })
        ).cancelled,
      ).toBe(false)
      await expect(
        settlePaymentNotificationDispatch(db, {
          tenantId,
          intentId: id,
          claimId,
          outcome: "rejected",
        }),
      ).rejects.toThrow("reconciliation")
      await expect(
        retryPaymentNotificationDispatch(db, {
          tenantId,
          actorUserId: userId,
          intentId: id,
          now,
        }),
      ).rejects.toThrow("definitively rejected")
      expect(
        await prisma.paymentNotificationQuota.findFirst({
          where: { tenantId },
        }),
      ).toMatchObject({ used: 0, reserved: 1 })
      await settlePaymentNotificationDispatch(db, {
        tenantId,
        intentId: id,
        claimId,
        outcome: "accepted",
        providerMessageId: "synthetic-only",
      })
      await settlePaymentNotificationDispatch(db, {
        tenantId,
        intentId: id,
        claimId,
        outcome: "accepted",
        providerMessageId: "synthetic-only",
      })
      expect(
        await prisma.paymentNotificationQuota.findFirst({
          where: { tenantId },
        }),
      ).toMatchObject({ used: 1, reserved: 0 })
      await expect(
        cancelPaymentNotificationReservation(db, {
          tenantId: "other-business",
          intentId: id,
        }),
      ).rejects.toThrow("unavailable")
      policy.tiers.starter.email.limit = 3
      await prisma.manualPaymentAlertSetting.update({
        where: { accountId },
        data: { recipientUserIds: [userId, otherUserId] },
      })
      const groupReport = await newReport()
      const group = await reservePaymentNotificationGroup(db, {
        tenantId,
        reportId: groupReport.id,
        now,
      })
      expect(group.intentIds).toHaveLength(2)
      const first = await prisma.paymentNotificationIntent.findFirstOrThrow({
        where: { reportId: groupReport.id, recipientUserId: userId },
      })
      const nextMonth = new Date("2026-11-01T00:00:01Z")
      policy.tiers.starter.email.limit = 1
      expect(
        (
          await startPaymentNotificationDispatch(db, {
            tenantId,
            intentId: first.id,
            claimId: randomUUID(),
            expectedDestination,
            now: nextMonth,
          })
        ).maySend,
      ).toBe(false)
      expect(
        await prisma.paymentNotificationIntent.count({
          where: { reportId: groupReport.id, status: "SENDING" },
        }),
      ).toBe(0)
      expect(
        await prisma.paymentNotificationQuota.findFirst({
          where: { tenantId, periodStart: new Date("2026-10-01T00:00:00Z") },
        }),
      ).toMatchObject({ used: 1, reserved: 2 })
      policy.tiers.starter.email.limit = 2
      const groupClaim = randomUUID()
      expect(
        (
          await startPaymentNotificationDispatch(db, {
            tenantId,
            intentId: first.id,
            claimId: groupClaim,
            expectedDestination,
            now: nextMonth,
          })
        ).maySend,
      ).toBe(true)
      const rows = await prisma.paymentNotificationIntent.findMany({
        where: { reportId: groupReport.id },
      })
      expect(
        rows.every(
          (r) => r.periodStart.toISOString() === "2026-11-01T00:00:00.000Z",
        ),
      ).toBe(true)
      expect(
        await prisma.paymentNotificationQuota.findFirst({
          where: { tenantId, periodStart: new Date("2026-11-01T00:00:00Z") },
        }),
      ).toMatchObject({ used: 0, reserved: 2 })
      await settlePaymentNotificationDispatch(db, {
        tenantId,
        intentId: first.id,
        claimId: groupClaim,
        outcome: "rejected",
      })
      await retryPaymentNotificationDispatch(db, {
        tenantId,
        actorUserId: userId,
        intentId: first.id,
        now: nextMonth,
      })
      expect(
        await prisma.paymentNotificationIntent.findUnique({
          where: { id: first.id },
        }),
      ).toMatchObject({ status: "RESERVED", channel: "email", claimId: null })
      expect(
        await prisma.paymentNotificationQuota.findFirst({
          where: { tenantId, periodStart: new Date("2026-11-01T00:00:00Z") },
        }),
      ).toMatchObject({ used: 0, reserved: 2 })
      await prisma.manualPaymentAlertSetting.update({
        where: { accountId },
        data: { effectiveChannel: null },
      })
      const paused = await newReport()
      expect(
        await reservePaymentNotificationGroup(db, {
          tenantId,
          reportId: paused.id,
          now: nextMonth,
        }),
      ).toMatchObject({ state: "blocked", reason: "configuration_paused" })
      const rollback = new Error("notification policy rollback")
      const original = await prisma.systemConfiguration.findUnique({
        where: { key: "payment-report-notifications:v1" },
      })
      const commandId = randomUUID()
      try {
        await prisma.$transaction(
          async (tx) => {
            const scopedTx = new Proxy(tx, {
              get(target, key) {
                if (key === "tenant")
                  return new Proxy(tx.tenant, {
                    get(model, method) {
                      if (method === "findMany")
                        return (
                          args: Parameters<typeof tx.tenant.findMany>[0],
                        ) =>
                          tx.tenant.findMany({
                            ...args,
                            where: { ...args?.where, id: tenantId },
                          })
                      const v = Reflect.get(model, method)
                      return typeof v === "function" ? v.bind(model) : v
                    },
                  })
                const v = Reflect.get(target, key)
                return typeof v === "function" ? v.bind(target) : v
              },
            })
            const root = new Proxy(prisma, {
              get(_target, key) {
                if (key === "$transaction")
                  return (run: (t: typeof tx) => Promise<unknown>) =>
                    run(scopedTx)
                const v = Reflect.get(scopedTx, key)
                return typeof v === "function" ? v.bind(scopedTx) : v
              },
            })
            const prior = await loadPaymentNotificationPolicy(tx)
            const tiers = structuredClone(prior.policy.tiers)
            tiers.starter.email = { enabled: true, limit: 100 }
            const input = {
              commandId,
              actorId: "synthetic-oversight-owner",
              expectedRevision: prior.policy.revision,
              tiers,
              reason: "Synthetic policy transaction verification",
            }
            const saved = await savePaymentNotificationPolicy(root, input)
            expect(
              (await savePaymentNotificationPolicy(root, input)).policy
                .revision,
            ).toBe(saved.policy.revision)
            await expect(
              savePaymentNotificationPolicy(root, {
                ...input,
                reason: "A different synthetic reason",
              }),
            ).rejects.toThrow("different settings")
            await expect(
              savePaymentNotificationPolicy(root, {
                ...input,
                commandId: randomUUID(),
              }),
            ).rejects.toThrow("Settings changed")
            const apply = async (revision: number) => {
              const claimId = randomUUID()
              await tx.paymentNotificationPolicyChange.update({
                where: { revision },
                data: {
                  status: "CLAIMED",
                  claimId,
                  claimExpiresAt: new Date(now.getTime() + 60000),
                },
              })
              return processPaymentNotificationPolicyChange(root, {
                revision,
                claimId,
                now,
              })
            }
            await prisma.manualPaymentAlertSetting.findUniqueOrThrow({
              where: { accountId },
            })
            await tx.manualPaymentAlertSetting.update({
              where: { accountId },
              data: { effectiveChannel: "email" },
            })
            expect((await apply(saved.policy.revision)).completed).toBe(true)
            const disabled = structuredClone(tiers)
            disabled.starter.email.enabled = false
            const off = await savePaymentNotificationPolicy(root, {
              ...input,
              commandId: randomUUID(),
              expectedRevision: saved.policy.revision,
              tiers: disabled,
            })
            await apply(off.policy.revision)
            expect(
              (
                await tx.manualPaymentAlertSetting.findUniqueOrThrow({
                  where: { accountId },
                })
              ).effectiveChannel,
            ).toBeNull()
            const reenabled = await savePaymentNotificationPolicy(root, {
              ...input,
              commandId: randomUUID(),
              expectedRevision: off.policy.revision,
            })
            await apply(reenabled.policy.revision)
            expect(
              (
                await tx.manualPaymentAlertSetting.findUniqueOrThrow({
                  where: { accountId },
                })
              ).effectiveChannel,
            ).toBeNull()
            const list = await listPaymentNotificationChanges(scopedTx, {
              tenantId,
              actorUserId: userId,
            })
            expect(list.items).toHaveLength(3)
            expect(list.items.every((item) => item.bookId === bookId)).toBe(
              true,
            )
            expect(
              list.items.some((item) => item.kind === "action_required"),
            ).toBe(true)
            const noticeId = list.items[0]?.id
            if (!noticeId) throw new Error("Missing notice")
            await markPaymentNotificationChangesRead(root, {
              tenantId,
              actorUserId: userId,
              ids: [noticeId],
            })
            expect(
              (
                await listPaymentNotificationChanges(scopedTx, {
                  tenantId,
                  actorUserId: userId,
                })
              ).unreadCount,
            ).toBe(2)
            await tx.membership.update({
              where: { tenantId_userId: { tenantId, userId: otherUserId } },
              data: { role: "CASHIER", staffAccessMode: "SCOPED" },
            })
            const store = await tx.store.findFirstOrThrow({
              where: { tenantId },
            })
            await tx.staffStoreAssignment.create({
              data: {
                tenantId,
                membershipId: (
                  await tx.membership.findUniqueOrThrow({
                    where: {
                      tenantId_userId: { tenantId, userId: otherUserId },
                    },
                  })
                ).id,
                storeId: store.id,
                role: "CASHIER",
                status: "ACTIVE",
                updatedByUserId: userId,
              },
            })
            expect(
              (
                await listPaymentNotificationChanges(scopedTx, {
                  tenantId,
                  actorUserId: otherUserId,
                })
              ).items,
            ).toHaveLength(0)
            await tx.commercialOrder.updateMany({
              where: { tenantId },
              data: { createdByUserId: otherUserId },
            })
            expect(
              (
                await listPaymentNotificationChanges(scopedTx, {
                  tenantId,
                  actorUserId: otherUserId,
                })
              ).items,
            ).toHaveLength(3)
            await tx.membership.update({
              where: { tenantId_userId: { tenantId, userId: otherUserId } },
              data: { status: "SUSPENDED" },
            })
            await expect(
              listPaymentNotificationChanges(scopedTx, {
                tenantId,
                actorUserId: otherUserId,
              }),
            ).rejects.toThrow("Current Business")
            throw rollback
          },
          { maxWait: 10000, timeout: 30000 },
        )
      } catch (error) {
        if (error !== rollback) throw error
      }
      expect(
        await prisma.systemConfiguration.findUnique({
          where: { key: "payment-report-notifications:v1" },
        }),
      ).toEqual(original)
      expect(
        await prisma.paymentNotificationPolicyCommand.count({
          where: { id: commandId },
        }),
      ).toBe(0)
    } finally {
      await prisma.paymentNotificationNoticeRead.deleteMany({
        where: { tenantId },
      })
      await prisma.paymentNotificationNotice.deleteMany({ where: { tenantId } })
      await prisma.paymentNotificationIntent.deleteMany({ where: { tenantId } })
      await prisma.paymentNotificationQuota.deleteMany({ where: { tenantId } })
      await prisma.manualPaymentAlertSetting.deleteMany({ where: { tenantId } })
      await prisma.manualPaymentReport.deleteMany({
        where: { link: { tenantId } },
      })
      await prisma.manualPaymentLink.deleteMany({ where: { tenantId } })
      await prisma.commercialOrder.deleteMany({ where: { tenantId } })
      if (bookId) await prisma.financeAccount.deleteMany({ where: { bookId } })
      await prisma.financeBook.deleteMany({ where: { tenantId } })
      await prisma.membership.deleteMany({ where: { tenantId } })
      await prisma.store.deleteMany({ where: { tenantId } })
      await prisma.tenant.deleteMany({ where: { id: tenantId } })
      await prisma.user.deleteMany({
        where: { id: { in: [userId, otherUserId] } },
      })
      expect(await prisma.tenant.count({ where: { id: tenantId } })).toBe(0)
    }
  },
  120000,
)
