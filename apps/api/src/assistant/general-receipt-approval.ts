import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  type GeneralAction,
  type GeneralProposal,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  DirectTelegramBotProvider,
  readAssistantTelegramConfig,
} from "@ewatrade/communications"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import {
  listGeneralConversations,
  startGeneralConversation,
} from "@ewatrade/db/assistant-general"
import { stageAssistantWhatsAppServerNotice } from "@ewatrade/db/assistant-whatsapp"
import { enqueueAssistantWhatsAppDelivery } from "@ewatrade/jobs/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import {
  type GeneralContext,
  assertGeneralActionAuthority,
  canDraftGeneralCapability,
  requireGeneralScope,
} from "./general-context"
import {
  decideGeneralProposalInTransaction,
  draftGeneralProposal,
  generalProposalWithReview,
  inFreshGeneralTransaction,
} from "./general-proposals"
import {
  type ReceiptEnvironment as Environment,
  receiptReadingConfig,
} from "./general-receipt-availability"

/**
 * Workshop 19l · a cashier's receipt for approval. Staff who can't record the
 * money ask an Owner/Admin in chat; the approver opens the link, reviews the
 * exact draft as their own and confirms it through the canonical proposal
 * path. The cashier's chat is told the result. Nothing records until then.
 */

export const RECEIPT_APPROVAL_TTL_MS = 3 * 24 * 60 * 60_000
const OFFER_MS = 30 * 60_000
type DbClient = GeneralContext["db"]
const APPROVER_ROLES = new Set(["OWNER", "ADMIN"])

type Kind = Extract<
  GeneralAction["action"],
  | "payment_record"
  | "money_transfer_simple"
  | "expense_record_simple"
  | "money_movement"
>
const LABEL: Record<Kind, { header: string; noun: string; plural: string }> = {
  payment_record: {
    header: "🧾 Payment to approve",
    noun: "payment",
    plural: "payments",
  },
  money_transfer_simple: {
    header: "🔁 Transfer to approve",
    noun: "transfer",
    plural: "transfers",
  },
  expense_record_simple: {
    header: "💸 Expense to approve",
    noun: "expense",
    plural: "expenses",
  },
  money_movement: {
    header: "💸 Withdrawal to approve",
    noun: "withdrawal",
    plural: "withdrawals",
  },
}
const labelFor = (action: string) =>
  LABEL[action as Kind] ?? {
    header: "🧾 Receipt to approve",
    noun: "receipt",
    plural: "receipts",
  }

const firstName = (user: {
  firstName?: string | null
  displayName?: string | null
  name?: string | null
}) =>
  (user.firstName || user.displayName || user.name || "")
    .trim()
    .split(/\s+/)[0] ?? ""

/** "Ada or Kemi", or "an owner or admin" when there are more or no names. */
function whoApproves(names: string[]) {
  const named = names.filter(Boolean)
  if (named.length === 1) return named[0] as string
  if (named.length === 2) return `${named[0]} or ${named[1]}`
  return "an owner or admin"
}

/** Active Owners/Admins whose role may record this action, newest-first irrelevant. */
export async function receiptApprovers(
  db: DbClient,
  tenantId: string,
  action: GeneralAction["action"],
  excludeUserId?: string,
) {
  const roles = capabilityForAction(action).policy.roles.filter((role) =>
    APPROVER_ROLES.has(role),
  )
  if (!roles.length) return []
  const rows = await db.membership.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      role: { in: roles as never },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    take: 10,
    select: {
      userId: true,
      user: { select: { firstName: true, displayName: true, name: true } },
    },
  })
  return rows.map((row) => ({ userId: row.userId, name: firstName(row.user) }))
}

/** QA businesses never reach a live chat unless receipt QA is explicitly on. */
function externalAllowed(
  classification: "LIVE" | "QA",
  env: Environment = process.env,
) {
  return classification !== "QA" || Boolean(receiptReadingConfig(env)?.qaLive)
}

function plain(text: string) {
  return text.replace(/[*_`]/g, "")
}

function appOrigin() {
  return (
    process.env.DASHBOARD_URL ??
    process.env.NEXT_PUBLIC_DASHBOARD_URL ??
    "https://dash.ewatrade.com"
  ).replace(/\/+$/, "")
}
export function receiptApprovalUrl(id: string) {
  return `${appOrigin()}/open/receipt-approval/${encodeURIComponent(id)}`
}

/**
 * Best effort: the user's linked WhatsApp chat (only inside its 24-hour window)
 * and Telegram chat for this business. Never throws; returns where it went.
 */
export async function notifyReceiptUser(
  db: DbClient,
  input: {
    userId: string
    tenantId: string
    storeId: string
    classification: "LIVE" | "QA"
    text: string
  },
  deps: {
    telegram?: Pick<DirectTelegramBotProvider, "sendMessage">
    telegramConfig?: typeof readAssistantTelegramConfig
    enqueue?: (outboxId: string) => Promise<unknown>
    env?: Environment
  } = {},
) {
  const reached: Array<"whatsapp" | "telegram"> = []
  if (!externalAllowed(input.classification, deps.env)) return reached
  try {
    const staged = await stageAssistantWhatsAppServerNotice(db, input)
    if (staged) {
      reached.push("whatsapp")
      if (staged.staged)
        await (deps.enqueue ?? enqueueAssistantWhatsAppDelivery)(
          staged.outboxId,
        ).catch(() => undefined)
    }
  } catch {
    console.error("[assistant] receipt approval WhatsApp notice skipped")
  }
  try {
    const config = (deps.telegramConfig ?? readAssistantTelegramConfig)()
    if (
      config?.allowedUserIds.has(input.userId) &&
      config.allowedTenantIds.has(input.tenantId)
    ) {
      const identity = await db.assistantTelegramIdentity.findFirst({
        where: {
          userId: input.userId,
          botId: config.botId,
          revokedAt: null,
          detachedAt: null,
          grants: {
            some: {
              tenantId: input.tenantId,
              storeId: input.storeId,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        select: { chatId: true },
      })
      if (identity) {
        const result = await (
          deps.telegram ?? new DirectTelegramBotProvider(config)
        ).sendMessage({ chatId: identity.chatId, text: plain(input.text) })
        if (result.status === "accepted") reached.push("telegram")
      }
    }
  } catch {
    console.error("[assistant] receipt approval Telegram notice skipped")
  }
  return reached
}

/** The chat reply for staff: what would be recorded, who approves, and ask/cancel. */
export async function offerReceiptApproval(
  ctx: GeneralContext,
  input: {
    rowId: string
    payload: GeneralAction
    summary: string
    detail?: string | null
    outcome?: unknown
  },
): Promise<{ text: string } | null> {
  const scope = requireGeneralScope(ctx)
  const approvers = await receiptApprovers(
    ctx.db,
    scope.tenantId,
    input.payload.action,
    scope.userId,
  )
  if (!approvers.length) return null
  // The approver records it as their own draft: no file of this chat is attached.
  const { receiptAttachmentId: _file, ...payload } = input.payload as {
    receiptAttachmentId?: string
  } & GeneralAction
  const label = labelFor(payload.action)
  const who = whoApproves(approvers.map((approver) => approver.name))
  await ctx.db.assistantReceiptRead.update({
    where: { id: input.rowId },
    data: {
      status: "APPROVAL_OFFERED",
      approvalAction: payload as never,
      approvalSummary: [input.summary, input.detail]
        .filter(Boolean)
        .join("\n")
        .slice(0, 500),
      ...(input.outcome ? { outcome: input.outcome as never } : {}),
    },
  })
  return {
    text: [
      `*${label.header}*`,
      input.summary,
      ...(input.detail ? [input.detail] : []),
      "",
      `${who.charAt(0).toUpperCase()}${who.slice(1)} approves ${label.plural}.`,
      `_Nothing is saved until ${approvers.length > 1 ? "one of them approves" : "they approve"}._`,
      "",
      "Reply `ask` to send it for approval, or `cancel`.",
    ].join("\n"),
  }
}

const ASK =
  /^(?:ask|ask (?:for )?approval|ask them|send|send it|send for approval|yes|ok|okay)[.!]*$/i
const CANCEL = /^(?:cancel|no|stop|don'?t|leave it)[.!]*$/i

/** The cashier's `ask` or `cancel` after the offer; anything else returns null. */
export async function handleReceiptApprovalReply(
  ctx: GeneralContext,
  input: { conversationId: string; text: string },
  deps: Parameters<typeof notifyReceiptUser>[2] = {},
): Promise<{ text: string } | null> {
  const text = input.text.trim()
  if (!text || text.length > 40 || !(ASK.test(text) || CANCEL.test(text)))
    return null
  const scope = requireGeneralScope(ctx)
  const row = await ctx.db.assistantReceiptRead.findFirst({
    where: {
      conversationId: input.conversationId,
      actorUserId: scope.userId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      status: "APPROVAL_OFFERED",
      updatedAt: { gt: new Date(Date.now() - OFFER_MS) },
    },
    orderBy: { updatedAt: "desc" },
  })
  if (!row?.approvalAction) return null
  if (CANCEL.test(text)) {
    await ctx.db.assistantReceiptRead.updateMany({
      where: { id: row.id, status: "APPROVAL_OFFERED" },
      data: { status: "CANCELLED" },
    })
    return { text: "❌ Cancelled. Nothing was changed." }
  }
  const action = generalActionSchema.parse(row.approvalAction)
  const approvers = await receiptApprovers(
    ctx.db,
    scope.tenantId,
    action.action,
    scope.userId,
  )
  if (!approvers.length)
    return { text: "There is no owner or admin to approve this right now." }
  const now = new Date()
  const claimed = await ctx.db.assistantReceiptRead.updateMany({
    where: { id: row.id, status: "APPROVAL_OFFERED" },
    data: {
      status: "APPROVAL_PENDING",
      approvalRequestedAt: now,
      approvalExpiresAt: new Date(now.getTime() + RECEIPT_APPROVAL_TTL_MS),
    },
  })
  if (claimed.count !== 1) return null
  const requester = await ctx.db.user.findUnique({
    where: { id: scope.userId },
    select: { firstName: true, displayName: true, name: true },
  })
  const label = labelFor(action.action)
  const from = (requester && firstName(requester)) || "A staff member"
  const message = [
    `*${from} sent a ${label.noun} to approve*`,
    row.approvalSummary ?? "",
    "",
    `Approve or decline: ${receiptApprovalUrl(row.id)}`,
  ].join("\n")
  await Promise.all(
    approvers.map((approver) =>
      notifyReceiptUser(
        ctx.db,
        {
          userId: approver.userId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          classification: scope.dataClassification,
          text: message,
        },
        deps,
      ),
    ),
  )
  return {
    text: [
      `⏳ Waiting for ${whoApproves(approvers.map((approver) => approver.name))} to approve.`,
      "I'll message you here when it's done.",
    ].join("\n"),
  }
}

type Row = NonNullable<
  Awaited<ReturnType<GeneralContext["db"]["assistantReceiptRead"]["findFirst"]>>
>

function assertApprover(ctx: GeneralContext) {
  const scope = requireGeneralScope(ctx)
  if (!APPROVER_ROLES.has(ctx.tenantContext.membership.role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an owner or admin can approve receipts.",
    })
  return scope
}

/** Waiting requests in this Store for an Owner/Admin ("Needs you"). */
export async function listReceiptApprovals(ctx: GeneralContext) {
  let scope: ReturnType<typeof requireGeneralScope>
  try {
    scope = assertApprover(ctx)
  } catch {
    return []
  }
  const rows = await ctx.db.assistantReceiptRead.findMany({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      status: "APPROVAL_PENDING",
      approvalExpiresAt: { gt: new Date() },
      actorUserId: { not: scope.userId },
    },
    orderBy: { approvalRequestedAt: "desc" },
    take: 20,
  })
  const users = await requesters(ctx, rows)
  return rows
    .filter((row) => canApprove(ctx, row))
    .map((row) => ({
      id: row.id,
      kind: labelFor(actionName(row) ?? "").noun,
      summary: row.approvalSummary ?? "",
      requestedBy: users.get(row.actorUserId) ?? "Staff",
      requestedAt: (row.approvalRequestedAt ?? row.updatedAt).toISOString(),
      expiresAt: (row.approvalExpiresAt ?? row.updatedAt).toISOString(),
    }))
}

function actionName(row: Row) {
  const parsed = generalActionSchema.safeParse(row.approvalAction)
  return parsed.success ? parsed.data.action : null
}
function canApprove(ctx: GeneralContext, row: Row) {
  const action = actionName(row)
  return Boolean(
    action && canDraftGeneralCapability(ctx, capabilityForAction(action)),
  )
}
async function requesters(ctx: GeneralContext, rows: Row[]) {
  const users = await ctx.db.user.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.actorUserId))] } },
    select: { id: true, firstName: true, displayName: true, name: true },
  })
  return new Map(users.map((user) => [user.id, firstName(user) || "Staff"]))
}

export type ReceiptApprovalView =
  | {
      status:
        | "expired"
        | "cancelled"
        | "scope_mismatch"
        | "unavailable"
        | "forbidden"
    }
  | { status: "approved" | "declined"; decidedBy: string; summary: string }
  | {
      status: "ready"
      id: string
      kind: string
      requestedBy: string
      requestedAt: string
      summary: string
      facts: Array<{ label: string; value: string }>
      proposal: GeneralProposal
      businessName: string
      storeName: string
      currencyCode: string
    }

async function loadRequest(ctx: GeneralContext, id: string) {
  const scope = requireGeneralScope(ctx)
  const row = await ctx.db.assistantReceiptRead.findFirst({
    where: { id, tenantId: scope.tenantId },
  })
  if (!row || !row.approvalAction) return { row: null, scope }
  return { row, scope }
}

function receiptFacts(row: Row) {
  const extraction = (row.extraction ?? {}) as Record<string, unknown>
  const text = (key: string) =>
    typeof extraction[key] === "string"
      ? (extraction[key] as string).trim()
      : ""
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ")
  return [
    {
      label: "From",
      value: join(
        text("senderName"),
        text("senderBank"),
        text("senderAccount"),
      ),
    },
    {
      label: "To",
      value: join(
        text("recipientName"),
        text("recipientBank"),
        text("recipientAccount"),
      ),
    },
    { label: "Amount on receipt", value: text("amountText") },
    { label: "Date", value: text("dateRaw") },
    { label: "Remark", value: text("narration") },
    { label: "Reference", value: text("bankReference") },
  ].filter((fact) => fact.value)
}

/**
 * Opening the link drafts the request as the approver's own reviewed proposal
 * (15 minutes, like any draft), so the familiar review card, edit and confirm
 * apply unchanged. Reads never record money.
 */
export async function openReceiptApproval(
  ctx: GeneralContext,
  id: string,
): Promise<ReceiptApprovalView> {
  let scope: ReturnType<typeof requireGeneralScope>
  try {
    scope = assertApprover(ctx)
  } catch {
    return { status: "forbidden" }
  }
  const { row } = await loadRequest(ctx, id)
  if (!row) return { status: "unavailable" }
  if (row.status === "APPROVED" || row.status === "DECLINED") {
    const decider = row.approvalDecidedByUserId
      ? await ctx.db.user.findUnique({
          where: { id: row.approvalDecidedByUserId },
          select: { firstName: true, displayName: true, name: true },
        })
      : null
    return {
      status: row.status === "APPROVED" ? "approved" : "declined",
      decidedBy: (decider && firstName(decider)) || "an owner or admin",
      summary: row.approvalSummary ?? "",
    }
  }
  if (row.status === "CANCELLED") return { status: "cancelled" }
  if (row.status !== "APPROVAL_PENDING") return { status: "unavailable" }
  if (!row.approvalExpiresAt || row.approvalExpiresAt <= new Date())
    return { status: "expired" }
  if (row.storeId !== scope.storeId) return { status: "scope_mismatch" }
  if (row.actorUserId === scope.userId || !canApprove(ctx, row))
    return { status: "forbidden" }
  const action = generalActionSchema.parse(row.approvalAction)
  const conversationId =
    (await listGeneralConversations(ctx.db, scope))[0]?.id ??
    (await startGeneralConversation(ctx.db, scope)).id
  const draft = await draftGeneralProposal(ctx, conversationId, action)
  const saved = await ctx.db.assistantActionProposal.findUniqueOrThrow({
    where: { id: draft.proposalId },
  })
  const users = await requesters(ctx, [row])
  return {
    status: "ready",
    id: row.id,
    kind: labelFor(action.action).noun,
    requestedBy: users.get(row.actorUserId) ?? "Staff",
    requestedAt: (row.approvalRequestedAt ?? row.updatedAt).toISOString(),
    summary: row.approvalSummary ?? "",
    facts: receiptFacts(row),
    proposal: await generalProposalWithReview(ctx, saved),
    businessName: ctx.tenantContext.tenant.name,
    storeName: ctx.tenantContext.activeStore?.name ?? "Store",
    currencyCode:
      ctx.tenantContext.activeStore?.currencyCode ??
      ctx.tenantContext.tenant.currencyCode,
  }
}

const conflict = (message: string) =>
  new TRPCError({ code: "CONFLICT", message })

/**
 * Approve: claims the request and confirms the approver's own draft in one
 * serializable transaction, so two approvers can never record it twice.
 * Decline: closes it and cancels the draft. The cashier's chat is told after.
 */
export async function decideReceiptApproval(
  ctx: GeneralContext,
  input: {
    id: string
    decision: "approve" | "decline"
    proposalId?: string
    revision?: number
    approvalToken?: string
  },
  deps: Parameters<typeof notifyReceiptUser>[2] = {},
) {
  assertApprover(ctx)
  const { row, scope } = await loadRequest(ctx, input.id)
  if (!row) throw conflict("This request is no longer available.")
  if (row.storeId !== scope.storeId)
    throw conflict("Switch to the Store this request belongs to.")
  if (row.actorUserId === scope.userId || !canApprove(ctx, row))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can't approve this request.",
    })
  const action = generalActionSchema.parse(row.approvalAction)
  assertGeneralActionAuthority(ctx, action.action)
  const now = new Date()
  const open = {
    id: row.id,
    status: "APPROVAL_PENDING" as const,
    approvalExpiresAt: { gt: now },
  }
  let proposal: GeneralProposal | null = null
  if (input.decision === "approve") {
    if (!input.proposalId || input.revision === undefined)
      throw conflict("Open the request again to review it.")
    const proposalId = input.proposalId
    const revision = input.revision
    proposal = await inFreshGeneralTransaction(ctx, async (fresh) => {
      const mine = await fresh.db.assistantActionProposal.findFirst({
        where: {
          id: proposalId,
          actorUserId: scope.userId,
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          action: action.action,
          createdAt: { gte: row.approvalRequestedAt ?? row.createdAt },
        },
        select: { id: true },
      })
      if (!mine) throw conflict("Open the request again to review it.")
      const claimed = await fresh.db.assistantReceiptRead.updateMany({
        where: open,
        data: {
          status: "APPROVED",
          approvalDecidedByUserId: scope.userId,
          approvalDecidedAt: now,
          proposalId,
        },
      })
      if (claimed.count !== 1)
        throw conflict("This request was already decided or has expired.")
      return decideGeneralProposalInTransaction(fresh, {
        proposalId,
        revision,
        decision: "confirm",
        approvalToken: input.approvalToken,
      })
    })
  } else {
    const closed = await ctx.db.assistantReceiptRead.updateMany({
      where: open,
      data: {
        status: "DECLINED",
        approvalDecidedByUserId: scope.userId,
        approvalDecidedAt: now,
      },
    })
    if (closed.count !== 1)
      throw conflict("This request was already decided or has expired.")
    if (input.proposalId && input.revision !== undefined) {
      const proposalId = input.proposalId
      const revision = input.revision
      await inFreshGeneralTransaction(ctx, (fresh) =>
        decideGeneralProposalInTransaction(fresh, {
          proposalId,
          revision,
          decision: "cancel",
        }),
      ).catch(() => undefined)
    }
  }
  await tellRequester(ctx, row, input.decision, proposal, deps)
  return {
    status: input.decision === "approve" ? "approved" : "declined",
    proposal,
  }
}

async function tellRequester(
  ctx: GeneralContext,
  row: Row,
  decision: "approve" | "decline",
  proposal: GeneralProposal | null,
  deps: Parameters<typeof notifyReceiptUser>[2],
) {
  const scope = requireGeneralScope(ctx)
  const me = await ctx.db.user.findUnique({
    where: { id: scope.userId },
    select: { firstName: true, displayName: true, name: true },
  })
  const by = (me && firstName(me)) || "An owner"
  const label = labelFor(actionName(row) ?? "")
  const summary = row.approvalSummary ?? ""
  const text =
    decision === "approve"
      ? [
          `✅ *${proposal?.receipt?.title ?? `${label.noun.charAt(0).toUpperCase()}${label.noun.slice(1)} recorded`}*`,
          "",
          summary,
          `Approved by ${by}`,
        ].join("\n")
      : [
          `❌ *${by} declined the ${label.noun}*`,
          "",
          summary,
          "Nothing was saved.",
        ].join("\n")
  try {
    // Also kept in the cashier's own chat history (the app shows it there).
    await appendAssistantMessage(ctx.db, {
      conversationId: row.conversationId,
      message: {
        id: `msg_receipt_${decision}_${row.id}`,
        role: "assistant",
        parts: [{ type: "text", text: plain(text) }],
      } as never,
    })
  } catch {
    console.error("[assistant] receipt approval chat message skipped")
  }
  await notifyReceiptUser(
    ctx.db,
    {
      userId: row.actorUserId,
      tenantId: row.tenantId,
      storeId: row.storeId,
      classification: scope.dataClassification,
      text,
    },
    deps,
  )
  await ctx.db.assistantReceiptRead.update({
    where: { id: row.id },
    data: { approvalNotifiedAt: new Date() },
  })
}
