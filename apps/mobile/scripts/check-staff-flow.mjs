import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")
// Staff now lives under components/mobile/staff; staff-invite-sheet.tsx is
// the compatibility re-export. Markers follow the owning files.
const contracts = [
  {
    file: "components/mobile/staff-invite-sheet.tsx",
    markers: ["StaffInviteContent", "./staff/staff-screen"],
  },
  {
    file: "components/mobile/staff/staff-screen.tsx",
    markers: [
      "StaffInviteContent",
      "useStaffDirectory",
      "StaffInvitationSheet",
      'variant="flat"',
      "disabled={!vm.canOpenInvite}",
      "rows.length === 0 &&",
    ],
  },
  {
    file: "components/mobile/staff/use-staff-directory.ts",
    markers: ["trpc.retailOps.staff", "trpc.retailOps.subscription"],
  },
  {
    file: "components/mobile/staff/use-staff-invitation.ts",
    markers: [
      "trpc.retailOps.inviteStaff",
      "trpc.retailOps.staff.queryFilter()",
    ],
  },
  {
    file: "components/mobile/staff/staff-invitation-sheet.tsx",
    markers: ["hasStaffInviteDraft", "Send invite"],
    // Invite attendant takes typing, so it opens full screen, never as a
    // bottom sheet (owner rule, 4 Nov 2026).
    scopedContracts: [
      {
        end: "</FullScreenModal>",
        forbiddenMarkers: [
          "Staff details",
          "bottomOffset={280}",
          "paddingBottom: 220",
          "snapPoints",
        ],
        markers: [
          'title={uncertain ? "Result not confirmed" : "Invite attendant"}',
          "closeDisabled={isPending}",
          "footer={",
          'label="Email address · Required"',
          'label="Attendant name · Optional"',
        ],
        orderedMarkers: [
          'label="Email address · Required"',
          'label="Attendant name · Optional"',
        ],
        start: "    <FullScreenModal\n      ref={ref}",
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
    file: "app/staff-onboarding.tsx",
    markers: ["StaffOnboardingScreen"],
  },
  {
    file: "components/mobile/staff-onboarding/staff-onboarding-screen.tsx",
    markers: [
      "resolveStaffInviteToken",
      "completeStaffOnboarding",
      "AuthFlowScreen",
      "SecondaryOperationalRow",
      "StatusBadge",
      "StatusBanner",
      "!!session && trimmedName.length > 0",
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
