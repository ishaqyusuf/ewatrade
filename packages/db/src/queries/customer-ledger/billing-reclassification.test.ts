import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  customerCreditBillingCommandId,
  resolveCustomerAllocationAfterBilling,
} from "./billing-reclassification"
import { resolveCustomerBillingReclassification } from "./billing-reclassification-source"

const order = {
  id: "order",
  tenantId: "tenant",
  customerId: "customer",
  currencyCode: "NGN",
  totalMinor: 10000,
  storeId: "store",
  orderNumber: "QA-1",
}
const now = new Date("2026-10-28T09:00:00Z")
const control = {
  id: "control",
  kind: "LIABILITY",
  purpose: "OTHER",
  name: "Order collections awaiting reconciliation",
  archivedAt: null,
}
const advance = {
  id: "advance",
  kind: "LIABILITY",
  purpose: "CUSTOMER_ADVANCE",
}
const receivable = { id: "receivable", kind: "ASSET", purpose: "RECEIVABLE" }
const line = (
  account: { id: string; kind: string; purpose: string },
  debitMinor: bigint,
  creditMinor: bigint,
) => ({ accountId: account.id, account, debitMinor, creditMinor })
function fixture(
  options: {
    mismatch?: boolean
    reversed?: boolean
    foreign?: boolean
    noMapping?: boolean
    cashRefund?: boolean
  } = {},
) {
  const command = {
    accountId: options.foreign ? "foreign" : "account",
    kind: "RECLASSIFY_UNBILLED_CREDIT",
    actorUserId: "merchant",
    result: {
      id: "replacement",
      audit: {
        originalAllocationId: "original",
        releaseId: "release",
        correctionEntryId: "correction",
        orderId: "order",
        amountMinor: "3000",
      },
    },
  }
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) =>
      strings.join("").includes('"CommercialOrder"')
        ? [order]
        : [
            {
              id: strings.join("").includes('"FinanceBook"')
                ? "book"
                : "account",
            },
          ],
    commercialOrder: { findFirst: async () => order },
    financeBook: {
      findUniqueOrThrow: async () => ({
        id: "book",
        tenantId: "tenant",
        currencyCode: "NGN",
      }),
    },
    financeAccount: {
      findUnique: async () => control,
      findFirst: async (args: { where: { purpose: string } }) =>
        args.where.purpose === "RECEIVABLE" ? receivable : advance,
    },
    financeJournalEntry: {
      findUnique: async (args: {
        where: { bookId_sourceKind_sourceId: { sourceKind: string } }
      }) => {
        const kind = args.where.bookId_sourceKind_sourceId.sourceKind
        if (kind === "COMMERCIAL_ORDER_BILLED")
          return {
            id: "billing",
            effectiveAt: now,
            reversal: null,
            reversalOfId: null,
          }
        const refund =
          kind === "COMMERCIAL_ORDER_COLLECTION" && options.cashRefund
        const lines =
          kind === "COMMERCIAL_ORDER_COLLECTION"
            ? [
                line(
                  { id: "bank", kind: "ASSET", purpose: "BANK" },
                  refund ? 0n : 2000n,
                  refund ? 2000n : 0n,
                ),
                line(control, refund ? 2000n : 0n, refund ? 0n : 2000n),
              ]
            : [line(advance, 5000n, 0n), line(control, 0n, 5000n)]
        return {
          reversalOfId: null,
          reversal: options.reversed ? { id: "reversal" } : null,
          lines,
        }
      },
    },
    customerLedgerCommand: {
      findUnique: async () => (options.noMapping ? null : command),
    },
    customerLedgerAllocation: {
      findFirst: async (args: { where: { id?: string } }) =>
        args.where.id === "original"
          ? {
              id: "original",
              orderSettlement: {
                orderId: "order",
                tenantId: "tenant",
                method: "CUSTOMER_CREDIT",
                type: "PAYMENT",
                amountMinor: 5000,
              },
              chargeEntryId: "temporary-charge",
              creditEntryId: "receipt",
              amountMinor: 5000n,
              charge: {
                orderId: "order",
                kind: "ORDER_PAYMENT",
                side: "DEBIT",
                sourceKind: "CUSTOMER_UNBILLED_ORDER_CREDIT",
                sourceId: "original",
                amountMinor: 5000n,
              },
              releases: [{ amountMinor: 2000n }, { amountMinor: 3000n }],
            }
          : args.where.id === "replacement"
            ? {
                id: "replacement",
                creditEntryId: "receipt",
                amountMinor: options.mismatch ? 3001n : 3000n,
                sequence: 8n,
                charge: {
                  orderId: "order",
                  kind: "ORDER_CHARGE",
                  sourceKind: "COMMERCIAL_ORDER_BILLED",
                  sourceId: "order",
                  amountMinor: 10000n,
                },
              }
            : { id: "bridge" },
    },
    customerLedgerAllocationRelease: {
      findUnique: async () => ({
        id: "release",
        allocationId: "original",
        amountMinor: 3000n,
        sequence: 8n,
      }),
    },
    customerLedgerEntry: {
      findFirst: async () => ({
        id: "correction",
        kind: "REVERSAL",
        side: "CREDIT",
        sourceKind: "CUSTOMER_UNBILLED_CREDIT_RELEASE",
        sourceId: "release",
        amountMinor: 3000n,
        sequence: 8n,
        actorUserId: "merchant",
        effectiveAt: now,
      }),
    },
    commercialOrderPayment: {
      findFirst: async () => ({
        id: "cash",
        method: "BANK_TRANSFER",
        moneyAccountId: "bank",
        type: options.cashRefund ? "REFUND" : "PAYMENT",
        amountMinor: 2000,
        recordedByUserId: "merchant",
        recordedAt: now,
      }),
    },
  } as unknown as Prisma.TransactionClient
  return tx
}
const source = {
  tenantId: "tenant",
  orderId: "order",
  clientCommandId: "billing-reclass",
}

test("later billing moves the exact remaining original credit from custody to receivables, with no bank line", async () => {
  const release = await resolveCustomerBillingReclassification(fixture(), {
    ...source,
    kind: "CREDIT_RELEASE",
  })
  const allocation = await resolveCustomerBillingReclassification(fixture(), {
    ...source,
    kind: "CREDIT_ALLOCATION",
  })
  expect(release.input.sourceId).toBe("release")
  expect(release.input.lines).toEqual([
    { accountId: "control", side: "DEBIT", amountMinor: "3000" },
    { accountId: "advance", side: "CREDIT", amountMinor: "3000" },
  ])
  expect(allocation.input.sourceId).toBe("replacement")
  expect(allocation.input.lines).toEqual([
    { accountId: "advance", side: "DEBIT", amountMinor: "3000" },
    { accountId: "receivable", side: "CREDIT", amountMinor: "3000" },
  ])
})
test("reclassification refuses foreign lineage, amount drift and reversed custody", async () => {
  for (const options of [
    { mismatch: true },
    { foreign: true },
    { reversed: true },
  ])
    await expect(
      resolveCustomerBillingReclassification(fixture(options), {
        ...source,
        kind: "CREDIT_ALLOCATION",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
})
test("mixed cash sources reclassify existing custody in either direction without collecting or paying cash again", async () => {
  for (const refund of [false, true]) {
    const result = await resolveCustomerBillingReclassification(
      fixture({ cashRefund: refund }),
      {
        tenantId: "tenant",
        orderId: "order",
        kind: "CASH_COLLECTION",
        paymentId: "cash",
      },
    )
    expect(result.input.lines).toEqual([
      {
        accountId: "control",
        side: refund ? "CREDIT" : "DEBIT",
        amountMinor: "2000",
      },
      {
        accountId: "receivable",
        side: refund ? "DEBIT" : "CREDIT",
        amountMinor: "2000",
      },
    ])
  }
})
test("old allocation identity follows exact durable billing lineage and foreign/altered lineage refuses", async () => {
  const input = {
    tenantId: "tenant",
    accountId: "account",
    allocationId: "original",
  }
  expect(customerCreditBillingCommandId("original")).not.toBe(
    customerCreditBillingCommandId("other"),
  )
  expect(await resolveCustomerAllocationAfterBilling(fixture(), input)).toBe(
    "replacement",
  )
  expect(
    await resolveCustomerAllocationAfterBilling(
      fixture({ noMapping: true }),
      input,
    ),
  ).toBe("original")
  await expect(
    resolveCustomerAllocationAfterBilling(fixture({ foreign: true }), input),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
