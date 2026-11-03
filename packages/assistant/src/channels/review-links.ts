import { z } from "zod"
import {
  type GeneralProposalReference,
  generalProposalReferenceSchema,
  generalStoredPartSchema,
} from "../general/contracts"
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

/** A 128-bit opaque locator; it carries no approval or business identifiers. */
export const assistantReviewShortLocatorSchema = z
  .string()
  .regex(/^r_[A-Za-z0-9_-]{21}[AQgw]$/)
export const assistantReviewLocatorSchema = z.union([
  assistantReviewLinkTokenSchema,
  assistantReviewShortLocatorSchema,
])

export function assistantReviewPath(locator: string): string | undefined {
  if (assistantReviewShortLocatorSchema.safeParse(locator).success)
    return `/r/${locator.slice(2)}`
  if (assistantReviewLinkTokenSchema.safeParse(locator).success)
    return `/assistant-review?token=${encodeURIComponent(locator)}`
  return undefined
}

/** Trusted configured destination only; a model or business record cannot select the host. */
export function assistantReviewLink(
  token: string,
  trustedAppOrigin: string,
): string | undefined {
  const path = assistantReviewPath(token)
  const origin = trustedAssistantAppOrigin(trustedAppOrigin)
  if (!path || !origin) return undefined
  return new URL(path, origin).href
}

/**
 * Fixed-purpose message: no approval token, chat navigation or claimed completed effect.
 * Dispatch re-renders this from the same inputs, so the shape stays input-only.
 */
export function renderWhatsAppWebReview(input: {
  token: string
  trustedAppOrigin: string
  scopeLabel: string
}): string | undefined {
  const href = assistantReviewLink(input.token, input.trustedAppOrigin)
  const scope = whatsAppPlainText(input.scopeLabel)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
  if (!href || !scope) return undefined
  return [
    `🧾 Draft ready for ${scope}.`,
    `Review draft: ${href}`,
    "Expires in 15 minutes. Nothing is saved until you approve it.",
  ].join("\n")
}

/** Deterministic run identity for link recovery replies; never a model or approval. */
export const WHATSAPP_REVIEW_LINK_RECOVERY_MODEL =
  "whatsapp-review-link-recovery-v1"
export const WHATSAPP_REVIEW_LINK_CHOICES = {
  newLink: "New link",
  cancelDraft: "Cancel draft",
  checkStatus: "Check status",
} as const
type GeneralStoredPart = z.infer<typeof generalStoredPartSchema>
export type WhatsAppReviewLinkRecoveryIntent =
  | "new_link"
  | "cancel_draft"
  | "check_status"
  | "expired"
  | "uncertain"

const exactIntents: Record<string, WhatsAppReviewLinkRecoveryIntent> = {
  "new link": "new_link",
  "cancel draft": "cancel_draft",
  "check status": "check_status",
}
const expiredPattern =
  /\b(?:link|page)\b[^.?!\n]{0,40}\bexpired\b|\bexpired\b[^.?!\n]{0,20}\blink\b|\blink\b[^.?!\n]{0,20}\b(?:doesn'?t|does not|isn'?t|is not|not) work(?:ing)?\b/i
const uncertainPattern =
  /\bcheck(?:ing)? (?:the )?status\b|\b(?:did|has) (?:it|that|this|the draft) (?:save|saved|go through|gone through)\b|\bis it saved\b/i

/**
 * Button labels match whole messages; short link complaints are recognised only
 * where the caller has already tied the message to a sent review link.
 */
export function parseWhatsAppReviewLinkRecoveryIntent(
  text: unknown,
): WhatsAppReviewLinkRecoveryIntent | undefined {
  if (typeof text !== "string" || text.length > 200) return undefined
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
  const exact = exactIntents[normalized]
  if (exact) return exact
  if (expiredPattern.test(normalized)) return "expired"
  if (uncertainPattern.test(normalized)) return "uncertain"
  return undefined
}
export function whatsAppReviewLinkChoiceIntent(
  text: string | undefined,
): WhatsAppReviewLinkRecoveryIntent | undefined {
  if (text === WHATSAPP_REVIEW_LINK_CHOICES.newLink) return "new_link"
  if (text === WHATSAPP_REVIEW_LINK_CHOICES.cancelDraft) return "cancel_draft"
  if (text === WHATSAPP_REVIEW_LINK_CHOICES.checkStatus) return "check_status"
  return undefined
}

/** Canonical proposal facts re-read by the server; nothing here comes from the message. */
export type WhatsAppReviewLinkRecoveryState = {
  status: string
  /** PENDING and before the proposal's own expiry. */
  draftOpen: boolean
  /** The newest sent link matches the current revision and has not expired. */
  linkUsable: boolean
  linkMinutesLeft: number
  receipt: { title: string; detail: string } | null
}
export type WhatsAppReviewLinkRecoveryPlan =
  | { kind: "issue_link" }
  | { kind: "cancel" }
  | { kind: "notice"; notice: "expired" | "uncertain" }
  | { kind: "reply"; text: string }

const linkStillWorks = (minutes: number) =>
  `The newest link above still works for ${minutes} more minute${minutes === 1 ? "" : "s"}. Nothing is saved until you approve it.`

/** Reads only; Saved, Not saved or Still checking. It never repeats a decision. */
export function renderWhatsAppReviewLinkStatus(
  state: WhatsAppReviewLinkRecoveryState,
): string {
  if (state.status === "COMPLETED") {
    const text = state.receipt
      ? whatsAppPlainText(
          `${state.receipt.title}\n${state.receipt.detail}`,
        ).trim()
      : ""
    return text && text.length <= 2500
      ? `✅ Saved once.\n\n${text}`
      : "✅ Saved once. Open the saved chat in EwaTrade for the full receipt."
  }
  if (state.status === "EXECUTING")
    return "⏳ Still checking. It can't save twice.\nThe result will arrive here."
  if (state.status === "CANCELLED") return "Not saved. The draft was cancelled."
  if (state.status === "PENDING" && state.draftOpen)
    return state.linkUsable
      ? `Not saved yet. ${linkStillWorks(state.linkMinutesLeft)}`
      : "Not saved yet. The draft is kept."
  return "Not saved. That draft is closed. Send the details again to start a new one."
}

/** Fixed decision table: only a still-open draft can get a new link or be cancelled. */
export function planWhatsAppReviewLinkRecovery(
  intent: WhatsAppReviewLinkRecoveryIntent,
  state: WhatsAppReviewLinkRecoveryState,
): WhatsAppReviewLinkRecoveryPlan {
  const open = state.status === "PENDING" && state.draftOpen
  const status = {
    kind: "reply" as const,
    text: renderWhatsAppReviewLinkStatus(state),
  }
  switch (intent) {
    case "new_link":
      if (!open) return status
      return state.linkUsable
        ? { kind: "reply", text: `🔗 ${linkStillWorks(state.linkMinutesLeft)}` }
        : { kind: "issue_link" }
    case "cancel_draft":
      if (state.status === "PENDING") return { kind: "cancel" }
      if (state.status === "COMPLETED")
        return {
          kind: "reply",
          text: "That draft is already saved, so it wasn't cancelled.",
        }
      if (state.status === "CANCELLED")
        return {
          kind: "reply",
          text: "That draft is already cancelled. Nothing was saved.",
        }
      return status
    case "expired":
      if (!open) return status
      return state.linkUsable
        ? { kind: "reply", text: `🔗 ${linkStillWorks(state.linkMinutesLeft)}` }
        : { kind: "notice", notice: "expired" }
    case "check_status":
      return open && !state.linkUsable
        ? { kind: "notice", notice: "expired" }
        : status
    case "uncertain":
      return open ? { kind: "notice", notice: "uncertain" } : status
  }
}

const notices = {
  expired: {
    title: "That link expired",
    value: "The draft is kept. Nothing was saved.",
    detail: "Links work for 15 minutes.",
    choices: [
      WHATSAPP_REVIEW_LINK_CHOICES.newLink,
      WHATSAPP_REVIEW_LINK_CHOICES.cancelDraft,
    ],
  },
  uncertain: {
    title: "That save isn't confirmed yet",
    value: "Don't approve it again.",
    detail: "Tap Check status to see if it saved.",
    choices: [WHATSAPP_REVIEW_LINK_CHOICES.checkStatus],
  },
} as const
const CHANGED_TEXT =
  "That link or draft just changed. Use the newest message above. Nothing was changed."

/**
 * Stored assistant parts for one recovery reply. A notice is a saved answer so
 * delivery attaches its fixed reply buttons; a new link is the same proposal
 * reference that normal settlement turns into a fresh 15-minute review link.
 */
export function whatsAppReviewLinkRecoveryParts(
  outcome:
    | Exclude<WhatsAppReviewLinkRecoveryPlan, { kind: "cancel" }>
    | { kind: "cancelled" }
    | { kind: "changed" },
  context: {
    reference?: GeneralProposalReference
    scopeLabel: string
    now: Date
  },
): GeneralStoredPart[] {
  if (outcome.kind === "issue_link" && context.reference)
    return [
      { type: "text", text: "🔗 Same draft, new link." },
      {
        type: "data-general-proposal-reference",
        data: generalProposalReferenceSchema.parse(context.reference),
      },
    ]
  if (outcome.kind === "cancelled")
    return [{ type: "text", text: "Draft cancelled. Nothing was saved." }]
  if (outcome.kind === "changed" || outcome.kind === "issue_link")
    return [{ type: "text", text: CHANGED_TEXT }]
  if (outcome.kind === "reply") return [{ type: "text", text: outcome.text }]
  const notice = notices[outcome.notice]
  return [
    generalStoredPartSchema.parse({
      type: "data-general-answer",
      data: {
        id: `review-link-${outcome.notice}`,
        title: notice.title,
        value: notice.value,
        scope: whatsAppPlainText(context.scopeLabel).slice(0, 500),
        asOf: context.now.toISOString(),
        detail: notice.detail,
        chatChoices: notice.choices.map((label) => ({
          title: label,
          text: label,
        })),
      },
    }),
  ]
}
