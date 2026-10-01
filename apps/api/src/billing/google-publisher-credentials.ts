import { createPrivateKey } from "node:crypto"
import { GoogleAuth, JWT } from "google-auth-library"

const publisherScope = "https://www.googleapis.com/auth/androidpublisher"

type ServiceAccount = {
  type?: unknown
  client_email?: unknown
  private_key?: unknown
}

/** Accept only a Google service-account key; never pass arbitrary JSON fields to auth. */
export function parsePlayPublisherServiceAccount(value: string) {
  if (value.length > 24_576) throw new Error("Play publisher key is invalid.")
  let parsed: ServiceAccount
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("Play publisher key is invalid.")
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    parsed.type !== "service_account" ||
    typeof parsed.client_email !== "string" ||
    parsed.client_email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(parsed.client_email) ||
    typeof parsed.private_key !== "string"
  )
    throw new Error("Play publisher key is invalid.")
  try {
    const key = createPrivateKey(parsed.private_key)
    if (
      key.asymmetricKeyType !== "rsa" ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    )
      throw new Error("Invalid key type")
  } catch {
    throw new Error("Play publisher key is invalid.")
  }
  return { email: parsed.client_email, key: parsed.private_key }
}

export function isPlayPublisherCredentialConfigured(
  env: NodeJS.ProcessEnv,
  fileExists: (path: string) => boolean,
) {
  const inline = env.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON
  if (inline !== undefined && inline !== "") {
    try {
      parsePlayPublisherServiceAccount(inline)
      return true
    } catch {
      return false
    }
  }
  const path = env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  return Boolean(path && fileExists(path))
}

export async function getPlayPublisherClient(
  env: NodeJS.ProcessEnv = process.env,
) {
  const inline = env.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON
  if (inline !== undefined && inline !== "") {
    const { email, key } = parsePlayPublisherServiceAccount(inline)
    return new JWT({ email, key, scopes: [publisherScope] })
  }
  const keyFile = env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  return new GoogleAuth({
    scopes: [publisherScope],
    ...(keyFile ? { keyFile } : {}),
  }).getClient()
}

export async function getPlayPublisherAccessToken(
  env: NodeJS.ProcessEnv = process.env,
) {
  const client = await getPlayPublisherClient(env)
  const response = await client.getAccessToken()
  return typeof response === "string" ? response : response.token
}
