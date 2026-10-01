#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import {
  probeProductionApi,
  validateProductionApiHostConfiguration,
} from "./production-api-readiness.mjs"

const envFile = new URL("../.env.production", import.meta.url)
if (!existsSync(envFile)) {
  console.error(
    "Production API host preflight failed: .env.production is missing.",
  )
  process.exit(1)
}

const config = validateProductionApiHostConfiguration(
  parseEnv(readFileSync(envFile, "utf8")),
)
const failures = [...config.failures]
if (config.origin) failures.push(...(await probeProductionApi(config.origin)))

if (failures.length) {
  console.error("Production API host preflight failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Production API host preflight passed: ${config.origin}`)
}
