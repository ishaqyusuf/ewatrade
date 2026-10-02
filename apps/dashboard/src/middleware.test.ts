import { expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { middleware } from "./middleware"

function request(path: string, cookie?: string) {
  return new NextRequest(`https://ewatrade-dashboard.localhost${path}`, {
    headers: {
      host: "ewatrade-dashboard.localhost",
      ...(cookie ? { cookie } : {}),
    },
  })
}

test("dashboard login is public without redirecting to itself", () => {
  expect(middleware(request("/login")).headers.get("location")).toBeNull()
})

test("staff token onboarding is public without an existing session", () => {
  expect(
    middleware(request("/staff-onboarding?inviteToken=fixture")).headers.get(
      "location",
    ),
  ).toBeNull()
})

test("protected routes stay on dashboard sign-in and preserve the requested query", () => {
  const location = middleware(request("/inventory?view=stock")).headers.get(
    "location",
  )
  const url = new URL(location ?? "")
  expect(url.origin).toBe("https://ewatrade-dashboard.localhost")
  expect(url.pathname).toBe("/login")
  expect(url.searchParams.get("next")).toBe("/inventory?view=stock")
})

test("a present session reaches full server-side validation", () => {
  expect(
    middleware(
      request("/inventory", "better-auth.session_token=fixture"),
    ).headers.get("location"),
  ).toBeNull()
})
