import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const SOURCE_DIR = join(MOBILE_DIR, "src")
const FILES = {
  bottomSheetKeyboard: join(
    MOBILE_DIR,
    "src/components/ui/bottom-sheet-keyboard-aware-scroll-view.tsx",
  ),
  closeout: join(MOBILE_DIR, "src/components/mobile/closeout-sheet.tsx"),
  createSale: join(MOBILE_DIR, "src/components/mobile/create-sale-sheet.tsx"),
  customerBook: join(
    MOBILE_DIR,
    "src/components/mobile/customer-book-sheet.tsx",
  ),
  firstProduct: join(
    MOBILE_DIR,
    "src/components/mobile/first-product-setup-sheet.tsx",
  ),
  formField: join(MOBILE_DIR, "src/components/mobile/form-field.tsx"),
  layout: join(MOBILE_DIR, "src/app/_layout.tsx"),
  login: join(MOBILE_DIR, "src/app/login.tsx"),
  modal: join(MOBILE_DIR, "src/components/ui/modal.tsx"),
  otpInput: join(MOBILE_DIR, "src/components/mobile/otp-input.tsx"),
  quantityStepper: join(
    MOBILE_DIR,
    "src/components/mobile/quantity-stepper.tsx",
  ),
  repClockIn: join(MOBILE_DIR, "src/components/mobile/rep-clock-in-sheet.tsx"),
  screen: join(MOBILE_DIR, "src/components/mobile/screen.tsx"),
  signup: join(MOBILE_DIR, "src/app/sign-up.tsx"),
  staffInvite: join(MOBILE_DIR, "src/components/mobile/staff-invite-sheet.tsx"),
  staffOnboarding: join(MOBILE_DIR, "src/app/staff-onboarding.tsx"),
  stockIntake: join(MOBILE_DIR, "src/components/mobile/stock-intake-sheet.tsx"),
  unitConversion: join(
    MOBILE_DIR,
    "src/components/mobile/unit-conversion-sheet.tsx",
  ),
  verifyEmail: join(MOBILE_DIR, "src/app/verify-email.tsx"),
}

const CONTRACTS = [
  {
    file: FILES.layout,
    markers: ["KeyboardProvider", "<KeyboardProvider>", "</KeyboardProvider>"],
    reason: "app root must keep the keyboard controller provider",
  },
  {
    file: FILES.screen,
    markers: [
      "KeyboardAwareScrollView",
      "bottomOffset={keyboardBottomOffset}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
    ],
    reason:
      "MobileScreen must keep keyboard-aware scrolling for route-level auth and dashboard forms",
  },
  {
    file: FILES.bottomSheetKeyboard,
    markers: [
      "KeyboardAwareScrollView",
      "BottomSheetInputProvider",
      "bottomOffset = 96",
      "extraKeyboardSpace = 220",
      "<BottomSheetInputProvider>{children}</BottomSheetInputProvider>",
    ],
    reason:
      "bottom-sheet scroll wrapper must keep input provider and keyboard spacing defaults",
  },
  {
    file: FILES.modal,
    markers: [
      "BottomSheetBackdrop",
      "BottomSheetBackgroundProps",
      "FLOATING_SHEET_RADIUS",
      "FLOATING_SHEET_SIDE_INSET",
      "getFloatingBottomInset",
      "detached = true",
      "bottomInset ?? getFloatingBottomInset()",
      "useWindowDimensions",
      "maxDynamicContentSize",
      "backgroundComponent={",
      "enablePanDownToClose={props.enablePanDownToClose ?? true}",
      "borderWidth: StyleSheet.hairlineWidth",
      "elevation: 2000",
      "android_keyboardInputMode={",
      'props.android_keyboardInputMode ?? "adjustResize"',
      'keyboardBlurBehavior={props.keyboardBlurBehavior ?? "restore"}',
      'keyboardBehavior={props.keyboardBehavior ?? "interactive"}',
      'pressBehavior="close"',
    ],
    reason:
      "shared bottom-sheet modal must keep GND-style floating presentation plus Android resize, interactive keyboard, dynamic height cap, and close-on-backdrop behavior",
  },
  {
    file: FILES.formField,
    markers: ["Input", "label", "error", "className"],
    reason:
      "mobile form fields must keep routing through the shared input primitive",
  },
  {
    file: FILES.login,
    markers: [
      "MobileScreen",
      "FormField",
      'keyboardType="email-address"',
      'placeholder="Enter your email address"',
    ],
    reason:
      "login email entry must stay inside MobileScreen with email keyboard",
  },
  {
    file: FILES.signup,
    markers: [
      "MobileScreen",
      "keyboardBottomOffset={420}",
      'keyboardType="email-address"',
      'placeholder="Enter your business name"',
      'placeholder="Enter your full name"',
      'placeholder="Enter your email address"',
    ],
    reason:
      "signup must keep compact keyboard-aware business/name/email fields",
  },
  {
    file: FILES.verifyEmail,
    markers: ["MobileScreen", "OtpInput", "Verify and continue"],
    reason:
      "OTP route must keep the shared OTP input on a keyboard-aware route",
  },
  {
    file: FILES.otpInput,
    markers: [
      "TextInput",
      'inputMode="numeric"',
      'keyboardType="number-pad"',
      "maxLength={index === 0 ? length : 1}",
      "nextFocusIndex",
      "refs.current[nextFocusIndex]?.focus()",
    ],
    reason:
      "OTP cells must keep numeric keyboard, one-character cells, and focus advance",
  },
  {
    file: FILES.quantityStepper,
    markers: [
      "Input",
      'inputMode="numeric"',
      'keyboardType="numeric"',
      'inputTextAlign="center"',
      "normalizeWholeNumberInput",
      "onFocus={onFocus}",
      "onPressIn={onFocus}",
      "Pressable",
    ],
    reason:
      "quantity entry must keep numeric keyboard plus centered input and plus/minus controls",
  },
  {
    file: FILES.createSale,
    markers: [
      "BottomSheetInputProvider",
      "BottomSheetSectionList",
      'keyboardShouldPersistTaps="handled"',
      "scrollToQuantityInput",
      "scrollToCustomerInput",
      "onFocus={scrollToQuantityInput}",
      "QuantityStepper",
      "customerName",
    ],
    reason:
      "create sale must keep virtualized keyboard-safe checkout and customer entry",
  },
  {
    file: FILES.customerBook,
    markers: [
      "BottomSheetInputProvider",
      "BottomSheetFlatList",
      'keyboardShouldPersistTaps="handled"',
      "FormField",
      "Search by name or email",
    ],
    reason:
      "customer book must keep searchable customer input in a bottom-sheet input context",
  },
  {
    file: FILES.firstProduct,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "bottomOffset={320}",
      'keyboardShouldPersistTaps="handled"',
      "setupStep",
      'keyboardType="numeric"',
      "Enter current stock",
    ],
    reason:
      "first-product setup must keep keyboard-safe item/unit/variant/current-stock steps",
  },
  {
    file: FILES.staffInvite,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "bottomOffset={320}",
      'keyboardShouldPersistTaps="handled"',
      'keyboardType="email-address"',
      "Enter attendant email address",
    ],
    reason:
      "staff invite must keep email input reachable inside the keyboard-aware sheet",
  },
  {
    file: FILES.staffOnboarding,
    markers: [
      "MobileScreen",
      "FormField",
      "Enter your full name",
      "Enter your display name",
    ],
    reason: "staff onboarding must keep minimal profile fields on MobileScreen",
  },
  {
    file: FILES.repClockIn,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "bottomOffset={320}",
      'keyboardType="numeric"',
      "Enter counted stock",
    ],
    reason: "rep clock-in stock declarations must keep numeric keyboard safety",
  },
  {
    file: FILES.closeout,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "bottomOffset={320}",
      'inputMode="decimal"',
      'keyboardType="numeric"',
      "Enter counted stock",
    ],
    reason:
      "closeout cash, transfer, and inventory declarations must keep keyboard-safe numeric entry",
  },
  {
    file: FILES.stockIntake,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "bottomOffset={320}",
      "QuantityStepper",
      "Enter source note",
    ],
    reason:
      "stock intake must keep keyboard-safe product/unit/quantity/note entry",
  },
  {
    file: FILES.unitConversion,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "bottomOffset={320}",
      "QuantityStepper",
      "Enter conversion note",
    ],
    reason:
      "unit conversion must keep keyboard-safe product/variant/quantity/note entry",
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

for (const filePath of findSourceFiles(SOURCE_DIR)) {
  if (filePath === FILES.modal) continue

  const source = readFileSync(filePath, "utf8")

  if (/<BottomSheetModal(?:\s|>)/.test(source)) {
    failures.push({
      file: filePath,
      message:
        "uses BottomSheetModal directly instead of the shared floating Modal wrapper",
    })
  }

  if (source.includes("detached={false}")) {
    failures.push({
      file: filePath,
      message: "opts out of floating bottom-sheet presentation",
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Mobile keyboard coverage check failed. Restore keyboard-aware wrappers, bottom-sheet input context, numeric keyboards, or focused form fields for MVP inputs.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile keyboard coverage check passed.")

function findSourceFiles(directory) {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...findSourceFiles(entryPath))
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))
    ) {
      files.push(entryPath)
    }
  }

  return files
}
