import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")
const contracts = [
  {
    file: "components/mobile/staff-invite-sheet.tsx",
    markers: [
      "StaffInviteContent",
      "getStaffDirectoryPresentation",
      "trpc.retailOps.staff",
      "trpc.retailOps.inviteStaff",
      "staff-add-first-action",
      'variant="flat"',
      "Invite first attendant",
      "SecondaryOperationalRow",
      "Send invite",
      "STAFF_INVITE_SHEET_PRESENT_DELAY_MS",
      "hasStaffInviteDraft",
      "setTimeout(",
    ],
    scopedContracts: [
      {
        end: "</Modal>",
        forbiddenMarkers: [
          "Staff details",
          "bottomOffset={280}",
          "paddingBottom: 220",
        ],
        markers: [
          'keyboardBehavior="extend"',
          "bottomOffset={120}",
          "paddingBottom: 24",
          "extraKeyboardSpace={140}",
          "backdropComponent={renderInviteBackdrop}",
          "enablePanDownToClose={!hasInviteDraft}",
          "maxDynamicContentSize={maxInviteSheetHeight}",
          "snapPoints={STAFF_INVITE_SHEET_SNAP_POINTS}",
          'title="Invite attendant"',
          'label="Email address · Required"',
          'label="Attendant name · Optional"',
        ],
        orderedMarkers: [
          'label="Email address · Required"',
          'label="Attendant name · Optional"',
          "Send invite",
        ],
        start: "      <Modal\n        backdropComponent={renderInviteBackdrop}",
      },
    ],
  },
  {
    file: "components/mobile/staff-invite-sheet-model.ts",
    markers: [
      'STAFF_INVITE_SHEET_SNAP_POINTS = ["44%", "84%"]',
      "STAFF_INVITE_SHEET_PRESENT_DELAY_MS = 120",
      "getStaffInviteSheetMaxHeight",
      "hasStaffInviteDraft",
    ],
  },
  {
    file: "components/mobile/staff-directory-presentation-model.ts",
    markers: [
      "getStaffDirectoryPresentation",
      "showInitialInviteAction",
      "showStandardInviteFab",
      "isAtStaffLimit",
    ],
  },
  {
    file: "app/staff-onboarding.tsx",
    markers: [
      "resolveStaffInviteToken",
      "completeStaffOnboarding",
      "SecondarySheetHeader",
      "SecondaryOperationalRow",
      "StatusBadge",
      "StatusBanner",
      "StaffOnboardingMarketNameplate",
      "!!session && trimmedName.length > 0",
    ],
  },
  {
    file: "app/design-system/staff-onboarding.tsx",
    markers: [
      "shouldShowInternalDesignSystemEntry",
      "StaffOnboardingMarketNameplate",
      'type PreviewState = "disabled" | "enabled" | "error" | "loading"',
      "onSubmit={() => undefined}",
      "name.trim().length > 0",
    ],
  },
  {
    file: "components/mobile/staff-onboarding-market-nameplate.tsx",
    markers: [
      'keyboardAutoScrollEnabled={largeTextLayout || Platform.OS !== "android"}',
      'keyboardBottomOffset={Platform.OS === "android" ? 12 : 48}',
      "safeAreaColor={marketDay.palm}",
      'testID="staff-onboarding-full-name"',
      'testID="staff-onboarding-display-name"',
      'testID="staff-onboarding-submit"',
      'tone="marigold"',
      'trailingIcon="ArrowRight"',
    ],
  },
  {
    file: "components/mobile/design-system/design-system-screen.tsx",
    markers: [
      'router.push("/design-system/staff-onboarding")',
      "Preview staff onboarding",
    ],
  },
]

const failures = []
for (const contract of contracts) {
  const filePath = join(SOURCE_DIR, contract.file)
  const source = readFileSync(filePath, "utf8")
  for (const marker of contract.markers) {
    if (!source.includes(marker)) {
      failures.push(
        `${relative(MOBILE_DIR, filePath)} is missing marker: ${marker}`,
      )
    }
  }

  for (const scopedContract of contract.scopedContracts ?? []) {
    const startIndex = source.indexOf(scopedContract.start)
    const endIndex = source.indexOf(
      scopedContract.end,
      startIndex + scopedContract.start.length,
    )
    const scopedSource =
      startIndex >= 0 && endIndex > startIndex
        ? source.slice(startIndex, endIndex)
        : ""

    for (const marker of scopedContract.markers) {
      if (scopedSource.includes(marker)) continue
      failures.push(
        `${relative(MOBILE_DIR, filePath)} is missing scoped marker after ${scopedContract.start}: ${marker}`,
      )
    }

    for (const marker of scopedContract.forbiddenMarkers ?? []) {
      if (!scopedSource.includes(marker)) continue
      failures.push(
        `${relative(MOBILE_DIR, filePath)} must not include scoped marker after ${scopedContract.start}: ${marker}`,
      )
    }

    let previousMarkerIndex = -1
    for (const marker of scopedContract.orderedMarkers ?? []) {
      const markerIndex = scopedSource.indexOf(marker)
      if (markerIndex > previousMarkerIndex) {
        previousMarkerIndex = markerIndex
        continue
      }
      failures.push(
        `${relative(MOBILE_DIR, filePath)} must keep ordered marker after ${scopedContract.start}: ${marker}`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error("Mobile Staff flow check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Mobile Staff flow check passed.")
