import { expect, test } from "bun:test"
import {
  nativeStaffOriginalRoute,
  readNativeStaffOriginalTarget,
} from "./native-staff-target"

test("native staff originals retain the exact event or command identity", () => {
  for (const target of [
    { kind: "staff_status", eventId: "status-original" },
    { kind: "staff_access", eventId: "access-original" },
    { kind: "staff_invitation", commandId: "command-original" },
  ] as const) {
    const route = nativeStaffOriginalRoute(target)
    expect(route?.pathname).toBe("/staff-invite-modal")
    expect(readNativeStaffOriginalTarget(route?.params.target)).toEqual(target)
  }
})
test("malformed, oversized and authority-bearing navigation never falls back to the directory", () => {
  for (const raw of [
    undefined,
    ["target"],
    "",
    "{",
    JSON.stringify({ kind: "staff_status", eventId: "" }),
    JSON.stringify({
      kind: "staff_status",
      eventId: "e",
      actorUserId: "other",
    }),
    JSON.stringify({ kind: "staff_access", eventId: "e", tenantId: "foreign" }),
    JSON.stringify({ kind: "staff_invitation", invitationId: "not-a-command" }),
    " ".repeat(1025),
  ])
    expect(readNativeStaffOriginalTarget(raw)).toBeNull()
  expect(
    nativeStaffOriginalRoute({
      kind: "staff_status",
      eventId: "e",
      url: "https://example.test",
    }),
  ).toBeNull()
})
