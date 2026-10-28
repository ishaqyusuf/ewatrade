import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  decryptCustomerRefundDestination,
  encryptCustomerRefundDestination,
} from "./funds-destination"
import { assertCustomerFundsNotReserved } from "./funds-reservations"
import { matchesVerifiedCustomerContact } from "./public-funds"
import { customerReceiptConservation } from "./receipt-for-order"
import { customerLedgerTotalsFromAggregates } from "./totals-projection"

const scope = {
  tenantId: "business",
  accountId: "customer-account",
  creditEntryId: "receipt-entry",
}
const secret = Buffer.alloc(32, 13).toString("base64")
const destination = {
  bankCode: "058",
  accountNumber: "1234567890",
  accountName: "Customer Name",
}

test("receipt allocation conserves received funds exactly and rejects malformed/overallocated values", () => {
  expect(customerReceiptConservation("20000", "15000")).toEqual({
    receivedMinor: "20000",
    appliedMinor: "15000",
    excessMinor: "5000",
  })
  expect(customerReceiptConservation("20000", "0").excessMinor).toBe("20000")
  expect(
    customerReceiptConservation("100000000000000", "99999999999999")
      .excessMinor,
  ).toBe("1")
  for (const [received, applied] of [
    ["100", "101"],
    ["0", "0"],
    ["1.5", "1"],
    ["100", "01"],
    ["100", "-1"],
    ["100000000000001", "0"],
  ])
    expect(() => customerReceiptConservation(received, applied)).toThrow()
})

test("refund destination is encrypted with source-bound authenticated custody and stable keyed fingerprint", () => {
  const first = encryptCustomerRefundDestination(destination, scope, secret)
  const second = encryptCustomerRefundDestination(destination, scope, secret)
  expect(first.destinationCiphertext).not.toContain(destination.accountNumber)
  expect(first.destinationCiphertext).not.toBe(second.destinationCiphertext)
  expect(first.destinationFingerprint).toBe(second.destinationFingerprint)
  expect(
    decryptCustomerRefundDestination(
      first.destinationCiphertext,
      scope,
      secret,
    ),
  ).toEqual(destination)
  for (const changed of [
    { ...scope, tenantId: "other" },
    { ...scope, accountId: "other" },
    { ...scope, creditEntryId: "other" },
  ])
    expect(() =>
      decryptCustomerRefundDestination(
        first.destinationCiphertext,
        changed,
        secret,
      ),
    ).toThrow()
  expect(() =>
    decryptCustomerRefundDestination(
      first.destinationCiphertext,
      scope,
      Buffer.alloc(32, 7).toString("base64"),
    ),
  ).toThrow()
  const segments = first.destinationCiphertext.split(".")
  const encrypted = Buffer.from(segments[3] ?? "", "base64url")
  encrypted.writeUInt8(encrypted.readUInt8(0) ^ 1, 0)
  segments[3] = encrypted.toString("base64url")
  expect(() =>
    decryptCustomerRefundDestination(segments.join("."), scope, secret),
  ).toThrow()
  expect(() =>
    encryptCustomerRefundDestination(destination, scope, ""),
  ).toThrow()
  expect(() =>
    encryptCustomerRefundDestination(
      { ...destination, accountName: "Bad\nName" },
      scope,
      secret,
    ),
  ).toThrow()
})

test("verified customer identity requires an exact current verified contact; display name/link possession cannot match", () => {
  const customer = {
    normalizedEmail: "customer@example.test",
    normalizedPhone: "+2348012345678",
  }
  const user = {
    email: "Customer@Example.Test",
    emailVerified: false,
    phone: "+234 801 234 5678",
    phoneVerifiedAt: null as Date | null,
  }
  expect(matchesVerifiedCustomerContact(customer, user)).toBe(false)
  expect(
    matchesVerifiedCustomerContact(customer, { ...user, emailVerified: true }),
  ).toBe(true)
  expect(
    matchesVerifiedCustomerContact(customer, {
      ...user,
      phoneVerifiedAt: new Date(),
    }),
  ).toBe(true)
  expect(
    matchesVerifiedCustomerContact(
      { ...customer, normalizedEmail: "changed@example.test" },
      { ...user, emailVerified: true },
    ),
  ).toBe(false)
  expect(
    matchesVerifiedCustomerContact(
      { normalizedEmail: null, normalizedPhone: null },
      { ...user, emailVerified: true, phoneVerifiedAt: new Date() },
    ),
  ).toBe(false)
})

test("reservation prevents spend or direct return of held source while leaving its unreserved remainder usable", async () => {
  const tx = {
    $queryRaw: async () => [{ reservedMinor: 600n }],
  } as unknown as Prisma.TransactionClient
  expect(await assertCustomerFundsNotReserved(tx, scope, 1000n, 400n)).toBe(
    600n,
  )
  await expect(
    assertCustomerFundsNotReserved(tx, scope, 1000n, 401n),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    assertCustomerFundsNotReserved(tx, scope, 1000n, 1000n),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  const totals = customerLedgerTotalsFromAggregates({
    debit: 500n,
    credit: 1500n,
    allocations: 700n,
    releases: 200n,
    reserved: 600n,
  })
  expect(totals.availableCreditMinor).toBe("400")
  expect(totals.outstandingDebtMinor).toBe("0")
  expect(totals.netBalanceMinor).toBe("-1000")
})
