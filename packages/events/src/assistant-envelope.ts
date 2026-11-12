import { z } from "zod"

/**
 * Cross-channel assistant behaviour events, sent to the `ewatrade-dashboard`
 * Logly project. Names are a fixed catalogue (not derived from paths/payloads).
 * Billing-grade counts (runs, tokens, messages) come from the ledger, not here.
 */
export const assistantEventChannels = [
  "whatsapp",
  "telegram",
  "mobile",
  "web",
] as const
export type AssistantEventChannel = (typeof assistantEventChannels)[number]

export const assistantEventCatalogue = {
  assistant_turn_completed: { category: "turn", status: "completed" },
  assistant_turn_failed: { category: "turn", status: "failed" },
  assistant_turn_blocked: { category: "turn", status: "blocked" },
  assistant_action_proposed: { category: "action", status: "proposed" },
  assistant_action_confirmed: { category: "action", status: "confirmed" },
  assistant_action_cancelled: { category: "action", status: "cancelled" },
  assistant_action_expired: { category: "action", status: "expired" },
  assistant_action_executed: { category: "action", status: "executed" },
  assistant_action_failed: { category: "action", status: "failed" },
  assistant_review_link_opened: { category: "review_link", status: "opened" },
  assistant_channel_link_started: {
    category: "channel_link",
    status: "started",
  },
  assistant_channel_link_completed: {
    category: "channel_link",
    status: "completed",
  },
  assistant_channel_link_revoked: {
    category: "channel_link",
    status: "revoked",
  },
} as const
export type AssistantEventName = keyof typeof assistantEventCatalogue
export const assistantEventNames = Object.keys(
  assistantEventCatalogue,
) as AssistantEventName[]
const unsuccessful = new Set<string>(["failed", "blocked", "expired"])
export function assistantEventSucceeded(name: AssistantEventName) {
  return !unsuccessful.has(assistantEventCatalogue[name].status)
}

const fixedToken = (max: number) =>
  z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(max)

/** Only fixed product vocabulary; free text, ids and contact data never fit. */
export const assistantEventDetailsSchema = z
  .object({
    input_kind: z.enum(["text", "voice", "image", "document"]).optional(),
    step_count: z.number().int().nonnegative().max(1000).optional(),
    block_reason: z.enum(["quota", "policy", "unbound"]).optional(),
    provider: fixedToken(40).optional(),
    model: z
      .string()
      .regex(/^[a-zA-Z0-9_./:-]{1,100}$/)
      .optional(),
    duration_ms: z.number().finite().nonnegative().optional(),
    error_code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .optional(),
    /** General assistant action key (e.g. `sale_record`), never a payload. */
    action: fixedToken(64).optional(),
    /** Chat channel a web review hand-off came from. */
    handoff_from: z.enum(["whatsapp", "telegram"]).optional(),
    /** Chat channel being linked/revoked from the app. */
    link_channel: z.enum(["whatsapp", "telegram"]).optional(),
  })
  .strict()
export type AssistantEventDetails = z.infer<typeof assistantEventDetailsSchema>

export const assistantEnvelopeSchema = z.object({
  eventId: z.uuid(),
  project: z.literal("ewatrade-dashboard"),
  name: z.enum(
    assistantEventNames as [AssistantEventName, ...AssistantEventName[]],
  ),
  version: z.literal(1),
  source: z.literal("server"),
  occurredAt: z.iso.datetime(),
  actorId: z.string().regex(/^usr_[a-f0-9]{64}$/),
  groups: z.object({
    business: z
      .object({
        key: z.string().regex(/^grp_[a-f0-9]{64}$/),
        properties: z.object({ name: z.string().max(120) }),
      })
      .optional(),
  }),
  properties: assistantEventDetailsSchema
    .extend({
      surface: z.literal("assistant"),
      category: z.enum(["turn", "action", "review_link", "channel_link"]),
      status: z.enum([
        "completed",
        "failed",
        "blocked",
        "proposed",
        "confirmed",
        "cancelled",
        "expired",
        "executed",
        "opened",
        "started",
        "revoked",
      ]),
      success: z.boolean(),
      /** Transport of the event itself; kept for parity with dashboard events. */
      channel: z.literal("server"),
      assistant_channel: z.enum(assistantEventChannels),
      workspace_role: z.string().max(40).optional(),
      audience: z.enum(["internal", "business"]),
      environment: z.enum(["local", "dev", "preview", "production"]).optional(),
    })
    .strict(),
})
export type AssistantServerEnvelope = z.infer<typeof assistantEnvelopeSchema>

export function assistantEventsEnabled() {
  return (
    process.env.LOGLY_ASSISTANT_EVENTS_ENABLED === "true" &&
    process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED === "true"
  )
}
