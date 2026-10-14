import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const loaded = loadRootEnvironment(root, {
  ...process.env,
  APP_ENV: "local",
  DEV_PROFILE: "local",
  NODE_ENV: "development",
})
if (!loaded.profileExists || loaded.profile !== "local")
  throw Error("An explicit local Development profile is required.")
const env = applyDatabaseProfile(loaded.env, loadProductionDatabaseUrl(root))
const target = new URL(env.EWATRADE_DATABASE_URL)
if (
  target.hostname !==
    "ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech" ||
  target.pathname !== "/ewatrade_qa_v1"
)
  throw Error(
    "The selected database is not the authorized ewatrade_qa_v1 target.",
  )
env.DATABASE_PROFILE_VERIFIED = "1"
env.RUN_DATABASE_INTEGRATION_TESTS = "1"
env.QA_ACCESS_ACCEPTANCE_DATABASE_HOST = target.hostname
console.info(
  "Running rolled-back Business Activity checks on authorized Development; no provider calls.",
)
const child = spawn(
  "bun",
  [
    "--env-file=/dev/null",
    "test",
    "packages/db/src/queries/business-activity/record.integration.test.ts",
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
