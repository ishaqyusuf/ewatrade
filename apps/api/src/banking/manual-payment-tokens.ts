import { readPaymentLinkToken } from "@ewatrade/payments"
import {
  isManualPaymentShortCode,
  manualPaymentLinkId,
} from "@ewatrade/utils/manual-payments"
import { TRPCError } from "@trpc/server"
import { paymentLinkSigningKey } from "./config"
export function manualLinkIdentity(
  token: string,
  allowExpired = false,
  now = new Date(),
) {
  const proof = readPaymentLinkToken(
    token,
    paymentLinkSigningKey(),
    allowExpired && Number.isFinite(now.getTime()) ? new Date(0) : now,
  )
  if (!proof)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This payment link is invalid or expired.",
    })
  return { linkId: proof.intentId, expiresAt: proof.expiresAt }
}

/** A short handle grants the same single-link access; report proofs remain purpose-signed. */
export async function resolveManualLinkIdentity(
  token: string,
  options: {
    readShortLink: (
      code: string,
    ) => Promise<{ linkId: string; expiresAt: Date } | null>
    allowExpired?: boolean
    now?: Date
  },
) {
  const now = options.now ?? new Date()
  if (!isManualPaymentShortCode(token))
    return manualLinkIdentity(token, options.allowExpired, now)
  const proof = await options.readShortLink(token)
  if (
    !proof ||
    proof.linkId !== manualPaymentLinkId(token) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(proof.expiresAt.getTime()) ||
    (!options.allowExpired && proof.expiresAt <= now)
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This payment link is invalid or expired.",
    })
  return proof
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
