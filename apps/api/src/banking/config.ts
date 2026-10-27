import { TRPCError } from "@trpc/server"

export function paymentLinkSigningKey(env = process.env) {
  const secret =
    env.PAYMENT_LINK_SIGNING_KEY ?? env.BETTER_AUTH_SECRET ?? env.AUTH_SECRET
  if (!secret || secret.length < 32)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Payment link signing is not configured.",
    })
  return secret
}

export function paymentLinkOrigin(env = process.env) {
  const origin = env.PAYMENT_LINK_PUBLIC_ORIGIN ?? env.NEXT_PUBLIC_DASHBOARD_URL
  if (!origin)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The public payment address is not configured.",
    })
  return origin
}
