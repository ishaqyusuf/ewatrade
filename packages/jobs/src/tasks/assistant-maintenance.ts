import { task } from "@trigger.dev/sdk/v3"
import { assistantMaintenanceHandler } from "../handlers/assistant-maintenance"

/** Started every hour by the shared cadence schedule. */
export const assistantMaintenance = task({
  id: "assistant.maintenance",
  // OOM-killed on the default 0.5 GB machine (18 and 19 Nov 2026).
  machine: "small-2x",
  maxDuration: 300,
  queue: { name: "assistant-maintenance", concurrencyLimit: 1 },
  run: () => assistantMaintenanceHandler(),
})
