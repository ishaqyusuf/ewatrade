import type { Prisma } from "../../../generated/prisma/client"
import { financePostingCommandId } from "../finance/commands"
import type { FinancePostingInput } from "../finance/posting"
import { FinanceError, financeAmount } from "../finance/rules"
import {
  lockCommerceFinancialOrder,
  readHeldCommerceFinanceBook,
} from "./commerce-locks"
import { getUnbilledOrderFundsControl } from "./funds-order-control"
import { postingLinesMatch } from "./reversal-sources"

export type CustomerBillingReclassificationSource = {
  tenantId: string
  orderId: string
} & (
  | { kind: "CREDIT_RELEASE" | "CREDIT_ALLOCATION"; clientCommandId: string }
  | { kind: "CASH_COLLECTION"; paymentId: string }
)

/** Internal source adapter: only stored billing/collection/allocation identities, never arbitrary lines. */
export async function resolveCustomerBillingReclassification(
  tx: Prisma.TransactionClient,
  source: CustomerBillingReclassificationSource,
) {
  const locked = await lockCommerceFinancialOrder(tx, source)
  const book = locked && (await readHeldCommerceFinanceBook(tx, locked, source))
  if (!locked || !book || !locked.context?.accountId)
    throw new FinanceError(
      "CONFLICT",
      "The billed Order's customer financial context is unavailable.",
    )
  const order = locked.order
  const billing = await tx.financeJournalEntry.findUnique({
    where: {
      bookId_sourceKind_sourceId: {
        bookId: book.id,
        sourceKind: "COMMERCIAL_ORDER_BILLED",
        sourceId: order.id,
      },
    },
    include: { reversal: { select: { id: true } } },
  })
  if (!billing || billing.reversal || billing.reversalOfId)
    throw new FinanceError(
      "CONFLICT",
      "Post the current Order billing before reclassifying its funds.",
    )
  const [control, receivable, advance] = await Promise.all([
    getUnbilledOrderFundsControl(tx, book.id),
    tx.financeAccount.findFirst({
      where: {
        bookId: book.id,
        code: "1200",
        kind: "ASSET",
        purpose: "RECEIVABLE",
        archivedAt: null,
      },
    }),
    tx.financeAccount.findFirst({
      where: {
        bookId: book.id,
        kind: "LIABILITY",
        purpose: "CUSTOMER_ADVANCE",
        archivedAt: null,
      },
    }),
  ])
  if (!receivable || !advance)
    throw new FinanceError(
      "CONFLICT",
      "Customer control accounts are unavailable for billing reconciliation.",
    )
  let input: FinancePostingInput
  if (source.kind === "CASH_COLLECTION") {
    const payment = await tx.commercialOrderPayment.findFirst({
      where: {
        id: source.paymentId,
        tenantId: source.tenantId,
        orderId: order.id,
      },
    })
    if (
      !payment ||
      payment.method === "CUSTOMER_CREDIT" ||
      !payment.moneyAccountId
    )
      throw new FinanceError(
        "CONFLICT",
        "Choose an original unbilled cash collection source.",
      )
    const original = await tx.financeJournalEntry.findUnique({
      where: {
        bookId_sourceKind_sourceId: {
          bookId: book.id,
          sourceKind: "COMMERCIAL_ORDER_COLLECTION",
          sourceId: payment.id,
        },
      },
      include: {
        reversal: { select: { id: true } },
        lines: {
          include: {
            account: { select: { id: true, kind: true, purpose: true } },
          },
        },
      },
    })
    const moneyLine = original?.lines.find(
      (line) => line.accountId === payment.moneyAccountId,
    )
    const refund = payment.type === "REFUND"
    const amount = BigInt(payment.amountMinor)
    if (
      !original ||
      original.reversal ||
      original.reversalOfId ||
      !moneyLine ||
      !["CASH", "BANK", "CLEARING"].includes(moneyLine.account.purpose) ||
      !postingLinesMatch(original.lines, [
        {
          accountId: payment.moneyAccountId,
          kind: "ASSET",
          purpose: moneyLine.account.purpose,
          side: refund ? "CREDIT" : "DEBIT",
          amount,
        },
        {
          accountId: control.id,
          kind: "LIABILITY",
          purpose: "OTHER",
          side: refund ? "DEBIT" : "CREDIT",
          amount,
        },
      ])
    )
      throw new FinanceError(
        "CONFLICT",
        "The original collection does not reconcile to Order custody.",
      )
    input = {
      tenantId: source.tenantId,
      actorUserId: payment.recordedByUserId,
      bookId: book.id,
      clientCommandId: financePostingCommandId(
        `billing-collection:${payment.id}`,
        "reclassify",
      ),
      sourceKind: "COMMERCIAL_COLLECTION_BILLING_RECLASS",
      sourceId: payment.id,
      effectiveAt:
        payment.recordedAt > billing.effectiveAt
          ? payment.recordedAt
          : billing.effectiveAt,
      storeId: order.storeId,
      description: `Reclassify collected funds to billed Order ${order.orderNumber}`,
      lines: [
        {
          accountId: control.id,
          side: refund ? "CREDIT" : "DEBIT",
          amountMinor: amount.toString(),
        },
        {
          accountId: receivable.id,
          side: refund ? "DEBIT" : "CREDIT",
          amountMinor: amount.toString(),
        },
      ],
    }
  } else {
    const command = await tx.customerLedgerCommand.findUnique({
      where: {
        tenantId_clientCommandId: {
          tenantId: source.tenantId,
          clientCommandId: source.clientCommandId,
        },
      },
    })
    const value = command?.result
    if (
      !command ||
      command.accountId !== locked.context.accountId ||
      command.kind !== "RECLASSIFY_UNBILLED_CREDIT" ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !value.audit ||
      typeof value.audit !== "object" ||
      Array.isArray(value.audit)
    )
      throw new FinanceError(
        "CONFLICT",
        "The credit billing reconciliation source is unavailable.",
      )
    const audit = value.audit
    if (
      typeof value.id !== "string" ||
      typeof audit.originalAllocationId !== "string" ||
      typeof audit.releaseId !== "string" ||
      typeof audit.correctionEntryId !== "string" ||
      audit.orderId !== order.id ||
      typeof audit.amountMinor !== "string"
    )
      throw new FinanceError(
        "CONFLICT",
        "The credit billing reconciliation identity is invalid.",
      )
    const amount = financeAmount(audit.amountMinor)
    const [original, replacement, release, correction] = await Promise.all([
      tx.customerLedgerAllocation.findFirst({
        where: {
          id: audit.originalAllocationId,
          accountId: locked.context.accountId,
        },
        include: { charge: true, releases: true, orderSettlement: true },
      }),
      tx.customerLedgerAllocation.findFirst({
        where: { id: value.id, accountId: locked.context.accountId },
        include: { charge: true },
      }),
      tx.customerLedgerAllocationRelease.findUnique({
        where: { id: audit.releaseId },
      }),
      tx.customerLedgerEntry.findFirst({
        where: {
          id: audit.correctionEntryId,
          accountId: locked.context.accountId,
        },
      }),
    ])
    if (
      !original ||
      !replacement ||
      !release ||
      !correction ||
      !original.orderSettlement ||
      original.orderSettlement.orderId !== order.id ||
      original.orderSettlement.tenantId !== source.tenantId ||
      original.orderSettlement.method !== "CUSTOMER_CREDIT" ||
      original.orderSettlement.type !== "PAYMENT" ||
      BigInt(original.orderSettlement.amountMinor) !== original.amountMinor ||
      original.charge.orderId !== order.id ||
      original.charge.kind !== "ORDER_PAYMENT" ||
      original.charge.side !== "DEBIT" ||
      original.charge.sourceKind !== "CUSTOMER_UNBILLED_ORDER_CREDIT" ||
      original.charge.sourceId !== original.id ||
      original.charge.amountMinor !== original.amountMinor ||
      original.releases.reduce((sum, row) => sum + row.amountMinor, 0n) !==
        original.amountMinor ||
      replacement.creditEntryId !== original.creditEntryId ||
      replacement.amountMinor !== amount ||
      replacement.charge.orderId !== order.id ||
      replacement.charge.kind !== "ORDER_CHARGE" ||
      replacement.charge.sourceKind !== "COMMERCIAL_ORDER_BILLED" ||
      replacement.charge.sourceId !== order.id ||
      replacement.charge.amountMinor !== BigInt(order.totalMinor) ||
      release.allocationId !== original.id ||
      release.amountMinor !== amount ||
      correction.kind !== "REVERSAL" ||
      correction.side !== "CREDIT" ||
      correction.sourceKind !== "CUSTOMER_UNBILLED_CREDIT_RELEASE" ||
      correction.sourceId !== release.id ||
      correction.amountMinor !== amount ||
      correction.sequence !== release.sequence ||
      replacement.sequence !== release.sequence ||
      command.actorUserId !== correction.actorUserId
    )
      throw new FinanceError(
        "CONFLICT",
        "The credit billing reconciliation does not conserve its exact original source.",
      )
    const bridge = await tx.customerLedgerAllocation.findFirst({
      where: {
        accountId: locked.context.accountId,
        creditEntryId: correction.id,
        chargeEntryId: original.chargeEntryId,
        sequence: release.sequence,
        amountMinor: amount,
      },
    })
    const originalPosting = await tx.financeJournalEntry.findUnique({
      where: {
        bookId_sourceKind_sourceId: {
          bookId: book.id,
          sourceKind: "CUSTOMER_CREDIT_ALLOCATION",
          sourceId: original.id,
        },
      },
      include: {
        reversal: { select: { id: true } },
        lines: {
          include: {
            account: { select: { id: true, kind: true, purpose: true } },
          },
        },
      },
    })
    if (
      !bridge ||
      !originalPosting ||
      originalPosting.reversal ||
      originalPosting.reversalOfId ||
      !postingLinesMatch(originalPosting.lines, [
        {
          accountId: advance.id,
          kind: "LIABILITY",
          purpose: "CUSTOMER_ADVANCE",
          side: "DEBIT",
          amount: original.amountMinor,
        },
        {
          accountId: control.id,
          kind: "LIABILITY",
          purpose: "OTHER",
          side: "CREDIT",
          amount: original.amountMinor,
        },
      ])
    )
      throw new FinanceError(
        "CONFLICT",
        "The original held-credit custody posting is unavailable.",
      )
    const releasing = source.kind === "CREDIT_RELEASE"
    input = {
      tenantId: source.tenantId,
      actorUserId: correction.actorUserId,
      bookId: book.id,
      clientCommandId: financePostingCommandId(
        source.clientCommandId,
        releasing ? "release-posting" : "allocation-posting",
      ),
      sourceKind: releasing
        ? "CUSTOMER_ALLOCATION_RELEASE"
        : "CUSTOMER_CREDIT_ALLOCATION",
      sourceId: releasing ? release.id : replacement.id,
      effectiveAt: correction.effectiveAt,
      storeId: order.storeId,
      description: `Reclassify held funds to billed Order ${order.orderNumber}`,
      lines: releasing
        ? [
            {
              accountId: control.id,
              side: "DEBIT",
              amountMinor: amount.toString(),
            },
            {
              accountId: advance.id,
              side: "CREDIT",
              amountMinor: amount.toString(),
            },
          ]
        : [
            {
              accountId: advance.id,
              side: "DEBIT",
              amountMinor: amount.toString(),
            },
            {
              accountId: receivable.id,
              side: "CREDIT",
              amountMinor: amount.toString(),
            },
          ],
    }
  }
  return { book, input }
}
