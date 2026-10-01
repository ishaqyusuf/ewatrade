import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { PRODUCTION_IOS_UNIVERSAL_LINK } from "./production-ios-universal-links.mjs"

const expected = Object.freeze({
  appId: "6815837585",
  bundleId: "com.ewatrade.app",
  teamId: "ZXC78SPCV4",
  expoProjectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b",
  expoOwner: "cipron-startups",
})

export function productionIosIdentityFailures({ env, app, eas, association }) {
  const failures = []
  if (env.APP_ENV !== "production" || env.DEV_PROFILE !== "prod")
    failures.push("Production profile is required.")
  if (
    env.APP_VARIANT !== "production" ||
    env.EXPO_PUBLIC_APP_VARIANT !== "production"
  )
    failures.push("Production app variant is required.")
  if (env.APPLE_SIGN_IN_TEAM_ID !== expected.teamId)
    failures.push("Apple Sign in team does not match the organization.")
  if (env.APPLE_BUNDLE_ID !== expected.bundleId)
    failures.push("Apple billing bundle does not match the release bundle.")
  if (env.APPLE_APP_ID !== expected.appId)
    failures.push("Apple App Store Connect ID does not match the release app.")
  if (app.ios?.bundleIdentifier !== expected.bundleId)
    failures.push("Resolved Expo iOS bundle does not match the release app.")
  if (
    app.owner !== expected.expoOwner ||
    app.extra?.eas?.projectId !== expected.expoProjectId
  )
    failures.push("Resolved Expo project does not match the release project.")
  if (app.extra?.appVariant !== "production")
    failures.push("Resolved Expo variant is not Production.")
  if (
    eas.build?.production?.environment !== "production" ||
    eas.build?.production?.channel !== "production"
  )
    failures.push("EAS Production build target is inconsistent.")
  if (association.appID !== `${expected.teamId}.${expected.bundleId}`)
    failures.push(
      "Universal Link team and bundle do not match the release app.",
    )
  return failures
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    // Resolve the same dynamic Expo config that EAS will use, after the runner
    // has selected its exact Production environment and variant.
    const { default: app } = await import("../apps/mobile/app.config.ts")
    const eas = JSON.parse(
      readFileSync(new URL("../apps/mobile/eas.json", import.meta.url), "utf8"),
    )
    const failures = productionIosIdentityFailures({
      env: process.env,
      app,
      eas,
      association: PRODUCTION_IOS_UNIVERSAL_LINK,
    })
    if (failures.length) {
      for (const failure of failures) console.error(`- ${failure}`)
      process.exitCode = 1
    } else {
      console.log("Production iOS organization app identity preflight passed.")
    }
  } catch (error) {
    console.error(
      "Production iOS organization app identity preflight failed:",
      error instanceof Error ? error.message : "UNKNOWN_ERROR",
    )
    process.exitCode = 1
  }
}
