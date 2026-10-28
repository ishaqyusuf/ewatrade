import type {
  CustomerLedgerAccount,
  FinanceBook,
  Prisma,
} from "../../../generated/prisma/client"
import { FinanceError } from "../finance/rules"
import { lockCommerceFinancialOrder } from "./commerce-locks"
import {
  type CustomerFundsSessionInput,
  resolveCustomerFundsSessionInTransaction,
} from "./public-funds"

/** Opaque and transaction-local. Only the customer-consent command can mint it. */
export type CustomerFundsAllocationAuthority = Readonly<{
  kind: "CUSTOMER_ORDER_CREDIT"
}>
type HeldAuthority = {
  tx: Prisma.TransactionClient
  book: FinanceBook
  account: CustomerLedgerAccount
  orderId: string
  actorUserId: string
  remaining: bigint
  paymentAttemptId: string
}
const authorities = new WeakMap<
  CustomerFundsAllocationAuthority,
  HeldAuthority
>()

export async function authorizeCustomerFundsAllocationInTransaction(
  tx: Prisma.TransactionClient,
  input: CustomerFundsSessionInput & {
    expectedRevision: string
    expectedOrderTotalMinor: string
    expectedOrderPaidMinor: string
    amountMinor: bigint
  },
  replay?: { clientCommandId: string; payloadHash: string },
) {
  const initial = await resolveCustomerFundsSessionInTransaction(tx, input)
  if (
    !initial?.account ||
    !input.authenticatedUserId ||
    !input.authenticatedSessionId
  )
    throw new FinanceError(
      "FORBIDDEN",
      "Verify this customer's account before using held funds.",
    )
  const locked = await lockCommerceFinancialOrder(tx, {
    tenantId: initial.tenantId,
    orderId: initial.order.id,
    expectedIdentity: {
      customerId: initial.customerId,
      currencyCode: initial.currencyCode,
    },
  })
  if (!locked?.context || locked.context.accountId !== initial.account.id)
    throw new FinanceError(
      "CONFLICT",
      "The Order's customer funds changed. Review again.",
    )
  // Revocation, contact and link retargeting cannot race the final proof/effect.
  await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${input.authenticatedSessionId} AND "userId" = ${input.authenticatedUserId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.authenticatedUserId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${initial.customerId} AND "tenantId" = ${initial.tenantId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM "ManualPaymentLink" WHERE id = ${input.linkId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${initial.tenantId} FOR SHARE`
  await tx.$queryRaw`SELECT id FROM "AccountPrivacyRequest" WHERE "requestKey" = ${`account-deletion:${input.authenticatedUserId}`} FOR SHARE`
  const current = await resolveCustomerFundsSessionInTransaction(tx, input)
  if (
    !current?.account ||
    current.account.id !== initial.account.id ||
    current.order.id !== initial.order.id ||
    !current.paymentAttemptId
  )
    throw new FinanceError(
      "CONFLICT",
      "Customer funds or the payment attempt changed. Review again.",
    )
  const prior = replay
    ? await tx.customerLedgerCommand.findUnique({
        where: {
          tenantId_clientCommandId: {
            tenantId: current.tenantId,
            clientCommandId: replay.clientCommandId,
          },
        },
      })
    : null
  const recovering =
    prior?.kind === "PUBLIC_ORDER_CREDIT" &&
    prior.payloadHash === replay?.payloadHash &&
    prior.accountId === current.account.id &&
    prior.actorUserId === input.authenticatedUserId
  if (prior && !recovering)
    throw new FinanceError(
      "CONFLICT",
      "This credit request was already used with different details.",
    )
  if (
    !recovering &&
    (current.account.revision.toString() !== input.expectedRevision ||
      current.order.totalMinor.toString() !== input.expectedOrderTotalMinor ||
      current.order.amountPaidMinor.toString() !==
        input.expectedOrderPaidMinor ||
      input.amountMinor <= 0n ||
      input.amountMinor >
        BigInt(current.order.totalMinor - current.order.amountPaidMinor))
  )
    throw new FinanceError(
      "CONFLICT",
      "Customer funds or the Order changed. Review the credit amount again.",
    )
  const [attribution] = await tx.$queryRaw<Array<{ usedMinor: bigint }>>`
    SELECT (
      COALESCE((SELECT SUM((command.result->>'appliedMinor')::bigint) FROM "CustomerLedgerCommand" command
        WHERE command."accountId" = ${current.account.id} AND command.kind = 'PUBLIC_ORDER_CREDIT'
          AND command.result->>'paymentAttemptId' = ${current.paymentAttemptId}), 0)
      + COALESCE((SELECT SUM(payment."amountMinor") FROM "ManualPaymentReport" report
        JOIN "CommercialOrderPayment" payment ON payment.id = report."canonicalPaymentId"
        WHERE report."attemptId" = ${current.paymentAttemptId} AND report.status = 'CONFIRMED'), 0)
    )::bigint AS "usedMinor"
  `
  if (
    !recovering &&
    input.amountMinor >
      BigInt(current.requestedMinor) - (attribution?.usedMinor ?? 0n)
  )
    throw new FinanceError(
      "CONFLICT",
      "Credit exceeds the remaining amount for this payment attempt. Review the next installment separately.",
    )
  const pendingCollection = await tx.collectionIntent.findFirst({
    where: {
      tenantId: current.tenantId,
      orderId: current.order.id,
      status: { in: ["CREATED", "PENDING"] },
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  })
  if (pendingCollection && !recovering)
    throw new FinanceError(
      "CONFLICT",
      "Another payment link is still open for this Order.",
    )
  const book = await tx.financeBook.findUniqueOrThrow({
    where: { id: locked.context.bookId },
  })
  if (
    book.tenantId !== current.tenantId ||
    book.currencyCode !== current.currencyCode
  )
    throw new FinanceError(
      "CONFLICT",
      "Customer funds and the financial book must match.",
    )
  const authority: CustomerFundsAllocationAuthority = Object.freeze({
    kind: "CUSTOMER_ORDER_CREDIT",
  })
  authorities.set(authority, {
    tx,
    book,
    account: current.account,
    orderId: current.order.id,
    actorUserId: input.authenticatedUserId,
    remaining: input.amountMinor,
    paymentAttemptId: current.paymentAttemptId,
  })
  return authority
}

/** Exact domain scope only; never a FinanceManager grant or arbitrary-journal authority. */
export function readCustomerFundsAllocationAuthority(
  tx: Prisma.TransactionClient,
  authority: CustomerFundsAllocationAuthority,
  input: {
    tenantId: string
    actorUserId: string
    accountId?: string
    bookId: string
    orderId?: string
  },
) {
  const held = authorities.get(authority)
  if (
    !held ||
    held.tx !== tx ||
    held.book.tenantId !== input.tenantId ||
    held.actorUserId !== input.actorUserId ||
    held.book.id !== input.bookId ||
    (input.accountId !== undefined && held.account.id !== input.accountId) ||
    (input.orderId !== undefined && held.orderId !== input.orderId)
  )
    throw new FinanceError(
      "FORBIDDEN",
      "Customer credit authorization does not belong to this transaction and Order.",
    )
  return held
}
export function consumeCustomerFundsAllocationAuthority(
  tx: Prisma.TransactionClient,
  authority: CustomerFundsAllocationAuthority,
  input: Parameters<typeof readCustomerFundsAllocationAuthority>[2],
  amount: bigint,
) {
  const held = readCustomerFundsAllocationAuthority(tx, authority, input)
  if (amount <= 0n || amount > held.remaining)
    throw new FinanceError(
      "CONFLICT",
      "Credit exceeds the customer's explicitly reviewed amount.",
    )
  held.remaining -= amount
}
