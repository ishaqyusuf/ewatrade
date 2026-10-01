import { describe, expect, test } from "bun:test"
import { validateProductionApiHostConfiguration } from "../../../scripts/production-api-readiness.mjs"
import {
  probeProductionApi,
  validateProductionApiConfiguration,
} from "./production-api-readiness.mjs"

describe("production mobile API readiness", () => {
  test("host preflight requires one configured production API origin", () => {
    const env = {
      API_URL: "https://api.ewatrade.example",
      NEXT_PUBLIC_API_URL: "https://api.ewatrade.example",
      VERCEL_API_HEALTH_URL: "https://api.ewatrade.example",
    }
    expect(validateProductionApiHostConfiguration(env)).toEqual({
      origin: "https://api.ewatrade.example",
      failures: [],
    })
    expect(
      validateProductionApiHostConfiguration({
        ...env,
        VERCEL_API_HEALTH_URL: "https://ewatrade.example",
      }).failures,
    ).toContain("root VERCEL_API_HEALTH_URL must match API_URL.")
  })

  test("requires one bare HTTPS API origin across root and mobile configs", () => {
    const root = {
      API_URL: "https://api.ewatrade.example",
      NEXT_PUBLIC_API_URL: "https://api.ewatrade.example",
    }
    const mobile = { EXPO_PUBLIC_API_URL: "https://api.ewatrade.example" }
    expect(validateProductionApiConfiguration(root, mobile)).toEqual({
      origin: "https://api.ewatrade.example",
      failures: [],
    })
    expect(
      validateProductionApiConfiguration(root, {
        EXPO_PUBLIC_API_URL: "https://marketing.ewatrade.example",
      }).failures,
    ).toContain("mobile EXPO_PUBLIC_API_URL must match root API_URL.")
    expect(
      validateProductionApiConfiguration(
        { ...root, API_URL: "http://api.ewatrade.example/api" },
        mobile,
      ).failures,
    ).toContain("root API_URL must be a public bare HTTPS origin.")
    expect(
      validateProductionApiConfiguration(
        { ...root, API_URL: "https://localhost" },
        mobile,
      ).failures,
    ).toContain("root API_URL must be a public bare HTTPS origin.")
  })

  test("requires database-backed health and auth JSON from the exact origin", async () => {
    const paths = []
    const validFetch = async (url, options) => {
      paths.push(new URL(url).pathname)
      expect(options.redirect).toBe("manual")
      return Response.json(
        url.endsWith("/health")
          ? { status: "ok", database: { accounts: 0 } }
          : url.endsWith("/api/trpc/auth.legalPublication")
            ? {
                result: {
                  data: {
                    json: {
                      effective: false,
                      signupAvailable: false,
                      version: null,
                      effectiveDate: null,
                    },
                  },
                },
              }
            : null,
      )
    }
    expect(
      await probeProductionApi("https://api.ewatrade.example", validFetch),
    ).toEqual([])
    expect(paths).toEqual([
      "/health",
      "/api/auth/get-session",
      "/api/trpc/auth.legalPublication",
    ])

    const marketingFetch = async (url) =>
      url.endsWith("/health")
        ? new Response(null, { status: 302, headers: { location: "/" } })
        : new Response("<html>Not Found</html>", {
            status: 404,
            headers: { "content-type": "text/html" },
          })
    expect(
      await probeProductionApi("https://ewatrade.example", marketingFetch),
    ).toEqual([
      "/health did not return API JSON 200 without a redirect.",
      "/api/auth/get-session did not return API JSON 200 without a redirect.",
      "/api/trpc/auth.legalPublication did not return API JSON 200 without a redirect.",
    ])
  })

  test("rejects generic JSON at the mobile tRPC path", async () => {
    const genericJson = async (url) =>
      Response.json(
        url.endsWith("/health")
          ? { status: "ok", database: { accounts: 0 } }
          : null,
      )
    expect(
      await probeProductionApi("https://api.ewatrade.example", genericJson),
    ).toEqual(["/api/trpc/auth.legalPublication returned unexpected API JSON."])
  })
})
