import { expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import { JWT } from "google-auth-library"
import {
  getPlayPublisherClient,
  isPlayPublisherCredentialConfigured,
  parsePlayPublisherServiceAccount,
} from "./google-publisher-credentials"

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const key = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const credential = JSON.stringify({
  type: "service_account",
  client_email: "publisher@project.iam.gserviceaccount.com",
  private_key: key,
  token_uri: "https://oauth2.googleapis.com/token",
})

test("a validated inline Play key creates a Publisher JWT without a file", async () => {
  const parsed = parsePlayPublisherServiceAccount(credential)
  expect(parsed.email).toBe("publisher@project.iam.gserviceaccount.com")
  const client = await getPlayPublisherClient({
    PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: credential,
  })
  expect(client).toBeInstanceOf(JWT)
  expect((client as JWT).email).toBe(parsed.email)
  expect(
    isPlayPublisherCredentialConfigured(
      { PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: credential },
      () => false,
    ),
  ).toBe(true)
})

test("malformed or non-service-account JSON fails even if an ADC file exists", () => {
  for (const raw of [
    "not-json",
    JSON.stringify({
      type: "external_account",
      client_email: "x",
      private_key: key,
    }),
    JSON.stringify({
      type: "service_account",
      client_email: "attacker@example.com",
      private_key: key,
    }),
    JSON.stringify({
      type: "service_account",
      client_email: "publisher@project.iam.gserviceaccount.com",
      private_key: "bad-key",
    }),
    JSON.stringify({
      type: "service_account",
      client_email: "publisher@project.iam.gserviceaccount.com",
      private_key: "",
    }),
  ]) {
    expect(() => parsePlayPublisherServiceAccount(raw)).toThrow(
      "Play publisher key is invalid.",
    )
    expect(
      isPlayPublisherCredentialConfigured(
        {
          PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: raw,
          GOOGLE_APPLICATION_CREDENTIALS: "/test/valid.json",
        },
        () => true,
      ),
    ).toBe(false)
  }
})

test("local ADC file readiness remains available without an inline key", () => {
  expect(
    isPlayPublisherCredentialConfigured(
      { GOOGLE_APPLICATION_CREDENTIALS: "/test/valid.json" },
      (path) => path === "/test/valid.json",
    ),
  ).toBe(true)
  expect(
    isPlayPublisherCredentialConfigured(
      { GOOGLE_APPLICATION_CREDENTIALS: "/test/missing.json" },
      () => false,
    ),
  ).toBe(false)
})
