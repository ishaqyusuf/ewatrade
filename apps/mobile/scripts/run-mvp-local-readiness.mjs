import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPT_DIR =
  process.env.MVP_LOCAL_READINESS_SCRIPT_DIR ?? DEFAULT_SCRIPT_DIR
const CHECKS = [
  {
    label: "Source QA",
    script: "run-mvp-source-qa.mjs",
  },
  {
    label: "MVP typechecks",
    script: "run-mvp-typechecks.mjs",
  },
  {
    label: "MVP contract tests",
    script: "run-mvp-contract-tests.mjs",
  },
  {
    label: "Google OAuth readiness",
    script: "check-google-oauth-ready.mjs",
  },
]
const failedChecks = []

console.log("Mobile Retail Ops MVP local readiness")
console.log(
  "This check verifies implementation-local gates and skips Android device, live API, deployed preview, and browser checkout proof.",
)

for (const check of CHECKS) {
  console.log(`\n== ${check.label} ==`)

  const result = spawnSync(process.execPath, [join(SCRIPT_DIR, check.script)], {
    stdio: "inherit",
  })

  if (result.error) {
    console.error(result.error.message)
    failedChecks.push(check.label)
    continue
  }

  if (result.status !== 0) {
    failedChecks.push(check.label)
  }
}

if (failedChecks.length > 0) {
  console.error("\nMobile MVP local readiness check failed.")
  console.error(`Failing local gates: ${failedChecks.join(", ")}`)
  process.exit(1)
}

console.log("\nMobile MVP local readiness check passed.")
console.log(
  "Run bun run --cwd apps/mobile qa:mvp-readiness for Android and live release gates.",
)
