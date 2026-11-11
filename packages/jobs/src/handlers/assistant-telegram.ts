import {
  type AssistantChannelDeliveryJob,
  assistantChannelDeliveryJobSchema,
  assistantChannelDeliveryResultSchema,
} from "@ewatrade/assistant/channels/delivery"
import {
  type AssistantChannelTurnJob,
  assistantChannelTurnJobSchema,
  assistantChannelTurnResultSchema,
} from "@ewatrade/assistant/channels/worker"
import {
  type AssistantWorkerEndpoint,
  assistantWorkerEndpoint,
  assistantWorkerHeaders,
} from "./assistant-worker-endpoint"

type Send = (url: URL, init: RequestInit) => Promise<Response>
type Dispatch = (id: string) => Promise<unknown>

async function requestAssistantWorker(
  endpoint: AssistantWorkerEndpoint,
  payload: AssistantChannelTurnJob | AssistantChannelDeliveryJob,
  timeoutMs: number,
  send: Send,
): Promise<unknown> {
  let response: Response
  try {
    response = await send(endpoint.url, {
      method: "POST",
      headers: assistantWorkerHeaders(endpoint),
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw Error("Assistant worker request interrupted.")
  }
  if (!response.ok) throw Error("Assistant worker request unavailable.")
  try {
    const body = await response.text()
    if (body.length <= 1024) return JSON.parse(body)
  } catch {
    // Provider details and machine configuration stay out of job errors.
  }
  throw Error("Invalid assistant worker result.")
}

async function enqueueNext(
  enqueue: Dispatch,
  nextId: string | undefined,
  previousId: string,
) {
  if (!nextId || nextId === previousId) return
  try {
    await enqueue(nextId)
  } catch {
    console.error("[assistant] Telegram dispatch deferred to recovery")
  }
}

export async function runAssistantTelegramTurn(
  payload: AssistantChannelTurnJob,
  enqueue: Dispatch,
  send: Send = fetch,
) {
  const input = assistantChannelTurnJobSchema.safeParse(payload)
  if (!input.success) throw Error("Invalid assistant job.")
  const response = await requestAssistantWorker(
    assistantWorkerEndpoint("telegram-turn"),
    input.data,
    150_000,
    send,
  )
  const result = assistantChannelTurnResultSchema.safeParse(response)
  if (!result.success) throw Error("Invalid assistant worker result.")
  await enqueueNext(enqueue, result.data.nextIngressId, input.data.ingressId)
  return { status: result.data.status }
}

export async function runAssistantTelegramDelivery(
  payload: AssistantChannelDeliveryJob,
  enqueue: Dispatch,
  send: Send = fetch,
) {
  const input = assistantChannelDeliveryJobSchema.safeParse(payload)
  if (!input.success) throw Error("Invalid assistant job.")
  const response = await requestAssistantWorker(
    assistantWorkerEndpoint("telegram-delivery"),
    input.data,
    90_000,
    send,
  )
  const result = assistantChannelDeliveryResultSchema.safeParse(response)
  if (!result.success) throw Error("Invalid assistant worker result.")
  await enqueueNext(enqueue, result.data.nextOutboxId, input.data.outboxId)
  return { status: result.data.status }
}
