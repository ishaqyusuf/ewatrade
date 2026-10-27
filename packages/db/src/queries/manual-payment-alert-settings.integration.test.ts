import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { PaymentReportNotificationEligibility } from "@ewatrade/utils/payment-report-notification-policy"
import { paymentNotificationPeriod } from "@ewatrade/utils/payment-report-notification-policy"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { saveManualPaymentAlertsInTransaction } from "./manual-payment-alert-settings"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const ready: PaymentReportNotificationEligibility = {
  schemaVersion: 1,
  scope: "payment_report",
  policyRevision: 1,
  planId: "starter",
  period: paymentNotificationPeriod(),
  channels: {
    email: {
      available: true,
      enabled: true,
      budget: { kind: "limited", limit: 10 },
      used: 0,
      reserved: 0,
      remaining: 10,
      reason: "available",
    },
    whatsapp: {
      available: false,
      enabled: false,
      budget: { kind: "limited", limit: 0 },
      used: 0,
      reserved: 0,
      remaining: 0,
      reason: "plan_disabled",
    },
  },
}
;(enabled ? test : test.skip)(
  "real bank alert save enforces scope, whole-group contacts, revision and capacity (existing QA bank, rollback only)",
  async () => {
    assertQaAccessAcceptanceDatabase()
    const { prisma } = await import("../client")
    const accountId = process.env.PAYMENT_ALERT_TEST_BANK_ACCOUNT_ID
    if (!accountId || accountId.length > 128)
      throw new Error(
        "Select the existing QA bank with PAYMENT_ALERT_TEST_BANK_ACCOUNT_ID.",
      )
    const account = await prisma.financeAccount.findFirst({
      where: {
        id: accountId,
        purpose: "BANK",
        archivedAt: null,
        book: { tenant: { isActive: true, dataClassification: "QA" } },
        manualPaymentLinks: { some: {} },
      },
      select: {
        id: true,
        bookId: true,
        book: {
          select: {
            tenantId: true,
            tenant: {
              select: {
                users: {
                  where: { role: "OWNER", status: "ACTIVE" },
                  take: 1,
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    })
    const owner = account?.book.tenant.users[0]
    if (!account || !owner)
      throw new Error(
        "Existing QA bank and owner are required; this test creates no bank/order fixture.",
      )
    const actor = {
      tenantId: account.book.tenantId,
      actorUserId: owner.userId,
      bookId: account.bookId,
      accountId: account.id,
    }
    const before = await prisma.manualPaymentAlertSetting.findUnique({
      where: { accountId: account.id },
    })
    const rollback = new Error("payment-alert-settings-rollback")
    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "FinanceBook" WHERE id=${account.bookId} FOR UPDATE`
          await tx.user.update({
            where: { id: owner.userId },
            data: { emailVerified: true },
          })
          const expectedRevision = before?.revision ?? 0
          const paymentAlerts = {
            recipientUserIds: [owner.userId],
            channel: "email" as const,
            expectedRevision,
          }
          const saved = await saveManualPaymentAlertsInTransaction(
            tx,
            { ...actor, paymentAlerts },
            async () => ready,
          )
          expect(saved.accountId).toBe(account.id)
          expect(saved.tenantId).toBe(actor.tenantId)
          expect(saved.revision).toBe(expectedRevision + 1)
          expect(saved.channel).toBe("email")
          expect(saved.recipientUserIds).toEqual([owner.userId])
          await expect(
            saveManualPaymentAlertsInTransaction(
              tx,
              { ...actor, paymentAlerts },
              async () => ready,
            ),
          ).rejects.toThrow("changed")
          await expect(
            saveManualPaymentAlertsInTransaction(
              tx,
              { ...actor, tenantId: "another-tenant", paymentAlerts },
              async () => ready,
            ),
          ).rejects.toThrow("Owners")
          const userId = `alert-settings-${randomUUID()}`
          await tx.user.create({
            data: {
              id: userId,
              email: `${userId}@example.test`,
              emailVerified: false,
            },
          })
          await tx.membership.create({
            data: {
              tenantId: actor.tenantId,
              userId,
              role: "ADMIN",
              status: "ACTIVE",
            },
          })
          const group = {
            recipientUserIds: [owner.userId, userId],
            channel: "email" as const,
            expectedRevision: saved.revision,
          }
          await expect(
            saveManualPaymentAlertsInTransaction(
              tx,
              { ...actor, paymentAlerts: group },
              async () => ready,
            ),
          ).rejects.toThrow("verified")
          await tx.user.update({
            where: { id: userId },
            data: { emailVerified: true },
          })
          await expect(
            saveManualPaymentAlertsInTransaction(
              tx,
              { ...actor, paymentAlerts: group },
              async () => ({
                ...ready,
                channels: {
                  ...ready.channels,
                  email: { ...ready.channels.email, remaining: 1 },
                },
              }),
            ),
          ).rejects.toThrow("all selected")
          await tx.membership.update({
            where: { tenantId_userId: { tenantId: actor.tenantId, userId } },
            data: { status: "REMOVED" },
          })
          await expect(
            saveManualPaymentAlertsInTransaction(
              tx,
              { ...actor, paymentAlerts: group },
              async () => ready,
            ),
          ).rejects.toThrow("access")
          expect(
            (
              await tx.manualPaymentAlertSetting.findUniqueOrThrow({
                where: { accountId: account.id },
              })
            ).revision,
          ).toBe(saved.revision)
          throw rollback
        },
        { maxWait: 10_000, timeout: 30_000 },
      ),
    ).rejects.toBe(rollback)
    expect(
      await prisma.manualPaymentAlertSetting.findUnique({
        where: { accountId: account.id },
      }),
    ).toEqual(before)
  },
  45_000,
)
