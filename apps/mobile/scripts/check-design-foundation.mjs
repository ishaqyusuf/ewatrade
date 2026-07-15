import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const requiredMarkers = [
  {
    file: "lib/design-foundation.ts",
    markers: [
      "MOBILE_DESIGN_FOUNDATION",
      "colorRoles",
      "actionButton",
      "emptyState",
      "floatingSheet",
      "quantityStepper",
      "statusBadge",
      "statusBanner",
      "timelineRow",
      "MobileDesignStatusTone",
    ],
  },
  {
    file: "lib/theme.ts",
    markers: [
      'primary: "rgb(13, 94, 82)"',
      'primary: "rgb(45, 212, 191)"',
      'warn: "rgb(245, 158, 11)"',
      'background: "rgb(18, 18, 18)"',
      'card: "rgb(30, 30, 30)"',
    ],
  },
  {
    file: "components/mobile/status-badge.tsx",
    markers: ["StatusBadge", "MobileDesignStatusTone", "min-h-8"],
  },
  {
    file: "components/ui/input-2.tsx",
    markers: [
      "unstyled",
      "embeddedInputStyle",
      "NativeBottomSheetTextInput",
    ],
  },
  {
    file: "components/mobile/form-field.tsx",
    markers: [
      "FormField",
      "leadingIcon",
      "trailingIcon",
      "activeBorderColor",
      "unstyled",
    ],
  },
  {
    file: "components/mobile/quantity-stepper.tsx",
    markers: ["QuantityStepper", "unstyled", "inputTextAlign=\"center\""],
  },
  {
    file: "components/mobile/status-banner.tsx",
    markers: ["StatusBanner", "MobileDesignStatusTone", "Pressable", "haptic"],
  },
  {
    file: "components/mobile/empty-state.tsx",
    markers: ["EmptyState", "ActionButton", "text-center"],
  },
  {
    file: "components/mobile/timeline-row.tsx",
    markers: ["TimelineRow", "MobileDesignStatusTone", "isLast"],
  },
  {
    file: "components/mobile/index.ts",
    markers: ["EmptyState", "StatusBadge", "StatusBanner", "TimelineRow"],
  },
  {
    file: "../DESIGN.md",
    markers: [
      "Mobile UI Redesign Foundation",
      "deep teal",
      "floating bottom sheets",
      "NativeWind",
    ],
  },
]

const failures = []

for (const check of requiredMarkers) {
  const filePath = join(SOURCE_DIR, check.file)
  const contents = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (contents.includes(marker)) continue

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      marker,
    })
  }
}

if (failures.length > 0) {
  console.error("Mobile design foundation check failed.")

  for (const failure of failures) {
    console.error(`- ${failure.file} is missing marker: ${failure.marker}`)
  }

  process.exit(1)
}

console.log("Mobile design foundation check passed.")
