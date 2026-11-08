import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { appStoreReviewOwnerIds } from "../packages/db/src/queries/owner-billing/review-environment.ts"

export function testFlightProductionFailures({ env, app, eas, scope }) {
  const failures = []
  const profile = eas.build?.["testflight-production"]
  const submit = eas.submit?.["testflight-production"]?.ios
  if (
    appStoreReviewOwnerIds(env).length === 0 ||
    env.STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED !== "false" ||
    env.APP_STORE_SANDBOX_FORWARD_ENABLED !== "true"
  )
    failures.push(
      "Production TestFlight requires the bounded Apple Sandbox reviewer scope with public checkout closed.",
    )
  for (const key of [
    "APP_STORE_REVIEW_OWNER_IDS",
    "APP_STORE_REVIEW_SANDBOX_ENABLED",
    "APP_STORE_SANDBOX_FORWARD_ENABLED",
    "OWNER_BILLING_ENABLED",
    "STORE_BILLING_ENABLED",
    "STORE_BILLING_ENVIRONMENT",
    "STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED",
  ]) {
    if (Object.hasOwn(profile?.env ?? {}, key))
      failures.push(
        "Reviewer authorization belongs to server configuration, not the client build profile.",
      )
  }
  if (
    env.IOS_TESTFLIGHT !== "1" ||
    env.APP_ENV !== "production" ||
    env.DEV_PROFILE !== "prod" ||
    env.APP_VARIANT !== "production" ||
    env.EXPO_PUBLIC_APP_VARIANT !== "production" ||
    env.EAS_BUILD_PROFILE !== "testflight-production"
  )
    failures.push("Explicit Production TestFlight target is required.")
  if (
    app.ios?.bundleIdentifier !== "com.ewatrade.app" ||
    app.extra?.appVariant !== "production" ||
    app.owner !== "cipron-startups" ||
    app.extra?.eas?.projectId !== "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b"
  )
    failures.push(
      "TestFlight must use the registered Production app and Expo project.",
    )
  if (
    profile?.extends !== "production" ||
    profile?.environment !== "production" ||
    profile?.distribution !== "store" ||
    profile?.channel !== "testflight-production" ||
    profile?.credentialsSource !== "local" ||
    profile?.ios?.simulator !== false ||
    profile?.env?.IOS_TESTFLIGHT !== "1" ||
    profile?.env?.APP_VARIANT !== "production" ||
    profile?.env?.EXPO_PUBLIC_APP_VARIANT !== "production" ||
    eas.build?.production?.environment !== "production" ||
    eas.build?.production?.channel !== "production"
  )
    failures.push(
      "Production TestFlight needs its isolated channel and reviewed local signing profile.",
    )
  if (
    submit?.ascAppId !== "6815837585" ||
    submit?.appleTeamId !== "ZXC78SPCV4" ||
    submit?.bundleIdentifier !== "com.ewatrade.app"
  )
    failures.push("TestFlight upload identity does not match EwaTrade.")
  for (const [key, expected] of Object.entries({
    EXPO_PUBLIC_API_URL: "https://api.ewatrade.com",
    EXPO_PUBLIC_BASE_URL: "https://dash.ewatrade.com",
    EXPO_PUBLIC_WEB_URL: "https://dash.ewatrade.com",
    EXPO_PUBLIC_DASHBOARD_URL: "https://dash.ewatrade.com",
    EXPO_PUBLIC_CHAT_URL: "https://chat.ewatrade.com",
    EXPO_PUBLIC_LEGAL_ORIGIN: "https://ewatrade.com",
  })) {
    if (env[key] !== expected || profile?.env?.[key] !== expected)
      failures.push(`${key} must match the reviewed Production origin.`)
  }
  if (
    !scope ||
    Object.keys(scope).join(",") !== "softwarePlanPurchases" ||
    scope.softwarePlanPurchases !== true
  )
    failures.push(
      "The paid TestFlight candidate must include software plan purchases.",
    )
  if (
    !app.plugins?.some(
      (plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === "expo-iap",
    )
  )
    failures.push(
      "The paid TestFlight candidate must include the native IAP plugin.",
    )
  return failures
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { default: app } = await import("../apps/mobile/app.config.ts")
  const eas = JSON.parse(
    readFileSync(new URL("../apps/mobile/eas.json", import.meta.url), "utf8"),
  )
  const scope = JSON.parse(
    readFileSync(
      new URL("../apps/mobile/mobile-release-scope.json", import.meta.url),
      "utf8",
    ),
  )
  const failures = testFlightProductionFailures({
    env: process.env,
    app,
    eas,
    scope,
  })
  if (failures.length) {
    console.error(failures.join("\n"))
    process.exitCode = 1
  } else
    console.log(
      "Private Production TestFlight target validated; Sandbox server, signed payment, privacy and public release acceptance remain required.",
    )
}
