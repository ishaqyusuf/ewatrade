import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { testFlightProductionFailures } from "./check-testflight-production.mjs"

const eas = JSON.parse(
  readFileSync(new URL("../apps/mobile/eas.json", import.meta.url), "utf8"),
)
const env = {
  ...eas.build["testflight-production"].env,
  APP_ENV: "production",
  DEV_PROFILE: "prod",
  EAS_BUILD_PROFILE: "testflight-production",
  APP_STORE_REVIEW_SANDBOX_ENABLED: "true",
  APP_STORE_SANDBOX_FORWARD_ENABLED: "true",
  APP_STORE_REVIEW_OWNER_IDS: JSON.stringify(["review-owner-123"]),
  OWNER_BILLING_ENABLED: "true",
  STORE_BILLING_ENABLED: "true",
  STORE_BILLING_ENVIRONMENT: "production",
  STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "false",
}
const app = {
  ios: { bundleIdentifier: "com.ewatrade.app" },
  owner: "cipron-startups",
  plugins: ["expo-iap"],
  extra: {
    appVariant: "production",
    eas: { projectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b" },
  },
}
const scope = { softwarePlanPurchases: true }
const check = (changed = {}) =>
  testFlightProductionFailures({ env, app, eas, scope, ...changed })

async function actualAppConfig(
  changes: Record<string, string | undefined> = {},
) {
  const selected: Record<string, string | undefined> = { ...env, ...changes }
  const previous = Object.fromEntries(
    Object.keys(selected).map((key) => [key, process.env[key]]),
  )
  try {
    for (const [key, value] of Object.entries(selected)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    // Bun caches dynamic config by path, including imports with query strings.
    // Clear this one owned module so each case evaluates its actual target.
    delete require.cache[require.resolve("../apps/mobile/app.config.ts")]
    return require("../apps/mobile/app.config.ts").default
  } finally {
    delete require.cache[require.resolve("../apps/mobile/app.config.ts")]
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("actual Production TestFlight preflight imports the real dynamic Expo config", async () => {
  expect(check({ app: await actualAppConfig() })).toEqual([])
})

test("actual Expo config preserves Preview and ordinary Production identities and refuses unintended TestFlight variants", async () => {
  const preview = await actualAppConfig({
    ...eas.build["testflight-preview"].env,
    APP_VARIANT: "preview",
    EXPO_PUBLIC_APP_VARIANT: "preview",
    EAS_BUILD_PROFILE: "testflight-preview",
  })
  expect(preview.ios.bundleIdentifier).toBe("com.ewatrade.app")
  expect(preview.extra.appVariant).toBe("preview")
  const production = await actualAppConfig({
    IOS_TESTFLIGHT: undefined,
    EAS_BUILD_PROFILE: "production",
  })
  expect(production.ios.bundleIdentifier).toBe("com.ewatrade.app")
  expect(production.extra.appVariant).toBe("production")
  for (const changes of [
    { EAS_BUILD_PROFILE: "production" },
    { EAS_BUILD_PROFILE: undefined },
    { APP_VARIANT: "development", EXPO_PUBLIC_DASHBOARD_URL: undefined },
  ]) {
    await expect(actualAppConfig(changes)).rejects.toThrow(
      "TestFlight requires",
    )
  }
})

test("private paid TestFlight uses Production identity/services and a separate channel", () => {
  expect(check()).toEqual([])
  for (const key of Object.keys(eas.build["testflight-production"].env).filter(
    (k) => k.endsWith("URL") || k.endsWith("ORIGIN"),
  )) {
    for (const value of [
      "https://preview-api.ewatrade.com",
      "https://api.ewatrade.com@evil.test",
      `${env[key]}/path`,
      `${env[key]}?token=test`,
    ])
      expect(check({ env: { ...env, [key]: value } }).length).toBeGreaterThan(0)
  }
})

test("public checkout, broad/absent reviewer scope and client-side authorization fail closed", () => {
  for (const changed of [
    { STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "true" },
    { STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: undefined },
    { APP_STORE_REVIEW_SANDBOX_ENABLED: "false" },
    { APP_STORE_SANDBOX_FORWARD_ENABLED: "false" },
    { APP_STORE_SANDBOX_FORWARD_ENABLED: undefined },
    { APP_STORE_REVIEW_OWNER_IDS: "[]" },
    { APP_STORE_REVIEW_OWNER_IDS: '["*"]' },
    { APP_STORE_REVIEW_OWNER_IDS: '["reviewer@example.com"]' },
    { APP_STORE_REVIEW_OWNER_IDS: '["review-owner-123","review-owner-123"]' },
    { OWNER_BILLING_ENABLED: "false" },
    { STORE_BILLING_ENABLED: "false" },
    { APP_ENV: "preview" },
    {
      APP_STORE_REVIEW_OWNER_IDS: JSON.stringify(
        Array.from({ length: 6 }, (_, i) => `review-owner-${i}`),
      ),
    },
    { STORE_BILLING_ENVIRONMENT: "sandbox" },
    { IOS_TESTFLIGHT: undefined },
    { EAS_BUILD_PROFILE: "production" },
    { APP_VARIANT: "preview" },
    { DEV_PROFILE: "preview" },
  ])
    expect(check({ env: { ...env, ...changed } }).length).toBeGreaterThan(0)
  const changed = structuredClone(eas)
  changed.build["testflight-production"].env.APP_STORE_REVIEW_OWNER_IDS =
    '["review-owner-123"]'
  expect(check({ eas: changed }).length).toBeGreaterThan(0)
  expect(
    check({ scope: { softwarePlanPurchases: false } }).length,
  ).toBeGreaterThan(0)
  expect(check({ app: { ...app, plugins: [] } }).length).toBeGreaterThan(0)
})

test("wrong signing/distribution/project and ordinary channels cannot qualify", () => {
  for (const mutate of [
    (e: typeof eas) => {
      e.build["testflight-production"].channel = "production"
    },
    (e: typeof eas) => {
      e.build["testflight-production"].channel = "testflight-preview"
    },
    (e: typeof eas) => {
      e.build["testflight-production"].environment = "preview"
    },
    (e: typeof eas) => {
      e.build["testflight-production"].distribution = "internal"
    },
    (e: typeof eas) => {
      e.build["testflight-production"].ios.simulator = true
    },
    (e: typeof eas) => {
      e.build["testflight-production"].credentialsSource = "remote"
    },
    (e: typeof eas) => {
      e.submit["testflight-production"].ios.ascAppId = "wrong"
    },
    (e: typeof eas) => {
      e.submit["testflight-production"].ios.appleTeamId = "wrong"
    },
    (e: typeof eas) => {
      e.submit["testflight-production"].ios.bundleIdentifier = "com.other.app"
    },
  ]) {
    const changed = structuredClone(eas)
    mutate(changed)
    expect(check({ eas: changed }).length).toBeGreaterThan(0)
  }
  expect(check({ app: { ...app, owner: "other" } }).length).toBeGreaterThan(0)
  expect(
    check({
      app: { ...app, ios: { bundleIdentifier: "com.ewatrade.preview" } },
    }).length,
  ).toBeGreaterThan(0)
})
