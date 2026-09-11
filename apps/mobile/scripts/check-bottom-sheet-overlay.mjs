#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function read(relativePath) {
  const filePath = join(root, relativePath)

  if (!existsSync(filePath)) {
    throw new Error(`Missing ${relativePath}`)
  }

  return readFileSync(filePath, "utf8")
}

function assertIncludes(contents, marker, message) {
  if (!contents.includes(marker)) {
    throw new Error(message)
  }
}

const backdrop = read("src/components/app/bottom-sheet-backdrop.tsx")
const createCustomerSheet = read(
  "src/components/mobile/create-sale-customer-sheet.tsx",
)
const modal = read("src/components/ui/modal.tsx")
const staffInviteSheet = read("src/components/mobile/staff-invite-sheet.tsx")
const theme = read("src/lib/theme.ts")
const themeVars = read("src/lib/nativewind-theme-vars.ts")
const globalCss = read("src/styles/global.css")
const tailwindConfig = read("tailwind.config.ts")

for (const [contents, marker, message] of [
  [
    theme,
    'overlay: "rgba(0, 0, 0, 0.48)"',
    "Light theme overlay must use the approved 48% neutral scrim.",
  ],
  [
    theme,
    'overlay: "rgba(0, 0, 0, 0.68)"',
    "Dark theme overlay must use the approved 68% neutral scrim.",
  ],
  [
    themeVars,
    '"--overlay": colors.overlay',
    "NativeWind variables must expose the semantic overlay token.",
  ],
  [
    globalCss,
    "--color-overlay: var(--overlay);",
    "Global CSS must expose the overlay color utility.",
  ],
  [
    tailwindConfig,
    'overlay: "var(--overlay)"',
    "Tailwind config must map the semantic overlay token.",
  ],
  [
    backdrop,
    "APP_BOTTOM_SHEET_BACKDROP_ELEVATION = 3999",
    "Backdrop must define the approved native layer.",
  ],
  [
    backdrop,
    "APP_BOTTOM_SHEET_ELEVATION = 4000",
    "Sheet must stay above its backdrop.",
  ],
  [
    backdrop,
    "backgroundColor: colors.overlay",
    "Backdrop must use the active semantic theme color.",
  ],
  [
    backdrop,
    'pressBehavior={dismissible ? "close" : "none"}',
    "Backdrop dismissal must be explicit and configurable.",
  ],
  [
    modal,
    'from "@/components/app/bottom-sheet-backdrop"',
    "Shared Modal must import the app backdrop primitive.",
  ],
  [
    modal,
    "<AppBottomSheetBackdrop {...props} />",
    "Shared Modal must render the semantic backdrop.",
  ],
  [
    modal,
    "elevation: APP_BOTTOM_SHEET_ELEVATION",
    "Detached sheets must use the approved layer.",
  ],
  [
    createCustomerSheet,
    "<AppBottomSheetBackdrop",
    "Protected customer drafts must keep the semantic backdrop.",
  ],
  [
    createCustomerSheet,
    "dismissible={!hasDraft}",
    "Protected customer drafts must keep explicit dismissal behavior.",
  ],
  [
    staffInviteSheet,
    "<AppBottomSheetBackdrop",
    "Protected staff-invite drafts must keep the semantic backdrop.",
  ],
  [
    staffInviteSheet,
    "dismissible={!hasInviteDraft}",
    "Protected staff-invite drafts must keep explicit dismissal behavior.",
  ],
]) {
  assertIncludes(contents, marker, message)
}

if (modal.includes("opacity={0.38}")) {
  throw new Error(
    "Shared Modal must not retain the retired hard-coded backdrop opacity.",
  )
}

for (const [name, contents] of [
  ["Create Customer", createCustomerSheet],
  ["Invite Staff", staffInviteSheet],
]) {
  if (contents.includes("<BottomSheetBackdrop")) {
    throw new Error(`${name} must not bypass the semantic app backdrop.`)
  }
}

console.log("Bottom-sheet semantic overlay guard passed.")
