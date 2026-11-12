import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type {
  Capability,
  CapabilityRole,
} from "@ewatrade/assistant/capabilities/types"
import { normalizeRole } from "@ewatrade/auth/roles"
import {
  type TelegramButton,
  escapeTelegramHtml,
} from "@ewatrade/communications"
import type { AssistantTelegramAccessEnded } from "@ewatrade/db/assistant-telegram"
import {
  type GeneralContext,
  assertCapabilityAuthority,
  canUseCapability,
} from "./general-context"
import {
  type TelegramChatEffects,
  openEwaTradeButtons,
  showTelegramDisconnected,
  telegramConnectedCommands,
  telegramCopy,
} from "./telegram-presentation"

/**
 * Telegram-native phase 2 (Workshop families 4–6: connected entry, new account,
 * roles and scope). Copy and best-effort chat effects only. Access is decided
 * by the grant, binding and capability checks before anything here runs.
 */

type Scope = { businessName: string; storeName: string }
type ScopeContext = Pick<GeneralContext, "session" | "tenantContext">
export type TelegramControlReply = {
  text: string
  buttons?: TelegramButton[][]
}

const scopeLabel = (scope: Scope) =>
  `${scope.businessName} · ${scope.storeName}`
const contextScope = (ctx: ScopeContext): Scope => ({
  businessName: ctx.tenantContext.tenant.name,
  storeName: ctx.tenantContext.activeStore?.name ?? "Store",
})

/** Workshop c-switch, step 1: /scope shows the scope with a Change in EwaTrade button. */
export function telegramScopeReply(ctx: ScopeContext): TelegramControlReply {
  const buttons = openEwaTradeButtons("Change in EwaTrade")
  return {
    text: `${scopeLabel(contextScope(ctx))}\nTo use another Business or Store here, change it in EwaTrade${buttons ? "." : " account settings."}`,
    ...(buttons ? { buttons } : {}),
  }
}

const roleNames: Record<CapabilityRole, string> = {
  OPERATOR: "Operator",
  CASHIER: "Cashier",
  MANAGER: "Manager",
  ADMIN: "Admin",
  OWNER: "Owner",
}
const roleOrder = Object.keys(roleNames) as CapabilityRole[]
const domainOrder = [
  "sales",
  "inventory",
  "customers",
  "catalog",
  "finance",
  "services",
  "staff",
  "storefront",
] as const
/** Writes lead with the everyday records, as in the Workshop help. */
const writeOrder = [
  "sales",
  "finance",
  "customers",
  "inventory",
  "catalog",
  "services",
  "staff",
  "storefront",
] as const
const readLabels: Record<(typeof domainOrder)[number], string> = {
  sales: "sales",
  inventory: "stock",
  customers: "customers",
  catalog: "products",
  finance: "money",
  services: "services",
  staff: "staff",
  storefront: "your storefront",
}
const writeLabels: Record<(typeof domainOrder)[number], string> = {
  sales: "sales",
  inventory: "stock",
  customers: "new customers",
  catalog: "products",
  finance: "money records",
  services: "service jobs",
  staff: "staff changes",
  storefront: "storefront changes",
}
function list(items: readonly string[], last = "and") {
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`
    : (items[0] ?? "")
}
const roleLabel = (ctx: ScopeContext) => {
  const role = normalizeRole(ctx.tenantContext.membership.role)
  return role && role in roleNames ? roleNames[role as CapabilityRole] : null
}

/**
 * Workshop c-help and a-cashier-menu: only what this role can use here, from
 * the same live capability checks a turn uses. Hints only; never authority.
 */
export function telegramHelpReply(
  ctx: ScopeContext,
  {
    manifest = capabilityManifest,
    canUse = canUseCapability,
  }: {
    manifest?: readonly Capability[]
    canUse?: (ctx: ScopeContext, capability: Capability) => boolean
  } = {},
): TelegramControlReply {
  const usable = manifest.filter((capability) => canUse(ctx, capability))
  const labels = (mode: "read" | "write") =>
    (mode === "read" ? domainOrder : writeOrder).flatMap((domain) => {
      const inDomain = usable.filter(
        (capability) =>
          capability.mode === mode && capability.domain === domain,
      )
      if (!inDomain.length) return []
      if (
        mode === "write" &&
        domain === "finance" &&
        inDomain.every(
          (capability) => capability.id === "finance.expense.record_simple",
        )
      )
        return ["expenses"]
      return [(mode === "read" ? readLabels : writeLabels)[domain]]
    })
  const reads = labels("read")
  const writes = labels("write")
  const role = roleLabel(ctx)
  const access = role ? `your ${role} access` : "your access"
  const can = [
    ...(reads.length ? [`ask about ${list(reads)}`] : []),
    ...(writes.length ? [`record ${list(writes)}`] : []),
  ]
  const intro = can.length
    ? `With ${access} you can ${can.join(", and ")}.${writes.length ? " I send a review before anything is saved." : ""}`
    : `There is nothing I can do here with ${access} yet.`
  return {
    text: `What I can do here\n${intro}\n\n${commandLines()}`,
  }
}

/** The connected menu's commands, so /help never drifts from it. */
const commandLines = () =>
  telegramConnectedCommands
    .filter(({ command }) => command !== "help")
    .map(
      ({ command, description }) =>
        `/${command} — ${description.charAt(0).toLowerCase()}${description.slice(1)}`,
    )
    .join("\n")

/** Typed requests to change scope get the same answer as /scope (Workshop c-switch). */
const scopeRequests = new Set([
  "change store",
  "switch store",
  "change business",
  "switch business",
])

/** Deterministic connected-chat commands. Anything else goes to the assistant. */
export function telegramConnectedControl(
  ctx: ScopeContext,
  text: string,
): TelegramControlReply | undefined {
  const value = text
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/u, "")
  if (value === "/help") return telegramHelpReply(ctx)
  if (value === "/scope" || scopeRequests.has(value))
    return telegramScopeReply(ctx)
  return undefined
}

/**
 * Workshop a-role: a Confirm or Edit refused because the person's role or Store
 * access changed after the draft. Returns null when authority still allows the
 * action, so other failures keep their own replies.
 */
export function telegramRoleChangedRefusal(
  ctx: ScopeContext,
  capability: Capability,
  assertAuthority: (
    ctx: ScopeContext,
    capability: Capability,
  ) => unknown = assertCapabilityAuthority,
): string | null {
  try {
    assertAuthority(ctx, capability)
    return null
  } catch {
    const role = normalizeRole(ctx.tenantContext.membership.role)
    // Linked channels use the WhatsApp role ceiling, as the authority check does.
    const roles = capability.whatsapp?.roles ?? capability.policy.roles
    const allowed = roleOrder.filter((entry) => roles.includes(entry))
    const business = ctx.tenantContext.tenant.name
    const reason =
      role && !roles.includes(role as CapabilityRole) && allowed.length
        ? `this now needs ${/^[AEIOU]/u.test(roleNames[allowed[0] as CapabilityRole]) ? "an" : "a"} ${list(
            allowed.map((entry) => roleNames[entry]),
            "or",
          )} of ${business}`
        : `you can't do this here now`
    return `Not saved. Your access changed since this draft, so ${reason}.\n\nNothing was changed.`
  }
}

export const telegramPhase2Copy = {
  /**
   * Workshop c-second. The other EwaTrade account is never named. A Telegram
   * account stays with its first EwaTrade user even after /disconnect, so the
   * design's "/disconnect, then connect again" step is withheld (owner decision).
   */
  busy: (business: Scope) =>
    `This Telegram account is already connected to another EwaTrade account. Nothing changed.\n\nTo use <b>${escapeTelegramHtml(business.businessName)}</b> in Telegram, connect a different Telegram account.`,
  /** Workshop c-switch: the claim message after a new scope is confirmed. */
  switched: (business: Scope, previous: Scope) =>
    `<b>Connected ✓</b>\n${escapeTelegramHtml(scopeLabel(business))}\n\n${escapeTelegramHtml(scopeLabel(previous))} is no longer connected here.`,
  /** Workshop a-lost. Says nothing about who removed access. */
  removed: (businessName: string | null) =>
    `Your access to ${businessName ? `<b>${escapeTelegramHtml(businessName)}</b>` : "this business"} has ended, so I can't use it here. If that's a mistake, ask the business Owner.\n\nNothing else changed.`,
  /** Workshop a-expired. */
  idle: (scope: string | null) =>
    `Welcome back. This chat's access${scope ? ` to <b>${escapeTelegramHtml(scope)}</b>` : ""} ended after 7 days without use. Nothing changed.\n\nReconnect from EwaTrade to turn it back on.`,
  expired: (scope: string | null) =>
    `This chat's access${scope ? ` to <b>${escapeTelegramHtml(scope)}</b>` : ""} ended after 30 days. Nothing changed.\n\nReconnect from EwaTrade to turn it back on.`,
} as const

/** The reply to the first message after access ended, with its chat effects. */
export function telegramAccessEndedNotice(
  chatId: string,
  ended: AssistantTelegramAccessEnded,
) {
  const scope =
    ended.businessName && ended.storeName
      ? scopeLabel({
          businessName: ended.businessName,
          storeName: ended.storeName,
        })
      : null
  const text =
    ended.reason === "removed"
      ? telegramPhase2Copy.removed(ended.businessName)
      : telegramPhase2Copy[ended.reason](scope)
  return {
    text,
    html: true,
    buttons: openEwaTradeButtons(
      ended.reason === "removed" ? "Open EwaTrade" : "Reconnect in EwaTrade",
    ),
    after: (bot: TelegramChatEffects) =>
      showTelegramDisconnected(bot, chatId, ended.connectedMessage),
  }
}

async function settle(effects: Promise<unknown>[]) {
  // Presentation only: a failed edit, unpin or pin never changes access.
  await Promise.allSettled(effects)
}

/**
 * Confirmed while this chat already had a connection (Workshop c-switch): drop
 * the old pin, edit the new claim message and pin it. A reconnect to the same
 * scope uses the ordinary Connected copy.
 */
export function showTelegramReconnected(
  bot: TelegramChatEffects,
  message: { chatId: string; messageId: string },
  business: Scope,
  previous: Scope,
) {
  const switched =
    previous.businessName !== business.businessName ||
    previous.storeName !== business.storeName
  return settle([
    bot
      .unpinAllChatMessages(message.chatId)
      .catch(() => undefined)
      .then(() =>
        bot.editMessageText({
          ...message,
          text: switched
            ? telegramPhase2Copy.switched(business, previous)
            : telegramCopy.connected(business),
          html: true,
        }),
      )
      .then(() => bot.pinChatMessage(message)),
    bot.setChatCommands(message.chatId, telegramConnectedCommands),
  ])
}
