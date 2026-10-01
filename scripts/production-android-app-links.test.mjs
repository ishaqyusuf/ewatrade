import { describe, expect, test } from "bun:test"
import {
  PRODUCTION_ANDROID_APP_LINK,
  validateProductionAndroidAppLinks,
} from "./production-android-app-links.mjs"

const validBody = JSON.stringify([
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: PRODUCTION_ANDROID_APP_LINK.packageName,
      sha256_cert_fingerprints: [PRODUCTION_ANDROID_APP_LINK.certificateSha256],
    },
  },
])

function check(overrides = {}) {
  return validateProductionAndroidAppLinks({
    status: 200,
    redirected: false,
    contentType: "application/json; charset=utf-8",
    body: validBody,
    ...overrides,
  })
}

describe("Production Android App Link association", () => {
  test("accepts only the Play-signed Production app", () => {
    expect(check()).toBeNull()
    expect(check({ status: 503 })).toBe(
      "PRODUCTION_ANDROID_APP_LINK_UNAVAILABLE",
    )
    expect(check({ status: 308 })).toBe("PRODUCTION_ANDROID_APP_LINK_REDIRECT")
    expect(check({ contentType: "text/html" })).toBe(
      "PRODUCTION_ANDROID_APP_LINK_CONTENT_TYPE",
    )
    expect(check({ body: "not JSON" })).toBe(
      "PRODUCTION_ANDROID_APP_LINK_INVALID_JSON",
    )
  })

  test("rejects another app, signing key or extra association", () => {
    const statement = JSON.parse(validBody)[0]
    expect(
      check({
        body: JSON.stringify([
          {
            ...statement,
            target: {
              ...statement.target,
              package_name: "com.ewatrade.preview",
            },
          },
        ]),
      }),
    ).toBe("PRODUCTION_ANDROID_APP_LINK_STATEMENT_MISMATCH")
    expect(
      check({
        body: JSON.stringify([
          {
            ...statement,
            target: {
              ...statement.target,
              sha256_cert_fingerprints: ["61:53:76:C3"],
            },
          },
        ]),
      }),
    ).toBe("PRODUCTION_ANDROID_APP_LINK_STATEMENT_MISMATCH")
    expect(check({ body: JSON.stringify([statement, statement]) })).toBe(
      "PRODUCTION_ANDROID_APP_LINK_STATEMENT_MISMATCH",
    )
  })
})
