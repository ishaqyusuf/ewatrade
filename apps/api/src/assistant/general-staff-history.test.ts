import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import {
  generalStaffHistoryAnswer,
  generalStaffHistoryInput,
} from "./general-staff-history"
test("staff history tool preserves strict scope/date/stream validation and fixed pagination", () => {
  for (const input of [
    { tenantId: "foreign" },
    { actorUserId: "owner" },
    { limit: 100 },
    { from: "2026-10-01" },
    { storeId: "store-a", eventType: "SUSPENDED" },
    { from: "2026-10-02T00:00:00Z", to: "2026-10-01T00:00:00Z" },
  ])
    expect(generalStaffHistoryInput.safeParse(input).success).toBe(false)
  const capability = capabilityManifest.find(
    (c) => c.id === "staff.history.read",
  )!
  expect(capability.rollout).toBe("planned")
  expect(capability.policy.roles).toEqual(["OWNER", "ADMIN"])
  expect(capability.procedures).toEqual(["retailOps.staffHistoryPage"])
})
test("history answer says unavailable total and legacy gaps rather than fabricating no history", () => {
  const page = {
    data: [],
    total: null,
    knownMatchingEvents: 0,
    nextCursor: null,
    asOf: "2026-10-12T00:00:00Z",
    scope: "tenant_staff_history" as const,
    coverage: {
      history: "partial" as const,
      lifecycle: "unavailable" as const,
      access: "available" as const,
      identities: "available" as const,
      detail:
        "Only recorded events are shown. Legacy writes may have no durable events; current status does not reconstruct history.",
    },
  }
  const answer = generalStaffHistoryAnswer(page)
  expect(answer.value).toBe("0 known recorded events")
  expect(answer.detail).toContain("full matching total is unknown")
  expect(answer.detail).toContain("does not reconstruct history")
  const exact = generalStaffHistoryAnswer({
    ...page,
    total: 2,
    knownMatchingEvents: 2,
    nextCursor: "next",
    scope: "recorded_store_access",
  })
  expect(exact.value).toBe("2 matching recorded events")
  expect(exact.detail).toContain("original filters/cursor")
  expect(exact.scope).toContain("Store access")
})
