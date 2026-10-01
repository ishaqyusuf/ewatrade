import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  probeProductionApi,
  validateProductionApiConfiguration,
} from "./production-api-readiness.mjs"

const root = resolve(new URL("../../..", import.meta.url).pathname)

function readEnv(file) {
  if (!existsSync(file)) throw new Error("Production env file is missing.")
  const values = {}
  for (const rawLine of readFileSync(file, "utf8").split("\n")) {
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

const rootEnv = readEnv(resolve(root, ".env.production"))
const mobileEnv = readEnv(resolve(root, "apps/mobile/.env.production"))
const { origin, failures } = validateProductionApiConfiguration(
  rootEnv,
  mobileEnv,
)
if (origin) failures.push(...(await probeProductionApi(origin)))
if (failures.length) {
  console.error("Production mobile API preflight failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log("Production mobile API preflight passed.")
}
