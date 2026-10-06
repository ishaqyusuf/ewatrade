import { afterEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

let role = "OWNER"
let staffAccessMode = "LEGACY"
const store = { id: "store", name: "Fixture" }
const invite = mock(async (_db: unknown, input: { email: string }) => ({
  staff: { email: input.email, name: "Staff", displayName: "Staff" },
  invite: {
    id: "membership",
    role: "CASHIER",
    acceptanceToken: "secret-token",
  },
  notification: { shouldSend: true },
}))
const updateAccess = mock(async (_db: unknown, _input: unknown) => ({}))
const notify = mock(async (_input: unknown) => {})
mock.module("@/lib/session", () => ({
  getServerSession: async () => ({
    user: { id: "owner", email: "owner@example.com" },
  }),
}))
mock.module("@/lib/tenant", () => ({
  getActiveTenant: async () => ({
    membership: { role, staffAccessMode },
    tenant: { id: "tenant", name: "Fixture" },
    activeStore: store,
    stores: [store],
  }),
}))
mock.module("@/lib/staff-data", () => ({ getDashboardStaff: async () => [] }))
mock.module("@ewatrade/db", () => ({ prisma: {} }))
mock.module("@ewatrade/db/queries", () => ({
  STAFF_STORE_ACCESS_ROLLOUT_READY: true,
  StaffStoreAccessError: class extends Error {},
  updateRetailOpsStaffStoreAccess: updateAccess,
  inviteRetailOpsStaff: invite,
  updateRetailOpsStaffStatus: async () => ({}),
  RetailOpsStaffError: class extends Error {},
  RetailOpsSubscriptionError: class extends Error {},
}))
mock.module("@ewatrade/jobs", () => ({
  enqueueRetailOpsStaffInviteNotification: notify,
}))
const { POST } = await import("./route")
const keys = [
  "APP_ENV",
  "DEV_PROFILE",
  "NODE_ENV",
  "QA_ACCELERATOR_ENABLED",
  "EMAIL_QA_DOMAIN_ROUTES",
  "DASHBOARD_URL",
]
const previous = new Map(keys.map((key) => [key, process.env[key]]))
function local() {
  process.env.APP_ENV = "local"
  Reflect.deleteProperty(process.env, "DEV_PROFILE")
  Reflect.deleteProperty(process.env, "QA_ACCELERATOR_ENABLED")
  process.env.EMAIL_QA_DOMAIN_ROUTES = JSON.stringify({
    "ishaq.qa.test": "tester@example.com",
  })
  process.env.DASHBOARD_URL = "https://ewatrade-dashboard.localhost"
}
function request(email: string) {
  return new NextRequest("https://ewatrade-dashboard.localhost/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "invite",
      email,
      role: "cashier",
      assignments: [{ storeId: "store", role: "cashier" }],
    }),
  })
}
afterEach(() => {
  role = "OWNER"
  staffAccessMode = "LEGACY"
  mock.clearAllMocks()
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
test("owner QA invitation exposes only a no-store website link with redacted result", async () => {
  local()
  const result = await POST(request("staff@ishaq.qa.test"))
  const body = await result.json()
  expect(result.status).toBe(200)
  expect(result.headers.get("Cache-Control")).toBe("no-store")
  expect(body.result.invite.acceptanceToken).toBeNull()
  expect(body.qaInviteUrl).toBe(
    "https://ewatrade-dashboard.localhost/staff-onboarding?inviteToken=secret-token",
  )
  expect(notify).toHaveBeenCalledTimes(1)
})
test("live email invitation never exposes the secret link", async () => {
  local()
  const body = await (await POST(request("staff@example.com"))).json()
  expect(body.qaInviteUrl).toBeUndefined()
  expect(body.result.invite.acceptanceToken).toBeNull()
})
test("Production refuses QA link exposure even with accelerator enabled", async () => {
  local()
  process.env.DEV_PROFILE = "production"
  process.env.QA_ACCELERATOR_ENABLED = "true"
  const body = await (await POST(request("staff@ishaq.qa.test"))).json()
  expect(body.qaInviteUrl).toBeUndefined()
  expect(body.result.invite.acceptanceToken).toBeNull()
})
test("cashier cannot create an invitation or receive its secret link", async () => {
  local()
  role = "CASHIER"
  const result = await POST(request("staff@ishaq.qa.test"))
  expect(result.status).toBe(403)
  expect(invite).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

test("scoped Manager cannot invite or change staff access", async () => {
  local()
  role = "MANAGER"
  staffAccessMode = "SCOPED"
  expect((await POST(request("staff@example.com"))).status).toBe(403)
  expect(invite).not.toHaveBeenCalled()
})
test("Owner can remove every Store without suspending the Membership", async () => {
  local()
  const response = await POST(
    new NextRequest("https://ewatrade-dashboard.localhost/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "access",
        staffUserId: "staff",
        expectedRevision: 4,
        assignments: [],
        defaultStoreId: null,
        catalogEditor: false,
        confirmLegacyCutover: true,
      }),
    }),
  )
  expect(response.status).toBe(200)
  expect(updateAccess).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      staffUserId: "staff",
      expectedRevision: 4,
      assignments: [],
      defaultStoreId: null,
      confirmLegacyCutover: true,
    }),
  )
})
