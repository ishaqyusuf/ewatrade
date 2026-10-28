import { randomUUID } from "node:crypto"
import type {
  CommercialOrder,
  CustomerLedgerAccount,
  CustomerLedgerEntry,
  FinanceBook,
  Prisma,
} from "../../../generated/prisma/client"
import { financePostingCommandId } from "../finance/commands"
import { postCustomerBillingReclassificationInTransaction } from "../finance/posting"
import { FinanceError, financePayloadHash } from "../finance/rules"

export function customerCreditBillingCommandId(allocationId: string) {
  return financePostingCommandId(
    `unbilled-credit-billing:${allocationId}`,
    "reclassify",
  )
}

/** Resolve old public/payment provenance to the current billed allocation, without rewriting history. */
export async function resolveCustomerAllocationAfterBilling(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; accountId: string; allocationId: string },
) {
  const command = await tx.customerLedgerCommand.findUnique({
    where: {
      tenantId_clientCommandId: {
        tenantId: input.tenantId,
        clientCommandId: customerCreditBillingCommandId(input.allocationId),
      },
    },
  })
  if (!command) return input.allocationId
  const value = command.result
  if (
    command.kind !== "RECLASSIFY_UNBILLED_CREDIT" ||
    command.accountId !== input.accountId ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.id !== "string" ||
    !value.audit ||
    typeof value.audit !== "object" ||
    Array.isArray(value.audit) ||
    value.audit.originalAllocationId !== input.allocationId
  )
    throw new FinanceError(
      "CONFLICT",
      "The original credit billing lineage cannot be verified.",
    )
  return value.id
}

/** A replacement allocation retains the immutable original Order payment as its origin. */
export async function customerAllocationBillingOrigin(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; accountId: string; allocationId: string },
) {
  const command = await tx.customerLedgerCommand.findFirst({
    where: {
      tenantId: input.tenantId,
      accountId: input.accountId,
      kind: "RECLASSIFY_UNBILLED_CREDIT",
      result: { path: ["id"], equals: input.allocationId },
    },
  })
  const value = command?.result
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !value.audit ||
    typeof value.audit !== "object" ||
    Array.isArray(value.audit) ||
    typeof value.audit.originalAllocationId !== "string"
  )
    return null
  if (
    command?.clientCommandId !==
    customerCreditBillingCommandId(value.audit.originalAllocationId)
  )
    throw new FinanceError("CONFLICT", "The billed credit origin is invalid.")
  return value.audit.originalAllocationId
}

/** Caller holds canonical Book → customer → Order locks and has posted the full billed charge. */
export async function reclassifyCustomerCreditAtBillingInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    book: FinanceBook
    account: CustomerLedgerAccount
    order: CommercialOrder
    charge: Pick<CustomerLedgerEntry, "id">
  },
) {
  const { book, account, order, charge } = input
  const allocations = await tx.customerLedgerAllocation.findMany({
    where: {
      accountId: account.id,
      orderSettlement: {
        orderId: order.id,
        method: "CUSTOMER_CREDIT",
        type: "PAYMENT",
      },
      charge: {
        tenantId: book.tenantId,
        orderId: order.id,
        sourceKind: "CUSTOMER_UNBILLED_ORDER_CREDIT",
        kind: "ORDER_PAYMENT",
        side: "DEBIT",
      },
    },
    include: { charge: true, releases: true },
    orderBy: { id: "asc" },
    take: 501,
  })
  if (allocations.length > 500)
    throw new FinanceError(
      "CONFLICT",
      "This Order requires a bounded customer-credit reconciliation review.",
    )
  for (const original of allocations) {
    if (
      original.charge.sourceId !== original.id ||
      original.charge.amountMinor !== original.amountMinor
    )
      throw new FinanceError(
        "CONFLICT",
        "The original unbilled credit source is inconsistent.",
      )
    const released = original.releases.reduce(
      (sum, row) => sum + row.amountMinor,
      0n,
    )
    const remaining = original.amountMinor - released
    if (released < 0n || remaining < 0n)
      throw new FinanceError(
        "CONFLICT",
        "Reconcile the original unbilled credit releases first.",
      )
    const clientCommandId = customerCreditBillingCommandId(original.id)
    const previous = await tx.customerLedgerCommand.findUnique({
      where: {
        tenantId_clientCommandId: { tenantId: book.tenantId, clientCommandId },
      },
    })
    if (previous) {
      // Re-resolve exact persisted source and journal payloads on billing replay.
      await postCustomerBillingReclassificationInTransaction(tx, {
        tenantId: book.tenantId,
        orderId: order.id,
        kind: "CREDIT_RELEASE",
        clientCommandId,
      })
      await postCustomerBillingReclassificationInTransaction(tx, {
        tenantId: book.tenantId,
        orderId: order.id,
        kind: "CREDIT_ALLOCATION",
        clientCommandId,
      })
      continue
    }
    if (remaining === 0n) continue
    const updated = await tx.customerLedgerAccount.update({
      where: { id: account.id },
      data: { revision: { increment: 1 }, lastSequence: { increment: 1 } },
    })
    const effectiveAt = new Date()
    const release = await tx.customerLedgerAllocationRelease.create({
      data: {
        allocationId: original.id,
        sequence: updated.lastSequence,
        amountMinor: remaining,
        reason: "Reclassify credit at Order billing; no money returned",
        actorUserId: order.createdByUserId,
        createdAt: effectiveAt,
      },
    })
    const correction = await tx.customerLedgerEntry.create({
      data: {
        tenantId: book.tenantId,
        accountId: account.id,
        sequence: updated.lastSequence,
        kind: "REVERSAL",
        side: "CREDIT",
        amountMinor: remaining,
        sourceKind: "CUSTOMER_UNBILLED_CREDIT_RELEASE",
        sourceId: release.id,
        orderId: order.id,
        storeId: order.storeId,
        actorUserId: order.createdByUserId,
        effectiveAt,
        description: `Reclassify held funds at billing: ${order.orderNumber}`,
      },
    })
    await tx.customerLedgerAllocation.create({
      data: {
        accountId: account.id,
        sequence: updated.lastSequence,
        creditEntryId: correction.id,
        chargeEntryId: original.chargeEntryId,
        amountMinor: remaining,
        actorUserId: order.createdByUserId,
        createdAt: effectiveAt,
      },
    })
    const replacement = await tx.customerLedgerAllocation.create({
      data: {
        id: randomUUID(),
        accountId: account.id,
        sequence: updated.lastSequence,
        creditEntryId: original.creditEntryId,
        chargeEntryId: charge.id,
        amountMinor: remaining,
        actorUserId: order.createdByUserId,
        createdAt: effectiveAt,
      },
    })
    await tx.customerLedgerCommand.create({
      data: {
        tenantId: book.tenantId,
        accountId: account.id,
        clientCommandId,
        kind: "RECLASSIFY_UNBILLED_CREDIT",
        payloadHash: financePayloadHash({
          bookId: book.id,
          orderId: order.id,
          originalAllocationId: original.id,
          billedChargeId: charge.id,
        }),
        actorUserId: order.createdByUserId,
        result: {
          id: replacement.id,
          audit: {
            originalAllocationId: original.id,
            releaseId: release.id,
            correctionEntryId: correction.id,
            orderId: order.id,
            billedChargeId: charge.id,
            amountMinor: remaining.toString(),
          },
        },
      },
    })
    await postCustomerBillingReclassificationInTransaction(tx, {
      tenantId: book.tenantId,
      orderId: order.id,
      kind: "CREDIT_RELEASE",
      clientCommandId,
    })
    await postCustomerBillingReclassificationInTransaction(tx, {
      tenantId: book.tenantId,
      orderId: order.id,
      kind: "CREDIT_ALLOCATION",
      clientCommandId,
    })
  }
}
