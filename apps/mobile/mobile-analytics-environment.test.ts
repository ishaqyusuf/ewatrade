import { expect, test } from "bun:test"

const { resolveMobileAnalyticsEnvironment } =
  require("./mobile-analytics-environment.cjs") as {
    resolveMobileAnalyticsEnvironment: (env: NodeJS.ProcessEnv) => string
  }

test("mobile analytics requires explicit recognized Production build identity", () => {
  for (const env of [
    {},
    { APP_ENV: "" },
    { APP_ENV: "unknown" },
    { EAS_BUILD_PROFILE: "unrecognized" },
    { APP_VARIANT: "production " },
  ])
    expect(resolveMobileAnalyticsEnvironment(env)).toBe("disabled")
  for (const env of [
    { APP_ENV: "production" },
    { DEV_PROFILE: "prod" },
    { EAS_BUILD_PROFILE: "production" },
    { EAS_BUILD_PROFILE: "production-apk" },
    { APP_VARIANT: "production", APP_ENV: "production" },
  ])
    expect(resolveMobileAnalyticsEnvironment(env)).toBe("production")
})

test("any preview, dev, TestFlight or conflicting signal denies collection", () => {
  const keys = [
    "APP_ENV",
    "DEV_PROFILE",
    "APP_VARIANT",
    "EXPO_PUBLIC_APP_VARIANT",
    "EAS_BUILD_PROFILE",
  ]
  for (const key of keys)
    for (const value of [
      "preview",
      "development",
      "local",
      "testflight-preview",
    ])
      expect(
        resolveMobileAnalyticsEnvironment({
          APP_VARIANT: "production",
          [key]: value,
        }),
      ).toBe("disabled")
  expect(
    resolveMobileAnalyticsEnvironment({
      APP_ENV: "production",
      IOS_TESTFLIGHT: "1",
    }),
  ).toBe("disabled")
  expect(
    resolveMobileAnalyticsEnvironment({
      EAS_BUILD_PROFILE: "preview",
      APP_ENV: "production",
    }),
  ).toBe("disabled")
})
