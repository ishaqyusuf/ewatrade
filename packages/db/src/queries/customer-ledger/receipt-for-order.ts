import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  type CommercialPaymentMethodValue,
  recordCommercialOrderPaymentInTransaction,
} from "../commercial-payments"
import { financePostingCommandId } from "../finance/commands"
import { FinanceError, financeAmount } from "../finance/rules"
import { runInOwnTransaction } from "../own-transaction"
import { applyCustomerLedgerCreditInTransaction } from "./allocations"
import { customerLedgerDocumentCommand } from "./commands"
import { lockCommerceFinancialOrder } from "./commerce-locks"
import { lockPostedCustomerOrderCharge } from "./order-charges"
import {
  type RecordCustomerLedgerReceiptInput,
  recordCustomerLedgerReceiptInTransaction,
} from "./receipts"

export type ReceiptForOrderInput = RecordCustomerLedgerReceiptInput & {
  orderId: string
  expectedRevision: string
  applyMinor: string
}

export function customerReceiptConservation(received: string, apply: string) {
  const receipt = financeAmount(received)
  const applied = apply === "0" ? 0n : financeAmount(apply)
  if (applied > receipt)
    throw new FinanceError(
      "CONFLICT",
      "The Order allocation exceeds the receipt.",
    )
  return {
    receivedMinor: receipt.toString(),
    appliedMinor: applied.toString(),
    excessMinor: (receipt - applied).toString(),
  }
}

export function recordCustomerReceiptForOrder(
  db: PrismaClient,
  input: ReceiptForOrderInput,
) {
  return runInOwnTransaction(db, (tx) =>
    recordCustomerReceiptForOrderInTransaction(tx, input),
  )
}

/**
 * One cash receipt R, an explicit allocation A to the selected posted Order, and
 * held excess E. R=A+E; allocation records CUSTOMER_CREDIT settlement, never a
 * second bank collection. The caller must not also post a direct cash payment.
 * Unbilled Orders preserve their billing state: direct payment A plus held
 * receipt E post exactly R=A+E into the selected money account.
 */
export async function recordCustomerReceiptForOrderInTransaction(
  tx: Prisma.TransactionClient,
  input: ReceiptForOrderInput,
) {
  const conservation = customerReceiptConservation(
    input.amountMinor,
    input.applyMinor,
  )
  if (!/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision))
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the current customer funds first.",
    )
  const { actorUserId: _actor, tenantId: _tenant, ...payload } = input
  const result = await customerLedgerDocumentCommand(
    tx,
    input,
    "RECEIPT_FOR_ORDER",
    payload,
    async (_book, account) => {
      if (account.revision.toString() !== input.expectedRevision)
        throw new FinanceError(
          "CONFLICT",
          "Customer funds changed. Review the receipt allocation again.",
        )
      const locked = await lockCommerceFinancialOrder(tx, {
        tenantId: input.tenantId,
        orderId: input.orderId,
        expectedIdentity: {
          customerId: account.customerId,
          currencyCode: account.currencyCode,
        },
      })
      if (
        !locked ||
        locked.context?.bookId !== _book.id ||
        locked.context.accountId !== account.id ||
        ["DRAFT", "PENDING", "CANCELLED", "REFUNDED"].includes(
          locked.order.status,
        ) ||
        (input.storeId && input.storeId !== locked.order.storeId)
      )
        throw new FinanceError(
          "CONFLICT",
          "The receipt must apply to this customer's current active Order and Store.",
        )
      const billing = await tx.financeJournalEntry.findUnique({
        where: {
          bookId_sourceKind_sourceId: {
            bookId: _book.id,
            sourceKind: "COMMERCIAL_ORDER_BILLED",
            sourceId: input.orderId,
          },
        },
        include: { reversal: { select: { id: true } } },
      })
      const charge = await tx.customerLedgerEntry.findFirst({
        where: {
          accountId: account.id,
          tenantId: input.tenantId,
          orderId: input.orderId,
          kind: "ORDER_CHARGE",
          side: "DEBIT",
          reversals: { none: {} },
        },
      })
      if (!billing) {
        if (charge)
          throw new FinanceError(
            "CONFLICT",
            "Reconcile this Order's charge and billing source before recording its receipt.",
          )
        let canonicalPaymentId: string | null = null
        let receiptId: string | null = null
        let creditEntryId: string | null = null
        if (conservation.appliedMinor !== "0") {
          const methods: Partial<
            Record<
              RecordCustomerLedgerReceiptInput["method"],
              CommercialPaymentMethodValue
            >
          > = {
            BANK_TRANSFER: "bank_transfer",
            CASH: "cash",
            CARD: "card",
            POS: "pos",
            OTHER: "other",
          }
          const method = methods[input.method]
          if (!method)
            throw new FinanceError(
              "INVALID_JOURNAL",
              "Choose a supported receipt method.",
            )
          const payment = await recordCommercialOrderPaymentInTransaction(
            tx,
            {
              tenantId: input.tenantId,
              actorUserId: input.actorUserId,
              orderId: input.orderId,
              clientPaymentId: financePostingCommandId(
                input.clientCommandId,
                "unbilled-order-payment",
              ),
              amountMinor: Number(conservation.appliedMinor),
              method,
              moneyAccountId: input.moneyAccountId,
              note: input.description,
              reference: input.reference,
              effectiveAt: input.effectiveAt,
            },
            locked,
          )
          canonicalPaymentId = payment.id
        }
        if (conservation.excessMinor !== "0") {
          const receipt = await recordCustomerLedgerReceiptInTransaction(tx, {
            tenantId: input.tenantId,
            actorUserId: input.actorUserId,
            bookId: input.bookId,
            accountId: account.id,
            moneyAccountId: input.moneyAccountId,
            amountMinor: conservation.excessMinor,
            method: input.method,
            reference: input.reference,
            description: input.description,
            storeId: locked.order.storeId,
            effectiveAt: input.effectiveAt,
            clientCommandId: financePostingCommandId(
              input.clientCommandId,
              "unbilled-held-excess",
            ),
          })
          receiptId = receipt.id
          creditEntryId = (
            await tx.customerLedgerReceipt.findUniqueOrThrow({
              where: { id: receipt.id },
              select: { entryId: true },
            })
          ).entryId
        }
        const id = canonicalPaymentId ?? receiptId
        if (!id)
          throw new FinanceError(
            "CONFLICT",
            "The receipt result could not be recovered.",
          )
        return {
          id,
          audit: {
            ...conservation,
            canonicalPaymentId,
            receiptId,
            creditEntryId,
            allocationId: null,
            orderId: input.orderId,
            accountingMode: "UNBILLED_DIRECT_AND_HELD",
          },
        }
      }
      if (!charge || billing.reversal || billing.reversalOfId)
        throw new FinanceError(
          "CONFLICT",
          "Reconcile this Order's current billing before recording its receipt.",
        )
      const order = await lockPostedCustomerOrderCharge(tx, {
        book: _book,
        account,
        charge,
      })
      const receipt = await recordCustomerLedgerReceiptInTransaction(tx, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        bookId: input.bookId,
        accountId: input.accountId,
        moneyAccountId: input.moneyAccountId,
        amountMinor: input.amountMinor,
        method: input.method,
        reference: input.reference,
        description: input.description,
        storeId: order.storeId,
        effectiveAt: input.effectiveAt,
        clientCommandId: financePostingCommandId(
          input.clientCommandId,
          "order-receipt",
        ),
      })
      const saved = await tx.customerLedgerReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        select: { entryId: true },
      })
      let allocationId: string | null = null
      if (conservation.appliedMinor !== "0") {
        const current = await tx.customerLedgerAccount.findUniqueOrThrow({
          where: { id: account.id },
          select: { revision: true },
        })
        const allocation = await applyCustomerLedgerCreditInTransaction(tx, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          bookId: input.bookId,
          accountId: input.accountId,
          clientCommandId: financePostingCommandId(
            input.clientCommandId,
            "order-allocation",
          ),
          expectedRevision: current.revision.toString(),
          creditEntryId: saved.entryId,
          chargeEntryId: charge.id,
          amountMinor: conservation.appliedMinor,
        })
        allocationId = allocation.id
      }
      return {
        id: receipt.id,
        audit: {
          ...conservation,
          creditEntryId: saved.entryId,
          allocationId,
          canonicalPaymentId: allocationId
            ? (
                await tx.commercialOrderPayment.findUniqueOrThrow({
                  where: { customerAllocationId: allocationId },
                  select: { id: true },
                })
              ).id
            : null,
          receiptId: receipt.id,
          accountingMode: "BILLED_RECEIPT_ALLOCATION",
          orderId: input.orderId,
        },
      }
    },
  )
  const command = await tx.customerLedgerCommand.findUniqueOrThrow({
    where: {
      tenantId_clientCommandId: {
        tenantId: input.tenantId,
        clientCommandId: input.clientCommandId,
      },
    },
    select: { result: true },
  })
  const saved = command.result
  if (
    !saved ||
    typeof saved !== "object" ||
    Array.isArray(saved) ||
    saved.id !== result.id ||
    !saved.audit ||
    typeof saved.audit !== "object" ||
    Array.isArray(saved.audit)
  )
    throw new FinanceError(
      "CONFLICT",
      "The saved receipt provenance is unavailable.",
    )
  const audit = saved.audit
  for (const field of [
    "canonicalPaymentId",
    "receiptId",
    "creditEntryId",
    "allocationId",
  ])
    if (audit[field] !== null && typeof audit[field] !== "string")
      throw new FinanceError(
        "CONFLICT",
        "The saved receipt provenance is invalid.",
      )
  return {
    id: result.id,
    canonicalPaymentId: audit.canonicalPaymentId as string | null,
    receiptId: audit.receiptId as string | null,
    creditEntryId: audit.creditEntryId as string | null,
    allocationId: audit.allocationId as string | null,
    accountingMode: audit.accountingMode,
    ...conservation,
  }
}
