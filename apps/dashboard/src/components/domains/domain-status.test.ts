import { expect, test } from "bun:test"
import {
  DOMAIN_STATUS,
  domainBoughtFrom,
  domainCount,
  domainNeedsRecord,
  domainRenews,
} from "./domain-status"

test("statuses read as plain words, never codes", () => {
  expect(DOMAIN_STATUS.ACTIVE.label).toBe("Live")
  expect(DOMAIN_STATUS.OWNERSHIP_PENDING.label).toBe("Waiting for DNS record")
  expect(DOMAIN_STATUS.DNS_CONFIGURING.label).toBe("Setting up")
  expect(DOMAIN_STATUS.VERIFYING.label).toBe("Checking")
  expect(DOMAIN_STATUS.FAILED.label).toBe("Needs attention")
})

test("bought from and renewal say who manages the domain", () => {
  expect(domainBoughtFrom({ provider: "OPENPROVIDER" })).toBe("Openprovider")
  expect(domainBoughtFrom({ provider: "EXTERNAL" })).toBe("Another company")
  expect(domainRenews({ expiresAt: null })).toBe("At the other company")
  expect(domainRenews({ expiresAt: "2027-03-12T00:00:00.000Z" })).toBe(
    "12 Mar 2027",
  )
})

test("only a pending domain with a record shows the steps", () => {
  const record = { name: "_ewatrade.shop.com", type: "TXT", value: "v" }
  expect(
    domainNeedsRecord({ status: "OWNERSHIP_PENDING", verification: record }),
  ).toBe(true)
  expect(domainNeedsRecord({ status: "ACTIVE", verification: record })).toBe(
    false,
  )
  expect(
    domainNeedsRecord({
      status: "OWNERSHIP_PENDING",
      verification: { name: null, type: null, value: null },
    }),
  ).toBe(false)
})

test("the count line agrees with the number", () => {
  expect(domainCount(1)).toBe("1 domain")
  expect(domainCount(3)).toBe("3 domains")
})
