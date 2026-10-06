import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import { tasks } from "@trigger.dev/sdk/v3"

tasks.middleware("performance-foundation", async ({ next }) => {
  if (process.env.PERFORMANCE_TRACE !== "true") return next()
  await withPerformanceTrace("job", next, (trace) => {
    console.info("[performance]", JSON.stringify(trace))
  })
})
