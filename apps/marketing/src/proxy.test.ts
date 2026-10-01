import { afterEach, expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { proxy } from "./proxy"

const previousVercelEnv = process.env.VERCEL_ENV
const previousAppEnv = process.env.APP_ENV

afterEach(() => {
  process.env.VERCEL_ENV = previousVercelEnv
  process.env.APP_ENV = previousAppEnv
})

test("preview serves legal drafts but denies data APIs and page mutations", async () => {
  process.env.VERCEL_ENV = "preview"
  process.env.APP_ENV = undefined

  for (const [method, path] of [
    ["GET", "/api/trpc/accountPrivacy.legalStatus"],
    ["POST", "/api/waitlist"],
    ["POST", "/signup"],
  ]) {
    const response = proxy(
      new NextRequest(`https://preview.example${path}`, { method }),
    )
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
  }

  for (const path of ["/privacy", "/api/legal-publication"]) {
    const response = proxy(new NextRequest(`https://preview.example${path}`))
    expect(response.headers.get("x-middleware-next")).toBe("1")
  }
})

test("production keeps the existing API routes available", () => {
  process.env.VERCEL_ENV = "production"
  process.env.APP_ENV = undefined

  const response = proxy(
    new NextRequest("https://www.ewatrade.com/api/early-access", {
      method: "POST",
    }),
  )
  expect(response.headers.get("x-middleware-next")).toBe("1")
})
