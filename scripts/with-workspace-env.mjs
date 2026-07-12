import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"
import { applyDatabaseProfile } from "./database-profile.mjs"

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), "..")
const workspaceDir = process.cwd()

function mergeEnvFile(filePath, targetEnv) {
  if (!existsSync(filePath)) {
    return
  }

  const contents = readFileSync(filePath, "utf8")
  const parsed = parseEnv(contents)

  for (const [key, value] of Object.entries(parsed)) {
    targetEnv[key] = value
  }
}

function buildEnv(envSeed = {}) {
  const env = { ...process.env, ...envSeed }
  const isProduction =
    env.NODE_ENV === "production" || env.APP_ENV === "production"
  const isRemoteDev =
    env.APP_ENV === "remote-dev" ||
    env.DEV_PROFILE === "remote-dev"
  const rootEnvFiles = [
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
  ]
  const workspaceEnvFiles = [
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

  for (const filePath of rootEnvFiles) {
    mergeEnvFile(filePath, env)
  }

  if (workspaceDir !== repoRoot) {
    for (const filePath of workspaceEnvFiles) {
      mergeEnvFile(filePath, env)
    }
  }

  return env
}

function assertProdDatabaseUrl(env) {
  if (env.REQUIRE_PROD_DATABASE_URL !== "1") {
    return
  }

  if (!env.DATABASE_URL) {
    console.error(
      "The production profile requires DATABASE_URL in .env.production.local or an explicit command env assignment."
    )
    process.exit(1)
  }

  let databaseUrl
  try {
    databaseUrl = new URL(env.DATABASE_URL)
  } catch {
    console.error(
      "The production profile requires DATABASE_URL to be a valid database URL."
    )
    process.exit(1)
  }

  if (["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
    console.error(
      "The production profile refused to use a localhost DATABASE_URL. Put the production database URL in .env.production.local."
    )
    process.exit(1)
  }
}

function parseCommand(argv) {
  const envAssignments = {}
  let index = 0

  while (index < argv.length) {
    const token = argv[index]

    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      break
    }

    const separatorIndex = token.indexOf("=")
    const key = token.slice(0, separatorIndex)
    const value = token.slice(separatorIndex + 1)
    envAssignments[key] = value
    index += 1
  }

  const command = argv[index]
  const args = argv.slice(index + 1)

  if (!command) {
    console.error("Expected a command to run.")
    process.exit(1)
  }

  return { envAssignments, command, args }
}

const { envAssignments, command, args } = parseCommand(process.argv.slice(2))
const env = applyDatabaseProfile({
  ...buildEnv(envAssignments),
  ...envAssignments,
})

assertProdDatabaseUrl(env)

const child = spawn(command, args, {
  cwd: workspaceDir,
  env,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on("error", (error) => {
  console.error(error)
  process.exit(1)
})
