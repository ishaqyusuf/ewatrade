import type { prisma } from "@ewatrade/db"
import {
  type AssistantEventChannel,
  type AssistantEventDetails,
  type AssistantEventName,
  assistantClientChannel,
  assistantEventsEnabled,
} from "@ewatrade/events/server-assistant"
import {
  type DashboardPrincipal,
  dashboardCaptureAllowed,
} from "@ewatrade/events/server-dashboard"
import { recordAssistantEvent } from "@ewatrade/jobs/assistant-events"
import { z } from "zod"
import { isLinkedAssistantIdentity } from "./channel-principal"

type SessionUser = {
  id: string
  email: string
  isPlatformAdmin?: boolean | null
}

/** Session-derived only; never accept a principal or consent grant from a body. */
export function assistantAnalyticsContext(ctx: {
  requestHeaders: Headers
  session: {
    user: { id: string; email: string; isPlatformAdmin?: boolean | null }
  }
  tenantContext: {
    tenant: { id: string; name: string; dataClassification: string }
    membership: { role: string }
  }
  qaSessionScope?: unknown
}) {
  const principal: DashboardPrincipal = {
    userId: ctx.session.user.id,
    email: ctx.session.user.email,
    internal: ctx.session.user.isPlatformAdmin === true,
    tenantId: ctx.tenantContext.tenant.id,
    tenantName: ctx.tenantContext.tenant.name,
    dataClassification: ctx.tenantContext.tenant.dataClassification,
    role: ctx.tenantContext.membership.role,
    qaSession: Boolean(ctx.qaSessionScope),
  }
  let origin: string | undefined
  try {
    if (dashboardCaptureAllowed(ctx.requestHeaders, principal))
      origin = ctx.requestHeaders.get("origin") ?? undefined
  } catch {
    /* Collection fails closed without changing the operation. */
  }
  return { principal, origin }
}

type AssistantEventContext = {
  requestHeaders: Headers
  session: unknown
  tenantContext?: {
    tenant: { id: string; name: string; dataClassification: string }
    membership: { role: string }
  } | null
  qaSessionScope?: unknown
}
export type AssistantEventSpec = {
  name: AssistantEventName
  key: string
  details?: AssistantEventDetails
}

/** Channel + principal from server-derived identity only. Null = never collect. */
export function assistantEventScope(ctx: AssistantEventContext) {
  const session = ctx.session
  const linked = isLinkedAssistantIdentity(session)
  const user = (session as { user?: Partial<SessionUser> } | null)?.user
  if (!user?.id || !user.email) return null
  const channel: AssistantEventChannel | null = linked
    ? session.channel === "telegram"
      ? "telegram"
      : "whatsapp"
    : assistantClientChannel(ctx.requestHeaders)
  if (!channel) return null
  const tenant = ctx.tenantContext ?? null
  const principal: DashboardPrincipal = {
    userId: user.id,
    email: user.email,
    internal: user.isPlatformAdmin === true,
    ...(tenant
      ? {
          tenantId: tenant.tenant.id,
          tenantName: tenant.tenant.name,
          dataClassification: tenant.tenant.dataClassification,
          role: tenant.membership.role,
        }
      : {}),
    qaSession: Boolean(ctx.qaSessionScope),
  }
  return { channel, headers: ctx.requestHeaders, principal }
}

/** Fire-and-forget; collection can never delay or fail the assistant. */
export function emitAssistantEvents(
  ctx: AssistantEventContext,
  events: AssistantEventSpec[],
) {
  if (!events.length || !assistantEventsEnabled()) return
  try {
    const scope = assistantEventScope(ctx)
    if (!scope) return
    for (const event of events)
      void recordAssistantEvent({ ...scope, ...event }).catch(() => undefined)
  } catch {
    /* Collection fails closed without changing the operation. */
  }
}

const proposalOutput = z.object({
  id: z.string().min(1).max(128),
  revision: z.number().int().positive(),
  status: z.string(),
  payload: z.object({ action: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/) }),
})
const linkChannels = {
  "assistantChannels.createTelegramLink": ["telegram", "started"],
  "assistantChannels.createWhatsAppLink": ["whatsapp", "started"],
  "assistantChannels.confirmTelegramLink": ["telegram", "completed"],
  "assistantChannels.confirmWhatsAppLink": ["whatsapp", "completed"],
  "assistantChannels.revokeTelegram": ["telegram", "revoked"],
  "assistantChannels.revokeWhatsApp": ["whatsapp", "revoked"],
} as const
const decisionPaths = new Set([
  "assistant.decideProposal",
  "assistant.decideReviewLink",
])
export function isAssistantEventProcedure(path: string) {
  return (
    path in linkChannels ||
    decisionPaths.has(path) ||
    path === "assistant.reviewLink"
  )
}

function stringField(value: unknown, key: string) {
  const field =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)[key]
      : undefined
  return typeof field === "string" && field.length <= 200 ? field : undefined
}

/** Successful procedure → events. Pure: outputs are read, never copied. */
export function assistantProcedureEvents(input: {
  path: string
  input: unknown
  output: unknown
}): AssistantEventSpec[] {
  const link = linkChannels[input.path as keyof typeof linkChannels]
  if (link) {
    const [linkChannel, phase] = link
    const key =
      phase === "started"
        ? stringField(input.output, "id")
        : phase === "completed"
          ? stringField(input.input, "linkId")
          : (input.output as { revoked?: unknown } | null)?.revoked === true
            ? stringField(input.input, "grantId")
            : undefined
    return key
      ? [
          {
            name: `assistant_channel_link_${phase}`,
            key: `link:${linkChannel}:${key}`,
            details: { link_channel: linkChannel },
          },
        ]
      : []
  }
  if (input.path === "assistant.reviewLink") {
    const output = input.output as { status?: unknown; proposal?: unknown }
    const proposal = proposalOutput.safeParse(output?.proposal)
    if (output?.status !== "ready" || !proposal.success) return []
    return [
      {
        name: "assistant_review_link_opened",
        key: `proposal:${proposal.data.id}:${proposal.data.revision}`,
        details: {
          action: proposal.data.payload.action,
          handoff_from: "whatsapp",
        },
      },
    ]
  }
  if (!decisionPaths.has(input.path)) return []
  return assistantDecisionEvents(
    input.output,
    input.path === "assistant.decideReviewLink" ? "whatsapp" : undefined,
  )
}

/** A settled proposal decision → fixed action events (proposal+revision key). */
export function assistantDecisionEvents(
  output: unknown,
  handoffFrom?: "whatsapp" | "telegram",
): AssistantEventSpec[] {
  const proposal = proposalOutput.safeParse(output)
  if (!proposal.success) return []
  const key = `proposal:${proposal.data.id}:${proposal.data.revision}`
  const details: AssistantEventDetails = {
    action: proposal.data.payload.action,
    ...(handoffFrom ? { handoff_from: handoffFrom } : {}),
  }
  switch (proposal.data.status) {
    case "COMPLETED":
      return [
        { name: "assistant_action_confirmed", key, details },
        { name: "assistant_action_executed", key, details },
      ]
    case "CANCELLED":
      return [{ name: "assistant_action_cancelled", key, details }]
    case "EXPIRED":
      return [{ name: "assistant_action_expired", key, details }]
    case "FAILED":
      return [{ name: "assistant_action_failed", key, details }]
    default:
      return []
  }
}

/**
 * Called by the tRPC capture middleware after the procedure (and its
 * transaction) settled. A refused confirm is `expired` when the draft lapsed,
 * otherwise `failed` with the tRPC error code.
 */
export async function captureAssistantProcedureEvents(
  ctx: AssistantEventContext & { db: typeof prisma },
  input: {
    path: string
    rawInput: unknown
    result: { ok: true; data: unknown } | { ok: false; errorCode: string }
  },
) {
  if (!assistantEventsEnabled() || !isAssistantEventProcedure(input.path))
    return
  try {
    if (input.result.ok) {
      emitAssistantEvents(
        ctx,
        assistantProcedureEvents({
          path: input.path,
          input: input.rawInput,
          output: input.result.data,
        }),
      )
      return
    }
    const proposalId = stringField(input.rawInput, "proposalId")
    const tenantId = ctx.tenantContext?.tenant.id
    if (
      input.path !== "assistant.decideProposal" ||
      stringField(input.rawInput, "decision") !== "confirm" ||
      !proposalId ||
      !tenantId
    )
      return
    const row = await ctx.db.assistantActionProposal.findFirst({
      where: { id: proposalId, tenantId },
      select: { action: true, revision: true, status: true, expiresAt: true },
    })
    if (!row || !/^[a-z][a-z0-9_]{0,63}$/.test(row.action)) return
    const expired = row.status === "PENDING" && row.expiresAt <= new Date()
    const errorCode = input.result.errorCode
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
    emitAssistantEvents(ctx, [
      {
        name: expired ? "assistant_action_expired" : "assistant_action_failed",
        key: `proposal:${proposalId}:${row.revision}`,
        details: {
          action: row.action,
          ...(expired ? {} : { error_code: errorCode.slice(0, 64) }),
        },
      },
    ])
  } catch {
    /* Optional capture cannot change the procedure result. */
  }
}

/** Coarse input kind for a turn from its attachment kinds; never content. */
export function assistantInputKind(
  attachments: readonly { kind: string }[],
): NonNullable<AssistantEventDetails["input_kind"]> {
  const kinds = new Set(attachments.map((attachment) => attachment.kind))
  if (kinds.has("AUDIO")) return "voice"
  if (kinds.has("IMAGE")) return "image"
  if (kinds.size) return "document"
  return "text"
}
