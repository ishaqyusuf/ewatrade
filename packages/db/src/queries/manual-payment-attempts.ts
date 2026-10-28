import { projectManualPaymentAttemptAmounts } from "@ewatrade/payments/manual-payment-allocation"
import { createManualPaymentReference } from "@ewatrade/payments/manual-payment-reference"
import { ManualPaymentError } from "@ewatrade/utils/manual-payments"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { effectiveCommercialAmountPaid } from "./commercial-payments"
import { runInOwnTransaction } from "./own-transaction"

type AttemptInput = {
  tenantId: string
  linkId: string
  clientAttemptId: string
}

/** Caller holds the link lock. ON CONFLICT avoids aborting the enclosing money transaction. */
export async function createManualPaymentAttemptInTransaction(
  tx: Prisma.TransactionClient,
  input: AttemptInput,
) {
  const identity = {
    linkId: input.linkId,
    clientAttemptId: input.clientAttemptId,
  }
  const previous = await tx.manualPaymentAttempt.findUnique({
    where: { linkId_clientAttemptId: identity },
  })
  if (previous) return { attempt: previous, replay: true }
  const current = await tx.manualPaymentAttempt.findFirst({
    where: { linkId: input.linkId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  })
  for (let collision = 0; collision < 3; collision++) {
    const paymentReference = createManualPaymentReference()
    const saved = await tx.manualPaymentAttempt.createMany({
      data: {
        ...input,
        paymentReference,
        sequence: (current?.sequence ?? 0) + 1,
      },
      skipDuplicates: true,
    })
    const attempt = await tx.manualPaymentAttempt.findUnique({
      where: { linkId_clientAttemptId: identity },
    })
    if (attempt) return { attempt, replay: saved.count === 0 }
  }
  throw new ManualPaymentError(
    "CONFLICT",
    "A payment reference could not be issued. Try again.",
  )
}

/** Exact decided-report proof authorizes only the next matching hint, never money/customer access. */
export function nextManualPaymentAttempt(
  db: PrismaClient,
  input: { reportId: string; clientAttemptId: string },
) {
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(input.clientAttemptId))
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Use a valid payment attempt request.",
    )
  return runInOwnTransaction(db, async (tx) => {
    const original = await tx.manualPaymentReport.findFirst({
      where: { id: input.reportId, link: { tenant: { isActive: true } } },
      select: { linkId: true },
    })
    if (!original)
      throw new ManualPaymentError("NOT_FOUND", "Payment report not found.")
    await tx.$queryRaw`SELECT id FROM "ManualPaymentLink" WHERE id=${original.linkId} FOR UPDATE`
    const report = await tx.manualPaymentReport.findUniqueOrThrow({
      where: { id: input.reportId },
      include: { link: true },
    })
    const existing = await tx.manualPaymentAttempt.findUnique({
      where: {
        linkId_clientAttemptId: {
          linkId: report.linkId,
          clientAttemptId: input.clientAttemptId,
        },
      },
    })
    if (existing) return { attempt: existing, replay: true }
    if (
      !["CONFIRMED", "NOT_RECEIVED"].includes(report.status) ||
      report.link.closedAt ||
      report.link.expiresAt <= new Date()
    )
      throw new ManualPaymentError(
        "CONFLICT",
        "Finish the current report before starting another transfer.",
      )
    const order = await tx.commercialOrder.findFirst({
      where: { id: report.link.orderId, tenantId: report.link.tenantId },
      include: { _count: { select: { payments: true } } },
    })
    if (
      !order ||
      ["DRAFT", "PENDING", "CANCELLED", "REFUNDED"].includes(order.status) ||
      effectiveCommercialAmountPaid({
        ...order,
        paymentCount: order._count.payments,
      }) >= order.totalMinor
    )
      throw new ManualPaymentError(
        "CONFLICT",
        "This Order no longer needs another transfer.",
      )
    const current = await tx.manualPaymentAttempt.findFirst({
      where: { linkId: report.linkId },
      orderBy: { sequence: "desc" },
    })
    if (current && report.attemptId !== current.id)
      throw new ManualPaymentError(
        "CONFLICT",
        "A newer payment attempt exists. Refresh the payment page.",
      )
    return createManualPaymentAttemptInTransaction(tx, {
      tenantId: report.link.tenantId,
      linkId: report.linkId,
      clientAttemptId: input.clientAttemptId,
    })
  })
}

/** Canonical attempt attribution only; this is not available Customer credit. */
export async function readManualPaymentAttemptAmounts(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: {
    tenantId: string
    linkId: string
    attemptId: string | null
    requestedMinor: number
    balanceMinor: number
  },
) {
  if (!input.attemptId)
    return {
      attemptAppliedMinor: 0,
      attemptReceivedMinor: 0,
      remainingTransferMinor: Math.max(
        0,
        Math.min(input.requestedMinor, input.balanceMinor),
      ),
    }
  const [row] = await db.$queryRaw<
    { appliedMinor: bigint; receivedMinor: bigint }[]
  >`
    SELECT
      COALESCE((SELECT SUM((command.result->>'appliedMinor')::bigint)
        FROM "CustomerLedgerCommand" command
        WHERE command."tenantId"=${input.tenantId} AND command.kind='PUBLIC_ORDER_CREDIT'
          AND command.result->>'linkId'=${input.linkId}
          AND command.result->>'paymentAttemptId'=${input.attemptId}),0)::bigint AS "appliedMinor",
      COALESCE((SELECT SUM(report."receivedAmountMinor") FROM "ManualPaymentReport" report
        JOIN "ManualPaymentLink" link ON link.id=report."linkId"
        WHERE link."tenantId"=${input.tenantId} AND link.id=${input.linkId}
          AND report."attemptId"=${input.attemptId} AND report.status='CONFIRMED'),0)::bigint AS "receivedMinor"
  `
  if (!row)
    throw new ManualPaymentError(
      "CONFLICT",
      "This payment attempt needs a current review.",
    )
  try {
    return projectManualPaymentAttemptAmounts({
      requestedMinor: input.requestedMinor,
      balanceMinor: input.balanceMinor,
      appliedMinor: row.appliedMinor,
      receivedMinor: row.receivedMinor,
    })
  } catch {
    throw new ManualPaymentError(
      "CONFLICT",
      "This payment attempt needs a current review.",
    )
  }
}
