import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import {
  decryptCustomerRefundDestination,
  encryptCustomerRefundDestination,
  validateCustomerRefundDestination,
} from "./funds-destination"

const scope = {
  tenantId: "tenant",
  accountId: "account",
  creditEntryId: "credit",
}
const key = Buffer.alloc(32, 3).toString("base64")
const account = { accountNumber: "1234567890", accountName: "QA customer" }

test("manual refund accepts a human bank name without inventing a routing code", () => {
  const value = { bankName: "  Example Community Bank  ", ...account }
  const encrypted = encryptCustomerRefundDestination(value, scope, key)
  const decoded = decryptCustomerRefundDestination(
    encrypted.destinationCiphertext,
    scope,
    key,
  )
  expect(decoded).toEqual({ bankName: "Example Community Bank", ...account })
  expect(decoded.bankCode).toBeUndefined()
  expect(encrypted.destinationCiphertext).not.toContain(
    "Example Community Bank",
  )
  const changed = encryptCustomerRefundDestination(
    { ...value, bankName: "Another Community Bank" },
    scope,
    key,
  )
  expect(changed.destinationFingerprint).not.toBe(
    encrypted.destinationFingerprint,
  )
  expect(() =>
    decryptCustomerRefundDestination(
      encrypted.destinationCiphertext,
      { ...scope, creditEntryId: "other" },
      key,
    ),
  ).toThrow()
})
test("legacy code-only normalized JSON and its exact keyed fingerprint remain unchanged", () => {
  const legacy = {
    bankCode: "058",
    accountNumber: account.accountNumber,
    accountName: account.accountName,
  }
  const aad = Buffer.from(
    JSON.stringify([
      "customer-refund-destination:v1",
      scope.tenantId,
      scope.accountId,
      scope.creditEntryId,
    ]),
  )
  const expectedFingerprint = createHmac("sha256", Buffer.from(key, "base64"))
    .update(aad)
    .update(JSON.stringify(legacy))
    .digest("hex")
  const encrypted = encryptCustomerRefundDestination(
    { ...legacy, bankCode: " 058 " },
    scope,
    key,
  )
  expect(encrypted.destinationFingerprint).toBe(expectedFingerprint)
  expect(
    decryptCustomerRefundDestination(
      encrypted.destinationCiphertext,
      scope,
      key,
    ),
  ).toEqual(legacy)
  expect(JSON.stringify(validateCustomerRefundDestination(legacy))).toBe(
    JSON.stringify(legacy),
  )
})
test("bank label is bounded and at least a human name or valid legacy code is required", () => {
  expect(() => validateCustomerRefundDestination(account)).toThrow()
  for (const bankName of ["A", "B".repeat(121), "Unsafe\nBank"])
    expect(() =>
      validateCustomerRefundDestination({ ...account, bankName }),
    ).toThrow()
  expect(() =>
    validateCustomerRefundDestination({
      ...account,
      bankCode: "invalid code",
      bankName: "QA bank",
    }),
  ).toThrow()
  expect(
    validateCustomerRefundDestination({
      ...account,
      bankCode: "058",
      bankName: "QA bank",
    }),
  ).toEqual({ bankCode: "058", bankName: "QA bank", ...account })
})
