export const PRODUCTION_IOS_UNIVERSAL_LINK = Object.freeze({
  url: "https://chat.ewatrade.com/.well-known/apple-app-site-association",
  appID: "ZXC78SPCV4.com.ewatrade.app",
  paths: ["/r/*"],
})

export function validateProductionIosUniversalLinks(input) {
  if (input.redirected || (input.status >= 300 && input.status < 400))
    return "PRODUCTION_IOS_UNIVERSAL_LINK_REDIRECT"
  if (input.status !== 200) return "PRODUCTION_IOS_UNIVERSAL_LINK_UNAVAILABLE"
  if (!/^application\/json(?:\s*;|\s*$)/i.test(input.contentType ?? ""))
    return "PRODUCTION_IOS_UNIVERSAL_LINK_CONTENT_TYPE"

  let association
  try {
    association = JSON.parse(input.body)
  } catch {
    return "PRODUCTION_IOS_UNIVERSAL_LINK_INVALID_JSON"
  }

  const applinks = association?.applinks
  if (
    !applinks ||
    typeof applinks !== "object" ||
    Array.isArray(applinks) ||
    Object.keys(applinks).length !== 1
  )
    return "PRODUCTION_IOS_UNIVERSAL_LINK_APP_MISMATCH"

  const details = applinks.details
  if (!Array.isArray(details) || details.length !== 1)
    return "PRODUCTION_IOS_UNIVERSAL_LINK_APP_MISMATCH"

  const [app] = details
  if (
    !app ||
    typeof app !== "object" ||
    Array.isArray(app) ||
    Object.keys(app).length !== 2 ||
    app?.appID !== PRODUCTION_IOS_UNIVERSAL_LINK.appID ||
    !Array.isArray(app.paths) ||
    app.paths.length !== 1 ||
    app.paths[0] !== PRODUCTION_IOS_UNIVERSAL_LINK.paths[0]
  )
    return "PRODUCTION_IOS_UNIVERSAL_LINK_APP_MISMATCH"

  return null
}
