import { describe, expect, test } from "bun:test"
import {
  assistantWorkerEndpoint,
  assistantWorkerHeaders,
} from "./assistant-worker-endpoint"

const host = "ewatrade-api-fixture123-ishaqyusufs-projects.vercel.app"
const preview = {
  APP_ENV: "preview",
  API_URL: `https://${host}`,
  INTERNAL_API_KEY: "fixture-machine-key",
  ASSISTANT_API_PROTECTION_BYPASS_SECRET: "fixture-protection-key",
  ASSISTANT_API_PROTECTION_BYPASS_HOST: host,
}

describe("assistant worker protected Preview endpoint", () => {
  test("uses only fixed machine routes and header-based protection credentials", () => {
    for (const route of ["channel-turn", "channel-delivery"] as const) {
      const endpoint = assistantWorkerEndpoint(route, preview)
      expect(endpoint.url.href).toBe(
        `https://${host}/api/internal/assistant/${route}`,
      )
      expect(assistantWorkerHeaders(endpoint)).toEqual({
        "Content-Type": "application/json",
        "x-internal-key": preview.INTERNAL_API_KEY,
        "x-vercel-protection-bypass":
          preview.ASSISTANT_API_PROTECTION_BYPASS_SECRET,
      })
      expect(endpoint.url.href).not.toContain("fixture-protection-key")
    }
  })

  test("refuses partial, non-Preview, foreign, redirected and non-root configuration", () => {
    for (const change of [
      { APP_ENV: "production" },
      { APP_ENV: "local" },
      { ASSISTANT_API_PROTECTION_BYPASS_SECRET: "" },
      { ASSISTANT_API_PROTECTION_BYPASS_HOST: "" },
      { ASSISTANT_API_PROTECTION_BYPASS_HOST: `${host}.evil.test` },
      { API_URL: `http://${host}` },
      { API_URL: `https://${host}:8443` },
      { API_URL: `https://${host}/foreign` },
      { API_URL: `https://${host}?secret=fixture-protection-key` },
      { API_URL: `https://${host}#fragment` },
      { API_URL: `https://user:pass@${host}` },
      {
        API_URL: "https://foreign.vercel.app",
        ASSISTANT_API_PROTECTION_BYPASS_HOST: "foreign.vercel.app",
      },
      { ASSISTANT_API_PROTECTION_BYPASS_SECRET: "fixture\r\nheader" },
    ]) {
      let failure = ""
      try {
        assistantWorkerEndpoint("channel-turn", { ...preview, ...change })
      } catch (error) {
        failure = String(error)
      }
      expect(failure).toContain("Assistant worker")
      expect(failure).not.toContain("fixture-protection-key")
      expect(failure).not.toContain(host)
    }
  })

  test("keeps normal Production and local machine requests free of bypass headers", () => {
    for (const env of [
      { APP_ENV: "production", API_URL: "https://api.ewatrade.com" },
      { APP_ENV: "local", API_URL: "http://api.localhost:3001" },
    ]) {
      const endpoint = assistantWorkerEndpoint("channel-turn", {
        ...env,
        INTERNAL_API_KEY: "fixture-machine-key",
      })
      expect(assistantWorkerHeaders(endpoint)).toEqual({
        "Content-Type": "application/json",
        "x-internal-key": "fixture-machine-key",
      })
    }
  })
})
