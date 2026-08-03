import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"
import { defineConfig, env } from "prisma/config"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "../../scripts/database-profile.mjs"

const __filename = fileURLToPath(import.meta.url)
const workspaceDir = path.dirname(__filename)
const repoRoot = path.resolve(workspaceDir, "../..")

function mergeEnvFile(filePath: string, targetEnv: NodeJS.ProcessEnv) {
  if (!existsSync(filePath)) {
    return
  }

  const parsed = parseEnv(readFileSync(filePath, "utf8"))

  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      targetEnv[key] = value
    }
  }
}

function loadEnv() {
  const loadedEnv = { ...process.env }
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production"
  const isPreview =
    process.env.APP_ENV === "preview" || process.env.DEV_PROFILE === "preview"
  const envFiles = [
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.development"),
    ...(!isPreview && !isProduction
      ? [
          path.join(repoRoot, ".env.local"),
          path.join(repoRoot, ".env.development.local"),
        ]
      : []),
    ...(isPreview
      ? [path.join(repoRoot, ".env.local"), path.join(repoRoot, ".env.preview")]
      : []),
    ...(isProduction
      ? [
          path.join(repoRoot, ".env.production"),
          path.join(repoRoot, ".env.production.local"),
        ]
      : []),
    path.join(workspaceDir, ".env"),
    path.join(workspaceDir, ".env.development"),
    ...(!isPreview && !isProduction
      ? [
          path.join(workspaceDir, ".env.local"),
          path.join(workspaceDir, ".env.development.local"),
        ]
      : []),
    ...(isProduction
      ? [
          path.join(workspaceDir, ".env.production"),
          path.join(workspaceDir, ".env.production.local"),
        ]
      : []),
  ]

  for (const filePath of envFiles) {
    mergeEnvFile(filePath, loadedEnv)
  }

  const productionDatabaseUrl = loadProductionDatabaseUrl(repoRoot)

  if (isProduction && productionDatabaseUrl) {
    loadedEnv.DATABASE_URL = productionDatabaseUrl
  }

  applyDatabaseProfile(loadedEnv, productionDatabaseUrl)

  for (const [key, value] of Object.entries(loadedEnv)) {
    if (value !== undefined) {
      process.env[key] = value
    }
  }
}

loadEnv()

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
  },
  schema: "prisma",
})
