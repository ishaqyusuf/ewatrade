import { expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import { readFileSync } from "node:fs"
import playPreview from "../apps/mobile/play-preview.cjs"
import {
  playPreviewFailures,
  playPreviewSigningFailures,
} from "./check-play-preview.mjs"

const eas = JSON.parse(
  readFileSync(new URL("../apps/mobile/eas.json", import.meta.url), "utf8"),
)
const key = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey.export({ type: "pkcs8", format: "pem" })
const credential = JSON.stringify({
  type: "service_account",
  client_email: "fixture@fixture.iam.gserviceaccount.com",
  private_key: key,
})
const env = {
  ...eas.build["play-preview"].env,
  EAS_BUILD_PROFILE: "play-preview",
  EAS_BUILD_PLATFORM: "android",
  OWNER_BILLING_ENABLED: "true",
  STORE_BILLING_ENABLED: "true",
  STORE_BILLING_ENVIRONMENT: "sandbox",
  STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "false",
  PLAY_PACKAGE_NAME: "com.ewatrade.app",
  STORE_SUBSCRIPTION_PRODUCTS: readFileSync(
    new URL("../docs/billing/play-subscription-products.json", import.meta.url),
    "utf8",
  ),
  PLAY_NOTIFICATION_AUDIENCE:
    "https://preview-api.ewatrade.com/webhooks/store/google",
  PLAY_NOTIFICATION_SERVICE_EMAIL: "fixture@fixture.iam.gserviceaccount.com",
  PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: credential,
}

let configSequence = 0
async function configFor(configEnv: NodeJS.ProcessEnv) {
  const names = [
    ...new Set([...Object.keys(process.env), ...Object.keys(configEnv)]),
  ].filter((name) =>
    /^(APP_ENV|APP_VARIANT|EXPO_PUBLIC_|EAS_BUILD_|DEV_PROFILE|ANDROID_PLAY_TEST|IOS_TESTFLIGHT)/.test(
      name,
    ),
  )
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  )
  try {
    for (const name of names) {
      if (configEnv[name] === undefined) delete process.env[name]
      else process.env[name] = configEnv[name]
    }
    const { default: app } = await import(
      `../apps/mobile/app.config.ts?play-preview-case=${configSequence++}`
    )
    return { app, exit: 0, err: "" }
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
}

test("real Expo config borrows Android identity only, isolates native fingerprint inputs and disables OTA", async () => {
  const { app, exit, err } = await configFor(env)
  expect(exit, err).toBe(0)
  expect(playPreviewFailures({ env, app, eas })).toEqual([])
  expect(app.android.package).toBe("com.ewatrade.app")
  expect(app.ios.bundleIdentifier).toBe("com.ewatrade.preview")
  expect(app.updates.enabled).toBe(false)
  expect(app.runtimeVersion).toEqual({ policy: "fingerprint" })
  const normal = await configFor({ APP_VARIANT: "preview" })
  expect(normal.exit, normal.err).toBe(0)
  expect(normal.app.android.package).toBe("com.ewatrade.preview")
  expect(normal.app.scheme).not.toBe(app.scheme)
  expect(normal.app.updates.enabled).toBeUndefined()
  const production = await configFor({ APP_VARIANT: "production" })
  expect(production.exit, production.err).toBe(0)
  expect(production.app.android.package).toBe("com.ewatrade.app")
  expect(production.app.scheme).not.toBe(app.scheme)
})

test("rejects wrong platform, opt-in, profile, variant and every unreviewed origin before config resolves", () => {
  for (const bad of [
    { ANDROID_PLAY_TEST: undefined },
    { EAS_BUILD_PROFILE: "production" },
    { EAS_BUILD_PLATFORM: "ios" },
    { IOS_TESTFLIGHT: "1" },
    { APP_ENV: "production" },
    { DEV_PROFILE: "prod" },
    { APP_VARIANT: "production" },
    { EXPO_PUBLIC_APP_VARIANT: "production" },
    ...Object.keys(playPreview.PLAY_PREVIEW_ORIGINS).map((key) => ({
      [key]: "https://api.ewatrade.com",
    })),
  ])
    expect(() => playPreview.isPlayPreviewBuild({ ...env, ...bad })).toThrow()
  expect(playPreview.isPlayPreviewBuild({ APP_VARIANT: "production" })).toBe(
    false,
  )
})

test("rejects incomplete or Production billing, foreign catalog, credentials and RTDN configuration", async () => {
  const { app } = await configFor(env)
  for (const bad of [
    { STORE_BILLING_ENVIRONMENT: "production" },
    { OWNER_BILLING_ENABLED: "false" },
    { STORE_BILLING_ENABLED: "false" },
    { STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "true" },
    { APP_STORE_REVIEW_SANDBOX_ENABLED: "true" },
    { PLAY_PACKAGE_NAME: "com.ewatrade.preview" },
    { STORE_SUBSCRIPTION_PRODUCTS: "[]" },
    {
      STORE_SUBSCRIPTION_PRODUCTS: env.STORE_SUBSCRIPTION_PRODUCTS.replace(
        "starter.monthly",
        "foreign.monthly",
      ),
    },
    {
      PLAY_NOTIFICATION_AUDIENCE:
        "https://api.ewatrade.com/webhooks/store/google",
    },
    { PLAY_NOTIFICATION_SERVICE_EMAIL: "owner@example.test" },
    { PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: "{}" },
    {
      PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: "",
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
    },
  ])
    expect(
      playPreviewFailures({ env: { ...env, ...bad }, app, eas }).length,
    ).toBeGreaterThan(0)
  expect(
    playPreviewFailures(
      {
        env: {
          ...env,
          PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: "",
          GOOGLE_APPLICATION_CREDENTIALS: "/fixture/key.json",
        },
        app,
        eas,
      },
      () => credential,
    ),
  ).toEqual([])
  expect(
    playPreviewFailures(
      {
        env: {
          ...env,
          PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: "",
          GOOGLE_APPLICATION_CREDENTIALS: "/fixture/key.json",
        },
        app,
        eas,
      },
      () => "{}",
    ).length,
  ).toBeGreaterThan(0)
})

test("rejects profile/publication mutations and identity/runtime drift", async () => {
  const { app } = await configFor(env)
  for (const patch of [
    { distribution: "internal" },
    { environment: "production" },
    { channel: "production" },
    { credentialsSource: "remote" },
    { android: { buildType: "apk" } },
    { extends: "production" },
    {
      env: {
        ...eas.build["play-preview"].env,
        EXPO_PUBLIC_API_URL: "https://api.ewatrade.com",
      },
    },
  ]) {
    const bad = structuredClone(eas)
    Object.assign(bad.build["play-preview"], patch)
    expect(playPreviewFailures({ env, app, eas: bad }).length).toBeGreaterThan(
      0,
    )
  }
  const submit = structuredClone(eas)
  submit.submit["play-preview"] = { android: { track: "internal" } }
  expect(playPreviewFailures({ env, app, eas: submit }).length).toBeGreaterThan(
    0,
  )
  for (const patch of [
    { android: { package: "com.ewatrade.preview" } },
    { updates: { enabled: true } },
    { runtimeVersion: "production" },
    { owner: "other" },
    { scheme: "ewatrade" },
  ])
    expect(
      playPreviewFailures({ env, app: { ...app, ...patch }, eas }).length,
    ).toBeGreaterThan(0)
})

test("local signing guard checks the registered certificate with password only in child environment", () => {
  const password = "fixture-only-password"
  const source = JSON.stringify({
    android: {
      keystore: {
        keystorePath: "fixture.jks",
        keyAlias: "fixture",
        keystorePassword: password,
      },
    },
  })
  const fingerprint =
    "61:53:76:C3:C2:03:52:20:23:0F:D6:45:C2:70:63:00:26:BD:0D:FF:BB:62:72:2B:88:CF:10:39:6A:D5:40:9E"
  const failures = playPreviewSigningFailures(
    "/fixture/credentials.json",
    () => source,
    (command, args, options) => {
      expect(command).toBe("keytool")
      expect(args).toContain("/fixture/fixture.jks")
      expect(args).toContain("-storepass:env")
      expect(args.join(" ")).not.toContain(password)
      expect(options.env.EWATRADE_PLAY_PREVIEW_KEYSTORE_PASSWORD).toBe(password)
      expect(options.timeout).toBe(10000)
      return { status: 0, stdout: `SHA256: ${fingerprint}` }
    },
  )
  expect(failures).toEqual([])
  for (const result of [
    { status: 1, stdout: "" },
    { status: 0, stdout: "SHA256: wrong" },
    { status: 0, stdout: `SHA256: ${fingerprint.replace("61:", "62:")}` },
  ])
    expect(
      playPreviewSigningFailures(
        "/fixture/credentials.json",
        () => source,
        () => result,
      ).length,
    ).toBeGreaterThan(0)
  expect(
    playPreviewSigningFailures("/fixture/credentials.json", () => "{}").length,
  ).toBeGreaterThan(0)
})
