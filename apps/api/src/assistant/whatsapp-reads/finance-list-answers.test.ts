import { expect, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import { generalStoredPartSchema } from "@ewatrade/assistant/general/contracts"
import {
  expenseCategoriesReadAnswers,
  purchaseBillsReadAnswers,
  purchaseRegistrationsReadAnswers,
  supplierStatementReadAnswers,
  suppliersReadAnswers,
} from "./finance-list-answers"

const asOf = "2026-10-15T14:00:00.000Z"
const at = new Date(asOf)
const long = "👨‍👩‍👧‍👦".repeat(200)
const render = (answers: ReturnType<typeof suppliersReadAnswers>) => {
  const parts = answers.map((data) => ({ type: "data-general-answer", data }))
  for (const part of parts)
    expect(generalStoredPartSchema.safeParse(part).success).toBe(true)
  const reply = renderWhatsAppFinalReply(parts)
  expect(reply.kind).toBe("reply")
  return reply.chunks.join("\n")
}

test("supplier names and categories are individually bounded identities, never amount totals", () => {
  const suppliers = suppliersReadAnswers(
    {
      data: Array.from({ length: 11 }, (_, i) => ({
        id: String(i),
        bookId: "book",
        code: "SUPPLIER",
        name: long,
      })),
      nextCursor: "next",
    },
    asOf,
  )
  expect(suppliers).toHaveLength(11)
  const supplierText = render(suppliers)
  expect(supplierText).toContain("More records available")
  expect(supplierText).toContain("Ask which saved supplier")
  expect(supplierText).toContain("do not report amounts paid")
  const categoryPage: Parameters<typeof expenseCategoriesReadAnswers>[0] = {
    book: {
      id: "book",
      currencyCode: "NGN",
      startsAt: at,
      closedThrough: null,
    },
    accounts: [
      { id: "rent", code: "RENT", name: long, purpose: "OPERATING_EXPENSE" },
    ],
    nextCursor: "RENT",
    coverage: "ACTIVE_EXPENSE_CATEGORY_IDENTITIES",
  }
  const categoryText = render(expenseCategoriesReadAnswers(categoryPage, asOf))
  expect(categoryText).toContain("account-code cursor")
  expect(categoryText).toContain("not incurred spending")
  expect(categoryText).not.toContain("₦")
})

test("registration long descriptions and exact large agreed cost remain separate from recognition", () => {
  const page: Parameters<typeof purchaseRegistrationsReadAnswers>[0] = {
    bookId: "book",
    supplierId: "supplier",
    currencyCode: "NGN",
    items: [
      {
        id: "registration",
        bookId: "book",
        supplierId: "supplier",
        storeId: "store",
        agreedAt: at,
        description: long,
        amountMinor: "9007199254740993",
      },
    ],
    nextCursor: null,
  }
  const answers = purchaseRegistrationsReadAnswers(page, asOf)
  expect(answers[1]?.value).toBe("₦90,071,992,547,409.93 agreed")
  const text = render(answers)
  expect(text).toContain("Registration creates no payable or stock")
  expect(text).toContain("not paid money")
  expect(text).toContain("End of this list")
})

test("purchase lists keep complete matching aggregates separate from bounded bill facts", () => {
  const page: Parameters<typeof purchaseBillsReadAnswers>[0] = {
    currencyCode: "NGN",
    count: 200,
    summary: {
      incurredMinor: "100000",
      paidMinor: "40000",
      outstandingMinor: "60000",
      coverage: "SETTLED_AGAINST_BILLS",
    },
    nextCursor: "next",
    items: [
      {
        id: "bill",
        supplierId: "supplier",
        supplier: { id: "supplier", name: "Supplier" },
        payeeName: long,
        description: long,
        reference: null,
        incurredAt: at,
        dueAt: null,
        storeId: "store",
        totalMinor: "10000",
        paidMinor: "10000",
        outstandingMinor: "0",
        status: "VOID",
      },
    ],
  }
  const answers = purchaseBillsReadAnswers(page, asOf)
  expect(answers[0]?.value).toBe("1 on this page · 200 matching")
  const text = render(answers)
  expect(text).toContain("incurred ₦1,000.00")
  expect(text).toContain("outstanding ₦600.00")
  expect(text).toContain("not sums of this page")
  expect(text).toContain("Settled includes advances, not all new cash")
  expect(text).toContain("Voided bill; cannot be paid")
  expect(text).toContain("Book, supplier and status")
})

test("supplier statement preserves exact snapshot controls, original entry side and corrections", () => {
  const entry: Parameters<
    typeof supplierStatementReadAnswers
  >[0]["data"][number] = {
    id: "entry",
    kind: "PURCHASE_PAYMENT",
    side: "DEBIT",
    amountMinor: "100",
    description: long,
    effectiveAt: at,
    recordedAt: at,
    actorUserId: "actor",
    journalEntryId: "journal",
    sequence: "7",
    moneyAccountId: "bank",
    reversalOfId: null,
    reversal: {
      id: "reversal",
      sequence: "8",
      effectiveAt: at,
      description: "Corrected",
    },
  }
  const statement: Parameters<typeof supplierStatementReadAnswers>[0] = {
    supplier: { id: "supplier", bookId: "book", code: "SUPPLIER", name: long },
    currencyCode: "NGN",
    snapshotSequence: "9007199254740993",
    payableMinor: "5000",
    advanceMinor: "2000",
    data: [
      entry,
      {
        ...entry,
        id: "reversal",
        kind: "REVERSAL",
        side: "CREDIT",
        reversalOfId: "entry",
        reversal: null,
      },
    ],
    nextCursor: "6",
  }
  const answers = supplierStatementReadAnswers(statement, asOf)
  expect(answers[0]?.value).toBe("₦50.00 payable")
  const text = render(answers)
  expect(text).toContain("supplier advance ₦20.00 is separate")
  expect(text).toContain("snapshot 9007199254740993")
  expect(text).toContain("Original posting has a linked reversal")
  expect(text).toContain("Reversal entry linked to an original posting")
  expect(text).toContain("not a cash direction")
  expect(text).toContain("not their sum or a complete entry count")
  expect(text).toContain("Book, supplier and snapshot")
  expect(text).not.toContain("actor")
})

test("empty lists preserve truthful page/identity limitations and invalid money fails closed", () => {
  const suppliers = render(
    suppliersReadAnswers({ data: [], nextCursor: null }, asOf),
  )
  expect(suppliers).toContain("0 identities on this page")
  expect(suppliers).toContain("This page is not a complete total")
  const empty: Parameters<typeof purchaseRegistrationsReadAnswers>[0] = {
    bookId: "book",
    supplierId: "supplier",
    currencyCode: "NGN",
    items: [],
    nextCursor: null,
  }
  render(purchaseRegistrationsReadAnswers(empty, asOf))
  expect(() =>
    purchaseRegistrationsReadAnswers(
      {
        ...empty,
        currencyCode: "",
        items: [
          {
            id: "r",
            bookId: "book",
            supplierId: "supplier",
            storeId: "store",
            agreedAt: at,
            description: "Goods",
            amountMinor: "10.25",
          },
        ],
      },
      asOf,
    ),
  ).toThrow("Exact recorded money unavailable")
})
