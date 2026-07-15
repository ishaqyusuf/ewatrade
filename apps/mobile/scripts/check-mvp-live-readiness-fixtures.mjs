import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL("./run-mvp-live-readiness.mjs", import.meta.url)
  .pathname
const CHECK_SCRIPT_NAMES = [
  "check-google-oauth-ready.mjs",
  "check-google-oauth-live-ready.mjs",
  "check-shared-link-live-ready.mjs",
  "check-shared-link-preview-url.mjs",
  "check-shared-link-browser-checkout-ready.mjs",
  "print-mvp-live-env-checklist.mjs",
]

runScenario({
  expectedStatus: 0,
  label: "all live gates passing",
  scripts: {
    "check-google-oauth-ready.mjs":
      "console.log('Google OAuth readiness check passed.')",
    "check-google-oauth-live-ready.mjs":
      "console.log('Google OAuth live QA readiness check passed.')",
    "check-shared-link-live-ready.mjs":
      "console.log('Shared-link live readiness check passed.')",
    "check-shared-link-preview-url.mjs":
      "console.log('Shared-link public preview URL check passed.')",
    "check-shared-link-browser-checkout-ready.mjs":
      "console.log('Shared-link browser checkout readiness check passed.')",
  },
  shouldInclude: [
    "Mobile Retail Ops MVP live readiness",
    "== Google OAuth readiness ==",
    "== Google OAuth live API readiness ==",
    "== Shared-link live readiness ==",
    "== Shared-link public preview ==",
    "== Shared-link browser checkout readiness ==",
    "Mobile MVP live readiness check passed.",
  ],
})

runScenario({
  expectedStatus: 1,
  label: "some live gates failing",
  scripts: {
    "check-google-oauth-ready.mjs":
      "console.log('Google OAuth readiness check passed.')",
    "check-google-oauth-live-ready.mjs":
      "console.error('Google OAuth live QA readiness check failed.'); process.exit(1)",
    "check-shared-link-live-ready.mjs":
      "console.error('Shared-link live readiness check failed.'); process.exit(1)",
    "check-shared-link-preview-url.mjs":
      "console.error('Shared-link public preview URL check failed.'); process.exit(1)",
    "check-shared-link-browser-checkout-ready.mjs":
      "console.error('Shared-link browser checkout readiness check failed.'); process.exit(1)",
    "print-mvp-live-env-checklist.mjs": requiredMissingChecklistScript(),
  },
  shouldInclude: [
    "Mobile MVP live readiness check failed.",
    "Failing live gates: Google OAuth live API readiness, Shared-link live readiness, Shared-link public preview, Shared-link browser checkout readiness",
    "Required missing value summary:",
    "- Google OAuth Live API QA: Google ID token (GOOGLE_LIVE_ID_TOKEN)",
    "- Shared-Link Public Preview: Deployed share URL (SHARED_LINK_PREVIEW_URL)",
    "qa:mvp-live-env-checklist",
  ],
  shouldNotInclude: ["google-id-token-secret", "share=secret-token"],
})

runScenario({
  envFilePropagation: true,
  expectedStatus: 0,
  label: "selected env file is propagated to child gates",
  scripts: {
    "check-google-oauth-ready.mjs": assertEnvScript(
      "GOOGLE_OAUTH_READY_ENV_FILE",
    ),
    "check-google-oauth-live-ready.mjs": assertEnvScript(
      "GOOGLE_OAUTH_LIVE_READY_ENV_FILE",
    ),
    "check-shared-link-live-ready.mjs": assertEnvScript(
      "SHARED_LINK_LIVE_READY_ENV_FILE",
    ),
    "check-shared-link-preview-url.mjs": assertEnvScript(
      "SHARED_LINK_PREVIEW_ENV_FILE",
    ),
    "check-shared-link-browser-checkout-ready.mjs": assertEnvScript(
      "SHARED_LINK_BROWSER_READY_ENV_FILE",
    ),
  },
  shouldInclude: ["Mobile MVP live readiness check passed."],
})

runScenario({
  envFilePropagation: true,
  expectedStatus: 1,
  label: "selected production env failure points to production checklist",
  scripts: {
    "check-google-oauth-ready.mjs":
      "console.log('Google OAuth readiness check passed.')",
    "check-google-oauth-live-ready.mjs":
      "console.error('Google OAuth live QA readiness check failed.'); process.exit(1)",
    "print-mvp-live-env-checklist.mjs": requiredMissingChecklistScript(),
  },
  shouldInclude: [
    "Mobile MVP live readiness check failed.",
    "Required missing value summary:",
    "qa:mvp-live-env-checklist:prod",
  ],
  shouldNotInclude: ["google-id-token-secret", "share=secret-token"],
})

console.log("MVP live readiness fixture checks passed.")

function runScenario(input) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-live-readiness-"))
  const envFile = join(fixtureDir, "selected.env")

  try {
    writeFileSync(envFile, "API_URL=https://api.ewatrade.test\n")
    for (const scriptName of CHECK_SCRIPT_NAMES) {
      writeFileSync(
        join(fixtureDir, scriptName),
        `${input.scripts[scriptName] ?? "process.exit(0)"}\n`.replaceAll(
          "__EXPECTED_ENV_FILE__",
          JSON.stringify(envFile),
        ),
      )
    }

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: "utf8",
      env: {
        ...process.env,
        ...(input.envFilePropagation
          ? { MVP_LIVE_READINESS_ENV_FILE: envFile }
          : {}),
        MVP_LIVE_READINESS_SCRIPT_DIR: fixtureDir,
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
    'console.log("- Google OAuth Live API QA: Google ID token (GOOGLE_LIVE_ID_TOKEN)")',
    'console.log("- Shared-Link Public Preview: Deployed share URL (SHARED_LINK_PREVIEW_URL)")',
    'console.log("Verification commands:")',
    'console.log("- bun run --cwd apps/mobile qa:google-oauth-live-run")',
    'console.log("No secret values were printed.")',
  ].join("\n")
}

function assertEnvScript(envKey) {
  return [
    `if (process.env.${envKey} !== __EXPECTED_ENV_FILE__) {`,
    `  console.error("${envKey} was not propagated.");`,
    "  process.exit(1);",
    "}",
    `console.log("${envKey} propagated.");`,
  ].join("\n")
}

function fail(label, message, output) {
  console.error(`MVP live readiness fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
