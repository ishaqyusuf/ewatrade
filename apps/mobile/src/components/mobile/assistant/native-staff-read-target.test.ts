import { expect, test } from "bun:test"
import {
  nativeStaffReadRoute,
  readNativeStaffReadTarget,
} from "./native-staff-read-target"

test("staff read routes preserve exact member identity, filters and full bounded cursor", () => {
  const targets = [
    { kind: "staff_member", membershipId: "original-member" },
    {
      kind: "staff_directory",
      filters: {
        search: "Amina",
        role: "MANAGER",
        status: "REMOVED",
        assignmentStoreId: "original-store",
        cursor: "directory-cursor",
      },
    },
    {
      kind: "staff_history",
      filters: {
        membershipId: "original-member",
        actorMembershipId: "original-actor",
        storeId: "original-store",
        stream: "STORE_ACCESS",
        eventType: "STORE_ACCESS_CHANGED",
        from: "2026-10-01T00:00:00+01:00",
        to: "2026-10-16T00:00:00+01:00",
        cursor: "x".repeat(2048),
      },
    },
  ] as const
  for (const target of targets) {
    const route = nativeStaffReadRoute(target)
    expect(route?.pathname).toBe("/staff-invite-modal")
    expect(readNativeStaffReadTarget(route?.params.target)).toEqual(target)
  }
})

test("malformed staff reads never turn into arbitrary directory or authority-bearing requests", () => {
  for (const target of [
    null,
    { kind: "staff_member", membershipId: " " },
    { kind: "staff_member", membershipId: "member", tenantId: "foreign" },
    { kind: "staff_directory", filters: { limit: 100 } },
    { kind: "staff_directory", filters: { actorUserId: "foreign" } },
    { kind: "staff_history", filters: { cursor: "x".repeat(2049) } },
    { kind: "staff_history", filters: { from: "tomorrow" } },
    { kind: "staff_history", filters: { url: "https://example.test" } },
    { kind: "staff_status", eventId: "original-event" },
  ]) {
    expect(nativeStaffReadRoute(target)).toBeNull()
    expect(readNativeStaffReadTarget(JSON.stringify(target))).toBeNull()
  }
  for (const raw of [undefined, ["{}"], "bad-json", "x".repeat(8193)])
    expect(readNativeStaffReadTarget(raw)).toBeNull()
})
