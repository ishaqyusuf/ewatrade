import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
if (
  args.length !== 0 &&
  (args.length !== 2 ||
    args[0] !== "--environment-root" ||
    !path.isAbsolute(args[1]))
)
  throw Error(
    "Use --environment-root with an absolute repository path, or no arguments.",
  )
const environmentRoot = args[1] ?? root
const loaded = loadRootEnvironment(environmentRoot, {
  ...process.env,
  APP_ENV: "local",
  DEV_PROFILE: "local",
  NODE_ENV: "development",
})
if (!loaded.profileExists || loaded.profile !== "local")
  throw Error("An explicit .env.local Development profile is required.")
const env = applyDatabaseProfile(
  loaded.env,
  loadProductionDatabaseUrl(environmentRoot),
)
// Only the already authorized isolated Development QA target. The derived
// host below is a consistency check, never authorization for another target.
const authorizedHost =
  "ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech"
const authorizedDatabase = "/ewatrade_qa_v1"
let target
try {
  target = new URL(env.EWATRADE_DATABASE_URL)
} catch {
  throw Error("The Development profile has no usable database URL.")
}
if (
  target.hostname !== authorizedHost ||
  target.pathname !== authorizedDatabase
)
  throw Error(
    "The selected database is not the authorized ewatrade_qa_v1 QA target.",
  )
env.QA_STAFF_ACTIVITY_DATABASE = authorizedDatabase
env.DATABASE_PROFILE_VERIFIED = "1"
env.RUN_DATABASE_INTEGRATION_TESTS = "1"
env.QA_ACCESS_ACCEPTANCE_DATABASE_HOST = new URL(
  env.EWATRADE_DATABASE_URL,
).hostname
console.info(
  "Running rolled-back S05 staff activity checks against the authorized Development QA target; Production excluded. No provider calls.",
)
const child = spawn(
  "bun",
  [
    "--env-file=/dev/null",
    "test",
    "packages/db/src/queries/staff-activity.integration.test.ts",
  ],
  { cwd: root, env, stdio: "inherit" },
)
child.on("error", (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
