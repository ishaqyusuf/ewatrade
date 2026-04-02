import type { JobHandler, RetryOptions } from "./queue"
import { runInBackground } from "./queue"

export function isTriggerConfigured() {
  return Boolean(process.env.TRIGGER_SECRET_KEY)
}

export async function triggerJob<TPayload>(
  jobId: string,
  handler: JobHandler<TPayload>,
  payload: TPayload,
  options: RetryOptions = {}
) {
  if (isTriggerConfigured()) {
    console.info("[jobs] trigger integration not yet wired, using in-memory fallback", {
      jobId
    })
  }

  await runInBackground(handler, payload, options)
}
