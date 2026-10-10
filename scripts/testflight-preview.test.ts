import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { testFlightPreviewFailures } from "./check-testflight-preview.mjs"
const eas = JSON.parse(
  readFileSync(new URL("../apps/mobile/eas.json", import.meta.url), "utf8"),
)
const env = {
  IOS_TESTFLIGHT: "1",
  APP_VARIANT: "preview",
  EXPO_PUBLIC_APP_VARIANT: "preview",
  APP_ENV: "preview",
  EXPO_PUBLIC_API_URL: "https://preview-api.ewatrade.com",
  EXPO_PUBLIC_BASE_URL: "https://preview-marketing.ewatrade.com",
  EXPO_PUBLIC_WEB_URL: "https://preview-marketing.ewatrade.com",
  EXPO_PUBLIC_LEGAL_ORIGIN: "https://ewatrade.com",
  EXPO_PUBLIC_CHAT_URL: "https://preview-storefront.ewatrade.com",
  EXPO_PUBLIC_DASHBOARD_URL: "https://preview-dashboard.ewatrade.com",
}
const app = {
  ios: { bundleIdentifier: "com.ewatrade.app" },
  owner: "cipron-startups",
  extra: {
    appVariant: "preview",
    eas: { projectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b" },
  },
}
test("allows only existing Apple identity with Preview services and isolated channel", () => {
  expect(testFlightPreviewFailures({ env, app, eas })).toEqual([])
  for (const key of Object.keys(env).filter(
    (k) => k.startsWith("EXPO_PUBLIC_") && k.endsWith("URL"),
  )) {
    expect(
      testFlightPreviewFailures({
        env: { ...env, [key]: "https://api.ewatrade.com" },
        app,
        eas,
      }).length,
    ).toBeGreaterThan(0)
  }
  for (const bad of [
    "",
    "http://preview-api.ewatrade.com",
    "https://preview-api.ewatrade.com@evil.test",
    "https://preview-api.ewatrade.com/path",
  ]) {
    expect(
      testFlightPreviewFailures({
        env: { ...env, EXPO_PUBLIC_API_URL: bad },
        app,
        eas,
      }).length,
    ).toBeGreaterThan(0)
  }
})
test("rejects simulator, ordinary Preview bundle, Production channel and wrong app", () => {
  expect(
    testFlightPreviewFailures({
      env,
      eas,
      app: { ...app, ios: { bundleIdentifier: "com.ewatrade.preview" } },
    }).length,
  ).toBeGreaterThan(0)
  for (const mutation of [
    (e: typeof eas) => {
      e.build["testflight-preview"].ios.simulator = true
    },
    (e: typeof eas) => {
      e.build["testflight-preview"].channel = "production"
    },
    (e: typeof eas) => {
      e.build["testflight-preview"].distribution = "internal"
    },
    (e: typeof eas) => {
      e.submit["testflight-preview"].ios.ascAppId = "wrong"
    },
  ]) {
    const changed = structuredClone(eas)
    mutation(changed)
    expect(
      testFlightPreviewFailures({ env, app, eas: changed }).length,
    ).toBeGreaterThan(0)
  }
})
for (const args of [
  ["build", "--prod", "--platform", "ios", "--ios-testflight"],
  ["build", "--preview", "--platform", "android", "--ios-testflight"],
  ["update", "--preview", "--platform", "ios", "--ios-testflight"],
  [
    "build",
    "--preview",
    "--platform",
    "ios",
    "--ios-testflight",
    "--ios-simulator",
  ],
])
  test(`rejects invalid route ${args.join(" ")}`, async () => {
    const p = Bun.spawn(
      ["bun", "--env-file=/dev/null", "scripts/eas-account-runner.ts", ...args],
      { stdout: "pipe", stderr: "pipe" },
    )
    expect(await p.exited).not.toBe(0)
    expect(await new Response(p.stderr).text()).toContain(
      "--ios-testflight requires",
    )
  })
