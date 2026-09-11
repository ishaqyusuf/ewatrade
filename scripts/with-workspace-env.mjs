import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), "..")
const workspaceDir = process.cwd()

function buildEnv(envSeed = {}) {
  return loadRootEnvironment(repoRoot, {
    ...process.env,
    ...envSeed,
  }).env
}

function assertProdDatabaseUrl(env) {
  if (env.REQUIRE_PROD_DATABASE_URL !== "1") {
    return
  }

  if (!env.EWATRADE_DATABASE_URL) {
    console.error(
      "The production profile requires EWATRADE_DATABASE_URL in .env.production or an explicit command env assignment.",
    )
    process.exit(1)
  }

  let databaseUrl
  try {
    databaseUrl = new URL(env.EWATRADE_DATABASE_URL)
  } catch {
    console.error(
      "The production profile requires EWATRADE_DATABASE_URL to be a valid database URL.",
    )
    process.exit(1)
  }

  if (["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
    console.error(
      "The production profile refused to use a localhost EWATRADE_DATABASE_URL. Put the production database URL in .env.production.",
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
const env = applyDatabaseProfile(
  {
    ...buildEnv(envAssignments),
    ...envAssignments,
  },
  loadProductionDatabaseUrl(repoRoot),
)

env.DATABASE_PROFILE_VERIFIED = "1"

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
