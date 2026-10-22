import {
  DirectMetaWhatsAppProvider,
  WHATSAPP_SESSION_WINDOW_MS,
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
const provider = new DirectMetaWhatsAppProvider()
export const defaultChannelTypingDependencies = () => ({
  linked: (identity: unknown): identity is TypingIdentity =>
    isLinkedAssistantIdentity(identity),
  allowed: isAssistantWhatsAppPilot,
  config: readAssistantWhatsAppConfig,
  send: (input: Parameters<typeof provider.sendTyping>[0]) =>
    provider.sendTyping(input),
})

/** One bounded, optional read+typing signal after fresh linked authority, before ordinary AI work. */
export async function startAssistantWhatsAppTyping(
  ctx: TypingContext,
  inbox: TypingInbox,
  deps = defaultChannelTypingDependencies(),
  now = new Date(),
): Promise<void> {
  try {
    if (
      inbox.kind !== "TURN" ||
      inbox.state !== "PROCESSING" ||
      ctx.tenantContext.tenant.dataClassification !== "LIVE" ||
      !deps.linked(ctx.session)
    )
      return
    const identity = ctx.session
    const lease = identity.inboxLease
    const occurredAt = inbox.providerOccurredAt.getTime()
    if (
      identity.purpose !== "GENERAL" ||
      !lease ||
      identity.principal.bindingId !== inbox.bindingId ||
      identity.principal.phoneNumberId !== inbox.phoneNumberId ||
      lease.inboxId !== inbox.id ||
      lease.bindingId !== inbox.bindingId ||
      lease.owner !== inbox.leaseOwner ||
      lease.generation !== inbox.leaseGeneration ||
      !inbox.leaseExpiresAt ||
      !(inbox.leaseExpiresAt > now) ||
      !(inbox.expiresAt > now) ||
      !Number.isFinite(occurredAt) ||
      occurredAt > now.getTime() ||
      now.getTime() - occurredAt >= WHATSAPP_SESSION_WINDOW_MS ||
      !isWhatsAppInboundMessageId(inbox.providerMessageId) ||
      !deps.allowed(identity.user.id)
    )
      return
    const config = deps.config()
    if (!config || config.phoneNumberId !== inbox.phoneNumberId) return
    await deps.send({
      accessToken: config.accessToken,
      phoneNumberId: config.phoneNumberId,
      messageId: inbox.providerMessageId,
    })
  } catch {
    // Transient UX only: no provider details in logs and no effect on the canonical reply.
  }
}
