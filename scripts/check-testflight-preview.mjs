import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function testFlightPreviewFailures({ env, app, eas }) {
  const failures = []
  const build = eas.build?.["testflight-preview"]
  const submit = eas.submit?.["testflight-preview"]?.ios
  if (
    env.IOS_TESTFLIGHT !== "1" ||
    env.APP_VARIANT !== "preview" ||
    env.EXPO_PUBLIC_APP_VARIANT !== "preview" ||
    env.APP_ENV !== "preview"
  )
    failures.push("Preview runtime and explicit TestFlight opt-in are required")
  if (
    app.ios?.bundleIdentifier !== "com.ewatrade.app" ||
    app.extra?.appVariant !== "preview"
  )
    failures.push(
      "TestFlight requires the existing Apple bundle and Preview runtime",
    )
  if (
    app.owner !== "cipron-startups" ||
    app.extra?.eas?.projectId !== "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b"
  )
    failures.push("Unexpected Expo project")
  if (
    build?.extends !== "preview" ||
    build?.environment !== "preview" ||
    eas.build?.preview?.environment !== "preview" ||
    build?.distribution !== "store" ||
    build?.channel !== "testflight-preview" ||
    build?.ios?.simulator !== false ||
    build?.env?.IOS_TESTFLIGHT !== "1"
  )
    failures.push(
      "TestFlight profile must use Preview services, a separate channel and store/device distribution",
    )
  if (
    submit?.ascAppId !== "6815837585" ||
    submit?.appleTeamId !== "ZXC78SPCV4" ||
    submit?.bundleIdentifier !== "com.ewatrade.app"
  )
    failures.push("Submission identity does not match EwaTrade")
  if (env.EXPO_PUBLIC_API_URL !== "https://preview-api.ewatrade.com")
    failures.push("API must be the isolated Preview API")
  for (const key of [
    "EXPO_PUBLIC_BASE_URL",
    "EXPO_PUBLIC_WEB_URL",
    "EXPO_PUBLIC_CHAT_URL",
    "EXPO_PUBLIC_DASHBOARD_URL",
  ]) {
    try {
      const url = new URL(env[key])
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        !(
          (url.hostname.startsWith("preview-") &&
            url.hostname.endsWith(".ewatrade.com")) ||
          (url.hostname.startsWith("ewatrade-") &&
            url.hostname.endsWith("-ishaqyusufs-projects.vercel.app"))
        )
      )
        throw new Error("Invalid Preview URL")
    } catch {
      failures.push(`${key} must identify an isolated Preview service`)
    }
  }
  // Public legal documents are shared read-only content, not a data backend.
  if (env.EXPO_PUBLIC_LEGAL_ORIGIN !== "https://ewatrade.com")
    failures.push("Use the effective shared public legal publication")
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
  const failures = testFlightPreviewFailures({ env: process.env, app, eas })
  if (failures.length) {
    console.error(failures.join("\n"))
    process.exitCode = 1
  } else
    console.log(
      "Preview TestFlight identity, service isolation and profile checks passed.",
    )
}
