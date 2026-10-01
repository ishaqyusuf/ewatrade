import { describe, expect, test } from "bun:test"
import { createAppleAppSiteAssociation } from "../apps/storefront/src/lib/mobile-app-association.ts"
import {
  PRODUCTION_IOS_UNIVERSAL_LINK,
  validateProductionIosUniversalLinks,
} from "./production-ios-universal-links.mjs"

const validBody = JSON.stringify(
  createAppleAppSiteAssociation(PRODUCTION_IOS_UNIVERSAL_LINK.appID),
)

function check(overrides = {}) {
  return validateProductionIosUniversalLinks({
    status: 200,
    redirected: false,
    contentType: "application/json; charset=utf-8",
    body: validBody,
    ...overrides,
  })
}

describe("Production iOS Universal Link association", () => {
  test("requires a direct JSON response from the customer chat host", () => {
    expect(check()).toBeNull()
    expect(check({ status: 503 })).toBe(
      "PRODUCTION_IOS_UNIVERSAL_LINK_UNAVAILABLE",
    )
    expect(check({ status: 308 })).toBe(
      "PRODUCTION_IOS_UNIVERSAL_LINK_REDIRECT",
    )
    expect(check({ contentType: "text/html" })).toBe(
      "PRODUCTION_IOS_UNIVERSAL_LINK_CONTENT_TYPE",
    )
    expect(check({ body: "not JSON" })).toBe(
      "PRODUCTION_IOS_UNIVERSAL_LINK_INVALID_JSON",
    )
  })

  test("rejects another team, extra app or broader paths", () => {
    const app = JSON.parse(validBody).applinks.details[0]
    expect(
      check({
        body: JSON.stringify({
          applinks: {
            details: [{ ...app, appID: "ABCDE12345.com.ewatrade.app" }],
          },
        }),
      }),
    ).toBe("PRODUCTION_IOS_UNIVERSAL_LINK_APP_MISMATCH")
    expect(
      check({
        body: JSON.stringify({ applinks: { details: [app, app] } }),
      }),
    ).toBe("PRODUCTION_IOS_UNIVERSAL_LINK_APP_MISMATCH")
    expect(
      check({
        body: JSON.stringify({
          applinks: { details: [{ ...app, paths: ["/*"] }] },
        }),
      }),
    ).toBe("PRODUCTION_IOS_UNIVERSAL_LINK_APP_MISMATCH")
    expect(
      check({
        body: JSON.stringify({
          applinks: { details: [{ ...app, components: [{ "/": "/*" }] }] },
        }),
      }),
    ).toBe("PRODUCTION_IOS_UNIVERSAL_LINK_APP_MISMATCH")
    expect(
      check({
        body: JSON.stringify({
          applinks: { details: [app], defaults: { caseSensitive: false } },
        }),
      }),
    ).toBe("PRODUCTION_IOS_UNIVERSAL_LINK_APP_MISMATCH")
  })
})
