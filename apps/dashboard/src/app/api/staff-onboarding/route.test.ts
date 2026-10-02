import { afterEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

const invite = {
  email: "staff@example.test",
  role: "CASHIER",
  membershipId: "membership",
  needsPassword: true,
  tenant: { slug: "fixture-business", name: "Fixture" },
  user: { id: "staff-user", name: "Staff", ageBand: "UNDECLARED" },
}
const load = mock(async (_token: string) => invite)
const send = mock(async (_input: unknown) => ({ success: true }))
const check = mock(async (_input: unknown) => ({ success: true }))
const signIn = mock(async (_input: unknown) => ({
  response: { user: { id: "staff-user" } },
  headers: new Headers({
    "Set-Cookie":
      "better-auth.session_token=fixture; Path=/; HttpOnly; SameSite=Lax",
  }),
}))
const createOtp = mock(async (_input: unknown) => "server-only-code")
const setPassword = mock(async (_input: unknown) => {})
let qaAllowed = false
mock.module("@ewatrade/utils/staff-invitation-links", () => ({
  isQaStaffInvitation: () => qaAllowed,
}))
const activate = mock(async (_db: unknown, _input: unknown) => ({}))
const declareAge = mock(
  async (_db: unknown, _id: string, _band: string) => ({}),
)
const legal = mock((_input: unknown) => null)
mock.module("@/lib/staff-web-invitation", () => ({
  getStaffWebInvitation: load,
}))
mock.module("@/lib/staff-onboarding-auth", () => ({
  staffOnboardingAuth: {
    api: {
      sendVerificationOTP: send,
      createVerificationOTP: createOtp,
      setPassword,
      checkVerificationOTP: check,
      signInEmailOTP: signIn,
    },
  },
}))
mock.module("@ewatrade/db", () => ({ prisma: {} }))
mock.module("@ewatrade/db/staff-onboarding", () => ({
  completeRetailOpsStaffOnboarding: activate,
  declareCustomerAccountAgeBand: declareAge,
}))
mock.module("@ewatrade/utils/legal-approval", () => ({
  resolveLegalSignupChoice: legal,
  assertLegalVersionHash: () => {},
}))
const { POST } = await import("./route")
const token = "test-invitation-token-long-enough"
const complete = {
  operation: "complete",
  inviteToken: token,
  name: "Staff",
  code: "123456",
  ageBand: "ADULT",
  password: "fixture-password",
  confirmPassword: "fixture-password",
}
function request(
  body: unknown,
  origin = "https://ewatrade-dashboard.localhost",
) {
  return new NextRequest(
    "https://ewatrade-dashboard.localhost/api/staff-onboarding",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify(body),
    },
  )
}
afterEach(() => {
  mock.clearAllMocks()
  qaAllowed = false
})

test("rejects cross-origin requests before reading the invitation", async () => {
  expect(
    (await POST(request(complete, "https://other.example.test"))).status,
  ).toBe(403)
  expect(load).not.toHaveBeenCalled()
})
test("accepts the configured Portless origin behind an internal upstream URL", async () => {
  const previous = process.env.DASHBOARD_URL
  process.env.DASHBOARD_URL = "https://ewatrade-dashboard.localhost"
  try {
    const result = await POST(
      new NextRequest("http://localhost:3094/api/staff-onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://ewatrade-dashboard.localhost",
        },
        body: JSON.stringify({ operation: "request-code", inviteToken: token }),
      }),
    )
    expect(result.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "DASHBOARD_URL")
    else process.env.DASHBOARD_URL = previous
  }
})
test("invalid or expired invitation cannot send email or activate membership", async () => {
  load.mockRejectedValueOnce(new Error("Invitation expired"))
  expect((await POST(request(complete))).status).toBe(400)
  expect(send).not.toHaveBeenCalled()
  expect(signIn).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
})
test("email destination comes from the invitation and client email is rejected", async () => {
  expect(
    (await POST(request({ operation: "request-code", inviteToken: token })))
      .status,
  ).toBe(200)
  expect(send.mock.lastCall?.[0]).toMatchObject({
    body: { email: invite.email, type: "sign-in" },
  })
  expect(
    (
      await POST(
        request({
          operation: "request-code",
          inviteToken: token,
          email: "other@example.test",
        }),
      )
    ).status,
  ).toBe(400)
})
test("wrong code cannot declare age, sign in, or activate staff", async () => {
  check.mockRejectedValueOnce(new Error("Invalid OTP"))
  expect((await POST(request(complete))).status).toBe(400)
  expect(declareAge).not.toHaveBeenCalled()
  expect(signIn).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
})
test("requires age declaration before creating a staff session", async () => {
  expect(
    (await POST(request({ ...complete, ageBand: undefined }))).status,
  ).toBe(400)
  expect(signIn).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
})
test("verified account activates only the token-bound invitation and forwards cookies", async () => {
  const response = await POST(request(complete))
  expect(response.status).toBe(200)
  expect(activate.mock.lastCall?.[1]).toEqual({
    userId: "staff-user",
    tenantSlug: "fixture-business",
    inviteToken: token,
    name: "Staff",
  })
  expect(response.headers.getSetCookie().join(";")).toContain(
    "better-auth.session_token=fixture",
  )
  expect(response.cookies.get("ewatrade.active_tenant_slug")?.value).toBe(
    "fixture-business",
  )
  expect(response.headers.get("Cache-Control")).toBe("no-store")
})
test("mismatched authenticated account never activates an invitation", async () => {
  signIn.mockResolvedValueOnce({
    response: { user: { id: "other-user" } },
    headers: new Headers(),
  })
  expect((await POST(request(complete))).status).toBe(403)
  expect(activate).not.toHaveBeenCalled()
})

test("new staff must create matching passwords before any authentication effects", async () => {
  for (const values of [
    { password: undefined, confirmPassword: undefined },
    { confirmPassword: "other-password" },
    { password: "short", confirmPassword: "short" },
  ]) {
    expect((await POST(request({ ...complete, ...values }))).status).toBe(400)
  }
  expect(check).not.toHaveBeenCalled()
  expect(signIn).not.toHaveBeenCalled()
  expect(setPassword).not.toHaveBeenCalled()
  expect(activate).not.toHaveBeenCalled()
})
test("password is set against the fresh invited-user session before activation", async () => {
  expect((await POST(request(complete))).status).toBe(200)
  expect(setPassword.mock.lastCall?.[0]).toMatchObject({
    body: { newPassword: "fixture-password" },
  })
  const call = setPassword.mock.lastCall?.[0] as { headers: Headers }
  expect(call.headers.get("cookie")).toBe("better-auth.session_token=fixture")
  expect(setPassword.mock.invocationCallOrder[0]).toBeLessThan(
    activate.mock.invocationCallOrder[0] ?? 0,
  )
})
test("failed password creation cannot activate staff access", async () => {
  setPassword.mockRejectedValueOnce(new Error("Password could not be set"))
  expect((await POST(request(complete))).status).toBe(400)
  expect(activate).not.toHaveBeenCalled()
})
test("an existing password is preserved when accepting another invitation", async () => {
  load.mockResolvedValueOnce({ ...invite, needsPassword: false })
  expect(
    (
      await POST(
        request({
          ...complete,
          password: undefined,
          confirmPassword: undefined,
        }),
      )
    ).status,
  ).toBe(200)
  expect(setPassword).not.toHaveBeenCalled()
})
test("authorized QA invitation completes without inbox verification and never emails a code", async () => {
  qaAllowed = true
  expect((await POST(request({ ...complete, code: undefined }))).status).toBe(
    200,
  )
  expect(check).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(createOtp.mock.lastCall?.[0]).toMatchObject({
    body: { email: invite.email, type: "sign-in" },
  })
  expect(signIn.mock.lastCall?.[0]).toMatchObject({
    body: { email: invite.email, otp: "server-only-code" },
  })
  expect(setPassword).toHaveBeenCalledTimes(1)
  expect(activate).toHaveBeenCalledTimes(1)
})
test("live invitations still require a verified email code", async () => {
  expect((await POST(request({ ...complete, code: undefined }))).status).toBe(
    400,
  )
  expect(createOtp).not.toHaveBeenCalled()
  expect(setPassword).not.toHaveBeenCalled()
})
