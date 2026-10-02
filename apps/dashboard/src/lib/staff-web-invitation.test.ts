import { afterEach, expect, mock, test } from "bun:test"
const invite = {
  email: "staff@example.test",
  role: "CASHIER",
  membershipId: "membership",
}
const member = {
  role: "CASHIER",
  status: "INVITED",
  tenant: { isActive: true },
  user: {
    id: "user",
    email: "staff@example.test",
    ageBand: "ADULT",
    name: "Staff",
    accounts: [] as Array<{ password: string | null }>,
  },
}
const resolve = mock(async (_db: unknown, _input: unknown) => invite)
const find = mock(async (_input: unknown) => member)
mock.module("@ewatrade/db", () => ({
  prisma: { membership: { findUnique: find } },
}))
mock.module("@ewatrade/db/staff-onboarding", () => ({
  resolveRetailOpsStaffInviteToken: resolve,
}))
const { getStaffWebInvitation } = await import("./staff-web-invitation")
afterEach(() => {
  mock.clearAllMocks()
})
test("loads the exact pending membership bound to the durable token", async () => {
  expect((await getStaffWebInvitation("fixture")).user.id).toBe("user")
  expect(find.mock.lastCall?.[0]).toMatchObject({ where: { id: "membership" } })
})
test("invalid or expired token stops before membership lookup", async () => {
  resolve.mockRejectedValueOnce(new Error("Expired"))
  await expect(getStaffWebInvitation("fixture")).rejects.toThrow("Expired")
  expect(find).not.toHaveBeenCalled()
})
test.each([
  { ...member, status: "ACTIVE" },
  { ...member, role: "MANAGER" },
  { ...member, tenant: { isActive: false } },
  { ...member, user: { ...member.user, email: "other@example.test" } },
])("rejects changed invitation authority %#", async (changed) => {
  find.mockResolvedValueOnce(changed)
  await expect(getStaffWebInvitation("fixture")).rejects.toThrow(
    "no longer available",
  )
})

test("exposes password requirement without projecting credential hashes", async () => {
  find.mockResolvedValueOnce({
    ...member,
    user: { ...member.user, accounts: [{ password: "fixture-hash" }] },
  })
  const result = await getStaffWebInvitation("fixture")
  expect(result.needsPassword).toBe(false)
  expect(result.user).not.toHaveProperty("accounts")
  expect(result.user).not.toHaveProperty("password")
})
