import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPT_DIR = process.env.MVP_READINESS_SCRIPT_DIR ?? DEFAULT_SCRIPT_DIR
const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const ENV_FILE = process.env.MVP_READINESS_ENV_FILE
  ? resolve(process.cwd(), process.env.MVP_READINESS_ENV_FILE)
  : join(REPO_ROOT, ".env")
const IS_PRODUCTION_ENV_TARGET = Boolean(process.env.MVP_READINESS_ENV_FILE)
const COMMAND_SUFFIX = IS_PRODUCTION_ENV_TARGET ? ":prod" : ""
const CHILD_ENV = {
  ...process.env,
  GOOGLE_OAUTH_LIVE_READY_ENV_FILE: ENV_FILE,
  GOOGLE_OAUTH_READY_ENV_FILE: ENV_FILE,
  SHARED_LINK_BROWSER_READY_ENV_FILE: ENV_FILE,
  SHARED_LINK_LIVE_READY_ENV_FILE: ENV_FILE,
  SHARED_LINK_PREVIEW_ENV_FILE: ENV_FILE,
}
const LIVE_ENV_CHECKLIST_SCRIPT = join(
  SCRIPT_DIR,
  "print-mvp-live-env-checklist.mjs",
)
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
    label: "Android device readiness",
    script: "check-android-qa-ready.mjs",
  },
  {
    label: "Google OAuth readiness",
    script: "check-google-oauth-ready.mjs",
  },
  {
    label: "Google OAuth live API readiness",
    script: "check-google-oauth-live-ready.mjs",
  },
  {
    label: "Shared-link live readiness",
    script: "check-shared-link-live-ready.mjs",
  },
  {
    label: "Shared-link public preview",
    script: "check-shared-link-preview-url.mjs",
  },
  {
    label: "Shared-link browser checkout readiness",
    script: "check-shared-link-browser-checkout-ready.mjs",
  },
]
const failedChecks = []
const NEXT_COMMANDS_BY_LABEL = {
  "Android device readiness": ["bun run --cwd apps/mobile qa:android-ready"],
  "Google OAuth live API readiness": [
    `bun run --cwd apps/mobile qa:google-oauth-live-ready${COMMAND_SUFFIX}`,
    `bun run --cwd apps/mobile qa:google-oauth-live-run${COMMAND_SUFFIX}`,
  ],
  "Google OAuth readiness": [
    `bun run --cwd apps/mobile qa:google-oauth-ready${COMMAND_SUFFIX}`,
  ],
  "MVP contract tests": ["bun run --cwd apps/mobile qa:mvp-contracts"],
  "MVP typechecks": ["bun run --cwd apps/mobile qa:mvp-typechecks"],
  "Shared-link browser checkout readiness": [
    `bun run --cwd apps/mobile qa:shared-link-browser-ready${COMMAND_SUFFIX}`,
    `bun run --cwd apps/mobile qa:shared-link-browser-checkout${COMMAND_SUFFIX}`,
  ],
  "Shared-link live readiness": [
    `bun run --cwd apps/mobile qa:shared-link-live-ready${COMMAND_SUFFIX}`,
    `bun run --cwd apps/mobile qa:shared-link-live-run${COMMAND_SUFFIX}`,
  ],
  "Shared-link public preview": [
    `bun run --cwd apps/mobile qa:shared-link-preview${COMMAND_SUFFIX}`,
  ],
  "Source QA": ["bun run --cwd apps/mobile qa:mvp-source"],
}
const LIVE_RELEASE_LABELS = new Set([
  "Google OAuth live API readiness",
  "Shared-link live readiness",
  "Shared-link public preview",
  "Shared-link browser checkout readiness",
])

for (const check of CHECKS) {
  console.log(`\n== ${check.label} ==`)

  const result = spawnSync(process.execPath, [join(SCRIPT_DIR, check.script)], {
    env: CHILD_ENV,
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
  console.error("\nMobile MVP readiness check failed.")
  console.error(`Failing gates: ${failedChecks.join(", ")}`)
  console.error(
    "Run bun run --cwd apps/mobile qa:mvp-local-readiness for the implementation-local gate without Android/live release checks.",
  )
  printRequiredMissingSummary(failedChecks)
  printNextCommands(failedChecks)
  process.exit(1)
}

console.log("\nMobile MVP readiness check passed.")

function printNextCommands(labels) {
  const nextCommands = [
    "bun run --cwd apps/mobile qa:mvp-local-readiness",
    `bun run --cwd apps/mobile qa:mvp-live-env-checklist${COMMAND_SUFFIX}`,
  ]

  for (const label of labels) {
    nextCommands.push(...(NEXT_COMMANDS_BY_LABEL[label] ?? []))
  }

  console.error("Recommended next commands:")
  for (const command of [...new Set(nextCommands)]) {
    console.error(`- ${command}`)
  }
}

function printRequiredMissingSummary(labels) {
  if (!labels.some((label) => LIVE_RELEASE_LABELS.has(label))) return

  const result = spawnSync(process.execPath, [LIVE_ENV_CHECKLIST_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      MVP_LIVE_ENV_CHECKLIST_ENV_FILE: ENV_FILE,
    },
  })

  if (result.error || result.status !== 0) return

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  const match =
    /Required missing values:\n([\s\S]*?)\nVerification commands:/.exec(output)
  const summary = match?.[1]?.trim()

  if (!summary) return

  console.error("Required missing value summary:")
  console.error(summary)
}
