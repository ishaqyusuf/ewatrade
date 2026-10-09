import { task } from "@trigger.dev/sdk/v3"
import { assistantMaintenanceHandler } from "../handlers/assistant-maintenance"

/** Started every hour by the shared cadence schedule. */
export const assistantMaintenance = task({
  id: "assistant.maintenance",
  maxDuration: 300,
  queue: { name: "assistant-maintenance", concurrencyLimit: 1 },
  run: () => assistantMaintenanceHandler(),
})
