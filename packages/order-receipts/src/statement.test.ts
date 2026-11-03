import { describe, expect, test } from "bun:test"
import {
  type CustomerStatementDocument,
  customerStatementBalanceWords,
  customerStatementFilename,
  customerStatementLineWords,
  customerStatementPeriod,
} from "./statement"
import { renderCustomerStatement } from "./statement-pdf"

function line(
  id: string,
  side: "DEBIT" | "CREDIT",
  amount: number,
  title = side === "DEBIT" ? "Order ORD-1" : "Payment",
) {
  return {
    id,
    effectiveAt: "2026-10-05T10:00:00.000Z",
    title,
    detail: null,
    side,
    amountMinor: BigInt(amount),
  }
}

describe("customer statement period", () => {
  test("runs from the opening balance and closes with the period movement", () => {
    const period = customerStatementPeriod({
      openingMinor: BigInt(500000),
      entries: [
        line("a", "DEBIT", 800000),
        line("b", "CREDIT", 300000),
        line("c", "DEBIT", 450000),
      ],
    })
    expect(period.lines.map((l) => l.runningMinor)).toEqual([
      "1300000",
      "1000000",
      "1450000",
    ])
    expect(period).toMatchObject({
      openingMinor: "500000",
      chargedMinor: "1250000",
      paidMinor: "300000",
      closingMinor: "1450000",
    })
  })

  test("an empty period closes at its opening balance, including paid ahead", () => {
    expect(
      customerStatementPeriod({ openingMinor: BigInt(-2000), entries: [] }),
    ).toMatchObject({ closingMinor: "-2000", chargedMinor: "0", lines: [] })
  })

  test("refuses negative amounts", () => {
    expect(() =>
      customerStatementPeriod({
        openingMinor: BigInt(0),
        entries: [line("a", "DEBIT", -1)],
      }),
    ).toThrow()
  })

  test("prints no merchant note, only kind, Order number and method", () => {
    expect(
      customerStatementLineWords({
        kind: "ORDER_CHARGE",
        orderNumber: "ORD-1042",
        method: null,
      }),
    ).toEqual({ title: "Order ORD-1042", detail: null })
    expect(
      customerStatementLineWords({
        kind: "RECEIPT",
        orderNumber: null,
        method: "BANK_TRANSFER",
      }),
    ).toEqual({ title: "Payment", detail: "Bank transfer" })
    expect(
      customerStatementLineWords({
        kind: "REVERSAL",
        orderNumber: null,
        method: null,
      }).title,
    ).toBe("Correction")
  })

  test("balance words and file name", () => {
    expect(customerStatementBalanceWords("1450000", "NGN")).toBe(
      "₦14,500.00 owed",
    )
    expect(customerStatementBalanceWords("-200001", "NGN")).toBe(
      "₦2,000.01 paid ahead",
    )
    expect(customerStatementBalanceWords("0", "NGN")).toBe("₦0.00")
    expect(
      customerStatementFilename({
        customerName: "Amína Bello & Sons",
        from: "2026-10-01",
        through: "2026-10-31",
      }),
    ).toBe("am-na-bello-sons-statement-2026-10-01-to-2026-10-31.pdf")
  })
})

describe("customer statement PDF", () => {
  test("renders opening, lines, closing and how to pay", async () => {
    const period = customerStatementPeriod({
      openingMinor: BigInt(500000),
      entries: [
        line("a", "DEBIT", 800000, "Order ORD-1042"),
        line("b", "CREDIT", 300000),
      ],
    })
    const statement: CustomerStatementDocument = {
      accountId: "account-1",
      customerId: "customer-1",
      currencyCode: "NGN",
      snapshotSequence: "7",
      timezone: "Africa/Lagos",
      from: "2026-10-01",
      through: "2026-10-31",
      issuedAt: "2026-11-03T09:00:00.000Z",
      business: {
        name: "Jawdah Farms",
        storeName: "Lekki",
        address: "12 Admiralty Way, Lagos",
        phone: "0803 111 2222",
        email: null,
      },
      customer: { name: "Amina Bello", phone: "0803 000 0001", email: null },
      paymentAccounts: [
        {
          bankName: "GTBank",
          accountNumber: "0123456789",
          accountHolder: "Jawdah Farms Ltd",
          mobileMoney: false,
        },
      ],
      ...period,
    }
    const bytes = await renderCustomerStatement(statement)
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const pdf = await getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    }).promise
    const content = await (await pdf.getPage(1)).getTextContent()
    // Letter-spaced labels come back split, so compare without spaces.
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join("")
      .replace(/\s+/g, "")
    for (const expected of [
      "STATEMENT",
      "Amina Bello",
      "Opening balance",
      "Order ORD-1042",
      "Closing balance",
      "10,000.00 owed",
      "HOW TO PAY",
      "0123456789",
    ])
      expect(text).toContain(expected.replace(/\s+/g, ""))
    await pdf.destroy()
  })
})
