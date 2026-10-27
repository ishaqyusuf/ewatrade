import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { emptyPaymentNotificationPolicy } from "@ewatrade/utils/payment-report-notification-policy"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import { processPaymentNotificationPolicyChange } from "./policy-changes"
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
;(enabled ? test : test.skip)(
  "delayed policy fanout preserves newer human choices and excludes later settings and Businesses",
  async () => {
    assertQaAccessAcceptanceDatabase()
    const { prisma } = await import("../../client")
    const nonce = randomUUID()
    const tenantId = `alert-fence-${nonce}`
    const lateTenantId = `alert-fence-late-${nonce}`
    const userId = `alert-fence-owner-${nonce}`
    const revision = Math.floor(Date.now() / 1000)
    const claimId = randomUUID()
    const now = new Date()
    const rollback = new Error("fence rollback")
    const before = emptyPaymentNotificationPolicy()
    before.revision = revision - 1
    before.tiers.starter.email = { enabled: true, limit: 100 }
    before.tiers.starter.whatsapp = { enabled: true, limit: 100 }
    const after = structuredClone(before)
    after.revision = revision
    after.tiers.starter.whatsapp.enabled = false
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.user.create({
            data: {
              id: userId,
              email: `${nonce}@example.test`,
              emailVerified: true,
            },
          })
          const tenant = async (id: string) => {
            await tx.tenant.create({
              data: {
                id,
                slug: id,
                name: "Isolated policy-fence QA",
                type: "MERCHANT",
                enabledModes: ["MERCHANT"],
                dataClassification: "QA",
                qaSourceDomain: "notification-fence.test",
                qaMarkedAt: now,
              },
            })
            await tx.membership.create({
              data: { tenantId: id, userId, role: "OWNER", status: "ACTIVE" },
            })
            return tx.financeBook.create({
              data: {
                tenantId: id,
                currencyCode: "NGN",
                timezone: "Africa/Lagos",
                startsAt: new Date("2026-01-01T00:00:00Z"),
                createdById: userId,
              },
            })
          }
          const book = await tenant(tenantId)
          const lateBook = await tenant(lateTenantId)
          const account = async (bookId: string, code: string) =>
            tx.financeAccount.create({
              data: {
                bookId,
                code,
                name: "Synthetic policy bank",
                kind: "ASSET",
                purpose: "BANK",
              },
            })
          const reviewed = await account(book.id, "REVIEWED")
          const automatic = await account(book.id, "AUTOMATIC")
          const later = await account(book.id, "LATER")
          const lateBusiness = await account(lateBook.id, "LATEBUSINESS")
          const older = new Date(now.getTime() - 86400000)
          const newer = new Date(now.getTime() + 86400000)
          const setting = async (
            accountId: string,
            businessId: string,
            selectedPolicyRevision: number,
            createdAt: Date,
          ) =>
            tx.manualPaymentAlertSetting.create({
              data: {
                tenantId: businessId,
                accountId,
                channel: "whatsapp",
                effectiveChannel: "whatsapp",
                recipientUserIds: [userId],
                updatedByUserId: userId,
                selectedPolicyRevision,
                createdAt,
              },
            })
          await setting(reviewed.id, tenantId, revision + 1, older)
          await setting(automatic.id, tenantId, 0, older)
          await setting(later.id, tenantId, 0, newer)
          await setting(lateBusiness.id, lateTenantId, 0, newer)
          await tx.paymentNotificationPolicyChange.create({
            data: {
              revision,
              before,
              after,
              status: "CLAIMED",
              claimId,
              claimExpiresAt: new Date(now.getTime() + 120000),
              createdAt: now,
            },
          })
          const scoped = new Proxy(tx, {
            get(target, key) {
              if (key === "tenant")
                return new Proxy(tx.tenant, {
                  get(model, method) {
                    if (method === "findMany")
                      return (args: Parameters<typeof tx.tenant.findMany>[0]) =>
                        tx.tenant.findMany({
                          ...args,
                          where: {
                            ...args?.where,
                            id: { in: [tenantId, lateTenantId] },
                          },
                        })
                    const value = Reflect.get(model, method)
                    return typeof value === "function"
                      ? value.bind(model)
                      : value
                  },
                })
              const value = Reflect.get(target, key)
              return typeof value === "function" ? value.bind(target) : value
            },
          })
          const root = new Proxy(prisma, {
            get(_target, key) {
              if (key === "$transaction")
                return (run: (t: typeof tx) => Promise<unknown>) => run(scoped)
              const value = Reflect.get(scoped, key)
              return typeof value === "function" ? value.bind(scoped) : value
            },
          })
          expect(
            (
              await processPaymentNotificationPolicyChange(root, {
                revision,
                claimId,
                now,
              })
            ).completed,
          ).toBe(true)
          const get = (accountId: string) =>
            tx.manualPaymentAlertSetting.findUniqueOrThrow({
              where: { accountId },
            })
          expect((await get(reviewed.id)).effectiveChannel).toBe("whatsapp")
          expect((await get(automatic.id)).effectiveChannel).toBe("email")
          expect((await get(later.id)).effectiveChannel).toBe("whatsapp")
          expect((await get(lateBusiness.id)).effectiveChannel).toBe("whatsapp")
          const notice = await tx.paymentNotificationNotice.findUniqueOrThrow({
            where: {
              tenantId_policyRevision: { tenantId, policyRevision: revision },
            },
          })
          expect(new Set(notice.accountIds)).toEqual(
            new Set([reviewed.id, automatic.id]),
          )
          expect(
            await tx.paymentNotificationNotice.count({
              where: { tenantId: lateTenantId },
            }),
          ).toBe(0)
          await tx.paymentNotificationPolicyChange.update({
            where: { revision },
            data: {
              status: "CLAIMED",
              claimId,
              cursor: null,
              claimExpiresAt: new Date(now.getTime() + 120000),
            },
          })
          await processPaymentNotificationPolicyChange(root, {
            revision,
            claimId,
            now,
          })
          expect(
            await tx.paymentNotificationNotice.count({ where: { tenantId } }),
          ).toBe(1)
          expect((await get(reviewed.id)).effectiveChannel).toBe("whatsapp")
          throw rollback
        },
        { maxWait: 10000, timeout: 30000 },
      )
    } catch (error) {
      if (error !== rollback) throw error
    }
    expect(
      await prisma.tenant.count({
        where: { id: { in: [tenantId, lateTenantId] } },
      }),
    ).toBe(0)
    expect(
      await prisma.paymentNotificationPolicyChange.count({
        where: { revision },
      }),
    ).toBe(0)
  },
  60000,
)
