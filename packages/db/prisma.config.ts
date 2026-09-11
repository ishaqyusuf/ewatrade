import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, env } from "prisma/config"
import {
  applyDatabaseProfile,
  directDatabaseUrlForPrismaCli,
  loadProductionDatabaseUrl,
} from "../../scripts/database-profile.mjs"
import { loadRootEnvironment } from "../../scripts/environment-profile.mjs"

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), "../..")

function loadEnv() {
  const { env: loadedEnv } = loadRootEnvironment(repoRoot)
  const productionDatabaseUrl = loadProductionDatabaseUrl(repoRoot)
  applyDatabaseProfile(loadedEnv, productionDatabaseUrl)

  for (const [key, value] of Object.entries(loadedEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

loadEnv()

export default defineConfig({
  datasource: {
    url: directDatabaseUrlForPrismaCli(env("EWATRADE_DATABASE_URL")),
  },
  migrations: {
    path: "prisma/migrations",
  },
  schema: "prisma",
})
