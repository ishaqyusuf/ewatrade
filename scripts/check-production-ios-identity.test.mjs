import { expect, test } from "bun:test"
import { productionIosIdentityFailures } from "./check-production-ios-identity.mjs"

const valid = {
  env: {
    APP_ENV: "production",
    DEV_PROFILE: "prod",
    APP_VARIANT: "production",
    EXPO_PUBLIC_APP_VARIANT: "production",
    APPLE_SIGN_IN_TEAM_ID: "ZXC78SPCV4",
    APPLE_BUNDLE_ID: "com.ewatrade.app",
    APPLE_APP_ID: "6815837585",
  },
  app: {
    ios: { bundleIdentifier: "com.ewatrade.app" },
    owner: "cipron-startups",
    extra: {
      appVariant: "production",
      eas: { projectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b" },
    },
  },
  eas: {
    build: { production: { environment: "production", channel: "production" } },
  },
  association: { appID: "ZXC78SPCV4.com.ewatrade.app" },
}

test("accepts the verified organization iOS release identity", () => {
  expect(productionIosIdentityFailures(valid)).toEqual([])
})

test.each([
  ["Apple team", { env: { ...valid.env, APPLE_SIGN_IN_TEAM_ID: "OTHERTEAM" } }],
  [
    "App Store Connect app",
    { env: { ...valid.env, APPLE_APP_ID: "1234567890" } },
  ],
  [
    "Apple billing bundle",
    { env: { ...valid.env, APPLE_BUNDLE_ID: "com.other.app" } },
  ],
  [
    "resolved Expo bundle",
    { app: { ...valid.app, ios: { bundleIdentifier: "com.other.app" } } },
  ],
  ["resolved Expo project", { app: { ...valid.app, owner: "other-owner" } }],
  [
    "EAS build target",
    {
      eas: {
        build: {
          production: { environment: "preview", channel: "production" },
        },
      },
    },
  ],
  [
    "Universal Link team",
    { association: { appID: "OTHERTEAM.com.ewatrade.app" } },
  ],
])("blocks a mismatched %s", (_label, change) => {
  expect(productionIosIdentityFailures({ ...valid, ...change })).not.toEqual([])
})
