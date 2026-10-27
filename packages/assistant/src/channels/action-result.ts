import { z } from "zod"
import { generalReceiptSchema } from "../general/contracts"
import { trustedAssistantAppOrigin } from "./conversation-links"
import { whatsAppPlainText } from "./render"

export const WHATSAPP_ACTION_RESULT_VERSION = "whatsapp-action-result-v1"
export const WHATSAPP_ACTION_EDIT_RESULT_VERSION =
  "whatsapp-action-edit-result-v1"
export const WHATSAPP_EDIT_INTENT_KIND = "whatsapp_proposal_edit_v1"
export const whatsAppEditIntentStateSchema = z
  .object({
    kind: z.literal(WHATSAPP_EDIT_INTENT_KIND),
    bindingId: z.string().min(1).max(128),
    proposalId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    scopeDigest: z.string().regex(/^[a-f0-9]{64}$/),
    identityGeneration: z.number().int().positive(),
    grantGeneration: z.number().int().positive(),
    selectionGeneration: z.number().int().positive(),
  })
  .strict()
export const whatsAppActionEditResultContentSchema = z.discriminatedUnion(
  "type",
  [
    z
      .object({
        type: z.literal("action_edit_result"),
        reviewId: z.string().min(1).max(128),
        intentId: z.string().min(1).max(160),
        proposalId: z.string().min(1).max(128),
        revision: z.number().int().positive(),
      })
      .strict(),
    z.object({ type: z.literal("action_edit_refusal") }).strict(),
  ],
)
export function renderWhatsAppActionEditResult(input: unknown) {
  const parsed = whatsAppActionEditResultContentSchema.parse(input)
  return parsed.type === "action_edit_result"
    ? "What would you like to change in this draft? The older Confirm and Cancel options no longer work. Describe the changes here; I will show a fresh review before you confirm. No business record was changed."
    : "That edit option expired, changed or was already used. Ask for a fresh review or open this saved draft in EwaTrade. No business record was changed."
}
export const WHATSAPP_ACTION_INVALID_REPLY =
  "That confirmation is unavailable or changed. Open the exact saved draft in EwaTrade, or ask for a fresh review. Nothing was changed by this message."
export const WHATSAPP_ACTION_DISABLED_REPLY =
  "WhatsApp confirmations are not enabled. Open the exact saved draft in EwaTrade to review and confirm it. Nothing was changed by this message."
export const whatsAppActionOutcomeSchema = z
  .object({
    proposalId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    status: z.enum(["COMPLETED", "CANCELLED"]),
    decision: z.enum(["confirm", "cancel"]),
  })
  .strict()
  .refine((value) =>
    value.decision === "confirm"
      ? value.status === "COMPLETED"
      : value.status === "CANCELLED",
  )
export const whatsAppActionResultContentSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("action_result"),
      resultRef: whatsAppActionOutcomeSchema,
    })
    .strict(),
  z.object({ type: z.literal("action_refusal") }).strict(),
])
function savedChatLink(value: string | undefined) {
  if (!value) return ""
  try {
    const url = new URL(value)
    if (
      !trustedAssistantAppOrigin(url.origin) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/assistant\/c\/[^/]+$/.test(url.pathname) ||
      value !== url.href
    )
      return ""
    return value
  } catch {
    return ""
  }
}
/** Only canonical, already-authorized receipt labels. No credentials or internal identities. */
export function renderWhatsAppActionResult(
  proposal: {
    status: string
    receipt: { title: string; detail: string } | null
  },
  appLink?: string,
) {
  if (proposal.status === "CANCELLED") return "Draft cancelled."
  if (proposal.status !== "COMPLETED" || !proposal.receipt)
    throw Error("Canonical receipt unavailable")
  const text = whatsAppPlainText(
    `${proposal.receipt.title}\n\n${proposal.receipt.detail}`,
  )
  if (text && text.length <= 2500) return `Saved in EwaTrade.\n\n${text}`
  const link = savedChatLink(appLink)
  return `Saved in EwaTrade. Open the saved chat for the complete original receipt.${link ? `\n${link}` : ""}`
}

/** Payment links are separate forwardable messages, never a cross-customer draft. */
export function renderWhatsAppActionResultChunks(
  proposal: Parameters<typeof renderWhatsAppActionResult>[0],
  appLink?: string,
  options: { paymentOrigin?: string; appOrigin?: string } = {},
) {
  const receipt = generalReceiptSchema.safeParse(proposal.receipt)
  if (
    proposal.status !== "COMPLETED" ||
    !receipt.success ||
    receipt.data.kind !== "payment_links" ||
    receipt.data.links.length > 5 ||
    receipt.data.links.some((link) => !link.copyText?.trim())
  )
    return [renderWhatsAppActionResult(proposal, appLink)]
  const links = receipt.data.links
  const origin = options.paymentOrigin
    ? trustedAssistantAppOrigin(options.paymentOrigin)
    : undefined
  const validUrl = (value: string) => {
    try {
      const url = new URL(value)
      return (
        origin &&
        url.origin === origin &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (/^\/pay\/[a-zA-Z0-9_.-]{1,220}$/.test(url.pathname) ||
          /^\/p\/[A-Za-z0-9_-]{22}$/.test(url.pathname)) &&
        value === url.href
      )
    } catch {
      return false
    }
  }
  if (links.some((link) => !validUrl(link.url)))
    return [renderWhatsAppActionResult(proposal, appLink)]
  const appOrigin = options.appOrigin
    ? trustedAssistantAppOrigin(options.appOrigin)
    : undefined
  const app = savedChatLink(appLink)
  const sharingLink =
    app && appOrigin && new URL(app).origin === appOrigin ? app : ""
  const summary = whatsAppPlainText(
    `${receipt.data.title}\n\n${links.map((link) => `${link.orderNumber}${link.customerName ? ` · ${link.customerName}` : ""}`).join("\n")}\n\nNothing was sent to customers and no payment was recorded. Forward each separate payment message to its customer.`,
  )
  return [
    `${summary}${sharingLink ? `\nSharing options in EwaTrade: ${sharingLink}` : ""}`,
    ...links.map((link) => {
      // Only this canonical URL survives; model/record URLs in other text stay stripped.
      const pieces = (link.copyText ?? "").split(link.url)
      const text = pieces.map(whatsAppPlainText).join(`\n${link.url}\n`)
      return pieces.length > 1 ? text.trim() : `${text}\n${link.url}`
    }),
  ]
}
