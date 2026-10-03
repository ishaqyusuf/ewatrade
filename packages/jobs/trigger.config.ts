import { syncEnvVars } from "@trigger.dev/build/extensions/core"
import { defineConfig } from "@trigger.dev/sdk/v3"
import {
  syncedTriggerJobEnvironment,
  triggerProjectForEnv,
} from "../../scripts/trigger-deploy-profile.mjs"
import { captureTerminalJobError } from "./src/observability/sentry"

export default defineConfig({
  project: triggerProjectForEnv(process.env),
  runtime: "node-22",
  logLevel: "log",
  maxDuration: 60,
  onFailure: async ({ error, task }) => {
    await captureTerminalJobError(error, task)
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    extensions: [
      syncEnvVars(() => syncedTriggerJobEnvironment(process.env), {
        override: true,
      }),
    ],
  },
  dirs: ["./src/tasks"],
})
