import { reviewManualPaymentAllocation } from "@ewatrade/payments/manual-payment-allocation"
import { ManualPaymentError } from "@ewatrade/utils/manual-payments"
import type { Prisma } from "../../generated/prisma/client"
import {
  type CustomerRefundDestination,
  decryptCustomerRefundDestination,
  encryptCustomerRefundDestination,
} from "./customer-ledger/funds-destination"
import { resolveCustomerFundsSessionInTransaction } from "./customer-ledger/public-funds"

export type ManualAllocationProposal = {
  allocationPreference: "ORDER_MORE" | "CREDIT" | "REFUND" | "UNRESOLVED"
  requestedApplyMinor: number
  refundDestination?: CustomerRefundDestination
}
const pendingDestinationScope = (input: {
  tenantId: string
  linkId: string
  clientReportId: string
  customerId: string
}) => ({
  tenantId: input.tenantId,
  accountId: `manual-report:${input.linkId}:${input.customerId}`,
  creditEntryId: input.clientReportId,
})

/** Customer proposals never post funds or turn requested refund details into payout authority. */
export async function prepareManualAllocationProposalInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    linkId: string
    clientReportId: string
    customerId: string | null
    claimedAmountMinor: number
    requestedAmountMinor: number
    orderBalanceMinor: number
    proposal: ManualAllocationProposal
    authenticatedUserId: string | null
    authenticatedSessionId: string | null
    destinationEncryptionKey?: string
  },
) {
  const { proposal } = input
  let reviewed: ReturnType<typeof reviewManualPaymentAllocation>
  try {
    reviewed = reviewManualPaymentAllocation({
      ...input,
      proposal: {
        orderAmountMinor: proposal.requestedApplyMinor,
        excessTreatment:
          proposal.allocationPreference === "CREDIT"
            ? "KEEP_CREDIT"
            : proposal.allocationPreference === "REFUND"
              ? "REFUND_REQUESTED"
              : "BUSINESS_REVIEW",
      },
    })
  } catch {
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Review the transferred amount, current Order balance and excess allocation.",
    )
  }
  if (
    reviewed.excessAmountMinor > 0 &&
    proposal.allocationPreference === "ORDER_MORE"
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Choose how the business should review the excess.",
    )
  if (
    reviewed.excessAmountMinor > 0 &&
    !input.customerId &&
    proposal.allocationPreference !== "UNRESOLVED"
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Ask the business to resolve the excess before choosing customer credit or a refund.",
    )
  if (
    proposal.refundDestination &&
    (proposal.allocationPreference !== "REFUND" ||
      reviewed.excessAmountMinor <= 0)
  )
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Refund details require an excess refund request.",
    )
  let destination: {
    destinationCiphertext: string
    destinationFingerprint: string
  } | null = null
  if (proposal.refundDestination)
    destination = await sealManualRefundDestinationInTransaction(tx, {
      ...input,
      refundDestination: proposal.refundDestination,
    })
  return {
    allocationPreference: proposal.allocationPreference,
    requestedApplyMinor: BigInt(reviewed.proposedOrderAmountMinor),
    refundDestinationCiphertext: destination?.destinationCiphertext ?? null,
    refundDestinationFingerprint: destination?.destinationFingerprint ?? null,
  }
}

/** Finance-authorized caller rewraps a verified report request into its real held source. */
export function rewrapManualRefundDestination(input: {
  tenantId: string
  linkId: string
  clientReportId: string
  reportCiphertext: string
  customerId: string
  accountId: string
  creditEntryId: string
  destinationEncryptionKey: string
}) {
  const destination = decryptCustomerRefundDestination(
    input.reportCiphertext,
    pendingDestinationScope(input),
    input.destinationEncryptionKey,
  )
  return encryptCustomerRefundDestination(
    destination,
    {
      tenantId: input.tenantId,
      accountId: input.accountId,
      creditEntryId: input.creditEntryId,
    },
    input.destinationEncryptionKey,
  )
}

export async function sealManualRefundDestinationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    linkId: string
    clientReportId: string
    customerId: string | null
    authenticatedUserId: string | null
    authenticatedSessionId: string | null
    destinationEncryptionKey?: string
    refundDestination: CustomerRefundDestination
  },
) {
  if (!/^\d{10}$/.test(input.refundDestination.accountNumber.trim()))
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Enter the ten-digit receiving refund account.",
    )
  const proof = await resolveCustomerFundsSessionInTransaction(tx, input)
  if (
    !proof ||
    proof.tenantId !== input.tenantId ||
    proof.customerId !== input.customerId
  )
    throw new ManualPaymentError(
      "FORBIDDEN",
      "Verify this customer's account before adding refund details.",
    )
  if (!input.destinationEncryptionKey)
    throw new ManualPaymentError(
      "BAD_REQUEST",
      "Refund details are unavailable. Ask the business to resolve the excess.",
    )
  return encryptCustomerRefundDestination(
    input.refundDestination,
    pendingDestinationScope({ ...input, customerId: proof.customerId }),
    input.destinationEncryptionKey,
  )
}
