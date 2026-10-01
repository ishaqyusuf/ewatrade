export const PRODUCTION_ANDROID_APP_LINK = Object.freeze({
  url: "https://chat.ewatrade.com/.well-known/assetlinks.json",
  packageName: "com.ewatrade.app",
  // Public Play App Signing certificate, read from this app's Play Console.
  certificateSha256:
    "32:A2:98:58:17:C5:A8:FC:41:8C:29:4B:72:54:E6:8A:83:84:D0:96:8D:6E:F6:ED:E8:A0:AD:92:83:88:85:2C",
})

export function validateProductionAndroidAppLinks(input) {
  if (input.redirected || (input.status >= 300 && input.status < 400))
    return "PRODUCTION_ANDROID_APP_LINK_REDIRECT"
  if (input.status !== 200) return "PRODUCTION_ANDROID_APP_LINK_UNAVAILABLE"
  if (!/^application\/json(?:\s*;|\s*$)/i.test(input.contentType ?? ""))
    return "PRODUCTION_ANDROID_APP_LINK_CONTENT_TYPE"

  let statements
  try {
    statements = JSON.parse(input.body)
  } catch {
    return "PRODUCTION_ANDROID_APP_LINK_INVALID_JSON"
  }
  if (!Array.isArray(statements) || statements.length !== 1)
    return "PRODUCTION_ANDROID_APP_LINK_STATEMENT_MISMATCH"

  const [statement] = statements
  const target = statement?.target
  if (
    !Array.isArray(statement?.relation) ||
    statement.relation.length !== 1 ||
    statement.relation[0] !== "delegate_permission/common.handle_all_urls" ||
    target?.namespace !== "android_app" ||
    target.package_name !== PRODUCTION_ANDROID_APP_LINK.packageName ||
    !Array.isArray(target.sha256_cert_fingerprints) ||
    target.sha256_cert_fingerprints.length !== 1 ||
    target.sha256_cert_fingerprints[0] !==
      PRODUCTION_ANDROID_APP_LINK.certificateSha256
  )
    return "PRODUCTION_ANDROID_APP_LINK_STATEMENT_MISMATCH"

  return null
}
