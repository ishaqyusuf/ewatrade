import { describe, expect, test } from "bun:test"

import {
  createAndroidAssetLinks,
  createAppleAppSiteAssociation,
} from "./mobile-app-association"

describe("mobile app association", () => {
  test("allows only the EwaTrade customer routes for configured iOS apps", () => {
    expect(
      createAppleAppSiteAssociation(
        "ABCDE12345.com.ewatrade.app, invalid, ABCDE12345.com.ewatrade.dev",
      ),
    ).toEqual({
      applinks: {
        details: [
          {
            appID: "ABCDE12345.com.ewatrade.app",
            paths: ["/r/*"],
          },
          {
            appID: "ABCDE12345.com.ewatrade.dev",
            paths: ["/r/*"],
          },
        ],
      },
    })
  })

  test("fails closed when association evidence is absent or malformed", () => {
    expect(createAppleAppSiteAssociation(undefined)).toBeNull()
    expect(createAndroidAssetLinks("not-a-fingerprint")).toBeNull()
  })

  test("projects only configured Android certificate fingerprints", () => {
    const fingerprint = Array.from({ length: 32 }, () => "AB").join(":")
    expect(createAndroidAssetLinks(fingerprint)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.ewatrade.app",
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ])
  })

  test("supports only the production and development EwaTrade packages", () => {
    const fingerprint = Array.from({ length: 32 }, () => "CD").join(":")
    const links = createAndroidAssetLinks(
      fingerprint,
      "com.ewatrade.app,com.ewatrade.dev,com.attacker.app",
    )
    expect(links?.map((link) => link.target.package_name)).toEqual([
      "com.ewatrade.app",
      "com.ewatrade.dev",
    ])
  })
})
