import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { conversationAppLink } from "@ewatrade/assistant/channels/conversation-links"
import type { AssistantChannelDeliveryResult } from "@ewatrade/assistant/channels/delivery"
import type { AssistantChannelTurnResult } from "@ewatrade/assistant/channels/worker"
import {
  generalActionSchema,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  type AssistantTelegramConfig,
  DirectTelegramBotProvider,
  type NormalizedAssistantTelegramUpdate,
  type TelegramButton,
  readAssistantTelegramConfig,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import { readGeneralActiveRun } from "@ewatrade/db/assistant-general"
import {
  AssistantTelegramError,
  acceptAssistantTelegramUpdate as acceptTelegramInbox,
  assertAssistantTelegramDeliveryAuthority,
  claimAssistantTelegramInbox,
  claimAssistantTelegramLink,
  claimAssistantTelegramOutbox,
  endAssistantTelegramAccess,
  finishAssistantTelegramActionReview,
  nextAssistantTelegramInbox,
  nextAssistantTelegramOutbox,
  readAssistantTelegramActionReview,
  readAssistantTelegramConnection,
  readAssistantTelegramDraftState,
  recordAssistantTelegramClaimMessage,
  retryAssistantTelegramInbox,
  settleAssistantTelegramInbox,
  settleAssistantTelegramOutbox,
  stageAssistantTelegramOutbox,
} from "@ewatrade/db/assistant-telegram"
import { enqueueAssistantTelegramDelivery } from "@ewatrade/jobs/assistant-telegram"
import { TRPCError } from "@trpc/server"
import { paymentLinkOrigin } from "../banking/config"
import { assistantDecisionEvents, emitAssistantEvents } from "./analytics"
import {
  createTelegramAssistantContext,
  resolveLinkedTelegramIdentity,
} from "./channel-principal"
import type { GeneralTransactionContext } from "./general-actions"
import {
  type GeneralContext,
  assertGeneralAction,
  canUseCapability,
  requireGeneralScope,
} from "./general-context"
import {
  decideGeneralProposalInTransaction,
  inFreshGeneralTransaction,
} from "./general-proposals"
import { createGeneralAssistantTurn } from "./general-turn"
import { GeneralTurnError } from "./general-turn-contract"
import { proposalApprovalToken } from "./proposal-security"
import { acceptTelegramChatsUpdate } from "./telegram-chats"
import { pickTelegramChoice, telegramChoiceExpired } from "./telegram-choices"
import {
  type TelegramControlReply,
  telegramAccessEndedNotice,
  telegramConnectedControl,
  telegramPhase2Copy,
  telegramRoleChangedRefusal,
} from "./telegram-connected"
import {
  type TelegramControlReceipt,
  acceptTelegramControl,
  telegramTypedDecision,
  telegramTypedDecisionReply,
} from "./telegram-control"
import { retireTelegramHandoffLinks } from "./telegram-handoff"
import { acceptAssistantTelegramMedia } from "./telegram-media"
import {
  type TelegramChatEffects,
  openEwaTradeButtons,
  telegramAppOrigin,
  telegramCopy,
} from "./telegram-presentation"
import {
  type TelegramRenderedMessage,
  type TelegramReplyOptions,
  isTelegramChoiceCallback,
  renderTelegramActionResult,
  renderTelegramFinalReply,
} from "./telegram-render"
import {
  answerExpiredTelegramReview,
  deliverTelegramOutboxPayload,
  provenTelegramReviewBody,
  refusedTelegramReview,
  renewTelegramReview,
  stageTelegramProposalReview,
  stageTelegramReviewStatus,
  telegramCallbackPattern,
  telegramReviewStatus,
} from "./telegram-review"

const callbackPattern = telegramCallbackPattern
const unavailableReview =
  "This review has expired or changed. Ask me for the current draft."
const appOrigin = telegramAppOrigin

/** A reply sent straight from the webhook (no inbox), e.g. linking and entry replies. */
export type TelegramNotice = {
  text: string
  html?: boolean
  buttons?: TelegramButton[][]
  /** Quote this user message at the top of the reply (`reply_parameters`). */
  replyTo?: string
  /** Phase 3: edit this bot message in place instead of sending, e.g. a spent /chats list. */
  editMessageId?: string
  /** Runs after Telegram accepts the reply, with the bot for follow-up chat effects. */
  onSent?: (messageId: string, bot: TelegramChatEffects) => Promise<unknown>
  /** Runs after the reply whatever its outcome. */
  after?: (bot: TelegramChatEffects) => Promise<unknown>
}
type IngressReceipt = {
  ingressId?: string
  notice?: TelegramNotice
  effects?: TelegramControlReceipt["effects"]
}
const entryNotice = (): TelegramNotice => ({
  text: telegramCopy.entry,
  buttons: openEwaTradeButtons(),
})
/** Phase 2 (a-lost, a-expired): close ended access once and explain it, else null. */
async function accessEndedNotice(
  config: AssistantTelegramConfig,
  sender: { botId: string; userId: string; chatId: string },
): Promise<TelegramNotice | null> {
  const ended = await endAssistantTelegramAccess(prisma, {
    ...sender,
    allowedUserIds: config.allowedUserIds,
    allowedTenantIds: config.allowedTenantIds,
  })
  return ended ? telegramAccessEndedNotice(sender.chatId, ended) : null
}
export async function acceptAssistantTelegramUpdate(
  config: AssistantTelegramConfig,
  event: NormalizedAssistantTelegramUpdate,
): Promise<IngressReceipt> {
  const sender = {
    botId: config.botId,
    userId: event.userId,
    chatId: event.chatId,
  }
  // Phase 6 (k-disc, k-stop, s-pw, s-forward): disconnect, Stop bot, passwords
  // and forwarded reviews are answered here and never enter the inbox.
  const control = await acceptTelegramControl(config, event)
  if (control) return control
  if (event.kind === "member") return {}
  // Phase 5 (f-today, v-today): media gets a text-only reply and never enters the inbox.
  if (event.kind === "media")
    return acceptAssistantTelegramMedia(config, event, {
      notConnected: async () =>
        (await accessEndedNotice(config, sender)) ?? entryNotice(),
    })
  const occurredAt = event.kind === "message" ? event.occurredAt : new Date()
  if (event.kind === "message") {
    const message = event.text.trim()
    if (!config.enabled) return {}
    if (/^\/start(?:\s|$)/u.test(message)) {
      const link = /^\/start ([A-Za-z0-9_-]{43})$/u.exec(message)
      if (link?.[1]) {
        const claimed = await claimAssistantTelegramLink(prisma, {
          ...sender,
          updateId: event.updateId,
          occurredAt,
          code: link[1],
          name: event.sender?.name,
          username: event.sender?.username,
        })
        // Invalid, expired, used and foreign links all get the same neutral reply.
        if (!claimed)
          return {
            notice: {
              text: telegramCopy.staleLink,
              buttons: openEwaTradeButtons(),
            },
          }
        // c-second: held by another EwaTrade account. Not a claim message to edit later.
        if (claimed.busy)
          return {
            notice: { text: telegramPhase2Copy.busy(claimed), html: true },
          }
        return {
          notice: {
            text: telegramCopy.claim(claimed),
            html: true,
            buttons: openEwaTradeButtons(),
            onSent: (messageId) =>
              recordAssistantTelegramClaimMessage(prisma, {
                ...sender,
                linkId: claimed.linkId,
                messageId,
              }),
          },
        }
      }
      const connection = await readAssistantTelegramConnection(prisma, sender)
      return {
        notice: connection
          ? { text: telegramCopy.alreadyConnected(connection), html: true }
          : ((await accessEndedNotice(config, sender)) ?? entryNotice()),
      }
    }
  }
  // Phase 3 (l-new, l-chats): switching chats moves the binding, so it is
  // answered here like /disconnect rather than from the inbox.
  if (config.enabled) {
    const chats = await acceptTelegramChatsUpdate(prisma, config, event)
    if (chats) return chats
  }
  if (
    !config.enabled ||
    (event.kind === "callback" &&
      !callbackPattern.test(event.data) &&
      !isTelegramChoiceCallback(event.data))
  )
    return {}
  const row = await acceptTelegramInbox(prisma, {
    ...sender,
    updateId: event.updateId,
    messageId: event.messageId,
    occurredAt,
    allowedUserIds: config.allowedUserIds,
    allowedTenantIds: config.allowedTenantIds,
    content:
      event.kind === "message"
        ? { kind: "message", text: event.text }
        : { kind: "callback", data: event.data, callbackId: event.callbackId },
  })
  if (row) return { ingressId: row.id }
  const ended = await accessEndedNotice(config, sender)
  if (ended) return { notice: ended }
  // Ordinary text in a chat that is not connected gets the neutral entry reply.
  // Connected chats rejected for other reasons (duplicates, enrollment) stay silent.
  if (
    event.kind === "message" &&
    !(await readAssistantTelegramConnection(prisma, sender))
  )
    return { notice: entryNotice() }
  return {}
}

type TelegramClaim = NonNullable<
  Awaited<ReturnType<typeof claimAssistantTelegramInbox>>
>

function startTelegramTyping(
  { principal, lease }: TelegramClaim,
  sendTyping: DirectTelegramBotProvider["sendTyping"],
) {
  const controller = new AbortController()
  const { signal } = controller
  let timer: ReturnType<typeof setTimeout> | undefined
  async function pulse(refresh: boolean) {
    try {
      // The turn checked authority before the first pulse. Refreshes must
      // still belong to an active connection and the same worker lease.
      if (refresh) await resolveLinkedTelegramIdentity(prisma, principal, lease)
      const nextPulseAt = Date.now() + 4_000
      if (signal.aborted || !(await sendTyping(principal.chatId, signal)))
        return
      if (!signal.aborted)
        timer = setTimeout(() => void pulse(true), nextPulseAt - Date.now())
    } catch {
      // Typing is optional; neither provider nor authority lookup failures delay the turn.
    }
  }
  void pulse(false)
  return () => {
    clearTimeout(timer)
    controller.abort()
  }
}

function savedChat(ctx: GeneralContext) {
  const scope = requireGeneralScope(ctx)
  const origin = { tenantId: scope.tenantId, storeId: scope.storeId }
  const conversation = {
    purpose: "GENERAL" as const,
    origin,
    conversationId: ctx.assistantConversationId ?? "",
  }
  const options = { trustedAppOrigin: appOrigin(), currentScope: origin }
  return {
    conversation,
    options,
    link: conversationAppLink(conversation, options),
  }
}

/** Phase 3: links, saved answer and "as of" zone for the Telegram HTML renderer. */
function telegramReplyOptions(
  ctx: GeneralContext,
  messageId?: string,
): TelegramReplyOptions {
  const { options, conversation } = savedChat(ctx)
  return {
    ...options,
    conversation,
    messageId,
    timeZone: ctx.tenantContext.tenant.timezone ?? undefined,
  }
}

/** Phase 4: replies quote the review, and a decided review keeps a status line. */
type CallbackReply = {
  replyTo?: string
  status?: { body: string | null; line: string }
}

async function stageText(
  fresh: GeneralTransactionContext,
  lease: TelegramClaim["lease"],
  messages: readonly (string | TelegramRenderedMessage)[],
  clearKeyboardMessageId?: string,
  reply: CallbackReply = {},
) {
  for (const message of messages)
    await stageAssistantTelegramOutbox(fresh.db, lease, {
      ...(typeof message === "string" ? { text: message } : message),
      ...(reply.replyTo ? { replyToMessageId: reply.replyTo } : {}),
    })
  if (clearKeyboardMessageId)
    await stageTelegramReviewStatus(fresh, lease, {
      messageId: clearKeyboardMessageId,
      body: reply.status?.body ?? null,
      status: reply.status?.line ?? "",
    })
  await settleAssistantTelegramInbox(fresh.db, lease, {})
}

async function executeCallback(
  ctx: GeneralContext,
  claim: TelegramClaim,
  data: string,
) {
  const { lease, inbox } = claim
  const callback = callbackPattern.exec(data)
  const decision = callback?.[1]
  const reviewId = callback?.[2]
  if (
    !reviewId ||
    (decision !== "confirm" &&
      decision !== "edit" &&
      decision !== "cancel" &&
      decision !== "again")
  ) {
    await inFreshGeneralTransaction(ctx, (fresh) =>
      stageText(fresh, lease, [unavailableReview]),
    )
    return
  }
  const replyTo = inbox.messageId
  // Analytics only: the decided proposal, emitted after the transaction commits.
  let decided: unknown
  try {
    await inFreshGeneralTransaction(ctx, async (fresh) => {
      decided = undefined
      // Phase 4 (t-review-expired): Review it again, once, for the same draft.
      if (decision === "again") {
        if (
          await renewTelegramReview(fresh, lease, {
            reviewId,
            messageId: inbox.messageId,
            inboxExpiresAt: inbox.expiresAt,
          })
        )
          await settleAssistantTelegramInbox(fresh.db, lease, {})
        else await stageText(fresh, lease, [unavailableReview])
        return
      }
      const proof = await readAssistantTelegramActionReview(fresh.db, lease, {
        reviewId,
        providerMessageId: inbox.messageId,
      })
      // Phase 4: a tap after expiry marks the review Expired in place.
      if (
        !proof &&
        (await answerExpiredTelegramReview(fresh, lease, {
          reviewId,
          messageId: inbox.messageId,
        }))
      ) {
        await settleAssistantTelegramInbox(fresh.db, lease, {})
        return
      }
      const scope = requireGeneralScope(fresh)
      const row = proof
        ? await fresh.db.assistantActionProposal.findFirst({
            where: {
              id: proof.proposalId,
              revision: proof.revision,
              payloadHash: proof.payloadHash,
              actorUserId: scope.userId,
              tenantId: scope.tenantId,
              storeId: scope.storeId,
              conversationId: fresh.assistantConversationId,
            },
          })
        : null
      if (!proof || !row || (proof.decision && proof.decision !== decision)) {
        await stageText(fresh, lease, [unavailableReview])
        return
      }
      // Phase 2 (a-role): the role or Store access changed after the draft.
      // The callback toast was already answered at the webhook, so the refusal
      // is a reply and the review's buttons are cleared. Cancel stays allowed.
      if (
        decision !== "cancel" &&
        !proof.decision &&
        row.status === "PENDING" &&
        row.expiresAt > new Date()
      ) {
        const refusal = telegramRoleChangedRefusal(
          fresh,
          capabilityForAction(row.action),
        )
        if (refusal) {
          await stageText(fresh, lease, [refusal], inbox.messageId)
          return
        }
      }
      if (decision === "edit") {
        if (row.status !== "PENDING" || row.expiresAt <= new Date()) {
          await stageText(fresh, lease, [unavailableReview])
          return
        }
        assertGeneralAction(
          fresh,
          generalActionSchema.parse(row.payload).action,
        )
        if (!proof.decision)
          await finishAssistantTelegramActionReview(fresh.db, proof.id, {
            decision,
          })
        await stageText(
          fresh,
          lease,
          ["What would you like to change in this draft?"],
          proof.decision ? undefined : inbox.messageId,
          { replyTo },
        )
        return
      }
      // The exact body as sent, so the decided review keeps its facts.
      const reviewBody =
        proof.decision || row.status !== "PENDING"
          ? null
          : await provenTelegramReviewBody(fresh, row, proof)
      const proposal = await decideGeneralProposalInTransaction(fresh, {
        proposalId: row.id,
        revision: row.revision,
        decision,
        ...(decision === "confirm" && row.status === "PENDING"
          ? {
              approvalToken: proposalApprovalToken(
                row,
                process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
              ),
            }
          : {}),
      })
      decided = proposal
      if (!proof.decision)
        await finishAssistantTelegramActionReview(fresh.db, proof.id, {
          decision,
          resultRef: {
            proposalId: proposal.id,
            revision: proposal.revision,
            status: proposal.status,
          },
        })
      await stageText(
        fresh,
        lease,
        // Phase 3 (fmt-receipt): Telegram HTML receipt with URL buttons.
        renderTelegramActionResult(proposal, {
          appLink: savedChat(ctx).link?.href,
          appOrigin: appOrigin(),
          paymentOrigin:
            proposal.receipt?.kind === "payment_links"
              ? paymentLinkOrigin()
              : undefined,
        }),
        proof.decision ? undefined : inbox.messageId,
        {
          replyTo,
          status: {
            body: reviewBody,
            line:
              proposal.status === "CANCELLED"
                ? telegramReviewStatus.cancelled
                : telegramReviewStatus.confirmed,
          },
        },
      )
    })
    emitAssistantEvents(ctx, assistantDecisionEvents(decided))
  } catch (error) {
    if (
      !(error instanceof TRPCError) &&
      !(
        error instanceof AssistantTelegramError &&
        ["CONFLICT", "EXPIRED"].includes(error.code)
      )
    )
      throw error
    await inFreshGeneralTransaction(ctx, async (fresh) => {
      // Phase 4: a refused Confirm or Cancel says "Not saved" on the review.
      const refused =
        decision === "confirm" || decision === "cancel"
          ? await refusedTelegramReview(fresh, lease, {
              reviewId,
              messageId: inbox.messageId,
            })
          : null
      await stageText(
        fresh,
        lease,
        [unavailableReview],
        refused ? inbox.messageId : undefined,
        {
          replyTo,
          status: refused
            ? { body: refused.body, line: telegramReviewStatus.notSaved }
            : undefined,
        },
      )
    })
  }
}

async function findRun(ctx: GeneralContext, requestId: string) {
  const scope = requireGeneralScope(ctx)
  return ctx.db.assistantRun.findFirst({
    where: {
      requestId,
      actorUserId: scope.userId,
      conversationId: ctx.assistantConversationId,
    },
    include: { assistantMessage: true },
  })
}

async function stageRunReply(
  ctx: GeneralContext,
  claim: TelegramClaim,
  run: NonNullable<Awaited<ReturnType<typeof findRun>>>,
) {
  const message = run.assistantMessage
  if (run.status !== "COMPLETED" || !message) {
    await inFreshGeneralTransaction(ctx, (fresh) =>
      stageText(fresh, claim.lease, [
        "The assistant could not finish this request. Please try again.",
      ]),
    )
    return
  }
  const parts = Array.isArray(message.parts) ? message.parts : []
  const refs = parts.flatMap((part) => {
    const parsed = generalStoredPartSchema.safeParse(part)
    return parsed.success &&
      parsed.data.type === "data-general-proposal-reference"
      ? [parsed.data.data]
      : []
  })
  await inFreshGeneralTransaction(ctx, async (fresh) => {
    const scope = requireGeneralScope(fresh)
    const reference = refs.length === 1 ? refs[0] : undefined
    const proposal = reference
      ? await fresh.db.assistantActionProposal.findFirst({
          where: {
            id: reference.proposalId,
            revision: reference.revision,
            payloadHash: reference.payloadHash,
            status: "PENDING",
            actorUserId: scope.userId,
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            conversationId: fresh.assistantConversationId,
          },
        })
      : null
    if (
      proposal &&
      canUseCapability(fresh, capabilityForAction(proposal.action))
    ) {
      const expiresAt = new Date(
        Math.min(
          proposal.expiresAt.getTime(),
          claim.inbox.expiresAt.getTime(),
          (run.completedAt ?? run.startedAt).getTime() + 5 * 60_000,
        ),
      )
      // Phase 4: the Telegram review layout (Draft N, local expiry).
      if (
        await stageTelegramProposalReview(
          fresh,
          claim.lease,
          proposal,
          expiresAt,
        )
      ) {
        await settleAssistantTelegramInbox(fresh.db, claim.lease, {
          runId: run.id,
        })
        return
      }
    }
    const { link } = savedChat(ctx)
    if (proposal && link) {
      const reviewUrl = new URL(link.href)
      reviewUrl.searchParams.set("proposalId", proposal.id)
      await stageAssistantTelegramOutbox(fresh.db, claim.lease, {
        text: "Review this saved draft in EwaTrade.",
        buttons: [[{ text: "Review in EwaTrade", url: reviewUrl.href }]],
        runId: run.id,
        messageId: message.id,
      })
      // Phase 5 (x-link-product): a corrected draft's earlier link loses its button.
      await retireTelegramHandoffLinks(fresh.db, claim.lease, {
        proposalId: proposal.id,
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
        chatId: claim.principal.chatId,
        messageId: message.id,
      })
      await settleAssistantTelegramInbox(fresh.db, claim.lease, {
        runId: run.id,
      })
      return
    }
    // Phase 3: one Telegram HTML message; the pinned message shows the scope.
    const rendered = renderTelegramFinalReply(
      message.parts,
      telegramReplyOptions(ctx, message.id),
    )
    for (const reply of rendered)
      await stageAssistantTelegramOutbox(fresh.db, claim.lease, {
        ...reply,
        runId: run.id,
        messageId: message.id,
      })
    await settleAssistantTelegramInbox(fresh.db, claim.lease, { runId: run.id })
  })
}

export async function processAssistantTelegramTurn(
  ingressId: string,
  {
    createTurn = createGeneralAssistantTurn,
    enqueueDelivery = enqueueAssistantTelegramDelivery,
    sendTyping,
  }: {
    createTurn?: typeof createGeneralAssistantTurn
    enqueueDelivery?: typeof enqueueAssistantTelegramDelivery
    sendTyping?: DirectTelegramBotProvider["sendTyping"]
  } = {},
): Promise<AssistantChannelTurnResult> {
  const config = readAssistantTelegramConfig()
  if (!config) return { status: "disabled" }
  const claim = await claimAssistantTelegramInbox(prisma, ingressId)
  if (!claim) {
    await dispatchAssistantTelegramReply(ingressId, enqueueDelivery)
    const next = await nextAssistantTelegramInbox(prisma, ingressId)
    return { status: "idle", ...(next ? { nextIngressId: next.id } : {}) }
  }
  const { principal, lease, inbox, content } = claim
  try {
    const ctx = await createTelegramAssistantContext(
      prisma,
      principal,
      inbox.requestId,
      lease,
    )
    let text: string | undefined
    if (content.kind === "callback") {
      // Phase 3 (l-ambig): a saved choice runs as the user's next message.
      if (isTelegramChoiceCallback(content.data)) {
        text =
          (await pickTelegramChoice(
            ctx,
            claim,
            content.data,
            telegramReplyOptions(ctx),
          )) ?? undefined
        if (text === undefined)
          await inFreshGeneralTransaction(ctx, (fresh) =>
            stageText(fresh, lease, [telegramChoiceExpired]),
          )
      } else await executeCallback(ctx, claim, content.data)
    } else text = content.text.trim()
    if (text !== undefined) {
      // Phase 2: /help by role (c-help, a-cashier-menu), /scope with a
      // Change in EwaTrade button (c-switch).
      const connected =
        content.kind === "message" ? telegramConnectedControl(ctx, text) : null
      // Phase 6 (k-cancel, k-cancel-draft, s-old): typed words never decide a
      // review; the reply says what to tap instead and quotes an open review.
      const typed =
        content.kind === "message" && !connected
          ? telegramTypedDecision(text)
          : null
      const draft = typed
        ? await readAssistantTelegramDraftState(ctx.db, lease.bindingId)
        : null
      const control: (TelegramControlReply & { replyTo?: string }) | undefined =
        content.kind !== "message"
          ? undefined
          : (connected ??
            (typed && draft
              ? {
                  text: telegramTypedDecisionReply(
                    typed,
                    draft.state,
                    `${ctx.tenantContext.tenant.name} · ${ctx.tenantContext.activeStore?.name ?? "Store"}`,
                  ),
                  replyTo: draft.reviewMessageId,
                }
              : text.startsWith("/")
                ? { text: "Use /help to see the available commands." }
                : undefined))
      if (control) {
        await inFreshGeneralTransaction(ctx, async (fresh) => {
          await stageAssistantTelegramOutbox(fresh.db, lease, {
            text: control.text,
            ...("replyTo" in control && control.replyTo
              ? { replyToMessageId: control.replyTo }
              : {}),
            // Control replies carry URL buttons only (Change in EwaTrade).
            ...(control.buttons
              ? {
                  buttons: control.buttons.map((row) =>
                    row.flatMap((button) =>
                      button.url
                        ? [{ text: button.text, url: button.url }]
                        : [],
                    ),
                  ),
                }
              : {}),
          })
          await settleAssistantTelegramInbox(fresh.db, lease, {})
        })
      } else {
        let run = await findRun(ctx, inbox.requestId)
        if (run?.status === "RUNNING" && ctx.assistantConversationId) {
          await readGeneralActiveRun(
            ctx.db,
            requireGeneralScope(ctx),
            ctx.assistantConversationId,
          )
          run = await findRun(ctx, inbox.requestId)
        }
        if (!run) {
          const provider = new DirectTelegramBotProvider(config)
          const stopTyping = startTelegramTyping(
            claim,
            sendTyping ?? provider.sendTyping.bind(provider),
          )
          try {
            const turn = await createTurn(ctx, {
              conversationId: ctx.assistantConversationId,
              requestId: inbox.requestId,
              message: {
                id: inbox.userMessageId,
                role: "user",
                parts: [{ type: "text", text }],
              },
            })
            const reader = turn.stream.getReader()
            try {
              while (!(await reader.read()).done) {
                /* Wait for canonical finalization. */
              }
            } finally {
              reader.releaseLock()
            }
            await turn.completion
            run = await findRun(ctx, inbox.requestId)
          } finally {
            stopTyping()
          }
        }
        if (!run || run.status === "RUNNING") {
          await retryAssistantTelegramInbox(prisma, lease, "RUN_IN_PROGRESS")
          return { status: "retry" }
        }
        await stageRunReply(ctx, claim, run)
      }
    }
  } catch (error) {
    if (
      error instanceof TRPCError &&
      ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(error.code)
    ) {
      await settleAssistantTelegramInbox(prisma, lease, {
        state: "CANCELLED",
        errorCode: "AUTHORITY_CHANGED",
      })
      return { status: "cancelled" }
    }
    const code =
      error instanceof GeneralTurnError ? error.code : "TURN_UNAVAILABLE"
    await retryAssistantTelegramInbox(prisma, lease, code)
    return { status: "retry" }
  }
  await dispatchAssistantTelegramReply(ingressId, enqueueDelivery)
  const next = await nextAssistantTelegramInbox(prisma, ingressId)
  return { status: "completed", ...(next ? { nextIngressId: next.id } : {}) }
}

async function dispatchAssistantTelegramReply(
  ingressId: string,
  enqueue: typeof enqueueAssistantTelegramDelivery,
) {
  try {
    const row = await prisma.assistantTelegramOutbox.findFirst({
      where: { inboxId: ingressId, state: "PENDING" },
      orderBy: { sequence: "asc" },
      select: { id: true },
    })
    if (row) await enqueue(row.id)
  } catch {
    console.error("[assistant] Telegram delivery deferred to recovery")
  }
}

export async function processAssistantTelegramDelivery(
  outboxId: string,
  deps: {
    send?: DirectTelegramBotProvider["sendMessage"]
    clearInlineKeyboard?: DirectTelegramBotProvider["clearInlineKeyboard"]
    editMessageText?: DirectTelegramBotProvider["editMessageText"]
  } = {},
): Promise<AssistantChannelDeliveryResult> {
  const config = readAssistantTelegramConfig()
  if (!config) return { status: "disabled" }
  const claim = await claimAssistantTelegramOutbox(prisma, outboxId)
  if (!claim) return { status: "idle" }
  const { lease, principal, payload } = claim
  try {
    const { scope } = await assertAssistantTelegramDeliveryAuthority(
      prisma,
      lease,
    )
    if (
      config.botId !== principal.botId ||
      !config.allowedUserIds.has(scope.userId) ||
      !config.allowedTenantIds.has(scope.tenantId)
    )
      throw new AssistantTelegramError("UNAUTHORIZED")
  } catch (error) {
    if (!(error instanceof AssistantTelegramError)) throw error
    await settleAssistantTelegramOutbox(prisma, lease, {
      status: "cancelled",
      errorCode: "AUTHORITY_CHANGED",
    })
    const next = await nextAssistantTelegramOutbox(prisma, outboxId)
    return { status: "cancelled", ...(next ? { nextOutboxId: next.id } : {}) }
  }
  const provider = new DirectTelegramBotProvider(config)
  const { result, edit: isEdit } = await deliverTelegramOutboxPayload(
    {
      sendMessage: deps.send ?? provider.sendMessage.bind(provider),
      clearInlineKeyboard:
        deps.clearInlineKeyboard ?? provider.clearInlineKeyboard.bind(provider),
      editMessageText:
        deps.editMessageText ?? provider.editMessageText.bind(provider),
    },
    principal.chatId,
    payload,
  )
  if (result.status === "retry") {
    await settleAssistantTelegramOutbox(prisma, lease, {
      status: "retry",
      retryAt: new Date(Date.now() + result.retryAfterMs),
    })
    return { status: "busy" }
  }
  if (isEdit && result.status === "uncertain") {
    // Retrying the same edit is safe even if Telegram applied it.
    await settleAssistantTelegramOutbox(prisma, lease, {
      status: "retry",
      retryAt: new Date(Date.now() + 30_000),
      errorCode:
        "clearKeyboardMessageId" in payload
          ? "KEYBOARD_EDIT_UNCERTAIN"
          : "REVIEW_EDIT_UNCERTAIN",
    })
    return { status: "busy" }
  }
  const status =
    result.status === "accepted"
      ? "sent"
      : result.status === "uncertain"
        ? "unknown"
        : "failed"
  await settleAssistantTelegramOutbox(
    prisma,
    lease,
    result.status === "accepted"
      ? { status: "sent", providerMessageId: result.messageId }
      : { status: result.status === "uncertain" ? "unknown" : "failed" },
  )
  const next = await nextAssistantTelegramOutbox(prisma, outboxId)
  return { status, ...(next ? { nextOutboxId: next.id } : {}) }
}
