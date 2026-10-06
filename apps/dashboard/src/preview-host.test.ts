import { expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { middleware } from "./middleware"

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
