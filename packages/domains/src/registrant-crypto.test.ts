import { describe, expect, test } from "bun:test"

import {
  decryptRegistrant,
  encryptRegistrant,
  maskEmail,
} from "./registrant-crypto"
import type { DomainRegistrant } from "./types"

const registrant: DomainRegistrant = {
  addressLine1: "1 Market Road",
  city: "Lagos",
  countryCode: "NG",
  email: "owner@example.com",
  firstName: "Ada",
  lastName: "Okafor",
  phoneCountryCode: "234",
  phoneNumber: "8012345678",
  region: "Lagos",
}

describe("registrant encryption", () => {
  test("round trips private registration data", () => {
    const env = {
      DOMAIN_DATA_ENCRYPTION_KEY: "test-key-with-enough-entropy",
    }
    const encrypted = encryptRegistrant(registrant, env)

    expect(encrypted).not.toContain(registrant.email)
    expect(decryptRegistrant(encrypted, env)).toEqual(registrant)
  })

  test("requires a production encryption key", () => {
    expect(() =>
      encryptRegistrant(registrant, { NODE_ENV: "production" }),
    ).toThrow("required in production")
  })

  test("masks email summaries", () => {
    expect(maskEmail("owner@example.com")).toBe("ow***@example.com")
  })
})
