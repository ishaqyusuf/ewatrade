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
  claimStoreConversationWhatsAppBridgePrompt,
  completeStoreConversationWhatsAppBridgePrompt,
  failStoreConversationWhatsAppBridgePrompt,
} from "@ewatrade/db/queries"
import {
  storeConversationWhatsAppBridgeChoiceLabel,
  storeConversationWhatsAppBridgeRequestKindAction,
} from "@ewatrade/service-commerce"
import {
  createStoreConversationWhatsAppBridgeTokenServices,
  storeConversationWhatsAppBridgeTokenDigest,
} from "@ewatrade/service-commerce/server"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type StoreConversationWhatsAppBridgePromptPayload = {
  bridgeId: string
  storeId: string
  tenantId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimStoreConversationWhatsAppBridgePrompt>>
>

type Dependencies = {
  assertProviderAllowed(input: { tenantId: string }): Promise<unknown>
  claim(
    input: StoreConversationWhatsAppBridgePromptPayload & {
      claimToken: string
    },
  ): Promise<Claim | null>
  complete(
    input: StoreConversationWhatsAppBridgePromptPayload & {
      attemptId: string
      claimToken: string
      providerReferenceDigest: string
    },
  ): Promise<unknown>
  deriveChoiceToken(input: {
    bridgeId: string
    choice: Claim["choices"][number]
    revision: number
  }): string
  digestProviderReference(value: string): string
  fail(
    input: StoreConversationWhatsAppBridgePromptPayload & {
      attemptId: string
      claimToken: string
      failureCode: string
      outcomeUnknown: boolean
    },
  ): Promise<unknown>
  issueClaimToken(): string
  provider: WhatsAppProvider
  resolveCredential(reference: string): string
  resolveRecipient(reference: string): string
}

function defaultDependencies(): Dependencies {
  const tokenServices = createStoreConversationWhatsAppBridgeTokenServices()
  return {
    assertProviderAllowed: ({ tenantId }) =>
      assertQaJobProviderAllowed({ operation: "whatsapp", tenantId }),
    claim: (input) => claimStoreConversationWhatsAppBridgePrompt(prisma, input),
    complete: (input) =>
      completeStoreConversationWhatsAppBridgePrompt(prisma, input),
    deriveChoiceToken: tokenServices.deriveChoiceToken,
    digestProviderReference: storeConversationWhatsAppBridgeTokenDigest,
    fail: (input) => failStoreConversationWhatsAppBridgePrompt(prisma, input),
    issueClaimToken: randomUUID,
    provider: new DirectMetaWhatsAppProvider(),
    resolveCredential: resolveCommunicationsCredential,
    resolveRecipient: resolveCommunicationsRecipient,
  }
}

export async function runStoreConversationWhatsAppBridgePrompt(
  payload: StoreConversationWhatsAppBridgePromptPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claimToken = dependencies.issueClaimToken()
  const claim = await dependencies.claim({ ...payload, claimToken })
  if (!claim) return null
  await dependencies.assertProviderAllowed({ tenantId: payload.tenantId })
  try {
    const buttons =
      claim.promptKind === "bridge_choice"
        ? claim.choices.map((choice) => ({
            id: dependencies.deriveChoiceToken({
              bridgeId: claim.bridgeId,
              choice,
              revision: claim.bridgeRevision,
            }),
            title: storeConversationWhatsAppBridgeChoiceLabel(choice),
          }))
        : claim.choices.map(storeConversationWhatsAppBridgeRequestKindAction)
    const sent = await dependencies.provider.sendButtons({
      accessToken: dependencies.resolveCredential(claim.credentialReference),
      body:
        claim.promptKind === "bridge_choice"
          ? "Your EwaTrade conversation is connected. Choose how to continue."
          : "Choose the type of request you want to start.",
      buttons,
      phoneNumberId: claim.phoneNumberId,
      to: dependencies.resolveRecipient(claim.externalCustomerIdCiphertext),
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
        ? "Store Conversation WhatsApp bridge prompt outcome is unknown."
        : "Store Conversation WhatsApp bridge prompt was rejected.",
    )
  }
}

export async function storeConversationWhatsAppBridgePromptHandler(
  payload: StoreConversationWhatsAppBridgePromptPayload,
) {
  await runStoreConversationWhatsAppBridgePrompt(payload)
}
