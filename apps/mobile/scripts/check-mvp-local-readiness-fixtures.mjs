import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL("./run-mvp-local-readiness.mjs", import.meta.url)
  .pathname
const CHECK_SCRIPT_NAMES = [
  "run-mvp-source-qa.mjs",
  "run-mvp-typechecks.mjs",
  "run-mvp-contract-tests.mjs",
  "check-google-oauth-ready.mjs",
]

runScenario({
  expectedStatus: 0,
  label: "all local gates passing",
  scripts: {
    "run-mvp-source-qa.mjs": "console.log('Mobile MVP source QA passed.')",
    "run-mvp-typechecks.mjs": "console.log('Mobile MVP typechecks passed.')",
    "run-mvp-contract-tests.mjs":
      "console.log('Mobile MVP contract tests passed.')",
    "check-google-oauth-ready.mjs":
      "console.log('Google OAuth readiness check passed.')",
  },
  shouldInclude: [
    "Mobile Retail Ops MVP local readiness",
    "== Source QA ==",
    "== MVP typechecks ==",
    "== MVP contract tests ==",
    "== Google OAuth readiness ==",
    "Mobile MVP local readiness check passed.",
    "qa:mvp-readiness",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "some local gates failing",
  scripts: {
    "run-mvp-source-qa.mjs": "console.log('Mobile MVP source QA passed.')",
    "run-mvp-typechecks.mjs":
      "console.error('Mobile MVP typechecks failed.'); process.exit(1)",
    "run-mvp-contract-tests.mjs":
      "console.log('Mobile MVP contract tests passed.')",
    "check-google-oauth-ready.mjs":
      "console.error('Google OAuth readiness check failed.'); process.exit(1)",
  },
  shouldInclude: [
    "Mobile MVP local readiness check failed.",
    "Failing local gates: MVP typechecks, Google OAuth readiness",
  ],
})

console.log("MVP local readiness fixture checks passed.")

function runScenario(input) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-local-readiness-"))

  try {
    for (const scriptName of CHECK_SCRIPT_NAMES) {
      writeFileSync(
        join(fixtureDir, scriptName),
        `${input.scripts[scriptName] ?? "process.exit(0)"}\n`,
      )
    }

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: "utf8",
      env: {
        ...process.env,
        MVP_LOCAL_READINESS_SCRIPT_DIR: fixtureDir,
      },
    })
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

    if (result.status !== input.expectedStatus) {
      fail(
        input.label,
        `Expected status ${input.expectedStatus}, received ${result.status}.`,
        output,
      )
    }

    for (const expected of input.shouldInclude) {
      if (!output.includes(expected)) {
        fail(input.label, `Expected output to include: ${expected}`, output)
      }
    }
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true })
  }
}

function fail(label, message, output) {
  console.error(`MVP local readiness fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
