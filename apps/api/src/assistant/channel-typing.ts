import {
  DirectMetaWhatsAppProvider,
  WHATSAPP_SESSION_WINDOW_MS,
  WhatsAppTypingError,
  type WhatsAppTypingFailureReason,
  isAssistantWhatsAppPilot,
  isWhatsAppInboundMessageId,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import {
  type LinkedAssistantIdentity,
  isLinkedAssistantIdentity,
} from "./channel-principal"

// Internal projection only: the default guard still requires the private server-issued brand.
export type TypingIdentity = Pick<
  LinkedAssistantIdentity,
  "purpose" | "principal" | "inboxLease"
> & { user: Pick<LinkedAssistantIdentity["user"], "id"> }
type TypingContext = {
  session: unknown
  requestId?: string
  tenantContext: { tenant: { dataClassification: string } }
}
type TypingInbox = {
  id: string
  kind: string
  state: string
  bindingId: string | null
  phoneNumberId: string
  providerMessageId: string
  providerOccurredAt: Date
  expiresAt: Date
  leaseOwner: string | null
  leaseGeneration: number
  leaseExpiresAt: Date | null
}
export type WhatsAppTypingSkipReason =
  | "not_turn"
  | "not_processing"
  | "non_live"
  | "unlinked_identity"
  | "non_general"
  | "missing_lease"
  | "binding_mismatch"
  | "phone_mismatch"
  | "lease_inbox_mismatch"
  | "lease_binding_mismatch"
  | "lease_owner_mismatch"
  | "lease_generation_mismatch"
  | "lease_expired"
  | "ingress_expired"
  | "invalid_source_time"
  | "future_source"
  | "session_expired"
  | "invalid_message_id"
  | "not_enrolled"
  | "unavailable_config"
  | "configured_phone_mismatch"
type TypingResult =
  | { outcome: "accepted"; providerStatus: number }
  | { outcome: "skipped"; reason: WhatsAppTypingSkipReason }
  | {
      outcome: "failed"
      reason: WhatsAppTypingFailureReason | "unexpected"
      providerStatus?: number
      providerCode?: number
      providerSubcode?: number
    }
export type AssistantWhatsAppTypingOutcome = TypingResult & {
  elapsedMs: number
}
export type AssistantWhatsAppTypingReport = AssistantWhatsAppTypingOutcome & {
  requestId?: string
}
const provider = new DirectMetaWhatsAppProvider()
export const defaultChannelTypingDependencies = () => ({
  linked: (identity: unknown): identity is TypingIdentity =>
    isLinkedAssistantIdentity(identity),
  allowed: isAssistantWhatsAppPilot,
  config: readAssistantWhatsAppConfig,
  send: (input: Parameters<typeof provider.sendTyping>[0]) =>
    provider.sendTyping(input),
  report: (event: AssistantWhatsAppTypingReport): void => {
    console.info("[whatsapp-typing]", event)
  },
})

/** One bounded, optional read+typing signal after fresh linked authority, before ordinary AI work. */
export async function startAssistantWhatsAppTyping(
  ctx: TypingContext,
  inbox: TypingInbox,
  deps = defaultChannelTypingDependencies(),
  now = new Date(),
): Promise<AssistantWhatsAppTypingOutcome> {
  const startedAt = performance.now()
  const finish = (result: TypingResult): AssistantWhatsAppTypingOutcome => {
    const outcome = {
      ...result,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    }
    try {
      void Promise.resolve(
        deps.report({
          ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
          ...outcome,
        }),
      ).catch(() => {})
    } catch {
      // Diagnostics are optional too: a reporter failure cannot affect the reply.
    }
    return outcome
  }
  const skip = (reason: WhatsAppTypingSkipReason) =>
    finish({ outcome: "skipped", reason })
  try {
    if (inbox.kind !== "TURN") return skip("not_turn")
    if (inbox.state !== "PROCESSING") return skip("not_processing")
    if (ctx.tenantContext.tenant.dataClassification !== "LIVE")
      return skip("non_live")
    if (!deps.linked(ctx.session)) return skip("unlinked_identity")
    const identity = ctx.session
    const lease = identity.inboxLease
    const occurredAt = inbox.providerOccurredAt.getTime()
    if (identity.purpose !== "GENERAL") return skip("non_general")
    if (!lease) return skip("missing_lease")
    if (identity.principal.bindingId !== inbox.bindingId)
      return skip("binding_mismatch")
    if (identity.principal.phoneNumberId !== inbox.phoneNumberId)
      return skip("phone_mismatch")
    if (lease.inboxId !== inbox.id) return skip("lease_inbox_mismatch")
    if (lease.bindingId !== inbox.bindingId)
      return skip("lease_binding_mismatch")
    if (lease.owner !== inbox.leaseOwner) return skip("lease_owner_mismatch")
    if (lease.generation !== inbox.leaseGeneration)
      return skip("lease_generation_mismatch")
    if (!inbox.leaseExpiresAt || !(inbox.leaseExpiresAt > now))
      return skip("lease_expired")
    if (!(inbox.expiresAt > now)) return skip("ingress_expired")
    if (!Number.isFinite(occurredAt)) return skip("invalid_source_time")
    if (occurredAt > now.getTime()) return skip("future_source")
    if (now.getTime() - occurredAt >= WHATSAPP_SESSION_WINDOW_MS)
      return skip("session_expired")
    if (!isWhatsAppInboundMessageId(inbox.providerMessageId))
      return skip("invalid_message_id")
    if (!deps.allowed(identity.user.id)) return skip("not_enrolled")
    const config = deps.config()
    if (!config) return skip("unavailable_config")
    if (config.phoneNumberId !== inbox.phoneNumberId)
      return skip("configured_phone_mismatch")
    const accepted = await deps.send({
      accessToken: config.accessToken,
      phoneNumberId: config.phoneNumberId,
      messageId: inbox.providerMessageId,
    })
    return finish({ outcome: "accepted", providerStatus: accepted.httpStatus })
  } catch (error) {
    return finish({
      outcome: "failed",
      reason:
        error instanceof WhatsAppTypingError ? error.reason : "unexpected",
      ...(error instanceof WhatsAppTypingError
        ? {
            ...(error.httpStatus !== undefined
              ? { providerStatus: error.httpStatus }
              : {}),
            ...(error.metaCode !== undefined
              ? { providerCode: error.metaCode }
              : {}),
            ...(error.metaSubcode !== undefined
              ? { providerSubcode: error.metaSubcode }
              : {}),
          }
        : {}),
    })
  }
}
