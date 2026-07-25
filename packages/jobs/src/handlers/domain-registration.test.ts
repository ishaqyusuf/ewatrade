import { describe, expect, test } from "bun:test"
import { DomainProviderError } from "@ewatrade/domains"

import { isUncertainDomainRegistrationFailure } from "./domain-registration"

describe("domain registration job failure classification", () => {
  test("never refunds a registrar request with an unknown network outcome", () => {
    const error = new DomainProviderError({
      code: "OPENPROVIDER_NETWORK_ERROR",
      isUncertain: true,
      message: "Openprovider could not be reached.",
      provider: "OPENPROVIDER",
    })

    expect(isUncertainDomainRegistrationFailure(error, false)).toBe(true)
  })

  test("reconciles failures after the registrar accepted registration", () => {
    expect(
      isUncertainDomainRegistrationFailure(
        new Error("Persistence failed after registration"),
        true,
      ),
    ).toBe(true)
  })

  test("allows a refund for a definite pre-registration failure", () => {
    expect(
      isUncertainDomainRegistrationFailure(
        new DomainProviderError({
          code: "GO54_REGISTRATION_FAILED",
          message: "Registration rejected.",
          provider: "GO54",
        }),
        false,
      ),
    ).toBe(false)
  })
})
