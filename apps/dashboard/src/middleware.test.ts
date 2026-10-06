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

test("exact public app-association paths are available without login", () => {
  for (const path of [
    "/.well-known/apple-app-site-association",
    "/.well-known/assetlinks.json",
  ])
    expect(middleware(request(path)).headers.get("location")).toBeNull()
  for (const path of [
    "/.well-known/private",
    "/.well-known/assetlinks.json/extra",
  ])
    expect(middleware(request(path)).headers.get("location")).not.toBeNull()
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

test("the versioned login logo and favicon can load without a session", () => {
  for (const path of [
    "/brand/ewatrade-logo-precision-rise-v1.svg",
    "/brand/ewatrade-logo-precision-rise-v1-reverse.svg",
    "/brand/ewatrade-mark-precision-rise-v1.png",
    "/favicon.png",
  ]) {
    expect(middleware(request(path)).headers.get("location")).toBeNull()
  }
})

test("the public logo exception grants no access to other brand paths or writes", () => {
  for (const path of [
    "/brand/customer-receipt.png",
    "/brand/ewatrade-logo-precision-rise-v1.svg/private",
    "/brand/ewatrade-logo-precision-rise-v2.svg",
  ]) {
    expect(middleware(request(path)).headers.get("location")).toContain(
      "/login",
    )
  }
  const post = new NextRequest(
    "https://ewatrade-dashboard.localhost/brand/ewatrade-logo-precision-rise-v1.svg",
    { method: "POST", headers: { host: "ewatrade-dashboard.localhost" } },
  )
  expect(middleware(post).headers.get("location")).toContain("/login")
})

test("signup and its exact fonts are public while neighboring routes stay protected", () => {
  for (const path of [
    "/signup?access_token=ea_fixture",
    "/shop-v3/cal-sans.woff2",
    "/shop-v3/inter-regular.ttf",
  ])
    expect(middleware(request(path)).headers.get("location")).toBeNull()
  for (const path of [
    "/signup/private",
    "/signup-other",
    "/shop-v3/private.ttf",
  ])
    expect(middleware(request(path)).headers.get("location")).toContain(
      "/login",
    )
})

test("only the deployment's own Vercel Preview host reaches dashboard auth", () => {
  const priorEnv = process.env.VERCEL_ENV
  const priorUrl = process.env.VERCEL_URL
  const host = "ewatrade-dashboard-fixture.vercel.app"
  try {
    process.env.VERCEL_ENV = "preview"
    process.env.VERCEL_URL = host
    const req = (hostname: string, path: string) =>
      new NextRequest(`https://${hostname}${path}`, {
        headers: { host: hostname },
      })
    expect(middleware(req(host, "/login")).headers.get("location")).toBeNull()
    expect(middleware(req(host, "/inventory")).headers.get("location")).toBe(
      `https://${host}/login?next=%2Finventory`,
    )
    expect(
      middleware(req("unrelated.vercel.app", "/login")).headers.get("location"),
    ).not.toBeNull()
    process.env.VERCEL_ENV = "production"
    expect(
      middleware(req(host, "/login")).headers.get("location"),
    ).not.toBeNull()
  } finally {
    if (priorEnv === undefined)
      Reflect.deleteProperty(process.env, "VERCEL_ENV")
    else process.env.VERCEL_ENV = priorEnv
    if (priorUrl === undefined)
      Reflect.deleteProperty(process.env, "VERCEL_URL")
    else process.env.VERCEL_URL = priorUrl
  }
})
