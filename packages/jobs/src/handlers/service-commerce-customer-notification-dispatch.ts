import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  issueServiceCommerceCustomerActionToken,
  resolveCommunicationsCredential,
  resolveCommunicationsRecipient,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  authorizeServiceCommerceCustomerNotificationAttempt,
  claimServiceCommerceCustomerNotificationIntent,
  completeServiceCommerceCustomerNotificationIntent,
  failServiceCommerceCustomerNotificationIntent,
} from "@ewatrade/db/queries"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type ServiceCommerceCustomerNotificationDispatchPayload = {
  actorUserId: string
  intentId: string
  storeId: string
  tenantId: string
}

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimServiceCommerceCustomerNotificationIntent>>
>

type Dependencies = {
  assertProviderAllowed(input: { tenantId: string }): Promise<unknown>
  authorize(
    input: ServiceCommerceCustomerNotificationDispatchPayload & {
      attemptId: string
      connectionId: string
    },
  ): Promise<boolean>
  claim(
    input: ServiceCommerceCustomerNotificationDispatchPayload,
  ): Promise<Claim | null>
  complete(
    input: ServiceCommerceCustomerNotificationDispatchPayload & {
      attemptId: string
      providerConnectionId: string
      providerKey: string
      providerOperationId?: string
    },
  ): Promise<unknown>
  fail(
    input: ServiceCommerceCustomerNotificationDispatchPayload & {
      attemptId: string
      failureCode: string
      retryAt?: Date
    },
  ): Promise<unknown>
  provider: Pick<WhatsAppProvider, "sendTemplate">
  resolveCredential(reference: string): string
  resolveRecipient(reference: string): string
}

const MAX_DELIVERY_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 60_000

function storefrontUrl() {
  return (
    process.env.STOREFRONT_URL?.replace(/\/$/, "") ?? "http://localhost:3001"
  )
}

function defaultDependencies(): Dependencies {
  return {
    assertProviderAllowed: ({ tenantId }) =>
      assertQaJobProviderAllowed({ operation: "whatsapp", tenantId }),
    authorize: (input) =>
      authorizeServiceCommerceCustomerNotificationAttempt(prisma, input),
    claim: (input) =>
      claimServiceCommerceCustomerNotificationIntent(prisma, input),
    complete: (input) =>
      completeServiceCommerceCustomerNotificationIntent(prisma, input),
    fail: (input) =>
      failServiceCommerceCustomerNotificationIntent(prisma, input),
    provider: new DirectMetaWhatsAppProvider(),
    resolveCredential: resolveCommunicationsCredential,
    resolveRecipient: resolveCommunicationsRecipient,
  }
}

export async function runServiceCommerceCustomerNotificationDispatch(
  payload: ServiceCommerceCustomerNotificationDispatchPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const claim = await dependencies.claim(payload)
  if (!claim) return null
  const authorized = await dependencies.authorize({
    ...payload,
    attemptId: claim.attemptId,
    connectionId: claim.connectionId,
  })
  if (!authorized) {
    await dependencies.fail({
      ...payload,
      attemptId: claim.attemptId,
      failureCode: "customer_action_authorization_changed",
    })
    return null
  }
  await dependencies.assertProviderAllowed({ tenantId: payload.tenantId })
  try {
    const actions = claim.actions.map((action) => {
      const token = issueServiceCommerceCustomerActionToken({
        clientCapabilityId: action.clientCapabilityId,
        storeId: payload.storeId,
        tenantId: payload.tenantId,
      })
      return {
        label: action.label,
        url: `${storefrontUrl()}/action/${encodeURIComponent(token)}`,
      }
    })
    const firstAction = actions[0]
    if (!firstAction) {
      throw new Error("Customer notification has no current action.")
    }
    const sent = await dependencies.provider.sendTemplate({
      accessToken: dependencies.resolveCredential(claim.credentialReference),
      components: [
        {
          index: "0",
          parameters: [{ text: firstAction.url, type: "text" }],
          sub_type: "url",
          type: "button",
        },
      ],
      language: "en",
      phoneNumberId: claim.phoneNumberId,
      templateName: claim.templateKey,
      to: dependencies.resolveRecipient(claim.protectedRecipient),
    })
    await dependencies.complete({
      ...payload,
      attemptId: claim.attemptId,
      providerConnectionId: claim.connectionId,
      providerKey: "meta-cloud-api",
      providerOperationId: sent.messageId,
    })
    return sent
  } catch (error) {
    const retryable =
      claim.attemptNumber < Math.min(claim.maxAttempts, MAX_DELIVERY_ATTEMPTS)
    await dependencies.fail({
      ...payload,
      attemptId: claim.attemptId,
      failureCode: "customer_action_delivery_failed",
      ...(retryable
        ? {
            retryAt: new Date(
              Date.now() +
                RETRY_BASE_DELAY_MS * 2 ** Math.max(0, claim.attemptNumber - 1),
            ),
          }
        : {}),
    })
    if (retryable) throw error
    return null
  }
}

export async function serviceCommerceCustomerNotificationDispatchHandler(
  payload: ServiceCommerceCustomerNotificationDispatchPayload,
) {
  await runServiceCommerceCustomerNotificationDispatch(payload)
}
