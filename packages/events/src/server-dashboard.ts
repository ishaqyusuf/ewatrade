import { createHmac } from "node:crypto"
import { z } from "zod"
import {
  type AssistantSignal,
  assistantSignalSchema,
  productCreationSignal,
  proposalSignal,
} from "./assistant-signals"
import {
  dashboardProcedure,
  procedureOutcome,
  workflowEvent,
} from "./dashboard-workflows"
import {
  issueAnalyticsContext,
  verifyAnalyticsContext,
} from "./identity-server"
import { isQaAnalyticsPrincipal } from "./qa-policy.server"
import { webSurfaces } from "./surfaces"

const serverEnvelopeSchema = z.object({
  eventId: z.uuid(),
  project: z.literal("ewatrade-dashboard"),
  name: z
    .string()
    .regex(
      /^dashboard_[a-z_]+_(started|completed|failed|blocked|cancelled|skipped)$/,
    )
    .max(80),
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
  properties: z.object({
    surface: z.literal("dashboard"),
    category: z.string().max(40),
    action: z.string().max(70),
    status: z.enum([
      "started",
      "completed",
      "failed",
      "blocked",
      "cancelled",
      "skipped",
    ]),
    success: z.boolean(),
    channel: z.literal("server"),
    workspace_role: z.string().max(40).optional(),
    audience: z.enum(["internal", "business"]),
    item_count: z.number().int().nonnegative().optional(),
    provider: assistantSignalSchema.shape.provider,
    model: assistantSignalSchema.shape.model,
    environment: assistantSignalSchema.shape.environment,
    error_code: assistantSignalSchema.shape.error_code,
    duration_ms: assistantSignalSchema.shape.duration_ms,
    attempt_ordinal: assistantSignalSchema.shape.attempt_ordinal,
  }),
})
export type DashboardServerEnvelope = z.infer<typeof serverEnvelopeSchema>
export type DashboardPrincipal = {
  userId: string
  email: string
  tenantId?: string
  tenantName?: string
  role?: string
  internal: boolean
  qaSession?: boolean
  dataClassification?: string
}

export function dashboardCaptureAllowed(
  headers: Headers,
  principal: DashboardPrincipal,
) {
  return (
    process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED === "true" &&
    headers.get("x-ewatrade-analytics") === "allowed" &&
    (webSurfaces.dashboard.origins as readonly string[]).includes(
      headers.get("origin") ?? "",
    ) &&
    !isQaAnalyticsPrincipal(principal)
  )
}

/** Called only after authorization and a successful resolver/transaction. No inputs are copied. */
export function createDashboardOutcome(
  input: {
    headers: Headers
    principal: DashboardPrincipal
    path: string
    output: unknown
    requestId: string
    commandId?: string
    signal?: AssistantSignal
  },
  now = new Date(),
): DashboardServerEnvelope | null {
  const secret = process.env.LOGLY_IDENTITY_SECRET
  if (!secret || secret.length < 32) return null
  const proposal =
    input.path === "assistant.decideProposal"
      ? proposalSignal(input.output)
      : productCreationSignal(input.path, input.output)
  if (
    [
      "assistant.decideProposal",
      "productAssistant.create",
      "productAssistant.createFromForm",
    ].includes(input.path) &&
    !proposal
  )
    return null
  const signal = input.signal ?? proposal?.signal
  const parsedSignal = signal ? assistantSignalSchema.safeParse(signal) : null
  if (parsedSignal && !parsedSignal.success) return null
  const safeSignal = parsedSignal?.success ? parsedSignal.data : undefined
  const workflow = safeSignal
    ? { category: "assistant", action: safeSignal.action }
    : dashboardProcedure(input.path)
  if (!workflow || !dashboardCaptureAllowed(input.headers, input.principal))
    return null
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
  const outcome = safeSignal
    ? { phase: safeSignal.phase, itemCount: safeSignal.item_count }
    : procedureOutcome(input.path, input.output)
  // HMAC namespaces isolate business/actor/procedure; command retries share one UUID.
  const hex = createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "dashboard-outcome-v1",
        input.principal.userId,
        input.principal.tenantId ?? null,
        input.path,
        proposal?.commandId ?? input.commandId ?? input.requestId,
        ...(safeSignal ? [safeSignal.action, safeSignal.phase] : []),
      ]),
    )
    .digest("hex")
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
  const event = workflowEvent(workflow, outcome.phase)
  return serverEnvelopeSchema.parse({
    eventId: id,
    project: "ewatrade-dashboard",
    name: event.name,
    version: 1,
    source: "server",
    occurredAt: now.toISOString(),
    actorId: identity.actorId,
    groups: identity.groups,
    properties: {
      ...(safeSignal
        ? {
            provider: safeSignal.provider,
            model: safeSignal.model,
            environment: safeSignal.environment,
            error_code: safeSignal.error_code,
            duration_ms: safeSignal.duration_ms,
            attempt_ordinal: safeSignal.attempt_ordinal,
          }
        : {}),
      ...event.properties,
      ...identity.properties,
      channel: "server",
      ...(outcome.itemCount === undefined
        ? {}
        : { item_count: outcome.itemCount }),
    },
  })
}

export function dashboardCommandId(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined
  for (const key of [
    "clientOperationId",
    "clientCommandId",
    "idempotencyKey",
  ]) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === "string" && value.length > 0 && value.length <= 200)
      return value
  }
  return undefined
}
export async function deliverDashboardOutcome(
  envelope: unknown,
  send: typeof fetch = fetch,
) {
  const event = serverEnvelopeSchema.parse(envelope)
  const collector = process.env.LOGLY_COLLECTOR_URL
  const key = process.env.LOGLY_DASHBOARD_PROJECT_KEY
  if (!collector || !key)
    throw new Error("Dashboard analytics is not configured")
  const response = await send(`${collector.replace(/\/$/, "")}/v1/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-logly-project-key": key,
      "x-logly-origin": webSurfaces.dashboard.origins[0],
    },
    body: JSON.stringify({
      sentAt: new Date().toISOString(),
      sdk: { name: "@ewatrade/events-server", version: "1.0.0" },
      events: [event],
    }),
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) throw new Error("Dashboard analytics delivery failed")
}
