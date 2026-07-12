import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const MOBILE_ROOT = join(SCRIPT_DIR, "..")
const PACKAGE_JSON_FILE = join(MOBILE_ROOT, "package.json")
const SOURCE_QA_FILE = join(SCRIPT_DIR, "run-mvp-source-qa.mjs")
const CONTRACT_QA_FILE = join(SCRIPT_DIR, "run-mvp-contract-tests.mjs")
const SHARED_LINK_LIVE_RUNNER_FILE = join(
  SCRIPT_DIR,
  "run-shared-link-live-qa.ts",
)
const GOOGLE_LIVE_RUNNER_FILE = join(SCRIPT_DIR, "run-google-oauth-live-qa.mjs")
const SHARED_LINK_PREVIEW_FILE = join(
  SCRIPT_DIR,
  "check-shared-link-preview-url.mjs",
)
const LIVE_ENV_CHECKLIST_FILE = join(
  SCRIPT_DIR,
  "print-mvp-live-env-checklist.mjs",
)
const EXPO_ENV_ATTACHMENT_FILE = join(
  SCRIPT_DIR,
  "check-expo-env-attachment.mjs",
)

const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_FILE, "utf8"))
const sourceQa = readFileSync(SOURCE_QA_FILE, "utf8")
const contractQa = readFileSync(CONTRACT_QA_FILE, "utf8")
const sharedLinkLiveRunner = readFileSync(SHARED_LINK_LIVE_RUNNER_FILE, "utf8")
const googleLiveRunner = readFileSync(GOOGLE_LIVE_RUNNER_FILE, "utf8")
const sharedLinkPreview = readFileSync(SHARED_LINK_PREVIEW_FILE, "utf8")
const liveEnvChecklist = readFileSync(LIVE_ENV_CHECKLIST_FILE, "utf8")
const expoEnvAttachment = readFileSync(EXPO_ENV_ATTACHMENT_FILE, "utf8")
const scripts = packageJson.scripts ?? {}

const REQUIRED_COVERAGE = [
  {
    area: "App launch and splash",
    label: "App launch config",
    script: "qa:app-launch",
    scriptFile: "check-app-launch-config.mjs",
  },
  {
    area: "Shared haptic actions",
    label: "Action primitives",
    script: "qa:action-primitives",
    scriptFile: "check-action-primitives.mjs",
  },
  {
    area: "Auth, signup, OTP, staff onboarding",
    label: "Auth onboarding flow",
    script: "qa:auth-onboarding",
    scriptFile: "check-auth-onboarding-flow.mjs",
  },
  {
    area: "First product setup",
    label: "First-product flow",
    script: "qa:first-product-flow",
    scriptFile: "check-first-product-flow.mjs",
  },
  {
    area: "Dashboard snapshot",
    label: "Dashboard production flow",
    script: "qa:dashboard-production-flow",
    scriptFile: "check-dashboard-production-flow.mjs",
  },
  {
    area: "Staff invite",
    label: "Staff flow",
    script: "qa:staff-flow",
    scriptFile: "check-staff-flow.mjs",
  },
  {
    area: "Create sale, variants, quantity, checkout",
    label: "Create-sale flow",
    script: "qa:create-sale-flow",
    scriptFile: "check-create-sale-flow.mjs",
  },
  {
    area: "Customer book",
    label: "Customer book flow",
    script: "qa:customer-book-flow",
    scriptFile: "check-customer-book-flow.mjs",
  },
  {
    area: "Inventory operations",
    label: "Inventory operations flow",
    script: "qa:inventory-operations-flow",
    scriptFile: "check-inventory-operations-flow.mjs",
  },
  {
    area: "Offline sale and sync",
    label: "Offline sync flow",
    script: "qa:offline-sync-flow",
    scriptFile: "check-offline-sync-flow.mjs",
  },
  {
    area: "Offline banner, sync status, conflicts",
    label: "Offline visual coverage",
    script: "qa:offline-visuals",
    scriptFile: "check-offline-visual-coverage.mjs",
  },
  {
    area: "Session and offline persistence",
    label: "Session/offline persistence",
    script: "qa:session-offline-persistence",
    scriptFile: "check-session-offline-persistence.mjs",
  },
  {
    area: "Product share link management",
    label: "Product share management flow",
    script: "qa:product-share-management",
    scriptFile: "check-product-share-management-flow.mjs",
  },
  {
    area: "Shared product storefront order flow",
    label: "Shared product storefront",
    script: "qa:shared-product-storefront",
    scriptFile: "check-shared-product-storefront.mjs",
  },
  {
    area: "Reports and export",
    label: "Reports flow",
    script: "qa:reports-flow",
    scriptFile: "check-reports-flow.mjs",
  },
  {
    area: "Subscription plan surface",
    label: "Subscription flow",
    script: "qa:subscription-flow",
    scriptFile: "check-subscription-flow.mjs",
  },
  {
    area: "Keyboard-safe forms",
    label: "Keyboard coverage",
    script: "qa:keyboard-coverage",
    scriptFile: "check-keyboard-coverage.mjs",
  },
  {
    area: "Long-list behavior",
    label: "Long-list coverage",
    script: "qa:long-lists",
    scriptFile: "check-long-list-coverage.mjs",
  },
  {
    area: "NativeWind class/style discipline",
    label: "NativeWind style mix",
    script: "qa:nativewind-style",
    scriptFile: "check-nativewind-style-mix.mjs",
  },
  {
    area: "Prompt-style placeholders",
    label: "Prompt placeholders",
    script: "qa:prompt-placeholders",
    scriptFile: "check-prompt-placeholders.mjs",
  },
  {
    area: "Light and dark semantic colors",
    label: "Theme colors",
    script: "qa:theme-colors",
    scriptFile: "check-theme-color-guard.mjs",
  },
  {
    area: "Expo EAS env attachment",
    label: "Expo EAS env attachment",
    script: "qa:expo-env-attachment",
    scriptFile: "check-expo-env-attachment.mjs",
  },
  {
    area: "Mobile surface structure",
    label: "MVP surface structure",
    script: "qa:mvp-surfaces",
    scriptFile: "check-mvp-surface-structure.mjs",
  },
  {
    area: "Mobile auth API boundary",
    label: "Mobile auth API boundary",
    script: "qa:mobile-auth-api-boundary",
    scriptFile: "check-mobile-auth-api-boundary.mjs",
  },
  {
    area: "Retail Ops API boundary",
    label: "Retail Ops API boundary",
    script: "qa:retail-ops-api-boundary",
    scriptFile: "check-retail-ops-api-boundary.mjs",
  },
]

const failures = []

for (const coverage of REQUIRED_COVERAGE) {
  const command = scripts[coverage.script]

  if (!command) {
    failures.push(
      `${coverage.area}: missing package script ${coverage.script}.`,
    )
    continue
  }

  if (!command.includes(coverage.scriptFile)) {
    failures.push(
      `${coverage.area}: ${coverage.script} must run ${coverage.scriptFile}.`,
    )
  }

  if (!sourceQa.includes(`label: "${coverage.label}"`)) {
    failures.push(
      `${coverage.area}: qa:mvp-source is missing label "${coverage.label}".`,
    )
  }

  if (!sourceQa.includes(`script: "${coverage.scriptFile}"`)) {
    failures.push(
      `${coverage.area}: qa:mvp-source is missing ${coverage.scriptFile}.`,
    )
  }

  if (!existsSync(join(SCRIPT_DIR, coverage.scriptFile))) {
    failures.push(`${coverage.area}: ${coverage.scriptFile} does not exist.`)
  }
}

if (!scripts["qa:mvp-source"]?.includes("run-mvp-source-qa.mjs")) {
  failures.push("qa:mvp-source must run run-mvp-source-qa.mjs.")
}

if (
  !scripts["qa:mvp-smoke-flow"]?.includes("check-mvp-smoke-flow-coverage.mjs")
) {
  failures.push("qa:mvp-smoke-flow must run check-mvp-smoke-flow-coverage.mjs.")
}

if (
  !scripts["qa:mvp-hands-on-checklist"]?.includes(
    "print-mvp-hands-on-smoke-checklist.mjs",
  )
) {
  failures.push(
    "qa:mvp-hands-on-checklist must print the hands-on smoke checklist.",
  )
}

if (
  !scripts["qa:mvp-hands-on-evidence-template"]?.includes(
    "print-mvp-hands-on-evidence-template.mjs",
  )
) {
  failures.push(
    "qa:mvp-hands-on-evidence-template must print the hands-on evidence template.",
  )
}

if (
  !scripts["qa:mvp-hands-on-evidence-template:prod"]?.includes(
    "MVP_HANDS_ON_EVIDENCE_ENV_FILE=../../.env.production",
  ) ||
  !scripts["qa:mvp-hands-on-evidence-template:prod"]?.includes(
    "print-mvp-hands-on-evidence-template.mjs",
  )
) {
  failures.push(
    "qa:mvp-hands-on-evidence-template:prod must print the hands-on evidence template against ../../.env.production.",
  )
}

if (
  !scripts["qa:mvp-hands-on-evidence-template-fixtures"]?.includes(
    "check-mvp-hands-on-evidence-template-fixtures.mjs",
  )
) {
  failures.push(
    "qa:mvp-hands-on-evidence-template-fixtures must verify the hands-on evidence template output.",
  )
}

if (
  !scripts["qa:mvp-hands-on-evidence-file"]?.includes(
    "check-mvp-hands-on-evidence-file.mjs",
  )
) {
  failures.push(
    "qa:mvp-hands-on-evidence-file must validate a completed hands-on evidence note.",
  )
}

if (
  !scripts["qa:mvp-hands-on-evidence-file-fixtures"]?.includes(
    "check-mvp-hands-on-evidence-file-fixtures.mjs",
  )
) {
  failures.push(
    "qa:mvp-hands-on-evidence-file-fixtures must verify the completed evidence-note validator.",
  )
}

if (
  !scripts["qa:mvp-hands-on-checklist:prod"]?.includes(
    "MVP_HANDS_ON_SMOKE_ENV_FILE=../../.env.production",
  ) ||
  !scripts["qa:mvp-hands-on-checklist:prod"]?.includes(
    "print-mvp-hands-on-smoke-checklist.mjs",
  )
) {
  failures.push(
    "qa:mvp-hands-on-checklist:prod must print the hands-on smoke checklist against ../../.env.production.",
  )
}

if (
  !scripts["qa:mvp-hands-on-checklist-fixtures"]?.includes(
    "check-mvp-hands-on-smoke-checklist-fixtures.mjs",
  )
) {
  failures.push(
    "qa:mvp-hands-on-checklist-fixtures must verify the hands-on smoke checklist output.",
  )
}

const REQUIRED_PRODUCTION_ENV_SCRIPTS = [
  {
    command: "GOOGLE_OAUTH_READY_ENV_FILE=../../.env.production",
    script: "qa:google-oauth-ready:prod",
  },
  {
    command: "GOOGLE_OAUTH_LIVE_READY_ENV_FILE=../../.env.production",
    script: "qa:google-oauth-live-ready:prod",
  },
  {
    command: "GOOGLE_OAUTH_LIVE_ENV_FILE=../../.env.production",
    script: "qa:google-oauth-live-run:prod",
  },
  {
    command: "MVP_LIVE_ENV_CHECKLIST_ENV_FILE=../../.env.production",
    script: "qa:mvp-live-env-checklist:prod",
  },
  {
    command:
      "MVP_LIVE_ENV_CHECKLIST_REPORT_PATH=/tmp/ewatrade-mvp-live-blockers.json",
    script: "qa:mvp-live-blocker-report:prod",
  },
  {
    command: "MVP_LIVE_READINESS_ENV_FILE=../../.env.production",
    script: "qa:mvp-live-readiness:prod",
  },
  {
    command: "MVP_READINESS_ENV_FILE=../../.env.production",
    script: "qa:mvp-readiness:prod",
  },
  {
    command: "SHARED_LINK_BROWSER_CHECKOUT_ENV_FILE=../../.env.production",
    script: "qa:shared-link-browser-checkout:prod",
  },
  {
    command: "SHARED_LINK_BROWSER_READY_ENV_FILE=../../.env.production",
    script: "qa:shared-link-browser-ready:prod",
  },
  {
    command: "SHARED_LINK_LIVE_ENV_FILE=../../.env.production",
    script: "qa:shared-link-live-run:prod",
  },
  {
    command: "SHARED_LINK_LIVE_READY_ENV_FILE=../../.env.production",
    script: "qa:shared-link-live-ready:prod",
  },
  {
    command: "SHARED_LINK_PREVIEW_ENV_FILE=../../.env.production",
    script: "qa:shared-link-preview:prod",
  },
]

for (const productionScript of REQUIRED_PRODUCTION_ENV_SCRIPTS) {
  const command = scripts[productionScript.script]

  if (!command) {
    failures.push(`Missing production env script ${productionScript.script}.`)
    continue
  }

  if (!command.includes(productionScript.command)) {
    failures.push(
      `${productionScript.script} must select ../../.env.production.`,
    )
  }
}

if (!existsSync(join(SCRIPT_DIR, "print-mvp-hands-on-smoke-checklist.mjs"))) {
  failures.push("print-mvp-hands-on-smoke-checklist.mjs does not exist.")
}

if (!existsSync(join(SCRIPT_DIR, "print-mvp-hands-on-evidence-template.mjs"))) {
  failures.push("print-mvp-hands-on-evidence-template.mjs does not exist.")
}

if (
  !existsSync(
    join(SCRIPT_DIR, "check-mvp-hands-on-evidence-template-fixtures.mjs"),
  )
) {
  failures.push(
    "check-mvp-hands-on-evidence-template-fixtures.mjs does not exist.",
  )
}

if (!existsSync(join(SCRIPT_DIR, "check-mvp-hands-on-evidence-file.mjs"))) {
  failures.push("check-mvp-hands-on-evidence-file.mjs does not exist.")
}

if (
  !existsSync(join(SCRIPT_DIR, "check-mvp-hands-on-evidence-file-fixtures.mjs"))
) {
  failures.push("check-mvp-hands-on-evidence-file-fixtures.mjs does not exist.")
}

if (
  !existsSync(
    join(SCRIPT_DIR, "check-mvp-hands-on-smoke-checklist-fixtures.mjs"),
  )
) {
  failures.push(
    "check-mvp-hands-on-smoke-checklist-fixtures.mjs does not exist.",
  )
}

if (!sourceQa.includes('label: "MVP smoke-flow coverage"')) {
  failures.push("qa:mvp-source must include the MVP smoke-flow coverage guard.")
}

if (!sourceQa.includes('script: "check-mvp-smoke-flow-coverage.mjs"')) {
  failures.push("qa:mvp-source must run check-mvp-smoke-flow-coverage.mjs.")
}

if (!contractQa.includes("apps/mobile/src/store/retailOpsStore.test.ts")) {
  failures.push(
    "qa:mvp-contracts must include the local Retail Ops store smoke test.",
  )
}

if (
  !contractQa.includes(
    "apps/mobile/scripts/check-mvp-hands-on-smoke-checklist-fixtures.mjs",
  )
) {
  failures.push(
    "qa:mvp-contracts must include the hands-on smoke checklist fixture.",
  )
}

if (
  !contractQa.includes(
    "apps/mobile/scripts/check-mvp-hands-on-evidence-template-fixtures.mjs",
  )
) {
  failures.push(
    "qa:mvp-contracts must include the hands-on evidence template fixture.",
  )
}

if (
  !contractQa.includes(
    "apps/mobile/scripts/check-mvp-hands-on-evidence-file-fixtures.mjs",
  )
) {
  failures.push(
    "qa:mvp-contracts must include the hands-on evidence file fixture.",
  )
}

if (
  !contractQa.includes(
    "apps/mobile/scripts/check-expo-env-attachment-fixtures.mjs",
  )
) {
  failures.push(
    "qa:mvp-contracts must include the Expo env attachment fixture.",
  )
}

for (const marker of [
  "EWATRADE_EXPO_ENV_VERIFY_LIVE",
  "EWATRADE_EXPO_ENV_LIST_DEVELOPMENT_FILE",
  "EWATRADE_EXPO_ENV_LIST_PRODUCTION_FILE",
  "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b",
  "cipron-startups",
  "ewatrade",
  "parseEasEnvList",
]) {
  if (!expoEnvAttachment.includes(marker)) {
    failures.push(`Expo env attachment checker must keep marker ${marker}.`)
  }
}

for (const marker of [
  "process.env.SHARED_LINK_LIVE_ENV_FILE",
  "SHARED_LINK_LIVE_READY_ENV_FILE: ENV_FILE",
  "PREVIEW_USER_AGENT",
  "WhatsApp/2.24 EwaTrade-Mobile-Retail-Ops-Live-QA/1.0",
  '"user-agent": PREVIEW_USER_AGENT',
  "ogImageAlt",
  "ogSiteName",
  "twitterImageAlt",
  "Open Graph image alt text does not include the product name.",
  "Twitter image alt text does not include the product name.",
  "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH",
  "writeLiveEvidence",
  "Shared-link live evidence:",
]) {
  if (!sharedLinkLiveRunner.includes(marker)) {
    failures.push(
      `shared-link live runner must keep preview metadata marker ${marker}.`,
    )
  }
}

for (const marker of [
  "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH",
  "writeLiveEvidence",
  "Google OAuth live evidence:",
  "emailMatched",
  "bearerTokenReturned",
  "auth.verifyMobileGoogle",
]) {
  if (!googleLiveRunner.includes(marker)) {
    failures.push(
      `Google live runner must keep value-safe evidence marker ${marker}.`,
    )
  }
}

for (const marker of [
  "EWATRADE_SHARED_LINK_PREVIEW_EVIDENCE_PATH",
  "writePreviewEvidence",
  "Shared-link public preview evidence:",
  "metadata",
  "share token",
  "pageUrl.pathname",
]) {
  if (!sharedLinkPreview.includes(marker)) {
    failures.push(
      `shared-link preview checker must keep value-safe evidence marker ${marker}.`,
    )
  }
}

for (const marker of [
  "MVP_LIVE_ENV_CHECKLIST_REPORT_PATH",
  "mobile-retail-ops-live-env-checklist",
  "missingRequired",
  "verificationCommands",
  "MVP_LIVE_ENV_CHECKLIST_REPORT_PATH must be an absolute .json path.",
]) {
  if (!liveEnvChecklist.includes(marker)) {
    failures.push(
      `live env checklist must keep value-safe report marker ${marker}.`,
    )
  }
}

if (failures.length > 0) {
  console.error("Mobile MVP smoke-flow coverage check failed.")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Mobile MVP smoke-flow coverage check passed.")
