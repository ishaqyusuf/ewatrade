import {
  WHATSAPP_TURN_JOB_ID,
  WHATSAPP_TURN_MAX_ATTEMPTS,
  type WhatsAppTurnJob,
  whatsAppTurnJobSchema,
  whatsAppTurnResultSchema,
} from "@ewatrade/assistant/channels/worker"
import { triggerJob } from "../trigger"
import {
  type AssistantWorkerEndpoint,
  assistantWorkerEndpoint,
  assistantWorkerHeaders,
} from "./assistant-worker-endpoint"

type Dependencies = {
  endpoint: () => AssistantWorkerEndpoint
  send: (url: URL, init: RequestInit) => Promise<Response>
  enqueue: (ingressId: string) => Promise<unknown>
}
export function defaultAssistantWhatsAppTurnDependencies(): Dependencies {
  return {
    endpoint: () => assistantWorkerEndpoint("channel-turn"),
    send: (url, init) => fetch(url, init),
    enqueue: (ingressId) =>
      triggerJob(
        WHATSAPP_TURN_JOB_ID,
        assistantWhatsAppTurnHandler,
        { ingressId },
        { maxAttempts: WHATSAPP_TURN_MAX_ATTEMPTS },
      ),
  }
}
/** Jobs carry only identifiers; private scope/content and model execution remain in the API. */
export async function runAssistantWhatsAppTurn(
  payload: WhatsAppTurnJob,
  deps = defaultAssistantWhatsAppTurnDependencies(),
) {
  const input = whatsAppTurnJobSchema.safeParse(payload)
  if (!input.success) throw Error("Invalid assistant job.")
  const endpoint = deps.endpoint()
  const { url } = endpoint
  let response: Response
  try {
    response = await deps.send(url, {
      method: "POST",
      headers: assistantWorkerHeaders(endpoint),
      body: JSON.stringify(input.data),
      redirect: "error",
      signal: AbortSignal.timeout(150_000),
    })
  } catch {
    throw Error("Assistant worker request interrupted.")
  }
  if (!response.ok) throw Error("Assistant worker request unavailable.")
  const raw = await response.text()
  if (raw.length > 1024) throw Error("Invalid assistant worker result.")
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw Error("Invalid assistant worker result.")
  }
  const result = whatsAppTurnResultSchema.safeParse(value)
  if (!result.success) throw Error("Invalid assistant worker result.")
  if (
    result.data.nextIngressId &&
    result.data.nextIngressId !== input.data.ingressId
  ) {
    try {
      await deps.enqueue(result.data.nextIngressId)
    } catch {
      console.error("[assistant] next inbox dispatch deferred to recovery")
    }
  }
  return { status: result.data.status }
}
export async function assistantWhatsAppTurnHandler(payload: WhatsAppTurnJob) {
  await runAssistantWhatsAppTurn(payload)
}
