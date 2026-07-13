import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const SOURCE_DIR = join(MOBILE_DIR, "src")

const FILES = {
  appShell: join(SOURCE_DIR, "components/mobile/app-shell.tsx"),
  dashboard: join(SOURCE_DIR, "app/dashboard.tsx"),
  evidenceTemplate: join(
    MOBILE_DIR,
    "scripts/print-mvp-hands-on-evidence-template.mjs",
  ),
  evidenceValidator: join(
    MOBILE_DIR,
    "scripts/check-mvp-hands-on-evidence-file.mjs",
  ),
  modal: join(SOURCE_DIR, "components/ui/modal.tsx"),
  packageJson: join(MOBILE_DIR, "package.json"),
  qaRunner: join(MOBILE_DIR, "scripts/run-mvp-source-qa.mjs"),
}

const SOURCE_QA_MARKERS = [
  "check-action-primitives.mjs",
  "check-app-shell.mjs",
  "check-auth-redesign.mjs",
  "check-create-sale-flow.mjs",
  "check-customer-book-flow.mjs",
  "check-dashboard-redesign.mjs",
  "check-design-foundation.mjs",
  "check-first-product-flow.mjs",
  "check-inventory-operations-flow.mjs",
  "check-keyboard-coverage.mjs",
  "check-mvp-surface-structure.mjs",
  "check-nativewind-style-mix.mjs",
  "check-offline-visual-coverage.mjs",
  "check-offline-sync-flow.mjs",
  "check-product-share-management-flow.mjs",
  "check-prompt-placeholders.mjs",
  "check-staff-flow.mjs",
  "check-subscription-flow.mjs",
  "check-theme-color-guard.mjs",
]

const ACCEPTANCE_CONTRACTS = [
  {
    file: FILES.packageJson,
    markers: [
      '"qa:mobile-redesign-acceptance": "node ./scripts/check-mobile-redesign-acceptance.mjs"',
    ],
    reason:
      "package scripts must expose the final mobile redesign acceptance gate",
  },
  {
    file: FILES.qaRunner,
    markers: [
      "Mobile redesign acceptance",
      "check-mobile-redesign-acceptance.mjs",
      ...SOURCE_QA_MARKERS,
    ],
    reason:
      "MVP source QA must run every redesign, keyboard, NativeWind, offline, role, and visual guard",
  },
  {
    file: FILES.evidenceTemplate,
    markers: [
      "Light and dark screenshots show readable contrast with no overlapping controls.",
      "Compact-phone screenshots show text, controls, and bottom navigation without overlap.",
      "Keyboard-open screenshots cover auth, OTP, first product, quantity, customer, staff invite, and follow-up forms.",
      "Floating bottom-sheet screenshots cover first product, create sale, inventory, staff, customer, product share, and sync states.",
      "Owner and attendant role screenshots show the correct dashboard actions and restrictions.",
      "Offline, pending, failed, retry, and conflict screenshots show clear status copy.",
      "Tap targets, contrast, status copy, and text fit meet the redesign acceptance bar.",
      "NativeWind source checks pass for className/style discipline on changed mobile UI components.",
    ],
    reason:
      "hands-on evidence must prompt the exact screenshot and accessibility proof required for the final redesign pass",
  },
  {
    file: FILES.evidenceValidator,
    markers: [
      "REQUIRED_SECTIONS",
      "REQUIRED_SECTION_FIELDS",
      "ABSOLUTE_EVIDENCE_ARTIFACT_PATTERN",
      "SECRET_PATTERNS",
      "Device smoke evidence",
    ],
    reason:
      "evidence validation must continue requiring sections, screenshot/log artifacts, and secret-safe notes",
  },
  {
    file: FILES.appShell,
    markers: [
      "MobileScreen",
      "keyboardBottomOffset",
      'accessibilityRole="button"',
      "accessibilityLabel={item.accessibilityLabel ?? item.label}",
      "min-h-12",
      "h-14 w-14",
      "numberOfLines={1}",
      'testID="mobile-shell-floating-nav"',
      'testID="mobile-shell-central-action"',
      'role === "owner" || !item.ownerOnly',
    ],
    reason:
      "floating navigation must keep tap-target sizing, labels, compact text, and owner/attendant filtering",
  },
  {
    file: FILES.modal,
    markers: [
      "FLOATING_SHEET_RADIUS",
      "FLOATING_SHEET_SIDE_INSET",
      "detached = true",
      "maxDynamicContentSize",
      "android_keyboardInputMode",
      "keyboardBehavior",
      "keyboardBlurBehavior",
      'pressBehavior="close"',
    ],
    reason:
      "bottom sheets must keep the shared floating presentation and keyboard-safe defaults",
  },
  {
    file: FILES.dashboard,
    markers: [
      "isAttendantDashboard ? null",
      "canManageInventory",
      "shellCentralAction",
      "centralAction={shellCentralAction}",
      "retail-sync-banner",
      "PlanStatusCard",
      "RepSessionStatusCard",
      "EmptyState",
      "StatusBadge",
    ],
    reason:
      "dashboard acceptance must keep role-specific surfaces, sync visibility, plan/session state, and shared status primitives",
  },
]

const failures = []

for (const contract of ACCEPTANCE_CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length === 0) continue

  failures.push({
    file: relative(REPO_ROOT, contract.file),
    message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
  })
}

if (failures.length > 0) {
  console.error(
    "Mobile redesign acceptance check failed. Restore the final QA runner wiring, evidence prompts, role/keyboard/bottom-sheet coverage, or visual acceptance markers.",
  )

  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile redesign acceptance check passed.")
