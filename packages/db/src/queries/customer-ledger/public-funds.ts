import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { isAccountPrivacyAccessBlocked } from "../account-privacy-access"
import { getCustomerLedgerTotalsInTransaction } from "./balances"
import { getCustomerFundsReservedInTransaction } from "./funds-reservations"

export function matchesVerifiedCustomerContact(
  customer: { normalizedEmail: string | null; normalizedPhone: string | null },
  user: {
    email: string
    emailVerified: boolean
    phone: string | null
    phoneVerifiedAt: Date | null
  },
) {
  const email = user.emailVerified ? user.email.trim().toLowerCase() : null
  const phone = user.phoneVerifiedAt ? user.phone?.replace(/[^\d+]/g, "") : null
  return Boolean(
    (email && customer.normalizedEmail && email === customer.normalizedEmail) ||
      (phone && customer.normalizedPhone && phone === customer.normalizedPhone),
  )
}

export type CustomerFundsSessionInput = {
  linkId: string
  /** Both IDs MUST originate from the canonical authenticated HTTP session. */
  authenticatedUserId: string | null
  authenticatedSessionId: string | null
}

/**
 * Reuses common account login/OTP, independent of a published storefront.
 * Link possession and caller-supplied customer IDs never prove customer identity.
 * This is a read/proof seam, not a FinanceActor and not refund/write authority.
 */
export async function resolveCustomerFundsSessionInTransaction(
  tx: Prisma.TransactionClient,
  input: CustomerFundsSessionInput,
) {
  if (!input.authenticatedUserId || !input.authenticatedSessionId) return null
  const now = new Date()
  const session = await tx.session.findFirst({
    where: {
      id: input.authenticatedSessionId,
      userId: input.authenticatedUserId,
      expiresAt: { gt: now },
    },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          emailVerified: true,
          phone: true,
          phoneVerifiedAt: true,
        },
      },
    },
  })
  if (
    !session ||
    (await isAccountPrivacyAccessBlocked(tx, input.authenticatedUserId))
  )
    return null
  const link = await tx.manualPaymentLink.findFirst({
    where: {
      id: input.linkId,
      closedAt: null,
      expiresAt: { gt: now },
      tenant: { isActive: true },
    },
    select: {
      id: true,
      tenantId: true,
      orderId: true,
      currencyCode: true,
      amountMinor: true,
      attempts: {
        take: 1,
        orderBy: { sequence: "desc" },
        select: { id: true },
      },
      order: {
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          customerId: true,
          currencyCode: true,
          totalMinor: true,
          amountPaidMinor: true,
          status: true,
        },
      },
    },
  })
  if (
    !link ||
    link.order.tenantId !== link.tenantId ||
    link.order.currencyCode !== link.currencyCode ||
    !link.order.customerId ||
    ["DRAFT", "PENDING", "CANCELLED", "REFUNDED"].includes(link.order.status)
  )
    return null
  const customer = await tx.customer.findFirst({
    where: { id: link.order.customerId, tenantId: link.tenantId },
    select: { id: true, normalizedEmail: true, normalizedPhone: true },
  })
  if (!customer || !matchesVerifiedCustomerContact(customer, session.user))
    return null
  const account = await tx.customerLedgerAccount.findUnique({
    where: {
      tenantId_customerId_currencyCode: {
        tenantId: link.tenantId,
        customerId: customer.id,
        currencyCode: link.currencyCode,
      },
    },
  })
  return {
    linkId: link.id,
    requestedMinor: link.amountMinor,
    paymentAttemptId: link.attempts[0]?.id ?? null,
    tenantId: link.tenantId,
    customerId: customer.id,
    currencyCode: link.currencyCode,
    account,
    order: link.order,
  }
}

export function getVerifiedCustomerFunds(
  db: PrismaClient,
  input: CustomerFundsSessionInput,
) {
  return db.$transaction(
    (tx) => getVerifiedCustomerFundsInTransaction(tx, input),
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
export async function getVerifiedCustomerFundsInTransaction(
  tx: Prisma.TransactionClient,
  input: CustomerFundsSessionInput,
) {
  const proof = await resolveCustomerFundsSessionInTransaction(tx, input)
  if (!proof) return { status: "VERIFICATION_REQUIRED" as const }
  if (!proof.account) return { status: "UNLINKED" as const }
  const [totals, reserved] = await Promise.all([
    getCustomerLedgerTotalsInTransaction(
      tx,
      proof.account.id,
      proof.account.lastSequence,
    ),
    getCustomerFundsReservedInTransaction(tx, { accountId: proof.account.id }),
  ])
  const available = BigInt(totals.availableCreditMinor) - reserved
  if (available < 0n || reserved < 0n) return { status: "UNAVAILABLE" as const }
  return {
    status: "VERIFIED" as const,
    accountId: proof.account.id,
    customerId: proof.customerId,
    currencyCode: proof.currencyCode,
    accountRevision: proof.account.revision.toString(),
    availableMinor: available.toString(),
    reservedMinor: reserved.toString(),
    showCredit: available > 0n,
    orderId: proof.order.id,
    orderTotalMinor: proof.order.totalMinor.toString(),
    orderPaidMinor: proof.order.amountPaidMinor.toString(),
  }
}
