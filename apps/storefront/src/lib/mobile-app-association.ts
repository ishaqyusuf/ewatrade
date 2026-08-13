const storeEntryPaths = ["/r/*"] as const

function commaSeparated(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function createAppleAppSiteAssociation(value: string | undefined) {
  const appIDs = commaSeparated(value).filter((appID) =>
    /^[A-Z0-9]{10}\.com\.ewatrade\.(?:app|dev)$/.test(appID),
  )
  if (appIDs.length === 0) return null

  return {
    applinks: {
      details: appIDs.map((appID) => ({ appID, paths: [...storeEntryPaths] })),
    },
  }
}

export function createAndroidAssetLinks(
  value: string | undefined,
  packageValue = "com.ewatrade.app",
) {
  const fingerprints = commaSeparated(value).filter((fingerprint) =>
    /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint),
  )
  if (fingerprints.length === 0) return null

  const packageNames = commaSeparated(packageValue).filter((packageName) =>
    /^com\.ewatrade\.(?:app|dev)$/.test(packageName),
  )
  if (packageNames.length === 0) return null

  return packageNames.map((packageName) => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  }))
}
