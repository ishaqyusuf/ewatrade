import { expect, test } from "bun:test"
import { onboardingAppAssociations } from "./onboarding-app-association"

const fingerprint = Array(32).fill("AB").join(":")
test("only the selected app owns setup and verification links", () => {
  for (const [APP_ENV, suffix] of [
    ["production", "app"],
    ["preview", "preview"],
    ["local", "dev"],
  ]) {
    const result = onboardingAppAssociations({
      APP_ENV,
      EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS: `ABCDE12345.com.ewatrade.${suffix}`,
      EWATRADE_ANDROID_APP_LINK_PACKAGE_NAMES: `com.ewatrade.${suffix}`,
      EWATRADE_ANDROID_APP_LINK_CERTIFICATE_SHA256: fingerprint,
    })
    expect(result.apple?.applinks.details[0]?.paths).toEqual([
      "/signup",
      "/api/early-access/verify",
    ])
    expect(result.android?.[0]?.target.package_name).toBe(
      `com.ewatrade.${suffix}`,
    )
  }
})

test("missing, mixed or cross-environment signing evidence cannot claim links", () => {
  for (const APP_ENV of [undefined, "preview", "unknown"]) {
    expect(
      onboardingAppAssociations({
        APP_ENV,
        EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS:
          "ABCDE12345.com.ewatrade.app",
        EWATRADE_ANDROID_APP_LINK_PACKAGE_NAMES: "com.ewatrade.app",
        EWATRADE_ANDROID_APP_LINK_CERTIFICATE_SHA256: fingerprint,
      }),
    ).toEqual({ apple: null, android: null })
  }
  expect(
    onboardingAppAssociations({ APP_ENV: "production", VERCEL_ENV: "preview" }),
  ).toEqual({ apple: null, android: null })
  expect(
    onboardingAppAssociations({
      APP_ENV: "preview",
      EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS:
        "ABCDE12345.com.ewatrade.preview,ABCDE12345.com.ewatrade.app",
    }).apple,
  ).toBeNull()
})

test("configured Dashboard base paths match native association paths", () => {
  expect(
    onboardingAppAssociations({
      APP_ENV: "preview",
      NEXT_PUBLIC_DASHBOARD_URL: "https://preview.example.com/setup/",
      EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS:
        "ABCDE12345.com.ewatrade.preview",
    }).apple?.applinks.details[0]?.paths,
  ).toEqual(["/setup/signup", "/setup/api/early-access/verify"])
  expect(
    onboardingAppAssociations({
      APP_ENV: "preview",
      EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS:
        "ABCDE12345XcomXewatradeXpreview",
    }).apple,
  ).toBeNull()
})
