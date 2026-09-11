import { describe, expect, test } from "bun:test"
import {
  DOMAIN_MANAGEMENT_COPY,
  resolveDomainBusinessId,
  shouldLoadDomainList,
  shouldLoadDomainOrder,
  shouldLoadRegistrantProfile,
} from "./domain-management-presentation"

describe("domain management presentation", () => {
  test("uses the authenticated production business when no local business is active", () => {
    expect(resolveDomainBusinessId(null, "production-business")).toBe(
      "production-business",
    )
  })

  test("keeps the explicitly active local business when available", () => {
    expect(
      resolveDomainBusinessId("local-business", "production-business"),
    ).toBe("local-business")
  })

  test("returns null only when neither session provides a business", () => {
    expect(resolveDomainBusinessId(null, undefined)).toBeNull()
  })

  test("keeps the zero-domain choice hierarchy explicit", () => {
    expect(DOMAIN_MANAGEMENT_COPY.includedAddressTitle).toBe(
      "Free ẸwáTrade address",
    )
    expect(DOMAIN_MANAGEMENT_COPY.emptyTitle).toBe("No custom domain yet")
    expect(DOMAIN_MANAGEMENT_COPY.findAction).toBe("Find a domain")
    expect(DOMAIN_MANAGEMENT_COPY.connectAction).toBe(
      "Connect a domain you own",
    )
  })

  test("does not read domain data without a resolved business", () => {
    expect(shouldLoadDomainList(null)).toBe(false)
    expect(shouldLoadDomainList("production-business")).toBe(true)
    expect(shouldLoadRegistrantProfile(null, "search")).toBe(false)
  })

  test("loads registrant details only inside the purchase path", () => {
    expect(shouldLoadRegistrantProfile("production-business", "list")).toBe(
      false,
    )
    expect(shouldLoadRegistrantProfile("production-business", "details")).toBe(
      false,
    )
    expect(shouldLoadRegistrantProfile("production-business", "search")).toBe(
      true,
    )
    expect(shouldLoadRegistrantProfile("production-business", "owner")).toBe(
      true,
    )
    expect(shouldLoadRegistrantProfile("production-business", "review")).toBe(
      true,
    )
  })

  test("loads order progress only with business scope and an order id", () => {
    expect(shouldLoadDomainOrder(null, "progress", "order-1")).toBe(false)
    expect(
      shouldLoadDomainOrder("production-business", "list", "order-1"),
    ).toBe(false)
    expect(shouldLoadDomainOrder("production-business", "progress", null)).toBe(
      false,
    )
    expect(
      shouldLoadDomainOrder("production-business", "progress", "order-1"),
    ).toBe(true)
  })
})
