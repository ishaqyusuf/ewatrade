import {
  WHATSAPP_DELIVERY_JOB_ID,
  WHATSAPP_DELIVERY_MAX_ATTEMPTS,
  type WhatsAppDeliveryJob,
  whatsAppDeliveryJobSchema,
  whatsAppDeliveryResultSchema,
} from "@ewatrade/assistant/channels/delivery"
import { triggerJob } from "../trigger"
import {
  type AssistantWorkerEndpoint,
  assistantWorkerEndpoint,
  assistantWorkerHeaders,
} from "./assistant-worker-endpoint"

type Dependencies = {
  endpoint: () => AssistantWorkerEndpoint
  send: (url: URL, init: RequestInit) => Promise<Response>
  enqueue: (outboxId: string) => Promise<unknown>
}
export function defaultAssistantWhatsAppDeliveryDependencies(): Dependencies {
  return {
    endpoint: () => assistantWorkerEndpoint("channel-delivery"),
    send: (url, init) => fetch(url, init),
    enqueue: (outboxId) =>
      triggerJob(
        WHATSAPP_DELIVERY_JOB_ID,
        assistantWhatsAppDeliveryHandler,
        { outboxId },
        { maxAttempts: WHATSAPP_DELIVERY_MAX_ATTEMPTS },
      ),
  }
}
/** Jobs carry only identifiers; private scope/content and provider execution remain in the API. */
export async function runAssistantWhatsAppDelivery(
  payload: WhatsAppDeliveryJob,
  deps = defaultAssistantWhatsAppDeliveryDependencies(),
) {
  const input = whatsAppDeliveryJobSchema.safeParse(payload)
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
      signal: AbortSignal.timeout(90_000),
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
  const result = whatsAppDeliveryResultSchema.safeParse(value)
  if (!result.success) throw Error("Invalid assistant worker result.")
  if (
    result.data.nextOutboxId &&
    result.data.nextOutboxId !== input.data.outboxId
  ) {
    try {
      await deps.enqueue(result.data.nextOutboxId)
    } catch {
      console.error("[assistant] next reply dispatch deferred to recovery")
    }
  }
  return { status: result.data.status }
}
export async function assistantWhatsAppDeliveryHandler(
  payload: WhatsAppDeliveryJob,
) {
  await runAssistantWhatsAppDelivery(payload)
}
