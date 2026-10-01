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
    file: "app/business-switch-modal.tsx",
    markers: [
      "BUSINESS_SWITCH_COPY",
      'closeLabel="Close workspaces"',
      "title={BUSINESS_SWITCH_COPY.title}",
    ],
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
      'from "./business-switch/business-switch-screen"',
      "BusinessSwitchSheet",
    ],
  },
  {
    file: "components/mobile/business-switch/business-switch-screen.tsx",
    markers: [
      "BUSINESS_SWITCH_COPY",
      "useBusinessSwitch",
      "ListCreateFab",
      'accessibilityLabel="Add a new business"',
      'testID="business-add-fab"',
      "onComplete?.()",
      "onActionPress={() => void vm.refresh()}",
      "disabled={!vm.canCreate}",
    ],
    forbiddenMarkers: [
      "Current workspace",
      ">\n        Done\n      </ActionButton>",
    ],
  },
  {
    file: "components/mobile/floating-theme-toggle.tsx",
    markers: ['pathname.startsWith("/business-switch-modal")'],
  },
  {
    file: "components/mobile/new-business-onboarding-screen.tsx",
    markers: [
      'from "./new-business/new-business-screen"',
      "NewBusinessOnboardingScreen",
    ],
  },
  {
    file: "components/mobile/business-switch/use-business-switch.ts",
    markers: [
      "getBusinessSwitchRowPresentation",
      'router.push("/new-business-onboarding-modal")',
      "switchMobileBusinessSession",
      "memberships.refetch({ throwOnError: true })",
      "currentSession()",
    ],
  },
  {
    file: "components/mobile/new-business/new-business-screen.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "Choose a different business type",
      "BottomSearchFooter",
      "onPress={() => model.selectProfile(item)}",
      "model.step > 1",
      "model.step === 1",
      "Create and open business",
    ],
  },
  {
    file: "components/mobile/new-business/new-business-model.ts",
    markers: [
      "BUSINESS_PROFILE_SCHEMA_VERSION",
      'BUSINESS_SETUP_STEPS = ["Type", "Profile", "Details", "Review"]',
      "Choose a business type",
      "How this business works",
      "businessCreateInput",
    ],
  },
  {
    file: "components/mobile/new-business/use-new-business.ts",
    markers: [
      "trpc.tenant.createBusiness",
      "switchMobileBusinessSession",
      "changeStep(2)",
      '"/dashboard"',
      "businessCreateInput(inputDraft)",
      "hasScope()",
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

  for (const marker of check.forbiddenMarkers ?? []) {
    if (!source.includes(marker)) continue
    failures.push(
      `${relative(MOBILE_DIR, filePath)} must not include ${marker}`,
    )
  }
}

if (failures.length > 0) {
  console.error("Mobile business onboarding flow check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Mobile business onboarding flow check passed.")
