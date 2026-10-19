import { z } from "zod"
import { trustedAssistantAppOrigin } from "./conversation-links"
import { whatsAppPlainText } from "./render"

export const WHATSAPP_ACTION_RESULT_VERSION = "whatsapp-action-result-v1"
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
