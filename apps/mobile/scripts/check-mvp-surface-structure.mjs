import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)

const SURFACE_CONTRACTS = [
  {
    file: "src/app/login.tsx",
    markers: ["MobileScreen", "FormField", "ActionButton"],
    reason: "login must stay on the shared keyboard-safe auth surface",
  },
  {
    file: "src/app/sign-up.tsx",
    markers: ["MobileScreen", "FormField", "ActionButton"],
    reason: "signup must stay on the shared keyboard-safe auth surface",
  },
  {
    file: "src/app/verify-email.tsx",
    markers: ["MobileScreen", "OtpInput", "ActionButton"],
    reason: "OTP entry must stay keyboard-safe and use the shared OTP cells",
  },
  {
    file: "src/app/staff-onboarding.tsx",
    markers: ["MobileScreen", "ActionButton"],
    reason: "attendant onboarding must remain a compact keyboard-safe route",
  },
  {
    file: "src/app/dashboard.tsx",
    markers: ["MobileScreen", "DASHBOARD_RECENT_SALE_PREVIEW_LIMIT"],
    reason:
      "dashboard must keep safe-area/keyboard handling and bounded previews",
  },
  {
    file: "src/components/ui/modal.tsx",
    markers: [
      "BottomSheetBackdrop",
      "FLOATING_SHEET_RADIUS",
      "detached = true",
      "bottomInset ?? getFloatingBottomInset()",
      "maxDynamicContentSize",
      "backgroundComponent={",
      "enablePanDownToClose={props.enablePanDownToClose ?? true}",
      'keyboardBehavior={props.keyboardBehavior ?? "interactive"}',
    ],
    reason:
      "shared bottom-sheet modal must keep the GND-style floating sheet, backdrop, dynamic height, and interactive keyboard defaults used by all MVP sheets",
  },
  {
    file: "src/components/mobile/first-product-setup-sheet.tsx",
    markers: ["BottomSheetKeyboardAwareScrollView", "setupStep"],
    reason:
      "first-product setup must remain keyboard-safe and split into steps",
  },
  {
    file: "src/components/mobile/staff-invite-sheet.tsx",
    markers: ["BottomSheetKeyboardAwareScrollView", "STAFF_PREVIEW_LIMIT"],
    reason: "staff invite must stay keyboard-safe with bounded staff previews",
  },
  {
    file: "src/components/mobile/create-sale-sheet.tsx",
    markers: ["BottomSheetSectionList", "visibleCustomerOptions"],
    reason:
      "create sale must keep virtualized product rows and bounded customers",
  },
  {
    file: "src/components/mobile/customer-book-sheet.tsx",
    markers: ["BottomSheetFlatList", "visibleCustomers"],
    reason: "customer book must keep a virtualized customer list",
  },
  {
    file: "src/components/mobile/product-share-sheet.tsx",
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "visibleProducts",
      "visibleOrderRequests",
    ],
    reason:
      "product share management must keep keyboard handling and bounded lists",
  },
  {
    file: "src/components/mobile/sync-status-sheet.tsx",
    markers: ["BottomSheetKeyboardAwareScrollView", "SYNC_QUEUE_PREVIEW_LIMIT"],
    reason: "sync status must keep keyboard handling and bounded queue rows",
  },
  {
    file: "src/components/mobile/subscription-plan-sheet.tsx",
    markers: ["BottomSheetKeyboardAwareScrollView"],
    reason: "subscription plan surface must stay keyboard-safe",
  },
  {
    file: "src/components/mobile/stock-intake-sheet.tsx",
    markers: ["BottomSheetKeyboardAwareScrollView", "STOCK_UNIT_PREVIEW_LIMIT"],
    reason:
      "stock intake must keep keyboard handling and bounded product/unit rows",
  },
  {
    file: "src/components/mobile/unit-conversion-sheet.tsx",
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "CONVERSION_VARIANT_PREVIEW_LIMIT",
    ],
    reason:
      "unit conversion must keep keyboard handling and bounded variant rows",
  },
  {
    file: "src/components/mobile/rep-clock-in-sheet.tsx",
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "visibleOpeningInventoryLines",
    ],
    reason:
      "rep clock-in must keep keyboard handling and bounded inventory declarations",
  },
  {
    file: "src/components/mobile/closeout-sheet.tsx",
    markers: ["BottomSheetKeyboardAwareScrollView", "visibleInventoryLines"],
    reason:
      "closeout must keep keyboard handling and bounded closing inventory rows",
  },
  {
    file: "src/components/mobile/reports-sheet.tsx",
    markers: ["BottomSheetKeyboardAwareScrollView", "visibleRows"],
    reason: "reports must keep keyboard handling and bounded report rows",
  },
]

const failures = []
const bottomSheetFailures = []

for (const contract of SURFACE_CONTRACTS) {
  const filePath = join(MOBILE_DIR, contract.file)
  const source = readFileSync(filePath, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      ...contract,
      missingMarkers,
    })
  }
}

const mobileComponentDir = join(MOBILE_DIR, "src/components/mobile")
const mobileSheetFiles = readdirSync(mobileComponentDir)
  .filter((file) => file.endsWith("-sheet.tsx"))
  .map((file) => `src/components/mobile/${file}`)

for (const file of mobileSheetFiles) {
  const filePath = join(MOBILE_DIR, file)
  const source = readFileSync(filePath, "utf8")

  if (!source.includes('from "@/components/ui/modal"')) {
    bottomSheetFailures.push({
      file,
      reason: "sheet must use the shared floating Modal primitive",
    })
  }

  if (/<BottomSheetModal(?:\s|>)/.test(source)) {
    bottomSheetFailures.push({
      file,
      reason: "sheet must not render raw BottomSheetModal JSX",
    })
  }

  if (/detached=\{\s*false\s*\}/.test(source)) {
    bottomSheetFailures.push({
      file,
      reason: "sheet must not opt out of the shared floating presentation",
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Mobile MVP surface structure check failed. Restore the keyboard-safe wrappers, virtualized lists, or bounded previews for these surfaces.",
  )

  for (const failure of failures) {
    console.error(
      `- ${relative(MOBILE_DIR, join(MOBILE_DIR, failure.file))}: missing ${failure.missingMarkers.join(
        ", ",
      )} (${failure.reason})`,
    )
  }

  process.exit(1)
}

if (bottomSheetFailures.length > 0) {
  console.error(
    "Mobile MVP bottom-sheet structure check failed. Route feature sheets through the shared floating Modal primitive.",
  )

  for (const failure of bottomSheetFailures) {
    console.error(`- ${failure.file}: ${failure.reason}`)
  }

  process.exit(1)
}

console.log("Mobile MVP surface structure check passed.")
