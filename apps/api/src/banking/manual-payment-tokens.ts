import { readPaymentLinkToken } from "@ewatrade/payments"
import { TRPCError } from "@trpc/server"
import { paymentLinkSigningKey } from "./config"
export function manualLinkIdentity(token: string, allowExpired = false) {
  const proof = readPaymentLinkToken(
    token,
    paymentLinkSigningKey(),
    allowExpired ? new Date(0) : new Date(),
  )
  if (!proof)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This payment link is invalid or expired.",
    })
  return { linkId: proof.intentId, expiresAt: proof.expiresAt }
}
export function manualReportIdentity(token: string) {
  const proof = readPaymentLinkToken(
    token,
    paymentLinkSigningKey(),
    new Date(),
    "manual-report",
  )
  if (!proof)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This payment confirmation page is invalid or expired.",
    })
  return { reportId: proof.intentId, expiresAt: proof.expiresAt }
}
