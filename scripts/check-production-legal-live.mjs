import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { currentEffectiveLegalPublication } from "../packages/utils/src/legal-approval.ts"
import {
  probeProductionLegal,
  validateProductionLegalConfiguration,
} from "./production-legal-readiness.mjs"

const root = resolve(new URL("..", import.meta.url).pathname)
function readEnv(path) {
  const values = {}
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    values[key] =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value
  }
  return values
}

const { origin, failures } = validateProductionLegalConfiguration(
  readEnv(resolve(root, ".env.production")),
  readEnv(resolve(root, "apps/mobile/.env.production")),
)
const publication = currentEffectiveLegalPublication()
if (!publication)
  failures.push("Local legal publication is not approved and effective.")
if (origin && publication)
  failures.push(...(await probeProductionLegal(origin, publication)))
if (failures.length) {
  console.error("Production legal publication preflight failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log("Production legal publication preflight passed.")
}
