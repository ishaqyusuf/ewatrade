import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { encryptCustomerRefundDestination } from "./funds-destination"
import { reserveCustomerFundsRefundInTransaction } from "./funds-refunds"

const scope = {
  tenantId: "tenant",
  accountId: "account",
  creditEntryId: "credit",
}
const key = Buffer.alloc(32, 11).toString("base64")
const encrypted = encryptCustomerRefundDestination(
  { bankCode: "058", accountNumber: "1234567890", accountName: "QA customer" },
  scope,
  key,
)
const changed = encryptCustomerRefundDestination(
  {
    bankCode: "058",
    accountNumber: "1234567890",
    accountName: "Different QA customer",
  },
  scope,
  key,
)

/** The real canonical command must refuse before any hold or money write. */
function fixture(ciphertext: string) {
  let writes = 0
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => [
      { id: strings.join("").includes('"FinanceBook"') ? "book" : "account" },
    ],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    financeBook: {
      findUniqueOrThrow: async () => ({ id: "book", currencyCode: "NGN" }),
    },
    customerLedgerAccount: {
      findUniqueOrThrow: async () => ({
        id: "account",
        currencyCode: "NGN",
        revision: 4n,
      }),
      update: async () => {
        writes++
        throw new Error("No mutation may be reached")
      },
    },
    customerLedgerCommand: {
      findUnique: async () => null,
      create: async () => {
        writes++
        throw new Error("No command may be persisted")
      },
    },
    customerFundsRefundRequest: {
      findFirst: async () => ({
        id: "request",
        ...scope,
        bookId: "book",
        status: "REQUESTED",
        version: 1,
        destinationCiphertext: ciphertext,
        destinationFingerprint: encrypted.destinationFingerprint,
      }),
      update: async () => {
        writes++
        throw new Error("No hold may be recorded")
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, writes: () => writes }
}
const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  accountId: "account",
  bookId: "book",
  requestId: "request",
  clientCommandId: "approve",
  expectedRevision: "4",
  expectedVersion: 1,
  expectedDestinationFingerprint: encrypted.destinationFingerprint,
  identityReviewAttested: true as const,
}
for (const [label, ciphertext, suppliedKey] of [
  ["missing server key", encrypted.destinationCiphertext, ""],
  [
    "wrong server key",
    encrypted.destinationCiphertext,
    Buffer.alloc(32, 4).toString("base64"),
  ],
  ["invalid ciphertext", "v1.invalid", key],
  [
    "valid AEAD with an unreviewed destination",
    changed.destinationCiphertext,
    key,
  ],
] as const) {
  test(`refund approval refuses ${label} under canonical locks before any hold`, async () => {
    const f = fixture(ciphertext)
    await expect(
      reserveCustomerFundsRefundInTransaction(f.tx, input, suppliedKey),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(f.writes()).toBe(0)
  })
}
