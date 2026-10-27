import { ManualPaymentError } from "@ewatrade/utils/manual-payments"
import type { PaymentReportNotificationEligibility } from "@ewatrade/utils/payment-report-notification-policy"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { assertFinanceManager } from "./finance/access"
import {
  type PaymentAlertSelection,
  maskPaymentAlertDestination,
  paymentAlertCanReview,
  paymentAlertDestination,
  paymentAlertRecipients,
} from "./manual-payment-alert-rules"
import { runInOwnTransaction } from "./own-transaction"
import { readPaymentReportNotificationEligibility } from "./payment-report-notifications/eligibility"

type Actor = { tenantId: string; actorUserId: string; bookId: string }
export type PaymentAlertEligibilityReader = (
  tx: Prisma.TransactionClient,
  input: { tenantId: string },
) => Promise<PaymentReportNotificationEligibility>

const staffInclude = {
  user: {
    select: {
      name: true,
      email: true,
      emailVerified: true,
      phone: true,
      phoneVerifiedAt: true,
    },
  },
  staffStoreAssignments: {
    where: { status: "ACTIVE" as const, store: { status: "ACTIVE" as const } },
    select: { storeId: true, status: true },
  },
} as const

async function bankContext(
  tx: Prisma.TransactionClient,
  input: Actor & { accountId?: string },
) {
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
    select: { id: true },
  })
  if (!book)
    throw new ManualPaymentError("NOT_FOUND", "Financial book not found.")
  if (input.accountId) {
    const account = await tx.financeAccount.findFirst({
      where: {
        id: input.accountId,
        bookId: input.bookId,
        kind: "ASSET",
        purpose: "BANK",
        archivedAt: null,
      },
      select: { id: true },
    })
    if (!account)
      throw new ManualPaymentError("NOT_FOUND", "Bank account not found.")
  }
}

/** An app-only Finance read. Contacts remain masked; a read grants no review access. */
export async function readManualPaymentAlertSettings(
  db: PrismaClient,
  input: Actor & { accountId?: string },
  readEligibility: PaymentAlertEligibilityReader = readPaymentReportNotificationEligibility,
) {
  return runInOwnTransaction(db, async (tx) => {
    await bankContext(tx, input)
    const [members, saved, eligibility] = await Promise.all([
      tx.membership.findMany({
        where: { tenantId: input.tenantId, status: "ACTIVE" },
        include: staffInclude,
        orderBy: [{ role: "asc" }, { id: "asc" }],
        take: 500,
      }),
      input.accountId
        ? tx.manualPaymentAlertSetting.findFirst({
            where: { accountId: input.accountId, tenantId: input.tenantId },
          })
        : null,
      readEligibility(tx, { tenantId: input.tenantId }),
    ])
    const recipients = members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      role: member.role,
      canReview: paymentAlertCanReview(member),
      email: maskPaymentAlertDestination(
        paymentAlertDestination(member, "email"),
        "email",
      ),
      phone: maskPaymentAlertDestination(
        paymentAlertDestination(member, "whatsapp"),
        "whatsapp",
      ),
      emailVerified: !!paymentAlertDestination(member, "email"),
      phoneVerified: !!paymentAlertDestination(member, "whatsapp"),
    }))
    const channel =
      saved?.channel === "email" || saved?.channel === "whatsapp"
        ? saved.channel
        : null
    const effectiveChannel =
      saved?.effectiveChannel === "email" ||
      saved?.effectiveChannel === "whatsapp"
        ? saved.effectiveChannel
        : null
    return {
      accountId: input.accountId ?? null,
      revision: saved?.revision ?? 0,
      recipientUserIds:
        saved?.recipientUserIds ??
        (input.accountId
          ? []
          : recipients
              .filter((r) => r.role === "OWNER" && r.canReview)
              .slice(0, 1)
              .map((r) => r.userId)),
      channel,
      effectiveChannel,
      recipients,
      eligibility,
    }
  })
}

/** Caller holds the finance-book lock; this joins the bank-details save transaction. */
export async function saveManualPaymentAlertsInTransaction(
  tx: Prisma.TransactionClient,
  input: Actor & {
    accountId: string
    paymentAlerts: PaymentAlertSelection
    allowCreateReplay?: boolean
  },
  readEligibility: PaymentAlertEligibilityReader = readPaymentReportNotificationEligibility,
) {
  await bankContext(tx, input)
  const previous = await tx.manualPaymentAlertSetting.findFirst({
    where: { accountId: input.accountId, tenantId: input.tenantId },
  })
  // Recover a lost create response without overwriting a later channel decision.
  if (
    input.allowCreateReplay &&
    input.paymentAlerts.expectedRevision === 0 &&
    previous?.revision === 1 &&
    previous.updatedByUserId === input.actorUserId &&
    previous.channel === input.paymentAlerts.channel &&
    previous.recipientUserIds.length ===
      input.paymentAlerts.recipientUserIds.length &&
    previous.recipientUserIds.every((id) =>
      input.paymentAlerts.recipientUserIds.includes(id),
    )
  )
    return previous
  if ((previous?.revision ?? 0) !== input.paymentAlerts.expectedRevision)
    throw new ManualPaymentError(
      "CONFLICT",
      "Payment alert settings changed. Review the latest settings before saving.",
    )
  // Membership rows remain shared-locked through commit, matching finance authority.
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${input.tenantId} AND "userId"=ANY(${input.paymentAlerts.recipientUserIds}::text[]) FOR SHARE`
  const members = await tx.membership.findMany({
    where: {
      tenantId: input.tenantId,
      userId: { in: input.paymentAlerts.recipientUserIds },
      status: "ACTIVE",
    },
    include: staffInclude,
  })
  const group = paymentAlertRecipients(members, input.paymentAlerts)
  const eligibility = await readEligibility(tx, { tenantId: input.tenantId })
  const channel = eligibility.channels[input.paymentAlerts.channel]
  if (
    eligibility.policyRevision === null ||
    !channel.available ||
    (channel.remaining !== null && channel.remaining < group.length)
  )
    throw new ManualPaymentError(
      "CONFLICT",
      channel.reason === "quota_exhausted" || channel.available
        ? "There is not enough monthly allowance for all selected staff."
        : "This notification channel is unavailable. Review your plan and try again.",
    )
  const data = {
    selectedPolicyRevision: eligibility.policyRevision,
    channel: input.paymentAlerts.channel,
    effectiveChannel: input.paymentAlerts.channel,
    recipientUserIds: input.paymentAlerts.recipientUserIds,
    updatedByUserId: input.actorUserId,
  }
  return tx.manualPaymentAlertSetting.upsert({
    where: { accountId: input.accountId },
    create: { ...data, tenantId: input.tenantId, accountId: input.accountId },
    update: { ...data, revision: { increment: 1 } },
  })
}
