import { prisma } from "@ewatrade/db/client"
import { persistProductAnalyticsEvent } from "@ewatrade/db/product-analytics"
import {
  type AssistantEventInput,
  assistantEventsEnabled,
  createAssistantEvent,
} from "@ewatrade/events/server-assistant"

/**
 * Best-effort, post-commit capture of one assistant behaviour event. The
 * envelope is only persisted (upsert by its deterministic id, so webhook or
 * client retries dedupe); the existing analytics recovery sweep delivers it.
 * Never throws and never blocks the assistant reply.
 */
export async function recordAssistantEvent(input: AssistantEventInput) {
  if (!assistantEventsEnabled()) return
  try {
    const envelope = createAssistantEvent(input)
    if (!envelope) return
    await persistProductAnalyticsEvent(prisma, {
      id: envelope.eventId,
      userId: input.principal.userId,
      tenantId: input.principal.tenantId,
      envelope,
    })
  } catch {
    // No user inputs/errors in this diagnostic.
    console.warn("[analytics] assistant event could not be recorded")
  }
}
