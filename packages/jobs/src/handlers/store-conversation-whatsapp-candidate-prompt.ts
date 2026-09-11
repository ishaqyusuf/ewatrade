import { randomUUID } from "node:crypto"

import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  WhatsAppProviderSendError,
  resolveCommunicationsCredential,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  claimStoreConversationWhatsAppCandidatePrompt,
  completeStoreConversationWhatsAppCandidatePrompt,
  failStoreConversationWhatsAppCandidatePrompt,
} from "@ewatrade/db/queries"
import { projectStoreConversationWhatsAppCandidatePrompt } from "@ewatrade/service-commerce"
import {
  createStoreConversationWhatsAppBridgeTokenServices,
  storeConversationWhatsAppBridgeTokenDigest,
} from "@ewatrade/service-commerce/server"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type StoreConversationWhatsAppCandidatePromptPayload = {
  candidateId: string
  storeId: string
  tenantId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimStoreConversationWhatsAppCandidatePrompt>>
>

type Dependencies = {
  assertProviderAllowed(input: { tenantId: string }): Promise<unknown>
  claim(
    input: StoreConversationWhatsAppCandidatePromptPayload & {
      claimToken: string
    },
  ): Promise<Claim | null>
  complete(
    input: StoreConversationWhatsAppCandidatePromptPayload & {
      attemptId: string
      claimToken: string
      providerReferenceDigest: string
    },
  ): Promise<unknown>
  deriveActionToken(input: {
    action: Claim["actions"][number]
    candidateId: string
    revision: number
  }): string
  digestProviderReference(value: string): string
  fail(
    input: StoreConversationWhatsAppCandidatePromptPayload & {
      attemptId: string
      claimToken: string
      failureCode: string
      outcomeUnknown: boolean
    },
  ): Promise<unknown>
  issueClaimToken(): string
  provider: WhatsAppProvider
  resolveCredential(reference: string): string
}

function defaultDependencies(): Dependencies {
  const tokenServices = createStoreConversationWhatsAppBridgeTokenServices()
  return {
    assertProviderAllowed: ({ tenantId }) =>
      assertQaJobProviderAllowed({ operation: "whatsapp", tenantId }),
    claim: (input) =>
      claimStoreConversationWhatsAppCandidatePrompt(prisma, input),
    complete: (input) =>
      completeStoreConversationWhatsAppCandidatePrompt(prisma, input),
    deriveActionToken: tokenServices.deriveCandidateActionToken,
    digestProviderReference: storeConversationWhatsAppBridgeTokenDigest,
    fail: (input) =>
      failStoreConversationWhatsAppCandidatePrompt(prisma, input),
    issueClaimToken: randomUUID,
    provider: new DirectMetaWhatsAppProvider(),
    resolveCredential: resolveCommunicationsCredential,
  }
}

export async function runStoreConversationWhatsAppCandidatePrompt(
  payload: StoreConversationWhatsAppCandidatePromptPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claimToken = dependencies.issueClaimToken()
  const claim = await dependencies.claim({ ...payload, claimToken })
  if (!claim) return null
  await dependencies.assertProviderAllowed({ tenantId: payload.tenantId })
  const prompt = projectStoreConversationWhatsAppCandidatePrompt()
  try {
    const sent = await dependencies.provider.sendButtons({
      accessToken: dependencies.resolveCredential(claim.credentialReference),
      body: prompt.message,
      buttons: prompt.actions.map(({ action, label }) => ({
        id: dependencies.deriveActionToken({
          action,
          candidateId: claim.candidateId,
          revision: claim.candidateRevision,
        }),
        title: label,
      })),
      phoneNumberId: claim.phoneNumberId,
      to: claim.externalCustomerId,
    })
    await dependencies.complete({
      ...payload,
      attemptId: claim.attemptId,
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
      attemptId: claim.attemptId,
      claimToken,
      failureCode: outcomeUnknown
        ? "provider_outcome_unknown"
        : "provider_rejected",
      outcomeUnknown,
    })
    throw new Error(
      outcomeUnknown
        ? "Store Conversation WhatsApp candidate prompt outcome is unknown."
        : "Store Conversation WhatsApp candidate prompt was rejected.",
    )
  }
}

export async function storeConversationWhatsAppCandidatePromptHandler(
  payload: StoreConversationWhatsAppCandidatePromptPayload,
) {
  await runStoreConversationWhatsAppCandidatePrompt(payload)
}
