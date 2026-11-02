import { configure, idempotencyKeys, tasks } from "@trigger.dev/sdk/v3"
import type { JobHandler, RetryOptions } from "./queue"
import { runInBackground } from "./queue"

/**
 * Prefixed so one Vercel shared variable can serve every EwaTrade project
 * without colliding with other products; the SDK's default name is a fallback.
 */
export function triggerSecretKey() {
  // Literal process.env reads let the release env check see both names.
  return (
    process.env.EWATRADE_TRIGGER_SECRET_KEY?.trim() ||
    process.env.TRIGGER_SECRET_KEY?.trim() ||
    undefined
  )
}

let configuredKey: string | undefined

/** The SDK only reads TRIGGER_SECRET_KEY by itself, so pass the resolved key. */
function useTriggerClient() {
  const key = triggerSecretKey()
  if (!key) return false
  if (key !== configuredKey) {
    configure({ accessToken: key })
    configuredKey = key
  }
  return true
}

export function isTriggerConfigured() {
  return Boolean(triggerSecretKey())
}

export async function triggerJob<TPayload>(
  jobId: string,
  handler: JobHandler<TPayload>,
  payload: TPayload,
  options: RetryOptions = {},
) {
  if (useTriggerClient()) {
    await tasks.trigger(jobId, payload)
    return
  }

  await runInBackground(handler, payload, options)
}

export async function triggerJobAt<TPayload>(
  jobId: string,
  handler: JobHandler<TPayload>,
  payload: TPayload,
  runAt: Date,
  options: RetryOptions = {},
) {
  if (useTriggerClient()) {
    await tasks.trigger(jobId, payload, { delay: runAt })
    return
  }

  const delayMs = Math.max(0, runAt.getTime() - Date.now())
  setTimeout(() => {
    void runInBackground(handler, payload, options)
  }, delayMs)
}

/**
 * Trigger-only with no in-process fallback: callers keep a durable outbox whose
 * sweeper recovers work when Trigger is unavailable. The key is global so a
 * call from inside another run still dedupes against every other caller.
 */
export async function triggerTaskOnce<TPayload>(
  jobId: string,
  payload: TPayload,
  options: { idempotencyKey: string; idempotencyKeyTTL: string; delay?: Date },
) {
  if (!useTriggerClient()) return false
  await tasks.trigger(jobId, payload, {
    delay: options.delay,
    idempotencyKey: await idempotencyKeys.create(options.idempotencyKey, {
      scope: "global",
    }),
    idempotencyKeyTTL: options.idempotencyKeyTTL,
  })
  return true
}
