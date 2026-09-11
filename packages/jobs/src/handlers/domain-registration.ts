import { prisma } from "@ewatrade/db/client"
import {
  completeDomainRegistration,
  failDomainRegistrationAttempt,
  markDomainOrderRefundPending,
  startDomainRegistrationAttempt,
  updateDomainConnectionStatus,
} from "@ewatrade/db/queries"
import {
  DomainProviderError,
  PaystackClient,
  VercelDomainClient,
  createDomainProvider,
  decryptRegistrant,
} from "@ewatrade/domains"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type DomainRegistrationPayload = { orderId: string }

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

export function isUncertainDomainRegistrationFailure(
  error: unknown,
  providerAcceptedRegistration: boolean,
) {
  return (
    (error instanceof DomainProviderError && error.isUncertain) ||
    providerAcceptedRegistration
  )
}

export async function domainRegistrationHandler(
  input: DomainRegistrationPayload,
  _attempt: number,
) {
  const claim = await startDomainRegistrationAttempt(prisma, input)

  if (!claim.attempt || claim.attempt.status !== "RUNNING") {
    return
  }

  try {
    await assertQaJobProviderAllowed({
      operation: "domain_registration",
      tenantId: claim.order.tenantId,
    })
  } catch (error) {
    await failDomainRegistrationAttempt(prisma, {
      attemptId: claim.attempt.id,
      errorCode: "QA_LIVE_EFFECT_BLOCKED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "QA provider operation blocked",
      isUncertain: false,
      orderId: claim.order.id,
    })
    return
  }

  let completed: Awaited<ReturnType<typeof completeDomainRegistration>>
  let providerAcceptedRegistration = false

  try {
    if (claim.order.provider === "EXTERNAL") {
      throw new Error("External domains cannot be registered by a provider.")
    }

    const vercelProjectId = requireEnv("VERCEL_STOREFRONT_PROJECT_ID")
    const provider = createDomainProvider(claim.order.provider)
    const registrant = decryptRegistrant(
      claim.order.registrantProfile.encryptedPayload,
    )
    const registration = await provider.registerDomain({
      acceptedProviderCost: {
        amountMinor: claim.order.providerCostMinor,
        currencyCode: claim.order.providerCurrencyCode,
      },
      domain: claim.order.normalizedDomain,
      idempotencyKey: claim.attempt.idempotencyKey,
      isPremium: claim.order.quote.isPremium,
      nameservers: (
        process.env.DOMAIN_MANAGED_NAMESERVERS ??
        "ns1.vercel-dns.com,ns2.vercel-dns.com"
      )
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      periodYears: 1,
      registrant,
    })
    providerAcceptedRegistration = true

    if (registration.status !== "registered") {
      await failDomainRegistrationAttempt(prisma, {
        attemptId: claim.attempt.id,
        errorCode:
          registration.status === "pending"
            ? "DOMAIN_REGISTRATION_PENDING"
            : "DOMAIN_REGISTRATION_STATE_UNCERTAIN",
        errorMessage:
          registration.status === "pending"
            ? "The registrar accepted the order and is still processing it."
            : "The registrar accepted the request without a final registration status.",
        isUncertain: true,
        orderId: claim.order.id,
        providerReference: registration.providerDomainId,
        responseMetadata: {
          providerCustomerHandle: registration.providerCustomerHandle,
          registrationStatus: registration.status,
        },
      })
      return
    }

    completed = await completeDomainRegistration(prisma, {
      attemptId: claim.attempt.id,
      expiresAt: registration.expiresAt,
      orderId: claim.order.id,
      providerCustomerHandle: registration.providerCustomerHandle,
      providerDomainId: registration.providerDomainId,
      registeredAt: registration.registeredAt ?? new Date(),
      vercelProjectId,
    })
  } catch (error) {
    const providerError = error instanceof DomainProviderError ? error : null
    const isUncertain = isUncertainDomainRegistrationFailure(
      error,
      providerAcceptedRegistration,
    )
    await failDomainRegistrationAttempt(prisma, {
      attemptId: claim.attempt.id,
      errorCode:
        providerError?.code ??
        (providerAcceptedRegistration
          ? "DOMAIN_REGISTRATION_STATE_UNCERTAIN"
          : "DOMAIN_REGISTRATION_FAILED"),
      errorMessage:
        error instanceof Error ? error.message : "Unknown registration error",
      isUncertain,
      orderId: claim.order.id,
    })

    if (isUncertain) {
      throw error
    }

    const refundOrder = await markDomainOrderRefundPending(prisma, {
      orderId: claim.order.id,
      reason:
        error instanceof Error ? error.message : "Domain registration failed",
    })
    await new PaystackClient({
      secretKey: requireEnv("PAYSTACK_SECRET_KEY"),
    })
      .refundTransaction({
        amountMinor: refundOrder.amountMinor,
        currencyCode: refundOrder.currencyCode,
        reference: refundOrder.paymentReference,
      })
      .catch(() => null)
    return
  }

  try {
    const vercel = new VercelDomainClient({
      teamId: process.env.VERCEL_TEAM_ID,
      token: requireEnv("VERCEL_API_TOKEN"),
    })
    await vercel.addDomain(
      completed.connection.vercelProjectId ?? "",
      completed.connection.hostname,
    )
    const state = await vercel.inspectDomain(
      completed.connection.vercelProjectId ?? "",
      completed.connection.hostname,
    )
    await updateDomainConnectionStatus(prisma, {
      connectionId: completed.connection.id,
      failureCode: null,
      failureMessage: null,
      status: state.verified ? "ACTIVE" : "VERIFYING",
      verificationRecordName: state.verified
        ? null
        : state.verificationRecord?.name,
      verificationRecordType: state.verified
        ? null
        : state.verificationRecord?.type,
      verificationRecordValue: state.verified
        ? null
        : state.verificationRecord?.value,
    })
  } catch (error) {
    await updateDomainConnectionStatus(prisma, {
      connectionId: completed.connection.id,
      failureCode: "VERCEL_DOMAIN_SETUP_FAILED",
      failureMessage:
        error instanceof Error ? error.message : "Unknown Vercel setup error",
      status: "FAILED",
    })
    throw error
  }
}
