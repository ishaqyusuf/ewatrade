import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"
import { fileURLToPath } from "node:url"
import { defineConfig, env } from "prisma/config"
import { applyDatabaseProfile } from "../../scripts/database-profile.mjs"

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
  const isRemoteDev =
    process.env.APP_ENV === "remote-dev" ||
    process.env.DEV_PROFILE === "remote-dev"
  const envFiles = [
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.development"),
    ...(!isRemoteDev && !isProduction
      ? [
          path.join(repoRoot, ".env.local"),
          path.join(repoRoot, ".env.development.local"),
        ]
      : []),
    ...(isRemoteDev
      ? [
          path.join(repoRoot, ".env.remote-dev"),
          path.join(repoRoot, ".env.remote-dev.local"),
        ]
      : []),
    ...(isProduction
      ? [
          path.join(repoRoot, ".env.production"),
          path.join(repoRoot, ".env.production.local"),
        ]
      : []),
    path.join(workspaceDir, ".env"),
    path.join(workspaceDir, ".env.development"),
    ...(!isRemoteDev && !isProduction
      ? [
          path.join(workspaceDir, ".env.local"),
          path.join(workspaceDir, ".env.development.local"),
        ]
      : []),
    ...(isRemoteDev
      ? [
          path.join(workspaceDir, ".env.remote-dev"),
          path.join(workspaceDir, ".env.remote-dev.local"),
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

  applyDatabaseProfile(loadedEnv)

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
