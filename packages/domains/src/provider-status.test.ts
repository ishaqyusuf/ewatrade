import { describe, expect, test } from "bun:test"

import { normalizeProviderDomainStatus } from "./provider-status"

describe("provider domain status normalization", () => {
  test("maps registrar success and queued states", () => {
    expect(normalizeProviderDomainStatus("OPENPROVIDER", "ACT")).toBe("active")
    expect(normalizeProviderDomainStatus("OPENPROVIDER", "REQ")).toBe("pending")
    expect(normalizeProviderDomainStatus("OPENPROVIDER", "PEN")).toBe("pending")
    expect(normalizeProviderDomainStatus("OPENPROVIDER", "DEL")).toBe("expired")
    expect(normalizeProviderDomainStatus("GO54", "success")).toBe("active")
    expect(normalizeProviderDomainStatus("GO54", "processing")).toBe("pending")
  })

  test("does not promote unknown provider states to active", () => {
    expect(normalizeProviderDomainStatus("GO54", "")).toBe("unknown")
    expect(normalizeProviderDomainStatus("OPENPROVIDER", "new-state")).toBe(
      "unknown",
    )
  })
})
