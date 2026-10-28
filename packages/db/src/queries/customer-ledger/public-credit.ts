import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { financePostingCommandId } from "../finance/commands"
import {
  FinanceError,
  financeAmount,
  financePayloadHash,
} from "../finance/rules"
import { runInOwnTransaction } from "../own-transaction"
import { applyCustomerLedgerCreditInTransaction } from "./allocations"
import {
  authorizeCustomerFundsAllocationInTransaction,
  readCustomerFundsAllocationAuthority,
} from "./funds-allocation-authority"
import {
  type CustomerFundsSessionInput,
  resolveCustomerFundsSessionInTransaction,
} from "./public-funds"
import { assertExactHeldCreditSource } from "./reversal-sources"
import { applyUnbilledCustomerCreditInTransaction } from "./unbilled-credit"

export type ApplyVerifiedCustomerCreditInput = CustomerFundsSessionInput & {
  clientCommandId: string
  expectedRevision: string
  expectedOrderTotalMinor: string
  expectedOrderPaidMinor: string
  amountMinor: string
}
export function applyVerifiedCustomerCredit(
  db: PrismaClient,
  input: ApplyVerifiedCustomerCreditInput,
) {
  return runInOwnTransaction(db, (tx) =>
    applyVerifiedCustomerCreditInTransaction(tx, input),
  )
}
/** Explicit customer consent only; no manager impersonation, cash receipt or refund authority. */
export async function applyVerifiedCustomerCreditInTransaction(
  tx: Prisma.TransactionClient,
  input: ApplyVerifiedCustomerCreditInput,
) {
  const amount = financeAmount(input.amountMinor)
  if (
    !input.clientCommandId.trim() ||
    input.clientCommandId.length > 128 ||
    !/^(0|[1-9]\d{0,18})$/.test(input.expectedRevision) ||
    !/^(0|[1-9]\d{0,14})$/.test(input.expectedOrderPaidMinor) ||
    !/^[1-9]\d{0,14}$/.test(input.expectedOrderTotalMinor)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Review the current customer balance and Order before applying credit.",
    )
  const proof = await resolveCustomerFundsSessionInTransaction(tx, input)
  if (!proof?.account || !input.authenticatedUserId)
    throw new FinanceError(
      "FORBIDDEN",
      "Verify this customer's account before applying credit.",
    )
  const payloadHash = financePayloadHash({
    linkId: input.linkId,
    actorUserId: input.authenticatedUserId,
    accountId: proof.account.id,
    expectedRevision: input.expectedRevision,
    expectedOrderTotalMinor: input.expectedOrderTotalMinor,
    expectedOrderPaidMinor: input.expectedOrderPaidMinor,
    amountMinor: input.amountMinor,
  })
  const previous = await tx.customerLedgerCommand.findUnique({
    where: {
      tenantId_clientCommandId: {
        tenantId: proof.tenantId,
        clientCommandId: input.clientCommandId,
      },
    },
  })
  if (previous) {
    if (
      previous.kind !== "PUBLIC_ORDER_CREDIT" ||
      previous.accountId !== proof.account.id ||
      previous.actorUserId !== input.authenticatedUserId ||
      previous.payloadHash !== payloadHash
    )
      throw new FinanceError(
        "CONFLICT",
        "This credit request was already used with different details.",
      )
    return readResult(previous.result)
  }
  const authority = await authorizeCustomerFundsAllocationInTransaction(
    tx,
    {
      ...input,
      amountMinor: amount,
    },
    { clientCommandId: input.clientCommandId, payloadHash },
  )
  const held = readCustomerFundsAllocationAuthority(tx, authority, {
    tenantId: proof.tenantId,
    actorUserId: input.authenticatedUserId,
    accountId: proof.account.id,
    bookId: (
      await tx.financeBook.findUniqueOrThrow({
        where: {
          tenantId_currencyCode: {
            tenantId: proof.tenantId,
            currencyCode: proof.currencyCode,
          },
        },
      })
    ).id,
    orderId: proof.order.id,
  })
  // Recheck replay after acquiring the shared financial serialization locks.
  const raced = await tx.customerLedgerCommand.findUnique({
    where: {
      tenantId_clientCommandId: {
        tenantId: proof.tenantId,
        clientCommandId: input.clientCommandId,
      },
    },
  })
  if (raced) {
    if (
      raced.kind !== "PUBLIC_ORDER_CREDIT" ||
      raced.accountId !== proof.account.id ||
      raced.actorUserId !== input.authenticatedUserId ||
      raced.payloadHash !== payloadHash
    )
      throw new FinanceError(
        "CONFLICT",
        "This credit request was already used with different details.",
      )
    return readResult(raced.result)
  }
  const charge = await tx.customerLedgerEntry.findFirst({
    where: {
      accountId: held.account.id,
      orderId: held.orderId,
      kind: "ORDER_CHARGE",
      side: "DEBIT",
      reversals: { none: {} },
    },
    select: { id: true },
  })

  const credits = await tx.$queryRaw<
    Array<{ id: string; availableMinor: bigint }>
  >`
    SELECT e.id, (e."amountMinor" - COALESCE(a.amount,0) + COALESCE(r.amount,0) - COALESCE(h.amount,0))::bigint AS "availableMinor"
    FROM "CustomerLedgerEntry" e
    LEFT JOIN LATERAL (SELECT SUM("amountMinor") AS amount FROM "CustomerLedgerAllocation" WHERE "accountId" = e."accountId" AND "creditEntryId" = e.id) a ON TRUE
    LEFT JOIN LATERAL (SELECT SUM(rel."amountMinor") AS amount FROM "CustomerLedgerAllocationRelease" rel JOIN "CustomerLedgerAllocation" alloc ON alloc.id = rel."allocationId" WHERE alloc."accountId" = e."accountId" AND alloc."creditEntryId" = e.id) r ON TRUE
    LEFT JOIN LATERAL (SELECT SUM("amountMinor") AS amount FROM "CustomerFundsRefundRequest" WHERE "accountId" = e."accountId" AND "creditEntryId" = e.id AND status = 'RESERVED') h ON TRUE
    WHERE e."accountId" = ${held.account.id} AND e.side = 'CREDIT' AND e.kind IN ('RECEIPT','OPENING_CREDIT')
      AND NOT EXISTS (SELECT 1 FROM "CustomerLedgerEntry" reversal WHERE reversal."reversalOfId" = e.id)
      AND e."amountMinor" - COALESCE(a.amount,0) + COALESCE(r.amount,0) - COALESCE(h.amount,0) > 0
    ORDER BY e.sequence ASC LIMIT 51
  `
  let remaining = amount
  const allocationIds: string[] = []
  for (const credit of credits.slice(0, 50)) {
    if (remaining === 0n) break
    const use =
      credit.availableMinor < remaining ? credit.availableMinor : remaining
    const current = await tx.customerLedgerAccount.findUniqueOrThrow({
      where: { id: held.account.id },
      select: { revision: true },
    })
    const advance = await tx.financeAccount.findFirst({
      where: {
        bookId: held.book.id,
        kind: "LIABILITY",
        purpose: "CUSTOMER_ADVANCE",
        archivedAt: null,
      },
      select: { id: true },
    })
    const sourceCredit = await tx.customerLedgerEntry.findUniqueOrThrow({
      where: { id: credit.id },
    })
    if (
      !advance ||
      !(await assertExactHeldCreditSource(
        tx,
        { bookId: held.book.id, accountId: held.account.id },
        sourceCredit,
        advance.id,
      ))
    )
      throw new FinanceError(
        "CONFLICT",
        "Reconcile this held-credit source before spending it.",
      )
    const commandInput = {
      tenantId: proof.tenantId,
      actorUserId: input.authenticatedUserId,
      bookId: held.book.id,
      accountId: held.account.id,
      clientCommandId: financePostingCommandId(
        input.clientCommandId,
        `public-credit-${allocationIds.length}`,
      ),
      expectedRevision: current.revision.toString(),
      creditEntryId: credit.id,
      amountMinor: use.toString(),
    }
    const allocation = charge
      ? await applyCustomerLedgerCreditInTransaction(
          tx,
          { ...commandInput, chargeEntryId: charge.id },
          authority,
        )
      : await applyUnbilledCustomerCreditInTransaction(
          tx,
          { ...commandInput, orderId: held.orderId },
          authority,
        )
    allocationIds.push(allocation.id)
    remaining -= use
  }
  if (remaining !== 0n)
    throw new FinanceError(
      "CONFLICT",
      "Available credit changed or needs source reconciliation. Review this payment again.",
    )
  if (!(await resolveCustomerFundsSessionInTransaction(tx, input)))
    throw new FinanceError(
      "FORBIDDEN",
      "Customer verification expired. Sign in again before applying credit.",
    )
  const id = allocationIds[0]
  if (!id)
    throw new FinanceError(
      "CONFLICT",
      "The credit application result is unavailable.",
    )
  const result = {
    id,
    orderId: held.orderId,
    appliedMinor: input.amountMinor,
    allocationIds,
    linkId: input.linkId,
    paymentAttemptId: held.paymentAttemptId,
  }
  await tx.customerLedgerCommand.create({
    data: {
      tenantId: proof.tenantId,
      accountId: held.account.id,
      clientCommandId: input.clientCommandId,
      kind: "PUBLIC_ORDER_CREDIT",
      payloadHash,
      actorUserId: input.authenticatedUserId,
      result,
    },
  })
  return result
}
function readResult(value: Prisma.JsonValue) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.id !== "string" ||
    typeof value.orderId !== "string" ||
    typeof value.appliedMinor !== "string" ||
    !Array.isArray(value.allocationIds) ||
    !value.allocationIds.every((id) => typeof id === "string")
  )
    throw new FinanceError(
      "CONFLICT",
      "The saved customer credit result cannot be recovered.",
    )
  return {
    id: value.id,
    orderId: value.orderId,
    appliedMinor: value.appliedMinor,
    allocationIds: value.allocationIds as string[],
    linkId: typeof value.linkId === "string" ? value.linkId : null,
    paymentAttemptId:
      typeof value.paymentAttemptId === "string"
        ? value.paymentAttemptId
        : null,
  }
}
