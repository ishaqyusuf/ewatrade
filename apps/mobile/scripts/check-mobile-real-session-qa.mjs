import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  authHook: join(MOBILE_DIR, "src/hooks/use-auth.tsx"),
  layout: join(MOBILE_DIR, "src/app/_layout.tsx"),
  packageJson: join(MOBILE_DIR, "package.json"),
  qaRoute: join(MOBILE_DIR, "src/app/qa-session.tsx"),
  qaRoutePayload: join(MOBILE_DIR, "src/app/qa-session/[payload].tsx"),
  runner: join(MOBILE_DIR, "scripts/run-mobile-real-session-qa.mjs"),
}
const CONTRACTS = [
  {
    file: FILES.layout,
    markers: ['<Stack.Screen name="qa-session"'],
    reason: "the guarded QA session route must be registered for emulator E2E",
  },
  {
    file: FILES.layout,
    markers: ['name="qa-session/[payload]"'],
    reason:
      "the real-session import route needs a path-payload variant because Expo strips exp:// query params",
  },
  {
    file: FILES.authHook,
    markers: [
      "applyAuthenticatedSession(",
      "redirectHref?: string",
      "applySession(nextSession, redirectHref)",
    ],
    reason:
      "QA imports need the same session setter as real auth with an optional destination route",
  },
  {
    file: FILES.qaRoute,
    markers: [
      "shouldShowInternalDesignSystemEntry",
      "decodeURIComponent(payload)",
      "QA session import is only available in dev or preview builds.",
      "completeOnboarding(true)",
      "auth.applyAuthenticatedSession",
      "businessId",
      "businessName",
      "role",
      "status",
      "token",
    ],
    reason:
      "QA session import must stay dev/preview-gated and preserve production tenant role/status fields",
  },
  {
    file: FILES.qaRoutePayload,
    markers: ['export { default } from "../qa-session"'],
    reason: "path-payload route must reuse the same guarded import logic",
  },
  {
    file: FILES.runner,
    markers: [
      "createTRPCProxyClient",
      "requestMobileOwnerOtp",
      "verifyMobileOwnerOtp",
      "MOBILE_REAL_SESSION_SEED_SERVICES",
      "retailOps.createCatalogItem",
      'kind: "service"',
      "retailOps.createSale",
      "retailOps.updateServiceJobStatus",
      "retailOps.inviteStaff",
      "retailOps.completeStaffOnboarding",
      "MOBILE_REAL_SESSION_CONFIRM",
      "MOBILE_REAL_SESSION_OPEN",
      "qa-session",
      "encodeURIComponent(JSON.stringify(payload))",
      "x-app-authorization",
    ],
    reason:
      "real-session runner must use production tRPC auth/staff APIs and open the guarded mobile import route",
  },
  {
    file: FILES.packageJson,
    markers: ['"qa:mobile-real-session"', '"qa:mobile-real-session-guard"'],
    reason: "package scripts must expose the real-session QA runner and guard",
  },
]
const failures = []

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Mobile real-session QA check failed. Keep the dev/preview-gated session import route and real tRPC session runner intact.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile real-session QA check passed.")
