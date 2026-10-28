import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { encryptCustomerRefundDestination } from "./funds-destination"
import {
  cancelCustomerFundsRefundInTransaction,
  completeCustomerFundsRefundInTransaction,
  getCustomerFundsRefundDetail,
  requestCustomerFundsRefundDetailsInTransaction,
  requestCustomerFundsRefundInTransaction,
  reserveCustomerFundsRefundInTransaction,
} from "./funds-refunds"

const base = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  accountId: "account",
  expectedRevision: "4",
  clientCommandId: "request",
}
const key = Buffer.alloc(32, 9).toString("base64")
const source = {
  tenantId: "tenant",
  accountId: "account",
  creditEntryId: "credit",
}
const encrypted = () =>
  encryptCustomerRefundDestination(
    {
      bankCode: "058",
      accountNumber: "1234567890",
      accountName: "Customer Name",
    },
    source,
    key,
  )
const requestInput = () => ({
  ...base,
  creditEntryId: "credit",
  amountMinor: "500",
  reason: "Return excess",
  ...encrypted(),
})
function fixture() {
  const account = {
    id: "account",
    customerId: "customer",
    tenantId: "tenant",
    currencyCode: "NGN",
    revision: 4n,
  }
  type Row = {
    id: string
    tenantId: string
    accountId: string
    bookId: string
    creditEntryId: string
    amountMinor: bigint
    status: string
    version: number
    createdAt: Date
    approvedAt: Date | null
    completedAt: Date | null
    cancelledAt: Date | null
    outgoingReference: string | null
    refundEntryId: string | null
  }
  const rows = new Map<string, Row>()
  const commands = new Map<
    string,
    { accountId: string; kind: string; payloadHash: string; result: unknown }
  >()
  let denied = false
  const effectiveAt = new Date("2026-01-01")
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) =>
      strings.join("").includes("DISTINCT ON")
        ? []
        : strings.join("").includes('FROM "CustomerFundsRefundRequest"')
          ? [
              {
                reservedMinor: [...rows.values()]
                  .filter((row) => row.status === "RESERVED")
                  .reduce((sum, row) => sum + row.amountMinor, 0n),
              },
            ]
          : [
              {
                id: strings.join("").includes('"FinanceBook"')
                  ? "book"
                  : "account",
              },
            ],
    user: { findMany: async () => [{ id: "owner", name: "Finance Owner" }] },
    membership: {
      findFirst: async () => (denied ? null : { tenant: { isActive: true } }),
    },
    financeBook: {
      findUniqueOrThrow: async () => ({
        id: "book",
        currencyCode: "NGN",
        startsAt: effectiveAt,
        closedThrough: null,
      }),
    },
    customerLedgerAccount: {
      findUniqueOrThrow: async () => ({ ...account }),
      update: async () => {
        account.revision += 1n
        return { ...account }
      },
    },
    customerLedgerCommand: {
      findUnique: async (args: {
        where: { tenantId_clientCommandId: { clientCommandId: string } }
      }) =>
        commands.get(args.where.tenantId_clientCommandId.clientCommandId) ??
        null,
      create: async (args: {
        data: {
          clientCommandId: string
          accountId: string
          kind: string
          payloadHash: string
          result: unknown
        }
      }) => {
        commands.set(args.data.clientCommandId, args.data)
        return args.data
      },
    },
    customerLedgerEntry: {
      findFirst: async () => ({
        id: "credit",
        kind: "RECEIPT",
        side: "CREDIT",
        amountMinor: 1000n,
        sourceKind: "CUSTOMER_RECEIPT",
        sourceId: "receipt",
        effectiveAt,
      }),
    },
    financeAccount: { findFirst: async () => ({ id: "advance" }) },
    customerLedgerReceipt: {
      findFirst: async () => ({ id: "receipt", moneyAccountId: "bank" }),
    },
    financeJournalEntry: {
      findUnique: async () => ({
        reversalOfId: null,
        reversal: null,
        effectiveAt,
        lines: [
          {
            accountId: "bank",
            debitMinor: 1000n,
            creditMinor: 0n,
            account: { kind: "ASSET", purpose: "BANK" },
          },
          {
            accountId: "advance",
            debitMinor: 0n,
            creditMinor: 1000n,
            account: { kind: "LIABILITY", purpose: "CUSTOMER_ADVANCE" },
          },
        ],
      }),
    },
    customerLedgerAllocation: {
      aggregate: async () => ({ _sum: { amountMinor: 0n } }),
    },
    customerLedgerAllocationRelease: {
      aggregate: async () => ({ _sum: { amountMinor: 0n } }),
    },
    customerFundsRefundRequest: {
      create: async (args: {
        data: Omit<
          Row,
          | "id"
          | "status"
          | "version"
          | "createdAt"
          | "approvedAt"
          | "completedAt"
          | "cancelledAt"
          | "outgoingReference"
          | "refundEntryId"
        >
      }) => {
        const row = {
          ...args.data,
          id: `refund-${rows.size}`,
          status: "REQUESTED",
          version: 1,
          createdAt: new Date(),
          approvedAt: null,
          completedAt: null,
          cancelledAt: null,
          outgoingReference: null,
          refundEntryId: null,
        }
        rows.set(row.id, row)
        return row
      },
      findFirst: async (args: { where: { id: string } }) => {
        const row = rows.get(args.where.id)
        return row
          ? {
              ...row,
              approvedByUserId: null,
              completedByUserId: null,
              account: {
                customerId: "customer",
                currencyCode: "NGN",
                revision: account.revision,
                customer: { name: "Customer Name" },
              },
            }
          : null
      },
      findFirstOrThrow: async (args: { where: { id: string } }) => {
        const row = rows.get(args.where.id)
        if (!row) throw new Error("Missing request")
        return row
      },
      update: async (args: {
        where: { id: string }
        data: Partial<Omit<Row, "version">> & {
          version?: { increment: number }
        }
      }) => {
        const row = rows.get(args.where.id)
        if (!row) throw new Error("Missing request")
        const { version, ...data } = args.data
        Object.assign(row, data)
        row.version += version?.increment ?? 0
        return row
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    rows,
    commands,
    account,
    revoke: () => {
      denied = true
    },
  }
}

test("request replay recovers before stale revision checks despite fresh encryption nonce, but rejects conflicting destination/amount", async () => {
  const f = fixture()
  const input = requestInput()
  const first = await requestCustomerFundsRefundInTransaction(f.tx, input)
  expect(first).toMatchObject({
    status: "REQUESTED",
    version: 1,
    amountMinor: "500",
  })
  expect(
    await requestCustomerFundsRefundInTransaction(f.tx, {
      ...input,
      ...encrypted(),
    }),
  ).toEqual(first)
  expect(f.rows.size).toBe(1)
  expect(f.account.revision).toBe(5n)
  await expect(
    requestCustomerFundsRefundInTransaction(f.tx, {
      ...input,
      amountMinor: "600",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  f.revoke()
  await expect(
    requestCustomerFundsRefundInTransaction(f.tx, input),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("approval reserves exact source, rejects stale versions/revision and cancellation releases only its reserve", async () => {
  const f = fixture()
  const row = await requestCustomerFundsRefundInTransaction(
    f.tx,
    requestInput(),
  )
  const approve = {
    ...base,
    clientCommandId: "approve",
    expectedDestinationFingerprint: encrypted().destinationFingerprint,
    identityReviewAttested: true as const,
    requestId: row.id,
    expectedRevision: "5",
    expectedVersion: 1,
  }
  expect(
    await reserveCustomerFundsRefundInTransaction(f.tx, approve, key),
  ).toMatchObject({ status: "RESERVED", version: 2 })
  expect(
    await reserveCustomerFundsRefundInTransaction(f.tx, approve, key),
  ).toMatchObject({ status: "RESERVED", version: 2 })
  await expect(
    reserveCustomerFundsRefundInTransaction(f.tx, {
      ...approve,
      clientCommandId: "other-approve",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    requestCustomerFundsRefundInTransaction(f.tx, {
      ...requestInput(),
      clientCommandId: "second-request",
      expectedRevision: "6",
      amountMinor: "501",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  const cancel = {
    ...base,
    clientCommandId: "cancel",
    requestId: row.id,
    expectedRevision: "6",
    expectedVersion: 2,
  }
  expect(
    await cancelCustomerFundsRefundInTransaction(f.tx, cancel),
  ).toMatchObject({ status: "CANCELLED", version: 3 })
  expect(f.account.revision).toBe(7n)
  expect(
    await requestCustomerFundsRefundInTransaction(f.tx, {
      ...requestInput(),
      clientCommandId: "third-request",
      expectedRevision: "7",
      amountMinor: "1000",
    }),
  ).toMatchObject({ status: "REQUESTED" })
})

test("completion requires reserved approval and actual outgoing reference; invalid input creates no completion command", async () => {
  const f = fixture()
  const row = await requestCustomerFundsRefundInTransaction(
    f.tx,
    requestInput(),
  )
  const complete = {
    ...base,
    clientCommandId: "complete",
    requestId: row.id,
    expectedRevision: "5",
    expectedVersion: 1,
    moneyAccountId: "bank",
    outgoingReference: "TRANSFER-123",
    effectiveAt: new Date(),
  }
  await expect(
    completeCustomerFundsRefundInTransaction(f.tx, complete),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    completeCustomerFundsRefundInTransaction(f.tx, {
      ...complete,
      outgoingReference: " ",
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  expect(f.commands.has("complete")).toBe(false)
  expect(f.rows.get(row.id)?.status).toBe("REQUESTED")
})

test("needs-details preserves a non-reserved request with durable note and fences stale review", async () => {
  const f = fixture()
  const row = await requestCustomerFundsRefundInTransaction(
    f.tx,
    requestInput(),
  )
  const review = {
    ...base,
    clientCommandId: "need-details",
    requestId: row.id,
    expectedRevision: "5",
    expectedVersion: 1,
    note: "Confirm the account holder with the customer",
  }
  expect(
    await requestCustomerFundsRefundDetailsInTransaction(f.tx, review),
  ).toMatchObject({ status: "REQUESTED", version: 2 })
  expect(f.commands.get("need-details")?.result).toMatchObject({
    audit: { action: "NEED_DETAILS", reviewNote: review.note },
  })
  expect(
    await requestCustomerFundsRefundDetailsInTransaction(f.tx, review),
  ).toMatchObject({ version: 2 })
  await expect(
    reserveCustomerFundsRefundInTransaction(f.tx, {
      ...review,
      clientCommandId: "stale-approve",
      expectedDestinationFingerprint: encrypted().destinationFingerprint,
      identityReviewAttested: true,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  expect(f.account.revision).toBe(6n)
})
test("missing destination key still returns authorized safe detail and cancellation revision", async () => {
  const f = fixture()
  const row = await requestCustomerFundsRefundInTransaction(
    f.tx,
    requestInput(),
  )
  const db = {
    $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      run(f.tx),
  } as unknown as PrismaClient
  const detail = await getCustomerFundsRefundDetail(
    db,
    { tenantId: "tenant", actorUserId: "owner", requestId: row.id },
    "",
  )
  expect(detail).toMatchObject({
    id: row.id,
    status: "REQUESTED",
    version: 1,
    accountRevision: "5",
    destination: null,
    destinationStatus: "UNAVAILABLE",
    canCancel: true,
    canApprove: false,
    requestedByName: "Finance Owner",
  })
  expect(JSON.stringify(detail)).not.toContain("1234567890")
  f.revoke()
  await expect(
    getCustomerFundsRefundDetail(
      db,
      { tenantId: "tenant", actorUserId: "owner", requestId: row.id },
      "",
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
