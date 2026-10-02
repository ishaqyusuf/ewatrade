import { afterEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

const signIn = mock(async (_input: unknown) => ({
  response: { user: { id: "fixture-user" } },
  headers: new Headers({
    "set-cookie":
      "better-auth.session_token=fixture; Path=/; HttpOnly; SameSite=Lax",
  }),
}))
const findMembership = mock(
  async (_input: unknown): Promise<{ id: string } | null> => ({
    id: "fixture-membership",
  }),
)
mock.module("@ewatrade/auth", () => ({
  auth: { api: { signInEmail: signIn } },
}))
mock.module("@ewatrade/db", () => ({
  prisma: { membership: { findFirst: findMembership } },
}))
const { POST } = await import("./route")

afterEach(() => {
  mock.clearAllMocks()
  findMembership.mockImplementation(async () => ({ id: "fixture-membership" }))
})

function request(body: unknown) {
  return new NextRequest(
    "https://ewatrade-dashboard.localhost/api/auth/login",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  )
}

test("signs in on the dashboard host and forwards the session cookie", async () => {
  const response = await POST(
    request({ email: "OWNER@example.com", password: "fixture-password" }),
  )
  expect(response.status).toBe(200)
  expect(response.headers.getSetCookie()).toContain(
    "better-auth.session_token=fixture; Path=/; HttpOnly; SameSite=Lax",
  )
  expect(signIn.mock.lastCall?.[0]).toMatchObject({
    body: { email: "owner@example.com" },
    returnHeaders: true,
  })
  expect(findMembership.mock.lastCall?.[0]).toMatchObject({
    where: {
      userId: "fixture-user",
      status: "ACTIVE",
      tenant: { isActive: true },
    },
  })
  expect(await response.json()).toMatchObject({ dashboardUrl: "/" })
})

test("rejects malformed input before authentication", async () => {
  expect((await POST(request({ email: "bad" }))).status).toBe(400)
  expect(signIn).not.toHaveBeenCalled()
})

test("keeps authentication errors generic", async () => {
  signIn.mockRejectedValueOnce(new Error("fixture authentication failure"))
  const response = await POST(
    request({ email: "owner@example.com", password: "fixture-password" }),
  )
  expect(response.status).toBe(401)
  expect(findMembership).not.toHaveBeenCalled()
  expect(await response.json()).toMatchObject({
    error: "Invalid email or password.",
  })
})

test("accounts without an active workspace receive an actionable error", async () => {
  findMembership.mockResolvedValueOnce(null)
  const response = await POST(
    request({ email: "owner@example.com", password: "fixture-password" }),
  )
  expect(response.status).toBe(403)
  expect((await response.json()).error).toContain("request early access")
})
