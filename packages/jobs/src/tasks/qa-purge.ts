import { task } from "@trigger.dev/sdk/v3"
import { type QaPurgePayload, qaPurgeHandler } from "../handlers/qa-purge"

export const qaPurgeTask = task({
  id: "platform.qa.purge",
  maxDuration: 1_800,
  queue: { concurrencyLimit: 1 },
  run: async (payload: QaPurgePayload) => {
    await qaPurgeHandler(payload, 1)
  },
})
