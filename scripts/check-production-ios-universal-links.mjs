import {
  PRODUCTION_IOS_UNIVERSAL_LINK,
  validateProductionIosUniversalLinks,
} from "./production-ios-universal-links.mjs"

try {
  const response = await fetch(PRODUCTION_IOS_UNIVERSAL_LINK.url, {
    headers: { Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  })
  const failure = validateProductionIosUniversalLinks({
    status: response.status,
    redirected: response.redirected,
    contentType: response.headers.get("content-type"),
    body: await response.text(),
  })
  if (failure) throw new Error(failure)
  console.log("Production iOS Universal Link association passed.")
} catch (error) {
  console.error(
    "Production iOS Universal Link association failed:",
    error instanceof Error ? error.message : "UNKNOWN_ERROR",
  )
  process.exitCode = 1
}
