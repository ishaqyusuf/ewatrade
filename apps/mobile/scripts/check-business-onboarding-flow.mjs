import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")
const checks = [
  {
    file: "app/_layout.tsx",
    markers: ['name="new-business-onboarding-modal"'],
  },
  {
    file: "app/new-business-onboarding-modal.tsx",
    markers: [
      "NewBusinessOnboardingScreen",
      'closeHref="/business-switch-modal"',
      'title="Add business"',
    ],
  },
  {
    file: "components/mobile/business-switch-sheet.tsx",
    markers: [
      "ListCreateFab",
      'accessibilityLabel="Add a new business"',
      'testID="business-add-fab"',
      'router.push("/new-business-onboarding-modal"',
    ],
  },
  {
    file: "components/mobile/new-business-onboarding-screen.tsx",
    markers: [
      "SetupFlowHeader",
      "KeyboardAwareScrollView",
      "BUSINESS_PROFILE_SCHEMA_VERSION",
      "trpc.tenant.createBusiness",
      "switchMobileBusinessSession",
      '"/dashboard"',
      "Create and open business",
    ],
  },
]
const failures = []

for (const check of checks) {
  const filePath = join(SOURCE_DIR, check.file)
  const source = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (source.includes(marker)) continue
    failures.push(`${relative(MOBILE_DIR, filePath)} missing ${marker}`)
  }
}

if (failures.length > 0) {
  console.error("Mobile business onboarding flow check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Mobile business onboarding flow check passed.")
