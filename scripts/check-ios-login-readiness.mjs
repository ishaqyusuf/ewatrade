import { createPrivateKey } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readEnvironmentFile } from "./environment-profile.mjs"

const expectedBundleId = "com.ewatrade.app"
const expectedTeamId = "ZXC78SPCV4"
const mobileProductionEnv = path.resolve("apps/mobile/.env.production")

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0
}

function googleClientId(value) {
  return nonempty(value) && value.endsWith(".apps.googleusercontent.com")
}

export function iosLoginReadinessFailures(server, mobile) {
  const failures = []
  if (server.APP_ENV !== "production" || server.DEV_PROFILE !== "prod")
    failures.push("Run with the production environment profile.")

  const appleAudiences = (server.APPLE_CLIENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (!appleAudiences.includes(expectedBundleId))
    failures.push("APPLE_CLIENT_IDS must include the iOS bundle ID.")
  if (server.APPLE_SIGN_IN_TEAM_ID !== expectedTeamId)
    failures.push(
      "APPLE_SIGN_IN_TEAM_ID must match the EwaTrade organization team.",
    )
  if (!nonempty(server.APPLE_SIGN_IN_KEY_ID))
    failures.push("APPLE_SIGN_IN_KEY_ID is missing.")
  try {
    const key = createPrivateKey(
      (server.APPLE_SIGN_IN_PRIVATE_KEY ?? "").replaceAll("\\n", "\n"),
    )
    if (
      key.asymmetricKeyType !== "ec" ||
      key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
    )
      throw new Error("wrong key type")
  } catch {
    failures.push(
      "APPLE_SIGN_IN_PRIVATE_KEY must be a valid P-256 private key.",
    )
  }
  const encryptionKey = server.APPLE_TOKEN_ENCRYPTION_KEY
  const decodedEncryptionKey = Buffer.from(encryptionKey ?? "", "base64")
  if (
    !nonempty(encryptionKey) ||
    decodedEncryptionKey.length !== 32 ||
    decodedEncryptionKey.toString("base64") !== encryptionKey
  )
    failures.push(
      "APPLE_TOKEN_ENCRYPTION_KEY must be canonical base64 for 32 bytes.",
    )

  for (const name of ["GOOGLE_WEB_CLIENT_ID", "GOOGLE_IOS_CLIENT_ID"]) {
    const publicName = `EXPO_PUBLIC_${name}`
    // The native hook uses the public ID; the API includes this same value
    // in its accepted Google token audiences. Private aliases may differ.
    const value = server[publicName]
    if (!googleClientId(value))
      failures.push(`${publicName} must be a Google OAuth client ID.`)
    if (value !== mobile[publicName])
      failures.push(`${publicName} must match the mobile production value.`)
  }
  return failures
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const failures = iosLoginReadinessFailures(
    process.env,
    readEnvironmentFile(mobileProductionEnv),
  )
  if (failures.length) {
    console.error("iOS login configuration is not ready:")
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else {
    console.log("iOS login configuration preflight passed.")
  }
}
