import { spawnSync } from "node:child_process"

const SCRIPT_PATH = new URL(
  "./print-mvp-hands-on-smoke-checklist.mjs",
  import.meta.url,
).pathname
const SECRET_MARKERS = [
  "Bearer ",
  "google-id-token",
  "EWATRADE_GOOGLE_LIVE_ID_TOKEN=",
  "EWATRADE_SHARED_LINK_LIVE_OWNER_BEARER_TOKEN=",
  "EWATRADE_SHARED_LINK_PREVIEW_URL=https://",
  "password=",
]
const REQUIRED_DEFAULT_OUTPUT = [
  "Mobile Retail Ops MVP hands-on smoke checklist",
  "Environment target: default local env file",
  "== Preflight ==",
  "bun run --cwd apps/mobile qa:mvp-local-readiness",
  "bun run --cwd apps/mobile qa:mvp-source",
  "bun run --cwd apps/mobile qa:mvp-contracts",
  "bun run --cwd apps/mobile qa:android-ready",
  "bun run --cwd apps/mobile qa:mvp-live-env-checklist",
  "bun run --cwd apps/mobile qa:mvp-live-readiness",
  "bun run --cwd apps/mobile qa:mvp-readiness",
  "== Device Evidence ==",
  "Start from bun run --cwd apps/mobile qa:mvp-hands-on-evidence-template.",
  "== Launch And Auth ==",
  "== First Product And Dashboard ==",
  "== Staff And Sessions ==",
  "== Sale And Customer Book ==",
  "== Offline And Sync ==",
  "== Inventory, Reports, And Subscription ==",
  "== Share Links And Web Checkout ==",
  "live Google provider flow",
  "live shared-link write/email flow",
  "deployed public preview",
  "browser checkout",
  "full device smoke run",
]
const REQUIRED_PRODUCTION_OUTPUT = [
  "Environment target: production env file",
  "bun run --cwd apps/mobile qa:mvp-hands-on-evidence-template:prod",
  "bun run --cwd apps/mobile qa:mvp-live-env-checklist:prod",
  "bun run --cwd apps/mobile qa:mvp-live-readiness:prod",
  "bun run --cwd apps/mobile qa:mvp-readiness:prod",
]

const defaultOutput = runChecklist()
const productionOutput = runChecklist({
  MVP_HANDS_ON_SMOKE_ENV_FILE: "../../.env.production",
})

for (const required of REQUIRED_DEFAULT_OUTPUT) {
  if (!defaultOutput.includes(required)) {
    fail(`Expected default output to include: ${required}`, defaultOutput)
  }
}

for (const required of REQUIRED_PRODUCTION_OUTPUT) {
  if (!productionOutput.includes(required)) {
    fail(`Expected production output to include: ${required}`, productionOutput)
  }
}

for (const localOnly of [
  "bun run --cwd apps/mobile qa:mvp-live-env-checklist\n",
  "bun run --cwd apps/mobile qa:mvp-live-readiness\n",
  "bun run --cwd apps/mobile qa:mvp-readiness\n",
]) {
  if (productionOutput.includes(localOnly)) {
    fail(
      `Production checklist should use the :prod variant instead of: ${localOnly.trim()}`,
      productionOutput,
    )
  }
}

for (const secret of SECRET_MARKERS) {
  if (defaultOutput.includes(secret) || productionOutput.includes(secret)) {
    fail(
      `Checklist output should not print secret marker: ${secret}`,
      `${defaultOutput}\n${productionOutput}`,
    )
  }
}

console.log("MVP hands-on smoke checklist fixture checks passed.")

function runChecklist(env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

  if (result.status !== 0) {
    fail(`Expected status 0, received ${result.status}.`, output)
  }

  return output
}

function fail(message, output) {
  console.error("MVP hands-on smoke checklist fixture failed.")
  console.error(message)
  console.error(output)
  process.exit(1)
}
