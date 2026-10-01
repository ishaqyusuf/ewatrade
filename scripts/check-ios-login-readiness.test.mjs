import assert from "node:assert/strict"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import { test } from "node:test"
import { iosLoginReadinessFailures } from "./check-ios-login-readiness.mjs"

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
const key = privateKey.export({ format: "pem", type: "pkcs8" })
const webId = "web.apps.googleusercontent.com"
const iosId = "ios.apps.googleusercontent.com"

function fixture() {
  const server = {
    APP_ENV: "production",
    DEV_PROFILE: "prod",
    APPLE_CLIENT_IDS: "com.ewatrade.app,com.ewatrade.web",
    APPLE_SIGN_IN_TEAM_ID: "ZXC78SPCV4",
    APPLE_SIGN_IN_KEY_ID: "TESTKEY",
    APPLE_SIGN_IN_PRIVATE_KEY: key,
    APPLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    GOOGLE_WEB_CLIENT_ID: webId,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: webId,
    GOOGLE_IOS_CLIENT_ID: iosId,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: iosId,
  }
  const mobile = {
    GOOGLE_WEB_CLIENT_ID: webId,
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: webId,
    GOOGLE_IOS_CLIENT_ID: iosId,
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: iosId,
  }
  return { server, mobile }
}

test("accepts exact organization, bundle, key and matching Google IDs", () => {
  const { server, mobile } = fixture()
  assert.deepEqual(iosLoginReadinessFailures(server, mobile), [])
})

test("rejects missing Apple authority and mismatched mobile Google audience", () => {
  const { server, mobile } = fixture()
  server.APPLE_CLIENT_IDS = "com.another.app"
  server.APPLE_SIGN_IN_TEAM_ID = "OTHERTEAM"
  server.APPLE_SIGN_IN_PRIVATE_KEY = "invalid"
  server.APPLE_TOKEN_ENCRYPTION_KEY = "short"
  mobile.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID =
    "different.apps.googleusercontent.com"
  assert.deepEqual(iosLoginReadinessFailures(server, mobile), [
    "APPLE_CLIENT_IDS must include the iOS bundle ID.",
    "APPLE_SIGN_IN_TEAM_ID must match the EwaTrade organization team.",
    "APPLE_SIGN_IN_PRIVATE_KEY must be a valid P-256 private key.",
    "APPLE_TOKEN_ENCRYPTION_KEY must be canonical base64 for 32 bytes.",
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must match the mobile production value.",
  ])
})

test("rejects a 32-byte encryption key with ignored non-base64 characters", () => {
  const { server, mobile } = fixture()
  server.APPLE_TOKEN_ENCRYPTION_KEY += "!"
  assert.deepEqual(iosLoginReadinessFailures(server, mobile), [
    "APPLE_TOKEN_ENCRYPTION_KEY must be canonical base64 for 32 bytes.",
  ])
})

test("refuses a non-production profile", () => {
  const { server, mobile } = fixture()
  server.DEV_PROFILE = "local"
  assert.deepEqual(iosLoginReadinessFailures(server, mobile), [
    "Run with the production environment profile.",
  ])
})
