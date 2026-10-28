import {
  applyVerifiedCustomerCredit,
  getVerifiedCustomerFunds,
  shortManualPaymentLinkIdentity,
} from "@ewatrade/db/queries"
import { manualPaymentLinkPath } from "@ewatrade/utils/manual-payments"
import type { TRPCContext } from "../trpc/init"
import { resolveManualLinkIdentity } from "./manual-payment-tokens"

export function manualPaymentCustomerSessionPrincipal(
  ctx: Pick<TRPCContext, "session" | "qaSessionScope">,
) {
  const session =
    !ctx.qaSessionScope && !ctx.session?.session?.token.startsWith("qas_")
      ? ctx.session?.session
      : null
  return {
    authenticatedUserId: session ? (ctx.session?.user.id ?? null) : null,
    authenticatedSessionId: session?.id ?? null,
  }
}

export async function manualPaymentCustomerFundsIdentity(
  ctx: Pick<TRPCContext, "db" | "session" | "qaSessionScope">,
  token: string,
) {
  const identity = await resolveManualLinkIdentity(token, {
    readShortLink: (code) => shortManualPaymentLinkIdentity(ctx.db, code),
  })
  return {
    linkId: identity.linkId,
    ...manualPaymentCustomerSessionPrincipal(ctx),
  }
}

/** Canonical account session only. No storefront cookie or client-chosen customer IDs. */
export async function readManualPaymentCustomerFunds(
  ctx: Pick<TRPCContext, "db" | "session" | "qaSessionScope">,
  token: string,
) {
  const funds = await getVerifiedCustomerFunds(
    ctx.db,
    await manualPaymentCustomerFundsIdentity(ctx, token),
  )
  return {
    ...funds,
    verificationUrl: `/login?next=${encodeURIComponent(manualPaymentLinkPath(token))}`,
  }
}

/** Explicit current review snapshot is mandatory; server owns all customer/finance scope. */
export async function applyManualPaymentCustomerFunds(
  ctx: Pick<TRPCContext, "db" | "session" | "qaSessionScope">,
  input: {
    token: string
    clientCommandId: string
    expectedRevision: string
    expectedOrderTotalMinor: string
    expectedOrderPaidMinor: string
    amountMinor: string
  },
) {
  const { token, ...review } = input
  const proof = await manualPaymentCustomerFundsIdentity(ctx, token)
  return applyVerifiedCustomerCredit(ctx.db, { ...review, ...proof })
}
