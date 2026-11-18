import { dispatchAssistantWhatsAppReply } from "./channel-delivery"
import { processAssistantChannelTurn } from "./channel-turn"

const maxChainedTurns = 3

/**
 * Runs a WhatsApp turn in this request when the job queue refuses it, so the
 * reply (and typing) does not wait for the recovery sweep. The ingress lease
 * fences against a queued run or the sweep picking up the same turn.
 */
export async function runAssistantWhatsAppTurnNow(
  ingressId: string,
  deps: {
    process: typeof processAssistantChannelTurn
    dispatch: (ingressId: string) => Promise<unknown>
  } = {
    process: processAssistantChannelTurn,
    dispatch: dispatchAssistantWhatsAppReply,
  },
) {
  let next: string | undefined = ingressId
  for (let turn = 0; next && turn < maxChainedTurns; turn++) {
    const current: string = next
    const result = await deps.process(current)
    if (result.status === "completed" || result.status === "idle") {
      try {
        await deps.dispatch(current)
      } catch {
        console.error("[assistant] reply dispatch deferred to recovery")
      }
    }
    next =
      result.nextIngressId && result.nextIngressId !== current
        ? result.nextIngressId
        : undefined
  }
}

/** Safe diagnostics only: provider status and a short message, never payloads or keys. */
export function queueRefusalReason(error: unknown) {
  if (!(error instanceof Error)) return { reason: "unknown" }
  const status =
    "status" in error && typeof error.status === "number"
      ? error.status
      : undefined
  return {
    reason: error.name,
    ...(status !== undefined ? { status } : {}),
    message: error.message
      .replace(/tr_[a-z]+_[A-Za-z0-9]+/g, "[key]")
      .slice(0, 160),
  }
}
