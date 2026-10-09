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
    file: "components/mobile/floating-qa-button.tsx",
    // QA shows only on the signed-out login screen, so never over modals.
    markers: ["isAuthenticated ||", 'pathname !== "/login"'],
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

// Membership switching is personal; creating a business retains management authority.
const layout = readFileSync(join(SOURCE_DIR, "app/_layout.tsx"), "utf8")
const authenticatedGroup =
  layout
    .split("<Stack.Protected guard={isAuthenticated && !isInvitedStaff}>")[1]
    ?.split("</Stack.Protected>")[0] ?? ""
const managementGroup =
  layout
    .split("guard={isAuthenticated && !isInvitedStaff && canAccessAdmin}")[1]
    ?.split("</Stack.Protected>")[0] ?? ""
if (
  !authenticatedGroup.includes('name="business-switch-modal"') ||
  managementGroup.includes('name="business-switch-modal"')
)
  failures.push(
    "Business switching must be reachable from authenticated Account, including reps",
  )
if (
  !managementGroup.includes('name="new-business-onboarding-modal"') ||
  authenticatedGroup.includes('name="new-business-onboarding-modal"')
)
  failures.push("Business creation must stay management-gated")
const switching = readFileSync(
  join(SOURCE_DIR, "components/mobile/business-switch/use-business-switch.ts"),
  "utf8",
)
if (switching.includes("scopeChanged || !canManage"))
  failures.push(
    "Rep membership switching must not inherit the create-business role gate",
  )
for (const marker of [
  'auth.profile?.status?.toUpperCase() ?? "ACTIVE"',
  'session.profile.status?.toUpperCase() ?? "ACTIVE"',
  "key !== origin.current",
  "const member = refreshed.data?.find((business) => business.id === id)",
  "epoch !== activationEpoch.current",
  "canCreate:\n      canManage &&",
])
  if (!switching.includes(marker))
    failures.push(`Business switching lost boundary: ${marker}`)
if (
  (
    switching.match(
      /if \(!canManageMobileOperations\(currentSession\(\)\?\.profile.role\)\) return/g,
    ) ?? []
  ).length !== 2
)
  failures.push(
    "Business creation must recheck management authority both before and after deferred navigation",
  )

if (failures.length > 0) {
  console.error("Mobile business onboarding flow check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Mobile business onboarding flow check passed.")
