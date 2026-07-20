import { tasks } from "@trigger.dev/sdk/v3"
import type { JobHandler, RetryOptions } from "./queue"
import { runInBackground } from "./queue"

export function isTriggerConfigured() {
  return Boolean(process.env.TRIGGER_SECRET_KEY)
}

export async function triggerJob<TPayload>(
  jobId: string,
  handler: JobHandler<TPayload>,
  payload: TPayload,
  options: RetryOptions = {},
) {
  if (isTriggerConfigured()) {
    await tasks.trigger(jobId, payload)
    return
  }

  await runInBackground(handler, payload, options)
}
