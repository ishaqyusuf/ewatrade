import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const contracts = [
  {
    file: "src/app/_layout.tsx",
    markers: ['name="qa-session/[payload]"'],
    reason: "the guarded path-payload import route must be registered",
  },
  {
    file: "src/app/qa-session/[payload].tsx",
    markers: [
      "shouldShowInternalDesignSystemEntry",
      "decodeURIComponent",
      "development or preview builds",
      "completeOnboarding(true)",
      "auth.applyAuthenticatedSession",
      "payload.profile",
      "payload.token",
    ],
    reason:
      "session import must stay dev/preview-gated and preserve the real API profile",
  },
  {
    file: "scripts/run-mobile-real-session-qa.mjs",
    markers: [
      "BUSINESS_MODELS",
      "bulk-packaged-goods",
      "fashion-apparel",
      "garment-care-services",
      "electronics-mixed",
      "professional-services",
      "requestMobileOwnerOtp",
      "verifyMobileOwnerOtp",
      "catalog.createItem",
      "inventory.transformPackagedStock",
      "services.createAndConfirmIntake",
      "serviceAccess.createRequestForm",
      "serviceAccess.issueQuote",
      "serviceAccess.acceptQuote",
      "MOBILE_REAL_SESSION_CONFIRM",
      "MOBILE_REAL_SESSION_OPEN",
      "ewatrade-dev://qa-session",
      "encodeURIComponent(JSON.stringify(payload))",
      "x-app-authorization",
    ],
    reason:
      "the harness must create five generic businesses through current production tRPC boundaries",
  },
  {
    file: "package.json",
    markers: ['"qa:mobile-real-session"', '"qa:mobile-real-session-guard"'],
    reason: "package scripts must expose the runner and guard",
  },
]

const failures = []
for (const contract of contracts) {
  const filePath = join(MOBILE_DIR, contract.file)
  const source = readFileSync(filePath, "utf8")
  const missing = contract.markers.filter((marker) => !source.includes(marker))
  if (missing.length > 0) {
    failures.push({
      file: filePath,
      message: `missing ${missing.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error("Mobile five-business real-session QA check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Mobile five-business real-session QA check passed.")
