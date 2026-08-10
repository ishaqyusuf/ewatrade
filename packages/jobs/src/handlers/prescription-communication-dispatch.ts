import {
  type ConversationStateStore,
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  getConfiguredConversationStateStore,
  isWithinWhatsAppSessionWindow,
  prescriptionConversationContextId,
  resolveCommunicationsActionId,
  resolveCommunicationsCredential,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  authorizePrescriptionCommunicationAttempt,
  claimPrescriptionCommunicationIntent,
  completePrescriptionCommunicationAttempt,
} from "@ewatrade/db/queries"

export type PrescriptionCommunicationDispatchPayload = { intentId: string }

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimPrescriptionCommunicationIntent>>
>

type Dependencies = {
  authorize(input: {
    attemptId: string
    intentId: string
    storeId: string
    tenantId: string
  }): Promise<boolean>
  claim(input: PrescriptionCommunicationDispatchPayload): Promise<Claim | null>
  complete(input: {
    attemptId: string
    failureCode?: string
    intentId: string
    providerMessageId?: string
  }): Promise<unknown>
  provider: WhatsAppProvider
  resolveActionId(reference: string): string
  resolveCredential(reference: string): string
  state: ConversationStateStore
}

const neutralCopy: Record<string, string> = {
  clarification:
    "Your pharmacy needs more information. Open the secure link to continue.",
  delivery_failed:
    "Your delivery needs attention. Open the secure status page for the next step.",
  delivery_progress: "Your pharmacy delivery status has been updated.",
  expiry:
    "A pharmacy action has expired. Contact the pharmacy if you still need help.",
  payment_receipt:
    "Your payment status has been updated. Open the secure receipt to review it.",
  pickup_ready:
    "Your pharmacy order is ready for collection. Open the secure status page before travelling.",
  quote_ready:
    "Your pharmacy has prepared an update. Open the secure page to review your options.",
}

function defaultDependencies(): Dependencies {
  return {
    authorize: (input) =>
      authorizePrescriptionCommunicationAttempt(prisma, input),
    claim: (input) => claimPrescriptionCommunicationIntent(prisma, input),
    complete: (input) =>
      completePrescriptionCommunicationAttempt(prisma, input),
    provider: new DirectMetaWhatsAppProvider(),
    resolveActionId: resolveCommunicationsActionId,
    resolveCredential: resolveCommunicationsCredential,
    state: getConfiguredConversationStateStore(),
  }
}

function record(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

export async function runPrescriptionCommunicationDispatch(
  payload: PrescriptionCommunicationDispatchPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim(payload)
  if (!claim) return null
  const authorized = await dependencies.authorize({
    attemptId: claim.attemptId,
    intentId: claim.intentId,
    storeId: claim.storeId,
    tenantId: claim.tenantId,
  })
  if (!authorized) {
    await dependencies.complete({
      attemptId: claim.attemptId,
      failureCode: "policy_restricted",
      intentId: claim.intentId,
    })
    return null
  }
  const intentPayload = record(claim.payload)
  const state = await dependencies.state.get({
    connectionId: claim.connectionId,
    contextId: prescriptionConversationContextId(claim.storeId),
    externalCustomerId: claim.recipientReference,
  })
  const inSession = isWithinWhatsAppSessionWindow(
    state?.lastSeenAt ? new Date(state.lastSeenAt) : null,
  )
  const credentials = {
    accessToken: dependencies.resolveCredential(claim.credentialReference),
    phoneNumberId: claim.phoneNumberId,
  }
  try {
    let sent: { messageId: string }
    const protectedActions = Array.isArray(intentPayload.actions)
      ? intentPayload.actions.filter(
          (action): action is { protectedId: string; title: string } =>
            Boolean(
              action &&
                typeof action === "object" &&
                typeof (action as { protectedId?: unknown }).protectedId ===
                  "string" &&
                typeof (action as { title?: unknown }).title === "string",
            ),
        )
      : []
    const actions = protectedActions.map((action) => ({
      id: dependencies.resolveActionId(action.protectedId),
      title: action.title,
    }))
    if (inSession && actions.length) {
      sent = await dependencies.provider.sendButtons({
        ...credentials,
        body: neutralCopy[claim.type] ?? "Your pharmacy has an update.",
        buttons: actions.slice(0, 3),
        to: claim.recipientReference,
      })
    } else if (inSession) {
      const secureUrl = String(intentPayload.secureUrl ?? "")
      sent = await dependencies.provider.sendText({
        ...credentials,
        body: `${neutralCopy[claim.type] ?? "Your pharmacy has an update."}${secureUrl.startsWith("https://") ? `\n\n${secureUrl}` : ""}`,
        to: claim.recipientReference,
      })
    } else {
      const templates = record(claim.templateConfiguration)
      const templateName = String(templates[claim.type] ?? "")
      if (!templateName) {
        await dependencies.complete({
          attemptId: claim.attemptId,
          failureCode: "approved_template_missing",
          intentId: claim.intentId,
        })
        return null
      }
      sent = await dependencies.provider.sendTemplate({
        ...credentials,
        components:
          typeof intentPayload.secureUrl === "string" &&
          intentPayload.secureUrl.startsWith("https://")
            ? [
                {
                  index: "0",
                  parameters: [{ text: intentPayload.secureUrl, type: "text" }],
                  sub_type: "url",
                  type: "button",
                },
              ]
            : undefined,
        language: String(templates.language ?? "en"),
        templateName,
        to: claim.recipientReference,
      })
    }
    await dependencies.complete({
      attemptId: claim.attemptId,
      intentId: claim.intentId,
      providerMessageId: sent.messageId,
    })
    return sent
  } catch (error) {
    await dependencies.complete({
      attemptId: claim.attemptId,
      failureCode: "provider_delivery_failed",
      intentId: claim.intentId,
    })
    throw error
  }
}

export async function prescriptionCommunicationDispatchHandler(
  payload: PrescriptionCommunicationDispatchPayload,
) {
  await runPrescriptionCommunicationDispatch(payload)
}
