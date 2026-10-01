import { describe, expect, test } from "bun:test"

import {
  createAndroidAssetLinks,
  createAppleAppSiteAssociation,
} from "./mobile-app-association"

describe("mobile app association", () => {
  test("allows only the EwaTrade customer routes for configured iOS apps", () => {
    expect(
      createAppleAppSiteAssociation(
        "ABCDE12345.com.ewatrade.app, invalid, ABCDE12345.com.ewatrade.dev, ABCDE12345.com.ewatrade.preview",
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
          {
            appID: "ABCDE12345.com.ewatrade.preview",
            paths: ["/r/*"],
          },
        ],
      },
    })
  })

  test("fails closed when association evidence is absent or malformed", () => {
    expect(createAppleAppSiteAssociation(undefined)).toBeNull()
    const fingerprint = Array.from({ length: 32 }, () => "AB").join(":")
    expect(createAndroidAssetLinks("not-a-fingerprint", "com.ewatrade.app")).toBeNull()
    expect(createAndroidAssetLinks(fingerprint, undefined)).toBeNull()
  })

  test("projects only configured Android certificate fingerprints", () => {
    const fingerprint = Array.from({ length: 32 }, () => "AB").join(":")
    expect(createAndroidAssetLinks(fingerprint, "com.ewatrade.app")).toEqual([
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

  test("supports only the production, development and preview EwaTrade packages", () => {
    const fingerprint = Array.from({ length: 32 }, () => "CD").join(":")
    const links = createAndroidAssetLinks(
      fingerprint,
      "com.ewatrade.app,com.ewatrade.dev,com.ewatrade.preview,com.attacker.app",
    )
    expect(links?.map((link) => link.target.package_name)).toEqual([
      "com.ewatrade.app",
      "com.ewatrade.dev",
      "com.ewatrade.preview",
    ])
  })

  test("projects the signed Preview package with only its configured fingerprint", () => {
    const fingerprint = Array.from({ length: 32 }, () => "3F").join(":")
    expect(createAndroidAssetLinks(fingerprint, "com.ewatrade.preview")).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.ewatrade.preview",
          sha256_cert_fingerprints: [fingerprint],
        },
      },
    ])
  })
})
