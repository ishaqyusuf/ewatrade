import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"
import { HostedCheckoutProviderError } from "./hosted-checkout-errors"
import type { HostedPaymentProvider } from "./index"

export type PrescriptionCheckoutInput = {
  acceptanceToken: string
  clientPaymentId: string
  statusToken: string
}

export type PrescriptionCheckoutResult = {
  checkoutUrl: string
  statusToken: string
}

export type PrescriptionCheckoutRepository = {
  attachCheckout(input: {
    checkoutUrl: string
    expiresAt?: Date
    intentId: string
    providerReference: string
  }): Promise<unknown>
  claimCheckout(input: {
    intentId: string
    providerReference: string
  }): Promise<
    | { kind: "claimed" }
    | { kind: "initializing" }
    | { checkoutUrl: string; kind: "ready" }
  >
  prepareCheckout(
    input: PrescriptionCheckoutInput & { provider: string },
  ): Promise<{
    amountMinor: number
    currencyCode: string
    customerEmail: string
    intentId: string
    providerReference: string
    statusToken: string
    tenantDataClassification: "LIVE" | "QA"
  }>
  recordProviderBlocked?(input: {
    intentId: string
    operation: "payment"
    outcome: string
  }): Promise<unknown>
  releaseCheckoutClaim(input: {
    intentId: string
    providerReference: string
  }): Promise<{ released: boolean }>
}

export class PrescriptionCheckoutHandoffError extends Error {
  constructor(
    readonly code:
      | "INITIALIZING"
      | "PROVIDER_UNAVAILABLE"
      | "QA_LIVE_EFFECT_BLOCKED",
    message: string,
  ) {
    super(message)
    this.name = "PrescriptionCheckoutHandoffError"
  }
}

const CHECKOUT_ATTACHMENT_ATTEMPTS = 3

async function attachCreatedCheckout(
  dependencies: PrescriptionCheckoutRepository,
  input: Parameters<PrescriptionCheckoutRepository["attachCheckout"]>[0],
) {
  let lastError: unknown
  for (let attempt = 0; attempt < CHECKOUT_ATTACHMENT_ATTEMPTS; attempt += 1) {
    try {
      await dependencies.attachCheckout(input)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function createPrescriptionHostedCheckoutHandoff(
  input: PrescriptionCheckoutInput,
  dependencies: PrescriptionCheckoutRepository & {
    provider: HostedPaymentProvider
    storefrontUrl?: string
  },
): Promise<PrescriptionCheckoutResult> {
  const prepared = await dependencies.prepareCheckout({
    ...input,
    provider: dependencies.provider.key,
  })
  const providerDecision = evaluateQaProviderPolicy({
    adapter: "live",
    operation: "payment",
    tenantDataClassification: prepared.tenantDataClassification,
  })
  if (!providerDecision.allowed) {
    await dependencies.recordProviderBlocked?.({
      intentId: prepared.intentId,
      operation: "payment",
      outcome: providerDecision.code,
    })
    throw new PrescriptionCheckoutHandoffError(
      "QA_LIVE_EFFECT_BLOCKED",
      providerDecision.message,
    )
  }
  const claim = await dependencies.claimCheckout({
    intentId: prepared.intentId,
    providerReference: prepared.providerReference,
  })
  if (claim.kind === "ready") {
    return {
      checkoutUrl: claim.checkoutUrl,
      statusToken: prepared.statusToken,
    }
  }
  if (claim.kind === "initializing") {
    throw new PrescriptionCheckoutHandoffError(
      "INITIALIZING",
      "Checkout is being prepared. Try again shortly.",
    )
  }

  const storefrontUrl = (
    dependencies.storefrontUrl ??
    process.env.STOREFRONT_URL ??
    "http://ewatrade-storefront.localhost"
  ).replace(/\/$/, "")
  let checkout: Awaited<ReturnType<HostedPaymentProvider["createCheckout"]>>
  try {
    checkout = await dependencies.provider.createCheckout({
      amountMinor: prepared.amountMinor,
      callbackUrl: `${storefrontUrl}/prescription-payment/${prepared.statusToken}`,
      currencyCode: prepared.currencyCode,
      customerEmail: prepared.customerEmail,
      metadata: { paymentIntentId: prepared.intentId },
      reference: prepared.providerReference,
    })
  } catch (error) {
    if (
      error instanceof HostedCheckoutProviderError &&
      error.code === "DEFINITE_FAILURE"
    ) {
      try {
        const release = await dependencies.releaseCheckoutClaim({
          intentId: prepared.intentId,
          providerReference: prepared.providerReference,
        })
        if (!release.released)
          throw new Error("Checkout initialization claim was not released.")
      } catch {
        throw new PrescriptionCheckoutHandoffError(
          "INITIALIZING",
          "Checkout is being reconciled. Try again shortly.",
        )
      }
      throw new PrescriptionCheckoutHandoffError(
        "PROVIDER_UNAVAILABLE",
        "Checkout is temporarily unavailable. Try again.",
      )
    }
    throw new PrescriptionCheckoutHandoffError(
      "INITIALIZING",
      "Checkout is being reconciled. Try again shortly.",
    )
  }
  if (checkout.providerReference !== prepared.providerReference) {
    throw new PrescriptionCheckoutHandoffError(
      "INITIALIZING",
      "Checkout is being reconciled. Try again shortly.",
    )
  }
  try {
    await attachCreatedCheckout(dependencies, {
      checkoutUrl: checkout.checkoutUrl,
      expiresAt: checkout.expiresAt,
      intentId: prepared.intentId,
      providerReference: prepared.providerReference,
    })
    return {
      checkoutUrl: checkout.checkoutUrl,
      statusToken: prepared.statusToken,
    }
  } catch {
    throw new PrescriptionCheckoutHandoffError(
      "INITIALIZING",
      "Checkout is being reconciled. Try again shortly.",
    )
  }
}
