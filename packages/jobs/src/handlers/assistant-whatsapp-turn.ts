import {
  WHATSAPP_TURN_JOB_ID,
  WHATSAPP_TURN_MAX_ATTEMPTS,
  type WhatsAppTurnJob,
  whatsAppTurnJobSchema,
  whatsAppTurnResultSchema,
} from "@ewatrade/assistant/channels/worker"
import { triggerJob } from "../trigger"

type Dependencies = {
  endpoint: () => { url: URL; key: string }
  send: (url: URL, init: RequestInit) => Promise<Response>
  enqueue: (ingressId: string) => Promise<unknown>
}
export function defaultAssistantWhatsAppTurnDependencies(): Dependencies {
  return {
    endpoint: () => {
      const origin = process.env.API_URL?.trim()
      const key = process.env.INTERNAL_API_KEY?.trim()
      if (!origin || !key) throw Error("Assistant worker endpoint unavailable.")
      const url = new URL(origin)
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(
            process.env.APP_ENV === "local" &&
            url.protocol === "http:" &&
            url.hostname.endsWith(".localhost")
          ))
      )
        throw Error("Assistant worker endpoint invalid.")
      return { url: new URL("/api/internal/assistant/channel-turn", url), key }
    },
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
  const { url, key } = deps.endpoint()
  let response: Response
  try {
    response = await deps.send(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": key },
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
