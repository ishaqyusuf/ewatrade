import { createHmac } from "node:crypto"
import {
  type AssistantEventChannel,
  type AssistantEventDetails,
  type AssistantEventName,
  type AssistantServerEnvelope,
  assistantEnvelopeSchema,
  assistantEventCatalogue,
  assistantEventDetailsSchema,
  assistantEventSucceeded,
  assistantEventsEnabled,
} from "./assistant-envelope"
import {
  issueAnalyticsContext,
  verifyAnalyticsContext,
} from "./identity-server"
import { isQaAnalyticsPrincipal } from "./qa-policy.server"
import {
  type DashboardPrincipal,
  dashboardCaptureAllowed,
} from "./server-dashboard"

export {
  type AssistantEventChannel,
  type AssistantEventDetails,
  type AssistantEventName,
  assistantEventCatalogue,
  assistantEventsEnabled,
} from "./assistant-envelope"

/**
 * App client for an HTTP request, from `x-ewatrade-client`. Analytics-only:
 * never use it for authorization. A missing header counts as `web` (web then
 * still has to pass the exact Dashboard Origin check); unknown values drop.
 */
export function assistantClientChannel(
  headers: Headers,
): "web" | "mobile" | null {
  const value = headers.get("x-ewatrade-client")
  if (value === "mobile") return "mobile"
  if (value === null || value === "web") return "web"
  return null
}

/**
 * Collection basis per channel. Web and mobile carry the client's live
 * collection decision (`x-ewatrade-analytics`). WhatsApp and Telegram webhooks
 * have no stored per-user analytics consent, so they fail closed.
 */
export function assistantCaptureAllowed(input: {
  channel: AssistantEventChannel
  headers: Headers
  principal: DashboardPrincipal
}) {
  if (!assistantEventsEnabled() || isQaAnalyticsPrincipal(input.principal))
    return false
  switch (input.channel) {
    case "web":
      return (
        assistantClientChannel(input.headers) === "web" &&
        dashboardCaptureAllowed(input.headers, input.principal)
      )
    case "mobile":
      return (
        input.headers.get("x-ewatrade-client") === "mobile" &&
        input.headers.get("x-ewatrade-analytics") === "allowed"
      )
    default:
      return false
  }
}

export type AssistantEventInput = {
  name: AssistantEventName
  channel: AssistantEventChannel
  headers: Headers
  principal: DashboardPrincipal
  /** Stable source record (run, proposal+revision, link, grant). Never sent. */
  key: string
  details?: AssistantEventDetails
}

/** Keyed UUID (v5 layout) of source key + event name: retries share one id. */
export function assistantEventId(secret: string, key: string, name: string) {
  const hex = createHmac("sha256", secret)
    .update(JSON.stringify(["assistant-event-v1", key, name]))
    .digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Keeps each valid fixed-vocabulary field; anything else is dropped. */
function sanitizeDetails(details: AssistantEventDetails = {}) {
  const shape = assistantEventDetailsSchema.shape
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    const field = shape[key as keyof typeof shape]
    if (field?.safeParse(value).success && value !== undefined)
      kept[key] = value
  }
  return kept as AssistantEventDetails
}

/** Call only after authorization and after the source write has committed. */
export function createAssistantEvent(
  input: AssistantEventInput,
  now = new Date(),
): AssistantServerEnvelope | null {
  const secret = process.env.LOGLY_IDENTITY_SECRET
  if (!secret || secret.length < 32 || !input.key) return null
  if (!assistantCaptureAllowed(input)) return null
  const details = sanitizeDetails(input.details)
  const context = issueAnalyticsContext(
    { project: "ewatrade-dashboard", ...input.principal },
    now.getTime(),
  )
  if (!context) return null
  const identity = verifyAnalyticsContext(
    context.token,
    "ewatrade-dashboard",
    now.toISOString(),
    now.getTime(),
  )
  if (!identity) return null
  const environment = process.env.APP_ENV
  const parsed = assistantEnvelopeSchema.safeParse({
    eventId: assistantEventId(secret, input.key, input.name),
    project: "ewatrade-dashboard",
    name: input.name,
    version: 1,
    source: "server",
    occurredAt: now.toISOString(),
    actorId: identity.actorId,
    groups: identity.groups,
    properties: {
      ...details,
      ...assistantEventCatalogue[input.name],
      surface: "assistant",
      success: assistantEventSucceeded(input.name),
      channel: "server",
      assistant_channel: input.channel,
      ...identity.properties,
      ...(environment &&
      ["local", "dev", "preview", "production"].includes(environment)
        ? { environment }
        : {}),
    },
  })
  return parsed.success ? parsed.data : null
}
