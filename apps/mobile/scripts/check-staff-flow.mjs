import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  emailTemplate: join(
    REPO_ROOT,
    "packages/email/templates/retail-ops-staff-invite.ts",
  ),
  notifications: join(
    REPO_ROOT,
    "packages/notifications/src/types/retail-ops-staff-invited.ts",
  ),
  router: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops.ts"),
  staffRouter: join(REPO_ROOT, "apps/api/src/trpc/routers/retail-ops-staff.ts"),
  staffInvite: join(MOBILE_DIR, "src/components/mobile/staff-invite-sheet.tsx"),
  staffOnboarding: join(MOBILE_DIR, "src/app/staff-onboarding.tsx"),
  store: join(MOBILE_DIR, "src/store/retailOpsStore.ts"),
}

const CONTRACTS = [
  {
    file: FILES.staffInvite,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "StatusBadge",
      "StatusBanner",
      "EmptyState",
      "trpc.retailOps.staff",
      "trpc.retailOps.inviteStaff",
      "inviteStaff(",
      "usesLocalStaffFallback",
      "STAFF_PREVIEW_LIMIT",
      "visibleStaffRows",
      "plan.limits.staff",
      "Email invite",
      "Enter attendant email address",
      "Send invite",
      'role: "cashier"',
    ],
    reason:
      "staff invite sheet must keep keyboard safety, production invite/list, local fallback, staff limits, bounded rows, and cashier role submission",
  },
  {
    file: FILES.staffOnboarding,
    markers: [
      "MobileScreen",
      "StatusBadge",
      "StatusBanner",
      "resolveStaffInviteToken",
      "completeStaffOnboarding",
      "isInvitedStaff",
      "Sign in to accept invite",
      "Wrong account",
      "Finish staff setup",
      "Enter your full name",
      "Enter your display name",
      "Start selling",
      "applyAuthenticatedSession",
      "ensureBusiness",
    ],
    reason:
      "staff onboarding must keep invite-token resolution, invited-account enforcement, compact profile fields, and session/business activation",
  },
  {
    file: FILES.dashboard,
    markers: [
      "StaffInviteSheet",
      "staffModal.present",
      "isAttendantDashboard",
      "canManageInventory",
      "isInvitedStaffProfile",
      '<Redirect href="/staff-onboarding"',
      "visibleStaffPreview",
      "Invite your first attendant",
    ],
    reason:
      "dashboard must keep staff invite entry points, invited-staff redirect, and attendant role gating",
  },
  {
    file: FILES.store,
    markers: [
      "inviteStaff",
      'createSyncEvent(\n                  "staff_invited"',
      'createSyncEvent(\n                "staff_invited"',
      "deviceId: state.offlineDeviceId",
      'kind: "staff"',
      'role: "attendant"',
      'status: "pending"',
      'syncStatus: "pending"',
    ],
    reason:
      "local staff invite fallback must create or refresh pending staff rows and queue staff_invited events with device/dependency metadata",
  },
  {
    file: FILES.staffRouter,
    markers: [
      "assertCanManageRetailOpsStaff",
      "inviteStaff: protectedProcedure",
      "inviteRetailOpsStaff",
      "enqueueStaffInviteNotification",
      "getRetailOpsStaffInviteUrl",
      "hideStaffInviteAcceptanceToken",
      "resolveStaffInviteToken: publicProcedure",
      "completeStaffOnboarding: authenticatedProcedure",
    ],
    reason:
      "API must keep staff permissions, durable invite creation, email notification enqueue, hidden acceptance tokens, public token resolution, and authenticated completion",
  },
  {
    file: FILES.emailTemplate,
    markers: [
      "renderRetailOpsStaffInviteTemplate",
      'ctaLabel: "Get started"',
      "Open the secure invite link",
      "You have been added to ewatrade",
      "Business",
      "Role",
      "Invited by",
    ],
    reason:
      "staff invite email must keep get-started instructions and business/role context",
  },
  {
    file: FILES.notifications,
    markers: [
      "retailOpsStaffInvitedPayloadSchema",
      "inviteUrl",
      "inviteeEmail",
      "membershipId",
      "retailOpsStaffInvited",
    ],
    reason:
      "notification payload must keep invite URL, invitee email, and membership id for delivery",
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

if (failures.length > 0) {
  console.error(
    "Staff flow check failed. Restore the invite sheet, attendant onboarding, local fallback, API invite, or email notification contract.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Staff flow check passed.")
