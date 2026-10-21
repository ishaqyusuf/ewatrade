import { z } from "zod"
import { trustedAssistantAppOrigin } from "./conversation-links"
import { whatsAppPlainText } from "./render"

export const WHATSAPP_WEB_REVIEW_VERSION = "whatsapp-web-review-v1"
export const WHATSAPP_WEB_REVIEW_RESULT_VERSION =
  "whatsapp-web-review-result-v1"
export const ASSISTANT_REVIEW_LINK_TTL_MS = 15 * 60_000
const identity = z.string().min(1).max(128)

/** Navigation proof only. Current browser identity and canonical proposal authority remain mandatory. */
export const assistantReviewLinkSourceSchema = z
  .object({
    version: z.literal(1),
    proposalId: identity,
    revision: z.number().int().positive(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    bindingId: identity,
    inboxId: identity,
    expiresAt: z.number().int().positive(),
    originRevision: z.number().int().positive().optional(),
    originPayloadHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.originRevision === undefined) ===
      (value.originPayloadHash === undefined),
    "Original proposal revision and hash must be supplied together",
  )
export type AssistantReviewLinkSource = z.infer<
  typeof assistantReviewLinkSourceSchema
>
export const assistantReviewLinkTokenSchema = z
  .string()
  .min(32)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

/** Trusted configured destination only; a model or business record cannot select the host. */
export function assistantReviewLink(
  token: string,
  trustedAppOrigin: string,
): string | undefined {
  const parsed = assistantReviewLinkTokenSchema.safeParse(token)
  const origin = trustedAssistantAppOrigin(trustedAppOrigin)
  if (!parsed.success || !origin) return undefined
  const url = new URL("/assistant-review", origin)
  url.searchParams.set("token", parsed.data)
  return url.href
}

/** Fixed-purpose message: no approval token, chat navigation or claimed completed effect. */
export function renderWhatsAppWebReview(input: {
  token: string
  trustedAppOrigin: string
  scopeLabel: string
}): string | undefined {
  const href = assistantReviewLink(input.token, input.trustedAppOrigin)
  const scope = whatsAppPlainText(input.scopeLabel).slice(0, 240)
  if (!href || !scope) return undefined
  return [
    scope,
    "Your draft is ready to review.",
    "Open the review page to check the details, edit, approve or cancel. Use your existing EwaTrade sign-in. Nothing is saved until you approve.",
    `Review draft: ${href}`,
    "This link expires within 15 minutes and stops working when the draft changes or is completed.",
  ].join("\n\n")
}
