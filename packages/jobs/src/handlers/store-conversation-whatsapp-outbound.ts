import { randomUUID } from "node:crypto"

import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  WhatsAppProviderSendError,
  resolveCommunicationsCredential,
  resolveCommunicationsRecipient,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  claimStoreConversationWhatsAppOutboundAttempt,
  completeStoreConversationWhatsAppOutboundAttempt,
  failStoreConversationWhatsAppOutboundAttempt,
} from "@ewatrade/db/queries"
import { storeConversationWhatsAppBridgeTokenDigest } from "@ewatrade/service-commerce/server"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type StoreConversationWhatsAppOutboundPayload = {
  attemptId: string
  storeId: string
  tenantId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimStoreConversationWhatsAppOutboundAttempt>>
>

type Dependencies = {
  assertProviderAllowed(input: { tenantId: string }): Promise<unknown>
  claim(input: { attemptId: string; claimToken: string }): Promise<Claim | null>
  complete(input: {
    attemptId: string
    claimToken: string
    eventDigest: string
    providerReferenceDigest: string
  }): Promise<unknown>
  digest(value: string): string
  fail(input: {
    attemptId: string
    claimToken: string
    failureCode: string
    outcomeUnknown: boolean
  }): Promise<unknown>
  issueClaimToken(): string
  provider: WhatsAppProvider
  resolveCredential(reference: string): string
  resolveRecipient(reference: string): string
}

function defaultDependencies(): Dependencies {
  return {
    assertProviderAllowed: ({ tenantId }) =>
      assertQaJobProviderAllowed({ operation: "whatsapp", tenantId }),
    claim: (input) =>
      claimStoreConversationWhatsAppOutboundAttempt(prisma, input),
    complete: (input) =>
      completeStoreConversationWhatsAppOutboundAttempt(prisma, input),
    digest: storeConversationWhatsAppBridgeTokenDigest,
    fail: (input) =>
      failStoreConversationWhatsAppOutboundAttempt(prisma, input),
    issueClaimToken: randomUUID,
    provider: new DirectMetaWhatsAppProvider(),
    resolveCredential: resolveCommunicationsCredential,
    resolveRecipient: resolveCommunicationsRecipient,
  }
}

export async function runStoreConversationWhatsAppOutbound(
  payload: StoreConversationWhatsAppOutboundPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claimToken = dependencies.issueClaimToken()
  const claim = await dependencies.claim({
    attemptId: payload.attemptId,
    claimToken,
  })
  if (!claim) return null
  await dependencies.assertProviderAllowed({ tenantId: payload.tenantId })
  try {
    const sent = await dependencies.provider.sendText({
      accessToken: dependencies.resolveCredential(claim.credentialReference),
      body: claim.text,
      phoneNumberId: claim.phoneNumberId,
      to: dependencies.resolveRecipient(claim.recipientCiphertext),
    })
    await dependencies.complete({
      attemptId: claim.attemptId,
      claimToken,
      eventDigest: dependencies.digest(`outbound-event:${sent.messageId}`),
      providerReferenceDigest: dependencies.digest(
        `outbound-provider:${sent.messageId}`,
      ),
    })
    return { sent: true as const }
  } catch (error) {
    const outcomeUnknown =
      !(error instanceof WhatsAppProviderSendError) ||
      error.outcome === "OUTCOME_UNKNOWN"
    await dependencies.fail({
      attemptId: claim.attemptId,
      claimToken,
      failureCode: outcomeUnknown
        ? "provider_outcome_unknown"
        : "provider_rejected",
      outcomeUnknown,
    })
    throw new Error(
      outcomeUnknown
        ? "Store Conversation WhatsApp reply outcome is unknown."
        : "Store Conversation WhatsApp reply was rejected.",
    )
  }
}

export async function storeConversationWhatsAppOutboundHandler(
  payload: StoreConversationWhatsAppOutboundPayload,
) {
  await runStoreConversationWhatsAppOutbound(payload)
}
