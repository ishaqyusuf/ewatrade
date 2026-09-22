import {
  resolveCommunicationsEndpoint,
  resolveCommunicationsRecipient,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  claimStoreConversationNotificationIntent,
  completeStoreConversationNotificationAttempt,
  failStoreConversationNotificationAttempt,
  invalidateStoreConversationNotificationPushEndpoint,
} from "@ewatrade/db/queries"
import {
  type EmailTransport,
  createEmailMessage,
  createTestRoutedEmailMessages,
  getDefaultEmailTransport,
  renderStoreConversationNotificationTemplate,
} from "@ewatrade/email"
import { renderStoreConversationNeutralNotification } from "@ewatrade/service-commerce"
import {
  digestStoreConversationNotificationProviderReference,
  parseStoreConversationPushEndpoint,
} from "@ewatrade/service-commerce/server"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type StoreConversationNotificationDispatchPayload = {
  intentId: string
  storeId: string
  tenantId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimStoreConversationNotificationIntent>>
>

type PushResult = {
  invalidDestination?: boolean
  providerKey: string
  providerOperationReference?: string
}

type Dependencies = {
  assertProviderAllowed(input: {
    operation: "email" | "push"
    qaEmailRouted?: boolean
    tenantId: string
  }): Promise<unknown>
  claim(
    payload: StoreConversationNotificationDispatchPayload,
  ): Promise<Claim | null>
  complete(
    payload: StoreConversationNotificationDispatchPayload & {
      attemptId: string
      providerKey: string
      providerOperationDigest?: string
    },
  ): Promise<unknown>
  emailTransport: EmailTransport
  fail(
    payload: StoreConversationNotificationDispatchPayload & {
      attemptId: string
      failureCode: string
      outcomeUnknown?: boolean
      terminal?: boolean
    },
  ): Promise<{ retryAt?: Date | null } | null>
  invalidatePush(
    payload: StoreConversationNotificationDispatchPayload & {
      attemptId: string
    },
  ): Promise<unknown>
  resolveEndpoint(reference: string): string
  resolveRecipient(reference: string): string
  sendNativePush(input: {
    body: string
    idempotencyKey: string
    title: string
    token: string
  }): Promise<PushResult>
  sendWebPush(input: {
    body: string
    endpoint: { auth: string; endpoint: string; p256dh: string }
    idempotencyKey: string
    title: string
  }): Promise<PushResult>
}

class StoreConversationPushDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly outcomeUnknown = false,
    readonly invalidDestination = false,
  ) {
    super(code)
  }
}

async function sendExpoPush(input: {
  body: string
  idempotencyKey: string
  title: string
  token: string
}): Promise<PushResult> {
  let response: Response
  try {
    response = await fetch("https://exp.host/--/api/v2/push/send", {
      body: JSON.stringify({
        body: input.body,
        data: { route: "/conversations" },
        sound: "default",
        title: input.title,
        to: input.token,
      }),
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
        "X-EwaTrade-Idempotency-Key": input.idempotencyKey,
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      method: "POST",
    })
  } catch {
    throw new StoreConversationPushDeliveryError(
      "expo_transport_outcome_unknown",
      true,
    )
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: { details?: { error?: string }; id?: string; status?: string }
  } | null
  if (response.status >= 500) {
    throw new StoreConversationPushDeliveryError(
      "expo_provider_outcome_unknown",
      true,
    )
  }
  if (!response.ok || payload?.data?.status !== "ok") {
    const invalid = payload?.data?.details?.error === "DeviceNotRegistered"
    throw new StoreConversationPushDeliveryError(
      invalid ? "expo_destination_invalid" : "expo_delivery_rejected",
      false,
      invalid,
    )
  }
  return {
    providerKey: "expo-push",
    providerOperationReference: payload.data.id,
  }
}

async function unavailableWebPush(): Promise<PushResult> {
  throw new StoreConversationPushDeliveryError("web_push_provider_unavailable")
}

function defaultDependencies(): Dependencies {
  return {
    assertProviderAllowed: (input) => assertQaJobProviderAllowed(input),
    claim: (payload) =>
      claimStoreConversationNotificationIntent(prisma, payload),
    complete: (payload) =>
      completeStoreConversationNotificationAttempt(prisma, payload),
    emailTransport: getDefaultEmailTransport(),
    fail: (payload) =>
      failStoreConversationNotificationAttempt(prisma, payload),
    invalidatePush: (payload) =>
      invalidateStoreConversationNotificationPushEndpoint(prisma, payload),
    resolveEndpoint: resolveCommunicationsEndpoint,
    resolveRecipient: resolveCommunicationsRecipient,
    sendNativePush: sendExpoPush,
    sendWebPush: unavailableWebPush,
  }
}

export async function runStoreConversationNotificationDispatch(
  payload: StoreConversationNotificationDispatchPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim(payload)
  if (!claim) return null
  const content = renderStoreConversationNeutralNotification({
    kind: claim.kind,
    storeName: claim.storeName,
  })
  try {
    let providerKey: string
    let providerOperationReference: string | undefined
    if (claim.channel === "email") {
      const recipient = claim.accountEmail
        ? claim.accountEmail
        : claim.destinationCiphertext
          ? dependencies.resolveRecipient(claim.destinationCiphertext)
          : null
      if (!recipient) {
        throw new StoreConversationPushDeliveryError(
          "email_destination_unavailable",
        )
      }
      const emailContent = renderStoreConversationNotificationTemplate({
        body: content.body,
        subject: content.subject,
      })
      const message = createEmailMessage({
        from: process.env.EMAIL_FROM ?? "noreply@ewatrade.local",
        html: emailContent.html,
        idempotencyKey: `store-conversation-notification:${claim.intentId}`,
        subject: content.subject,
        text: emailContent.text,
        to: recipient,
      })
      const routed = createTestRoutedEmailMessages(message)
      await dependencies.assertProviderAllowed({
        operation: "email",
        qaEmailRouted:
          routed.length > 0 && routed.every((email) => email.qaRouted),
        tenantId: payload.tenantId,
      })
      let lastReceipt: Awaited<ReturnType<EmailTransport["send"]>>
      for (const email of routed) {
        lastReceipt = await dependencies.emailTransport.send(email)
      }
      providerKey = lastReceipt?.provider ?? "email"
      providerOperationReference = lastReceipt?.providerMessageId
    } else if (claim.channel === "push" && claim.destinationCiphertext) {
      await dependencies.assertProviderAllowed({
        operation: "push",
        tenantId: payload.tenantId,
      })
      const endpoint = parseStoreConversationPushEndpoint(
        dependencies.resolveEndpoint(claim.destinationCiphertext),
      )
      const result =
        endpoint.kind === "native_expo"
          ? await dependencies.sendNativePush({
              body: content.body,
              idempotencyKey: claim.intentId,
              title: content.subject,
              token: endpoint.expoPushToken,
            })
          : await dependencies.sendWebPush({
              body: content.body,
              endpoint,
              idempotencyKey: claim.intentId,
              title: content.subject,
            })
      if (result.invalidDestination) {
        throw new StoreConversationPushDeliveryError(
          "push_destination_invalid",
          false,
          true,
        )
      }
      providerKey = result.providerKey
      providerOperationReference = result.providerOperationReference
    } else {
      throw new StoreConversationPushDeliveryError(
        "notification_channel_unavailable",
      )
    }
    await dependencies.complete({
      ...payload,
      attemptId: claim.attemptId,
      providerKey,
      ...(providerOperationReference
        ? {
            providerOperationDigest:
              digestStoreConversationNotificationProviderReference({
                providerKey,
                providerReference: providerOperationReference,
              }),
          }
        : {}),
    })
    return { channel: claim.channel, sent: true }
  } catch (error) {
    const deliveryError =
      error instanceof StoreConversationPushDeliveryError ? error : null
    if (deliveryError?.invalidDestination) {
      await dependencies.invalidatePush({
        ...payload,
        attemptId: claim.attemptId,
      })
    }
    await dependencies.fail({
      ...payload,
      attemptId: claim.attemptId,
      failureCode: deliveryError?.code ?? "notification_outcome_unknown",
      outcomeUnknown: deliveryError ? deliveryError.outcomeUnknown : true,
      terminal: deliveryError?.invalidDestination,
    })
    return null
  }
}

export async function storeConversationNotificationDispatchHandler(
  payload: StoreConversationNotificationDispatchPayload,
) {
  await runStoreConversationNotificationDispatch(payload)
}
