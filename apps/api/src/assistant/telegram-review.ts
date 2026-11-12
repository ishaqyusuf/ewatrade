import { createHash } from "node:crypto"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS,
  WHATSAPP_ACTION_REVIEW_MAX_UNITS,
  type WhatsAppProposalSource,
  actionReviewFactLines,
  exactPlainText,
  whatsAppActionReviewSchema,
} from "@ewatrade/assistant/channels/action-review"
import type {
  DirectTelegramBotProvider,
  TelegramSendResult,
} from "@ewatrade/communications"
import {
  type TelegramInboxLease,
  type TelegramOutboxPayload,
  finishAssistantTelegramReviewRenewal,
  markAssistantTelegramReviewExpired,
  readAssistantTelegramActionReview,
  readAssistantTelegramExpiredReview,
  stageAssistantTelegramActionReview,
  stageAssistantTelegramOutbox,
} from "@ewatrade/db/assistant-telegram"
import { buildChannelProposalReview } from "./channel-proposal-review"
import type { GeneralTransactionContext } from "./general-actions"
import { canUseCapability, requireGeneralScope } from "./general-context"

/**
 * Telegram-native phase 4 (Workshop ewatrade/assistant/telegram-system, 02 v4,
 * families 9–10): the Telegram review layout, decided-review status lines,
 * receipts as replies, callback toasts and Review it again. Presentation only:
 * every decision still goes through the canonical proposal → review → Confirm path.
 */

export const telegramCallbackPattern =
  /^(confirm|cancel|edit|again):([A-Za-z0-9_-]{1,48})$/

/** The one status line a decided review keeps under its facts. */
export const telegramReviewStatus = {
  confirmed: "✓ Confirmed",
  cancelled: "Cancelled · nothing was saved",
  expired: "Expired · nothing was saved",
  notSaved: "Not saved · this draft changed",
} as const

export const telegramReviewCopy = {
  expired:
    "This review expired. Nothing was saved, and your draft is still here.",
  reviewingAgain: "Reviewing again ✓",
} as const

/**
 * Toasts the webhook can show before the turn runs. They describe the tap only,
 * never an outcome the webhook cannot know.
 */
export function telegramCallbackToast(data: string) {
  switch (telegramCallbackPattern.exec(data)?.[1]) {
    case "confirm":
      return "Saving…"
    case "edit":
      return "Send your change"
    case "cancel":
      return "Cancelling…"
    case "again":
      return "Getting a fresh review…"
    default:
      return undefined
  }
}

/** "9:50 AM" in the Business's time zone; UTC (labelled) if the zone is unusable. */
export function telegramReviewExpiry(expiresAt: Date, timeZone: string) {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    })
      .format(expiresAt)
      .replace(/[  ]/gu, " ")
  try {
    return format(timeZone)
  } catch {
    return `${format("UTC")} UTC`
  }
}

/**
 * Telegram review body: the same exact facts and order as the WhatsApp review,
 * laid out for Telegram ("Draft N", local expiry, one blank line between blocks).
 */
export function renderTelegramActionReviewBody(
  input: unknown,
  options: { timeZone: string },
): { body: string; source: WhatsAppProposalSource } | null {
  const parsed = whatsAppActionReviewSchema.safeParse(input)
  if (!parsed.success) return null
  const review = parsed.data
  const facts = actionReviewFactLines(review)
  const expiresAt = new Date(review.expiresAt)
  if (!facts || !Number.isFinite(expiresAt.getTime())) return null
  const lines = [
    review.title,
    `Business: ${review.businessName}`,
    `Store: ${review.storeName}`,
    `Draft ${review.source.revision}`,
    ...facts,
    `Review expires: ${telegramReviewExpiry(expiresAt, options.timeZone)}`,
  ]
  if (lines.some((line) => !exactPlainText(line) || !line.trim())) return null
  const body = [
    review.title,
    lines.slice(1, 4).join("\n"),
    facts.join("\n"),
    lines.at(-1),
  ].join("\n\n")
  return body.length <=
    WHATSAPP_ACTION_REVIEW_MAX_UNITS - WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS
    ? { body, source: review.source }
    : null
}

export const telegramReviewDigest = (body: string) =>
  createHash("sha256").update(body).digest("hex")

export const telegramDecidedReview = (body: string, status: string) =>
  `${body}\n\n${status}`

type ProposalRow = Parameters<typeof buildChannelProposalReview>[1]

/** Render a proposal as a Telegram review that expires at `expiresAt`. */
export async function renderTelegramProposalReview(
  fresh: GeneralTransactionContext,
  proposal: ProposalRow,
  expiresAt: Date,
) {
  const projection = await buildChannelProposalReview(fresh, proposal)
  if (projection.kind !== "review" || projection.pages) return null
  return renderTelegramActionReviewBody(
    { ...projection.review, expiresAt: expiresAt.toISOString() },
    { timeZone: fresh.tenantContext.tenant.timezone },
  )
}

/**
 * The review body exactly as it was sent, proved by its digest. The product does
 * not keep sent text, so the body is rebuilt from the same proposal revision; any
 * drift (renamed records, changed zone) returns null and the review keeps only a
 * cleared keyboard.
 */
export async function provenTelegramReviewBody(
  fresh: GeneralTransactionContext,
  proposal: ProposalRow,
  review: { expiresAt: Date; reviewDigest: string },
) {
  try {
    const rendered = await renderTelegramProposalReview(
      fresh,
      proposal,
      review.expiresAt,
    )
    return rendered &&
      telegramReviewDigest(rendered.body) === review.reviewDigest
      ? rendered.body
      : null
  } catch {
    return null
  }
}

/** Stage a fresh Telegram review for a pending proposal. False → app review. */
export async function stageTelegramProposalReview(
  fresh: GeneralTransactionContext,
  lease: TelegramInboxLease,
  proposal: ProposalRow,
  expiresAt: Date,
  now = Date.now(),
) {
  if (expiresAt.getTime() <= now) return false
  const review = await renderTelegramProposalReview(fresh, proposal, expiresAt)
  if (!review) return false
  await stageAssistantTelegramActionReview(fresh.db, lease, {
    ...review.source,
    expiresAt,
    text: review.body,
    reviewDigest: telegramReviewDigest(review.body),
  })
  return true
}

/** Edit a decided review in place, or only clear its keyboard if its body is unproven. */
export function stageTelegramReviewStatus(
  fresh: GeneralTransactionContext,
  lease: TelegramInboxLease,
  input: { messageId: string; body: string | null; status: string },
) {
  return stageAssistantTelegramOutbox(
    fresh.db,
    lease,
    input.body
      ? {
          editMessageId: input.messageId,
          text: telegramDecidedReview(input.body, input.status),
        }
      : { clearKeyboardMessageId: input.messageId },
  )
}

function findScopedProposal(
  fresh: GeneralTransactionContext,
  review: { proposalId: string; revision: number; payloadHash: string },
) {
  const scope = requireGeneralScope(fresh)
  return fresh.db.assistantActionProposal.findFirst({
    where: {
      id: review.proposalId,
      revision: review.revision,
      payloadHash: review.payloadHash,
      actorUserId: scope.userId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      conversationId: fresh.assistantConversationId,
    },
  })
}

/** Whether the same draft can be reviewed again: still pending, unchanged and allowed. */
function renewable(
  fresh: GeneralTransactionContext,
  proposal: Awaited<ReturnType<typeof findScopedProposal>>,
  now: Date,
): proposal is NonNullable<typeof proposal> {
  return Boolean(
    proposal &&
      proposal.status === "PENDING" &&
      proposal.expiresAt > now &&
      canUseCapability(fresh, capabilityForAction(proposal.action)),
  )
}

/**
 * A tap on an expired review (t-review-expired). Marks it Expired in place and
 * offers Review it again while the same draft is still pending. Returns false
 * when this is not an expired review of this chat.
 */
export async function answerExpiredTelegramReview(
  fresh: GeneralTransactionContext,
  lease: TelegramInboxLease,
  input: { reviewId: string; messageId: string },
  now = new Date(),
) {
  const review = await readAssistantTelegramExpiredReview(
    fresh.db,
    lease,
    {
      reviewId: input.reviewId,
      providerMessageId: input.messageId,
      decision: "expired-or-open",
    },
    now,
  )
  if (!review) return false
  const proposal = await findScopedProposal(fresh, review)
  const canRenew = renewable(fresh, proposal, now)
  const body =
    proposal && canRenew
      ? await provenTelegramReviewBody(fresh, proposal, review)
      : null
  await markAssistantTelegramReviewExpired(fresh.db, review.id, now)
  await stageAssistantTelegramOutbox(fresh.db, lease, {
    text: canRenew
      ? telegramReviewCopy.expired
      : "This review has expired or changed. Ask me for the current draft.",
    replyToMessageId: input.messageId,
    ...(canRenew
      ? {
          buttons: [[{ text: "Review it again", data: `again:${review.id}` }]],
        }
      : {}),
  })
  await stageTelegramReviewStatus(fresh, lease, {
    messageId: input.messageId,
    body,
    status: telegramReviewStatus.expired,
  })
  return true
}

/**
 * Review it again: a fresh Telegram review of the same, unchanged draft. Returns
 * false when the draft can no longer be reviewed (changed, decided or expired).
 */
export async function renewTelegramReview(
  fresh: GeneralTransactionContext,
  lease: TelegramInboxLease,
  input: { reviewId: string; messageId: string; inboxExpiresAt: Date },
  now = new Date(),
) {
  const review = await readAssistantTelegramExpiredReview(
    fresh.db,
    lease,
    { reviewId: input.reviewId, decision: "expired" },
    now,
  )
  const proposal = review ? await findScopedProposal(fresh, review) : null
  if (!review || !renewable(fresh, proposal, now)) return false
  const expiresAt = new Date(
    Math.min(
      proposal.expiresAt.getTime(),
      input.inboxExpiresAt.getTime(),
      now.getTime() + 5 * 60_000,
    ),
  )
  if (
    !(await stageTelegramProposalReview(
      fresh,
      lease,
      proposal,
      expiresAt,
      now.getTime(),
    ))
  )
    return false
  await finishAssistantTelegramReviewRenewal(fresh.db, review.id, now)
  // The notice keeps its words and loses its spent button.
  await stageAssistantTelegramOutbox(fresh.db, lease, {
    editMessageId: input.messageId,
    text: `${telegramReviewCopy.expired}\n\n${telegramReviewCopy.reviewingAgain}`,
  })
  return true
}

/**
 * After a refused Confirm or Cancel (the draft changed, an account closed, the
 * proposal was revised elsewhere): the open review's proven body, so it can say
 * "Not saved". Null when the review is already decided, gone, or was saved.
 */
export async function refusedTelegramReview(
  fresh: GeneralTransactionContext,
  lease: TelegramInboxLease,
  input: { reviewId: string; messageId: string },
) {
  const review = await readAssistantTelegramActionReview(fresh.db, lease, {
    reviewId: input.reviewId,
    providerMessageId: input.messageId,
  })
  if (!review || review.decision) return null
  const proposal = await findScopedProposal(fresh, review)
  if (!proposal || ["COMPLETED", "EXECUTING"].includes(proposal.status))
    return null
  return { body: await provenTelegramReviewBody(fresh, proposal, review) }
}

export type TelegramDeliveryBot = Pick<
  DirectTelegramBotProvider,
  "sendMessage" | "editMessageText" | "clearInlineKeyboard"
>

/**
 * Send one outbox payload. Edits (keyboard or text) are idempotent, so the worker
 * may retry an uncertain edit; an uncertain send is never repeated.
 */
export async function deliverTelegramOutboxPayload(
  bot: TelegramDeliveryBot,
  chatId: string,
  payload: TelegramOutboxPayload,
): Promise<{ result: TelegramSendResult; edit: boolean }> {
  if ("clearKeyboardMessageId" in payload)
    return {
      edit: true,
      result: await bot.clearInlineKeyboard({
        chatId,
        messageId: payload.clearKeyboardMessageId,
      }),
    }
  if ("editMessageId" in payload)
    return {
      edit: true,
      result: await bot.editMessageText({
        chatId,
        messageId: payload.editMessageId,
        text: payload.text,
      }),
    }
  return {
    edit: false,
    result: await bot.sendMessage({
      chatId,
      text: payload.text,
      replyToMessageId: payload.replyToMessageId,
      buttons: payload.buttons?.map((row) =>
        row.map((button) =>
          "url" in button
            ? { text: button.text, url: button.url }
            : { text: button.text, callbackData: button.data },
        ),
      ),
    }),
  }
}
