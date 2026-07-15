import { spawnSync } from "node:child_process"

const SCRIPT_PATH = new URL(
  "./print-mvp-hands-on-evidence-template.mjs",
  import.meta.url,
).pathname
const SECRET_MARKERS = [
  "Bearer ",
  "google-id-token",
  "GOOGLE_LIVE_ID_TOKEN=",
  "SHARED_LINK_LIVE_OWNER_BEARER_TOKEN=",
  "SHARED_LINK_PREVIEW_URL=https://",
  "password=",
  "share=secret",
]
const REQUIRED_DEFAULT_OUTPUT = [
  "# Mobile Retail Ops MVP Hands-On Evidence",
  "Environment target: default local env file",
  "## Safe Evidence Rules",
  "Do not paste OTPs, bearer tokens, Google ID tokens, customer passwords, or live share tokens.",
  "## Preflight Commands",
  "bun run --cwd apps/mobile qa:mvp-hands-on-checklist",
  "bun run --cwd apps/mobile qa:mvp-live-env-checklist",
  "bun run --cwd apps/mobile qa:mvp-live-readiness",
  "bun run --cwd apps/mobile qa:mvp-readiness",
  "absolute .log/.txt/.md/.json artifact path",
  "## Run Context",
  "## Launch And Auth",
  "## First Product And Dashboard",
  "## Staff And Sessions",
  "## Sale And Customer Book",
  "## Offline And Sync",
  "## Inventory, Reports, And Subscription",
  "## Share Links And Web Checkout",
  "Screenshots or logs: absolute screenshot/log artifact path",
  "## Release Gate Summary",
  "Live Google provider flow has current evidence.",
  "Live shared-link write/email flow has current evidence.",
  "Deployed public preview has current evidence.",
  "Browser checkout has current evidence.",
  "Full device smoke run has current evidence.",
  "Google evidence: command plus absolute .json evidence path",
  "Shared-link live evidence: command plus absolute .json evidence path",
  "Public preview evidence: command plus absolute .json evidence path",
  "Browser checkout evidence: command plus absolute .png evidence path",
  "Device smoke evidence: hands-on checklist command or full device smoke note plus absolute screenshot/log artifact path",
  "Live blocker report: blocker-report command plus absolute .json path when blockers remain; report must be from production env, same run date, and include missingRequiredCount plus publicConfiguredValues proof. Use None when no blockers remain.",
  "set MVP_HANDS_ON_EVIDENCE_FILE to this file path and run bun run --cwd apps/mobile qa:mvp-hands-on-evidence-file.",
]
const REQUIRED_PRODUCTION_OUTPUT = [
  "Environment target: production env file",
  "bun run --cwd apps/mobile qa:mvp-hands-on-checklist:prod",
  "bun run --cwd apps/mobile qa:mvp-live-env-checklist:prod",
  "bun run --cwd apps/mobile qa:mvp-live-blocker-report:prod",
  "bun run --cwd apps/mobile qa:mvp-live-readiness:prod",
  "bun run --cwd apps/mobile qa:mvp-readiness:prod",
]

const defaultOutput = runTemplate()
const productionOutput = runTemplate({
  MVP_HANDS_ON_EVIDENCE_ENV_FILE: "../../.env.production",
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
  "bun run --cwd apps/mobile qa:mvp-hands-on-checklist\n",
  "bun run --cwd apps/mobile qa:mvp-live-env-checklist\n",
  "bun run --cwd apps/mobile qa:mvp-live-readiness\n",
  "bun run --cwd apps/mobile qa:mvp-readiness\n",
  "QA mode: local fallback / production",
]) {
  if (productionOutput.includes(localOnly)) {
    fail(
      `Production evidence template should use the :prod variant instead of: ${localOnly.trim()}`,
      productionOutput,
    )
  }
}

if (
  defaultOutput.includes("bun run --cwd apps/mobile qa:mvp-live-blocker-report")
) {
  fail(
    "Default evidence template should not include the production-only blocker report command.",
    defaultOutput,
  )
}

for (const secret of SECRET_MARKERS) {
  if (defaultOutput.includes(secret) || productionOutput.includes(secret)) {
    fail(
      `Evidence template output should not print secret marker: ${secret}`,
      `${defaultOutput}\n${productionOutput}`,
    )
  }
}

console.log("MVP hands-on evidence template fixture checks passed.")

function runTemplate(env = {}) {
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
  console.error("MVP hands-on evidence template fixture failed.")
  console.error(message)
  console.error(output)
  process.exit(1)
}
