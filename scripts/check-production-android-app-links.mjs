import {
  PRODUCTION_ANDROID_APP_LINK,
  validateProductionAndroidAppLinks,
} from "./production-android-app-links.mjs"

try {
  const response = await fetch(PRODUCTION_ANDROID_APP_LINK.url, {
    headers: { Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  })
  const failure = validateProductionAndroidAppLinks({
    status: response.status,
    redirected: response.redirected,
    contentType: response.headers.get("content-type"),
    body: await response.text(),
  })
  if (failure) throw new Error(failure)
  console.log("Production Android App Link association passed.")
} catch (error) {
  console.error(
    "Production Android App Link association failed:",
    error instanceof Error ? error.message : "UNKNOWN_ERROR",
  )
  process.exitCode = 1
}
