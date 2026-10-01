const productionPackage = "com.ewatrade.app"
const productionAppleAppId = 6815837585

export function requireAppleStoreIdentity(
  bundleId: string,
  appId: number | undefined,
  production: boolean,
) {
  if (
    bundleId !== productionPackage ||
    (production && appId !== productionAppleAppId)
  )
    throw new Error("Apple billing app identity does not match this release.")
}

export function requirePlayStorePackage(packageName: string | undefined) {
  if (packageName?.trim() !== productionPackage)
    throw new Error(
      "Google Play billing app identity does not match this release.",
    )
  return productionPackage
}
