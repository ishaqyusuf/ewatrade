import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parsePlayPublisherServiceAccount } from "../apps/api/src/billing/google-publisher-credentials.ts"
import { getStoreProducts } from "../apps/api/src/billing/store-products.ts"
import playPreview from "../apps/mobile/play-preview.cjs"

const { PLAY_PREVIEW_PROFILE, PLAY_PREVIEW_ORIGINS, isPlayPreviewBuild } =
  playPreview

/** Offline configuration proof only; hosted permissions and RTDN delivery remain acceptance gates. */
export function playPreviewFailures({ env, app, eas }, read = readFileSync) {
  const failures = []
  try {
    if (!isPlayPreviewBuild(env)) throw new Error("Not opted in")
  } catch {
    failures.push(
      "Explicit Android Play Preview profile and exact isolated origins are required.",
    )
  }
  const profile = eas.build?.[PLAY_PREVIEW_PROFILE]
  if (
    profile?.extends !== "preview" ||
    eas.build?.preview?.environment !== "preview" ||
    profile?.environment !== "preview" ||
    profile?.distribution !== "store" ||
    profile?.channel !== PLAY_PREVIEW_PROFILE ||
    profile?.credentialsSource !== "local" ||
    profile?.android?.buildType !== "app-bundle" ||
    profile?.env?.ANDROID_PLAY_TEST !== "1" ||
    profile?.env?.APP_ENV !== "preview" ||
    profile?.env?.DEV_PROFILE !== "preview" ||
    profile?.env?.APP_VARIANT !== "preview" ||
    profile?.env?.EXPO_PUBLIC_APP_VARIANT !== "preview" ||
    Object.entries(PLAY_PREVIEW_ORIGINS).some(
      ([key, value]) => profile?.env?.[key] !== value,
    ) ||
    eas.submit?.[PLAY_PREVIEW_PROFILE]
  )
    failures.push(
      "Use the reviewed store AAB/local-credential Preview profile; no submit profile is allowed.",
    )
  if (
    app.android?.package !== "com.ewatrade.app" ||
    app.ios?.bundleIdentifier !== "com.ewatrade.preview" ||
    app.scheme !== "ewatrade-play-preview" ||
    app.extra?.appVariant !== "preview" ||
    app.extra?.buildPurpose !== PLAY_PREVIEW_PROFILE ||
    app.updates?.enabled !== false ||
    app.extra?.autoUpdateOnForeground !== false ||
    app.runtimeVersion?.policy !== "fingerprint" ||
    app.owner !== "cipron-startups" ||
    app.extra?.eas?.projectId !== "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b"
  )
    failures.push(
      "Registered Android identity, Preview services, fingerprint runtime and disabled OTA are required.",
    )
  if (
    env.STORE_BILLING_ENVIRONMENT !== "sandbox" ||
    env.OWNER_BILLING_ENABLED !== "true" ||
    env.STORE_BILLING_ENABLED !== "true" ||
    env.STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED === "true" ||
    env.APP_STORE_REVIEW_SANDBOX_ENABLED === "true" ||
    env.PLAY_PACKAGE_NAME !== "com.ewatrade.app"
  )
    failures.push(
      "Require isolated Preview Sandbox owner/store billing; Production checkout/reviewer exceptions are forbidden.",
    )
  try {
    const products = getStoreProducts(env.STORE_SUBSCRIPTION_PRODUCTS).filter(
      (p) => p.store === "play_store",
    )
    if (
      products.length !== 3 ||
      ["starter", "growth", "pro"].some(
        (plan) =>
          !products.some(
            (p) =>
              p.planId === plan &&
              p.productId === `com.ewatrade.owner.${plan}.monthly`,
          ),
      )
    )
      throw new Error("Wrong catalog")
  } catch {
    failures.push(
      "All three exact registered Play monthly product mappings are required.",
    )
  }
  if (
    env.PLAY_NOTIFICATION_AUDIENCE !==
      "https://preview-api.ewatrade.com/webhooks/store/google" ||
    !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(
      env.PLAY_NOTIFICATION_SERVICE_EMAIL ?? "",
    )
  )
    failures.push(
      "Preview RTDN audience and a Google service-account push identity are required.",
    )
  try {
    // Reuse the actual verifier's RSA service-account validation. Never print key material.
    const inline = env.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON
    const value =
      inline !== undefined && inline !== ""
        ? inline
        : read(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
    parsePlayPublisherServiceAccount(value)
  } catch {
    failures.push(
      "Valid Preview Play Publisher service-account credentials are required.",
    )
  }
  return failures
}

// The registered Play upload certificate, independently extracted from AAB36.
const UPLOAD_CERT_SHA256 =
  "615376C3C2035220230FD645C270630026BD0DFFBB62722B88CF10396AD5409E"
export function playPreviewSigningFailures(
  credentialsFile,
  read = readFileSync,
  run = spawnSync,
) {
  try {
    const { android } = JSON.parse(read(credentialsFile, "utf8"))
    const key = android?.keystore
    if (
      !key ||
      typeof key.keystorePath !== "string" ||
      !key.keystorePath.trim() ||
      typeof key.keyAlias !== "string" ||
      !key.keyAlias.trim() ||
      key.keyAlias.length > 200 ||
      typeof key.keystorePassword !== "string" ||
      !key.keystorePassword
    )
      throw new Error("Missing local signing fields")
    const result = run(
      "keytool",
      [
        "-list",
        "-v",
        "-keystore",
        resolve(dirname(credentialsFile), key.keystorePath),
        "-alias",
        key.keyAlias,
        "-storepass:env",
        "EWATRADE_PLAY_PREVIEW_KEYSTORE_PASSWORD",
      ],
      {
        env: {
          PATH: process.env.PATH,
          LANG: "C",
          LC_ALL: "C",
          EWATRADE_PLAY_PREVIEW_KEYSTORE_PASSWORD: key.keystorePassword,
        },
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      },
    )
    const fingerprint = result.stdout
      ?.match(/SHA256:\s*([A-Fa-f0-9:]{95})/)?.[1]
      ?.replaceAll(":", "")
      .toUpperCase()
    if (result.status !== 0 || fingerprint !== UPLOAD_CERT_SHA256)
      throw new Error("Upload certificate mismatch")
    return []
  } catch {
    return [
      "Local Android keystore must match the registered Play upload certificate; signing details are not printed.",
    ]
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { default: app } = await import("../apps/mobile/app.config.ts")
  const eas = JSON.parse(
    readFileSync(new URL("../apps/mobile/eas.json", import.meta.url), "utf8"),
  )
  const failures = [
    ...playPreviewFailures({ env: process.env, app, eas }),
    ...playPreviewSigningFailures(
      fileURLToPath(
        new URL("../apps/mobile/credentials.json", import.meta.url),
      ),
    ),
  ]
  if (failures.length) {
    console.error(failures.join("\n"))
    process.exitCode = 1
  } else
    console.log(
      "Offline Play Preview profile/Sandbox configuration passed; hosted credentials, signing and RTDN remain unverified.",
    )
}
