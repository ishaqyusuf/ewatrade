import { describe, expect, test } from "bun:test"
import {
  probeProductionLegal,
  validateProductionLegalConfiguration,
} from "./production-legal-readiness.mjs"

const origin = "https://ewatrade.com"
const version = "2026-10-01"
const effectiveDate = "2026-10-01"
const documentHash = "a".repeat(64)
const approvedPublication = { version, effectiveDate, documentHash }
const titles = {
  terms: "Terms of Service",
  privacy: "Privacy Notice",
  support: "Support and contact",
  "delete-account": "Delete your EwaTrade account",
  "billing-policy": "Software billing policy",
}

function routedResponse(
  path,
  body,
  type,
  finalUrl = `https://www.ewatrade.com${path}`,
  status = 200,
  headers = {},
) {
  const response = new Response(body, {
    status,
    headers: { "content-type": type, ...headers },
  })
  Object.defineProperty(response, "url", { value: finalUrl })
  return response
}

function publicSite(overrides = {}) {
  return async (url, options) => {
    expect(options.redirect).toBe("follow")
    const path = new URL(url).pathname
    if (overrides[path]) return overrides[path]
    if (path === "/api/legal-publication")
      return routedResponse(
        path,
        JSON.stringify({
          approved: true,
          signupAvailable: true,
          version,
          effectiveDate,
          documentHash,
        }),
        "application/json",
      )
    if (path === "/api/trpc/accountPrivacy.externalIntakeAvailability")
      return routedResponse(
        path,
        JSON.stringify({ result: { data: { json: { available: true } } } }),
        "application/json",
      )
    const title = titles[path.slice(1)]
    return routedResponse(
      path,
      `<html><h1>${title}</h1><p>Version ${version} · Effective ${effectiveDate}</p>${path === "/delete-account" ? '<form><input id="deletion-email" type="email"></form>' : ""}</html>`,
      "text/html",
    )
  }
}

describe("production legal publication readiness", () => {
  test("requires the exact production mobile legal origin on the Marketing host", () => {
    const root = { NEXT_PUBLIC_MARKETING_URL: origin }
    expect(
      validateProductionLegalConfiguration(root, {
        EXPO_PUBLIC_LEGAL_ORIGIN: "https://www.ewatrade.com",
      }),
    ).toEqual({ origin: "https://www.ewatrade.com", failures: [] })
    expect(validateProductionLegalConfiguration(root, {}).failures).toContain(
      "mobile EXPO_PUBLIC_LEGAL_ORIGIN is missing.",
    )
    expect(
      validateProductionLegalConfiguration(root, {
        EXPO_PUBLIC_LEGAL_ORIGIN: "https://foreign.example",
      }).failures,
    ).toContain(
      "mobile EXPO_PUBLIC_LEGAL_ORIGIN must match the Marketing origin or its www host.",
    )
    expect(
      validateProductionLegalConfiguration(root, {
        EXPO_PUBLIC_LEGAL_ORIGIN: "http://ewatrade.com/terms",
      }).failures,
    ).toContain(
      "mobile EXPO_PUBLIC_LEGAL_ORIGIN must be a bare public HTTPS origin.",
    )
  })

  test("accepts approved effective pages at the public www redirect destination", async () => {
    expect(
      await probeProductionLegal(
        origin,
        approvedPublication,
        publicSite(),
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toEqual([])
  })

  test("accepts React server-rendered text boundaries in the approved version", async () => {
    const fetchImpl = publicSite({
      "/privacy": routedResponse(
        "/privacy",
        `<html><h1>Privacy Notice</h1><p>Version <!-- -->${version}<!-- --> · Effective ${effectiveDate}</p></html>`,
        "text/html",
      ),
    })
    expect(
      await probeProductionLegal(origin, approvedPublication, fetchImpl),
    ).toEqual([])
  })

  test("rejects a version that appears only inside an HTML comment", async () => {
    const fetchImpl = publicSite({
      "/privacy": routedResponse(
        "/privacy",
        `<html><h1>Privacy Notice</h1><!-- Version ${version} --><p>Version old · Effective ${effectiveDate}</p></html>`,
        "text/html",
      ),
    })
    expect(
      await probeProductionLegal(origin, approvedPublication, fetchImpl),
    ).toEqual([
      "/privacy does not render the approved, indexable legal version.",
    ])
  })

  test("rejects a draft publication before reading any page", async () => {
    const paths = []
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname
      paths.push(path)
      return routedResponse(
        path,
        JSON.stringify({ approved: false, version: null, effectiveDate: null }),
        "application/json",
      )
    }
    expect(
      await probeProductionLegal(origin, approvedPublication, fetchImpl),
    ).toEqual([
      "Legal publication is not approved and effective on the public host.",
    ])
    expect(paths).toEqual(["/api/legal-publication"])
  })

  test("rejects a live digest that differs from the approved source before reading pages", async () => {
    const paths = []
    const source = publicSite({
      "/api/legal-publication": routedResponse(
        "/api/legal-publication",
        JSON.stringify({
          approved: true,
          signupAvailable: true,
          version,
          effectiveDate,
          documentHash: "b".repeat(64),
        }),
        "application/json",
      ),
    })
    const fetchImpl = async (...args) => {
      paths.push(new URL(args[0]).pathname)
      return source(...args)
    }
    expect(
      await probeProductionLegal(
        origin,
        approvedPublication,
        fetchImpl,
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toEqual([
      "The public legal publication differs from the approved source snapshot.",
    ])
    expect(paths).toEqual(["/api/legal-publication"])
  })

  test("rejects a public status that cannot offer signup", async () => {
    const fetchImpl = publicSite({
      "/api/legal-publication": routedResponse(
        "/api/legal-publication",
        JSON.stringify({
          approved: true,
          signupAvailable: false,
          version,
          effectiveDate,
          documentHash,
        }),
        "application/json",
      ),
    })
    expect(
      await probeProductionLegal(
        origin,
        approvedPublication,
        fetchImpl,
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toEqual([
      "Legal publication is not approved and effective on the public host.",
    ])
  })

  test("rejects marketing 404, foreign redirects and stale page content", async () => {
    const fetchImpl = publicSite({
      "/terms": routedResponse(
        "/terms",
        "Not found",
        "text/html",
        "https://www.ewatrade.com/terms",
        404,
      ),
      "/privacy": routedResponse(
        "/privacy",
        "<h1>Privacy Notice</h1>",
        "text/html",
        "https://www.ewatrade.com:444/privacy",
      ),
      "/support": routedResponse(
        "/support",
        "<h1>Support and contact</h1>Version old",
        "text/html",
      ),
    })
    expect(
      await probeProductionLegal(
        origin,
        approvedPublication,
        fetchImpl,
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toEqual([
      "/terms must return HTML 200 from the EwaTrade public host.",
      "/privacy must return HTML 200 from the EwaTrade public host.",
      "/support does not render the approved, indexable legal version.",
    ])
  })

  test("rejects an approved deletion page without the external request form", async () => {
    const fetchImpl = publicSite({
      "/delete-account": routedResponse(
        "/delete-account",
        `<html><h1>Delete your EwaTrade account</h1><p>Version ${version} · Effective ${effectiveDate}</p></html>`,
        "text/html",
      ),
    })
    expect(
      await probeProductionLegal(
        origin,
        approvedPublication,
        fetchImpl,
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toEqual([
      "/delete-account does not expose the verified external request form.",
    ])
  })

  test("rejects header-level noindex on a legal page", async () => {
    const fetchImpl = publicSite({
      "/privacy": routedResponse(
        "/privacy",
        `<html><h1>Privacy Notice</h1><p>Version ${version} · Effective ${effectiveDate}</p></html>`,
        "text/html",
        "https://www.ewatrade.com/privacy",
        200,
        { "x-robots-tag": "googlebot: noindex, nofollow" },
      ),
    })
    expect(
      await probeProductionLegal(
        origin,
        approvedPublication,
        fetchImpl,
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toEqual([
      "/privacy does not render the approved, indexable legal version.",
    ])
  })

  test("rejects a visible deletion form when the public API intake is disabled", async () => {
    const path = "/api/trpc/accountPrivacy.externalIntakeAvailability"
    const fetchImpl = publicSite({
      [path]: routedResponse(
        path,
        JSON.stringify({ result: { data: { json: { available: false } } } }),
        "application/json",
      ),
    })
    expect(
      await probeProductionLegal(
        origin,
        approvedPublication,
        fetchImpl,
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toEqual(["The public account-deletion intake API is not ready."])
  })

  test("rejects an unavailable or foreign account-deletion intake API", async () => {
    const path = "/api/trpc/accountPrivacy.externalIntakeAvailability"
    for (const response of [
      routedResponse(path, "Not found", "text/html", undefined, 404),
      routedResponse(
        path,
        JSON.stringify({ result: { data: { json: { available: true } } } }),
        "application/json",
        "https://foreign.example/api/trpc/accountPrivacy.externalIntakeAvailability",
      ),
    ]) {
      const fetchImpl = publicSite({ [path]: response })
      expect(
        await probeProductionLegal(
          origin,
          approvedPublication,
          fetchImpl,
          new Date("2026-10-02T00:00:00Z"),
        ),
      ).toEqual(["The public account-deletion intake API is unavailable."])
    }
  })
})
