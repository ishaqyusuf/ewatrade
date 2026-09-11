import { randomUUID } from "node:crypto"

import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  WhatsAppProviderSendError,
  resolveCommunicationsCredential,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  claimStoreConversationWhatsAppRecovery,
  completeStoreConversationWhatsAppRecovery,
  failStoreConversationWhatsAppRecovery,
} from "@ewatrade/db/queries"
import { storeConversationWhatsAppBridgeTokenDigest } from "@ewatrade/service-commerce/server"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type StoreConversationWhatsAppRecoveryPayload = {
  attemptId: string
  storeId: string
  tenantId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimStoreConversationWhatsAppRecovery>>
>

type Dependencies = {
  assertProviderAllowed(input: { tenantId: string }): Promise<unknown>
  claim(
    input: StoreConversationWhatsAppRecoveryPayload & { claimToken: string },
  ): Promise<Claim | null>
  complete(
    input: StoreConversationWhatsAppRecoveryPayload & {
      claimToken: string
      providerReferenceDigest: string
    },
  ): Promise<unknown>
  digestProviderReference(value: string): string
  fail(
    input: StoreConversationWhatsAppRecoveryPayload & {
      claimToken: string
      failureCode: string
      outcomeUnknown: boolean
    },
  ): Promise<unknown>
  issueClaimToken(): string
  provider: WhatsAppProvider
  resolveCredential(reference: string): string
  storefrontOrigin: string
}

function defaultDependencies(): Dependencies {
  return {
    assertProviderAllowed: ({ tenantId }) =>
      assertQaJobProviderAllowed({ operation: "whatsapp", tenantId }),
    claim: (input) => claimStoreConversationWhatsAppRecovery(prisma, input),
    complete: (input) =>
      completeStoreConversationWhatsAppRecovery(prisma, input),
    digestProviderReference: storeConversationWhatsAppBridgeTokenDigest,
    fail: (input) => failStoreConversationWhatsAppRecovery(prisma, input),
    issueClaimToken: randomUUID,
    provider: new DirectMetaWhatsAppProvider(),
    resolveCredential: resolveCommunicationsCredential,
    storefrontOrigin: (
      process.env.STOREFRONT_URL ?? "http://localhost:3001"
    ).replace(/\/$/, ""),
  }
}

function recoveryMessage(storefrontOrigin: string, publicToken: string) {
  const url = `${storefrontOrigin}/r/${encodeURIComponent(publicToken)}`
  return `We couldn't safely match this message to one conversation. Continue securely on EwaTrade: ${url}`
}

export async function runStoreConversationWhatsAppRecovery(
  payload: StoreConversationWhatsAppRecoveryPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claimToken = dependencies.issueClaimToken()
  const claim = await dependencies.claim({ ...payload, claimToken })
  if (!claim) return null
  await dependencies.assertProviderAllowed({ tenantId: payload.tenantId })

  try {
    const sent = await dependencies.provider.sendText({
      accessToken: dependencies.resolveCredential(claim.credentialReference),
      body: recoveryMessage(dependencies.storefrontOrigin, claim.publicToken),
      phoneNumberId: claim.phoneNumberId,
      to: claim.externalCustomerId,
    })
    await dependencies.complete({
      ...payload,
      claimToken,
      providerReferenceDigest: dependencies.digestProviderReference(
        sent.messageId,
      ),
    })
    return { sent: true as const }
  } catch (error) {
    const outcomeUnknown =
      !(error instanceof WhatsAppProviderSendError) ||
      error.outcome === "OUTCOME_UNKNOWN"
    await dependencies.fail({
      ...payload,
      claimToken,
      failureCode: outcomeUnknown
        ? "provider_outcome_unknown"
        : "provider_rejected",
      outcomeUnknown,
    })
    throw new Error(
      outcomeUnknown
        ? "Store Conversation WhatsApp recovery outcome is unknown."
        : "Store Conversation WhatsApp recovery was rejected.",
    )
  }
}

export async function storeConversationWhatsAppRecoveryHandler(
  payload: StoreConversationWhatsAppRecoveryPayload,
) {
  await runStoreConversationWhatsAppRecovery(payload)
}
