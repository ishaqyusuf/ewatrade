import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL("./run-mvp-readiness.mjs", import.meta.url).pathname
const CHECK_SCRIPT_NAMES = [
  "run-mvp-source-qa.mjs",
  "run-mvp-typechecks.mjs",
  "run-mvp-contract-tests.mjs",
  "check-android-qa-ready.mjs",
  "check-google-oauth-ready.mjs",
  "check-google-oauth-live-ready.mjs",
  "check-shared-link-live-ready.mjs",
  "check-shared-link-preview-url.mjs",
  "check-shared-link-browser-checkout-ready.mjs",
  "print-mvp-live-env-checklist.mjs",
]

runScenario({
  expectedStatus: 0,
  label: "all release gates passing",
  scripts: {
    "check-android-qa-ready.mjs":
      "console.log('Android QA readiness check passed.')",
    "check-google-oauth-live-ready.mjs":
      "console.log('Google OAuth live QA readiness check passed.')",
    "check-google-oauth-ready.mjs":
      "console.log('Google OAuth readiness check passed.')",
    "check-shared-link-browser-checkout-ready.mjs":
      "console.log('Shared-link browser checkout readiness check passed.')",
    "check-shared-link-live-ready.mjs":
      "console.log('Shared-link live readiness check passed.')",
    "check-shared-link-preview-url.mjs":
      "console.log('Shared-link public preview URL check passed.')",
    "run-mvp-contract-tests.mjs":
      "console.log('Mobile MVP contract tests passed.')",
    "run-mvp-source-qa.mjs": "console.log('Mobile MVP source QA passed.')",
    "run-mvp-typechecks.mjs": "console.log('Mobile MVP typechecks passed.')",
  },
  shouldInclude: [
    "== Source QA ==",
    "== MVP typechecks ==",
    "== MVP contract tests ==",
    "== Android device readiness ==",
    "== Google OAuth readiness ==",
    "== Google OAuth live API readiness ==",
    "== Shared-link live readiness ==",
    "== Shared-link public preview ==",
    "== Shared-link browser checkout readiness ==",
    "Mobile MVP readiness check passed.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "some release gates failing",
  scripts: {
    "check-android-qa-ready.mjs":
      "console.error('Android QA readiness check failed.'); process.exit(1)",
    "check-google-oauth-live-ready.mjs":
      "console.error('Google OAuth live QA readiness check failed.'); process.exit(1)",
    "check-google-oauth-ready.mjs":
      "console.log('Google OAuth readiness check passed.')",
    "check-shared-link-browser-checkout-ready.mjs":
      "console.error('Shared-link browser checkout readiness check failed.'); process.exit(1)",
    "check-shared-link-live-ready.mjs":
      "console.error('Shared-link live readiness check failed.'); process.exit(1)",
    "check-shared-link-preview-url.mjs":
      "console.error('Shared-link public preview URL check failed.'); process.exit(1)",
    "run-mvp-contract-tests.mjs":
      "console.log('Mobile MVP contract tests passed.')",
    "run-mvp-source-qa.mjs": "console.log('Mobile MVP source QA passed.')",
    "run-mvp-typechecks.mjs": "console.log('Mobile MVP typechecks passed.')",
    "print-mvp-live-env-checklist.mjs": requiredMissingChecklistScript(),
  },
  shouldInclude: [
    "Mobile MVP readiness check failed.",
    "Failing gates: Android device readiness, Google OAuth live API readiness, Shared-link live readiness, Shared-link public preview, Shared-link browser checkout readiness",
    "Required missing value summary:",
    "- Google OAuth Live API QA: Google ID token (EWATRADE_GOOGLE_LIVE_ID_TOKEN)",
    "- Shared-Link Public Preview: Deployed share URL (EWATRADE_SHARED_LINK_PREVIEW_URL)",
    "Recommended next commands:",
    "bun run --cwd apps/mobile qa:mvp-local-readiness",
    "bun run --cwd apps/mobile qa:mvp-live-env-checklist",
    "bun run --cwd apps/mobile qa:android-ready",
    "bun run --cwd apps/mobile qa:google-oauth-live-ready",
    "bun run --cwd apps/mobile qa:google-oauth-live-run",
    "bun run --cwd apps/mobile qa:shared-link-live-ready",
    "bun run --cwd apps/mobile qa:shared-link-live-run",
    "bun run --cwd apps/mobile qa:shared-link-preview",
    "bun run --cwd apps/mobile qa:shared-link-browser-ready",
    "bun run --cwd apps/mobile qa:shared-link-browser-checkout",
  ],
  shouldNotInclude: ["google-id-token-secret", "share=secret-token"],
})

runScenario({
  envFilePropagation: true,
  expectedStatus: 1,
  label: "selected production env failure points to production commands",
  scripts: {
    "check-google-oauth-live-ready.mjs":
      "console.error('Google OAuth live QA readiness check failed.'); process.exit(1)",
    "print-mvp-live-env-checklist.mjs": requiredMissingChecklistScript(),
  },
  shouldInclude: [
    "Mobile MVP readiness check failed.",
    "Required missing value summary:",
    "bun run --cwd apps/mobile qa:mvp-live-env-checklist:prod",
    "bun run --cwd apps/mobile qa:google-oauth-live-ready:prod",
    "bun run --cwd apps/mobile qa:google-oauth-live-run:prod",
  ],
  shouldNotInclude: ["google-id-token-secret", "share=secret-token"],
})

console.log("MVP readiness fixture checks passed.")

function runScenario(input) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-readiness-"))
  const envFile = join(fixtureDir, "selected.env")

  try {
    writeFileSync(envFile, "EWATRADE_API_URL=https://api.ewatrade.test\n")
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
        ...(input.envFilePropagation
          ? { MVP_READINESS_ENV_FILE: envFile }
          : {}),
        MVP_READINESS_SCRIPT_DIR: fixtureDir,
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

    for (const unexpected of input.shouldNotInclude ?? []) {
      if (output.includes(unexpected)) {
        fail(
          input.label,
          `Expected output not to include: ${unexpected}`,
          output,
        )
      }
    }
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true })
  }
}

function requiredMissingChecklistScript() {
  return [
    'console.log("Mobile Retail Ops MVP live environment checklist")',
    'console.log("Required missing values:")',
    'console.log("- Google OAuth Live API QA: Google ID token (EWATRADE_GOOGLE_LIVE_ID_TOKEN)")',
    'console.log("- Shared-Link Public Preview: Deployed share URL (EWATRADE_SHARED_LINK_PREVIEW_URL)")',
    'console.log("Verification commands:")',
    'console.log("- bun run --cwd apps/mobile qa:google-oauth-live-run")',
    'console.log("No secret values were printed.")',
  ].join("\n")
}

function fail(label, message, output) {
  console.error(`MVP readiness fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
