import type { PrismaClient } from "../../generated/prisma/client"
import { paymentAlertCanReview } from "./manual-payment-alert-rules"

export async function manualPaymentAlertDeliveries(
  db: PrismaClient,
  input: {
    tenantId: string
    reportId: string
    storeId: string
    allowRetry?: boolean
  },
) {
  const rows = await db.paymentNotificationIntent.findMany({
    where: {
      tenantId: input.tenantId,
      reportId: input.reportId,
      report: {
        link: { tenantId: input.tenantId, order: { storeId: input.storeId } },
      },
    },
    include: {
      report: { select: { status: true } },
      membership: {
        include: {
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
            where: {
              tenantId: input.tenantId,
              status: "ACTIVE",
              store: { status: "ACTIVE" },
            },
            select: { storeId: true, status: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  })
  return rows.flatMap((row) => {
    if (
      !paymentAlertCanReview(row.membership, input.storeId) ||
      (row.channel !== "email" && row.channel !== "whatsapp")
    )
      return []
    const status:
      | "pending"
      | "sending"
      | "sent"
      | "failed"
      | "unknown"
      | "cancelled" =
      row.status === "ACCEPTED"
        ? "sent"
        : row.status === "SENDING"
          ? "sending"
          : row.status === "UNKNOWN"
            ? "unknown"
            : row.status === "REJECTED"
              ? "failed"
              : row.status === "CANCELLED"
                ? "cancelled"
                : "pending"
    return [
      {
        userId: row.recipientUserId,
        name: row.membership.user.name,
        channel: row.channel,
        status,
        canRetry:
          input.allowRetry === true &&
          row.status === "REJECTED" &&
          row.report.status === "SUBMITTED",
      },
    ]
  })
}
