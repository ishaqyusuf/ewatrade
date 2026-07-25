import { describe, expect, test } from "bun:test"

import { normalizeDomainName, providerNameForDomain } from "./index"

describe("domain normalization and routing", () => {
  test("normalizes supported public domains", () => {
    expect(normalizeDomainName(" HTTPS://Acme.com.ng/checkout ")).toEqual({
      label: "acme",
      normalizedDomain: "acme.com.ng",
      tld: "com.ng",
    })
    expect(normalizeDomainName("Acme.com")).toEqual({
      label: "acme",
      normalizedDomain: "acme.com",
      tld: "com",
    })
  })

  test("rejects unsupported and malformed domains", () => {
    expect(() => normalizeDomainName("acme.ng")).toThrow("Only .com.ng")
    expect(() => normalizeDomainName("-acme.com")).toThrow("cannot begin")
    expect(() => normalizeDomainName("shop.acme.com")).toThrow("letters")
  })

  test("routes .com.ng to GO54 and .com to Openprovider", () => {
    expect(providerNameForDomain("acme.com.ng")).toBe("GO54")
    expect(providerNameForDomain("acme.com")).toBe("OPENPROVIDER")
  })
})
