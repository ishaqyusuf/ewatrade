import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { GeneralContext } from "./general-context"
import { canUseCapability } from "./general-context"
import {
  generalStaffDirectoryInput,
  generalStaffMemberInput,
  generalStaffDirectoryAnswer,
  generalStaffMemberAnswer,
} from "./general-staff-reads"

const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})
function actor(role: string, scoped = false) {
  return {
    session: { user: { id: "user" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "QA",
        retailOpsPlanId: "pro",
        currencyCode: "NGN",
      },
      membership: { id: "membership", role },
      activeStore: { id: "store", name: "Shop" },
      stores: [{ id: "store" }],
      staffAccess: {
        businessRole: role,
        status: "ACTIVE",
        mode: scoped ? "SCOPED" : "LEGACY",
        catalogEditor: false,
        assignments: scoped
          ? [{ storeId: "store", role: "MANAGER", status: "ACTIVE" }]
          : [],
      },
    },
  } as unknown as GeneralContext
}
test("staff directory/detail stay planned, dashboard only, and keep native role/grant ceiling", () => {
  const capabilities = capabilityManifest.filter((c) =>
    ["staff.directory.read", "staff.member.read"].includes(c.id),
  )
  expect(capabilities).toHaveLength(2)
  for (const capability of capabilities) {
    expect(capability.rollout).toBe("planned")
    expect(canUseCapability(actor("OWNER"), capability)).toBe(false)
    const source = { ...capability, rollout: "source" as const }
    for (const role of ["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"])
      expect(canUseCapability(actor(role), source)).toBe(
        ["OWNER", "ADMIN", "MANAGER"].includes(role),
      )
    expect(canUseCapability(actor("MANAGER", true), source)).toBe(false)
    const suspended = actor("OWNER")
    suspended.tenantContext.staffAccess!.status = "SUSPENDED"
    expect(canUseCapability(suspended, source)).toBe(false)
  }
})
test("staff tools exclude model-selected scope, arbitrary limit and secret-bearing inputs", () => {
  for (const input of [
    { tenantId: "foreign" },
    { actorUserId: "owner" },
    { limit: 100 },
    { acceptanceToken: "secret" },
  ])
    expect(generalStaffDirectoryInput.safeParse(input).success).toBe(false)
  expect(
    generalStaffMemberInput.safeParse({
      membershipId: "a",
      tenantId: "foreign",
    }).success,
  ).toBe(false)
  expect(
    generalStaffDirectoryInput.parse({ search: " Amina ", status: "ACTIVE" })
      .search,
  ).toBe("Amina")
})
test("answer distinguishes total/page, Tenant scope, profile gaps and unread history", () => {
  const answer = generalStaffDirectoryAnswer({
    data: [],
    total: 25,
    nextCursor: "cursor",
    scope: "tenant_memberships",
    assignmentStoreId: null,
    asOf: "2026-10-12T00:00:00Z",
    coverage: {
      directory: "current_memberships",
      profile: "partial",
      history: "not_read",
    },
  })
  expect(answer.value).toBe("25 matching memberships")
  expect(answer.scope).toContain("Business")
  expect(answer.detail).toContain("0 on this page")
  expect(answer.detail).toContain("original filters")
  expect(answer.detail).toContain("profiles are unavailable")
  expect(answer.detail).toContain("History has not been read")
  const detail = generalStaffMemberAnswer({
    membershipId: "a",
    userId: "u",
    name: "Amina",
    email: "amina@example.test",
    role: "CASHIER",
    status: "INVITED",
    createdAt: new Date(),
    updatedAt: new Date(),
    invitedAt: null,
    acceptedAt: null,
    profileCoverage: "unavailable",
    scope: "tenant_membership",
    historyCoverage: "not_read",
  })
  expect(detail.detail).toContain("accepted date unavailable")
  expect(detail.detail).toContain("history have not been read")
  expect(detail.value).toBe("CASHIER · INVITED")
})
