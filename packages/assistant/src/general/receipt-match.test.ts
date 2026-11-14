import { describe, expect, test } from "bun:test"
import {
  type ReceiptFacts,
  matchReceipt,
  matchReceiptAccount,
  matchReceiptOrder,
  receiptNameMatches,
  receiptPurpose,
} from "./receipt-match"

const main = {
  id: "main",
  name: "Main bank",
  bankAccountNumber: "0123454417",
  bankAccountHolder: "Mama Ada Provisions",
  bankName: "GTBank",
}
const bisi = {
  id: "bisi",
  name: "Bisi Opay",
  bankAccountNumber: "8100093051",
  bankAccountHolder: "Bisi Ojo",
  bankName: "OPay",
}
const cash = { id: "cash", name: "Cash till Yaba" }
const accounts = [main, bisi, cash]
const orders = [
  {
    id: "o38",
    orderNumber: "S-1038",
    customerName: "Musa Ibrahim",
    customerId: "musa",
    balanceMinor: 6_200_000,
  },
  {
    id: "o39",
    orderNumber: "S-1039",
    customerName: "Chidi Eze",
    customerId: "chidi",
    balanceMinor: 2_450_000,
  },
  {
    id: "o36",
    orderNumber: "S-1036",
    customerName: "Funmi Bello",
    customerId: "funmi-s",
    balanceMinor: 940_000,
  },
]
const categories = ["Transport", "Generator fuel", "Rent", "Salaries"]
const facts = (over: Partial<ReceiptFacts>): ReceiptFacts => ({
  amountMinor: 6_200_000,
  senderName: null,
  senderAccount: null,
  senderBank: null,
  recipientName: "MAMA ADA PROVISIONS",
  recipientAccount: "0123454417",
  recipientBank: "GTBank",
  narration: null,
  caption: null,
  ...over,
})
const match = (over: Partial<ReceiptFacts>) =>
  matchReceipt({
    facts: facts(over),
    accounts,
    orders,
    categoryNames: categories,
  })

describe("receipt names", () => {
  test("word order, extra names and typos", () => {
    expect(receiptNameMatches("IBRAHIM MUSA ABDULLAHI", "Musa Ibrahim")).toBe(
      true,
    )
    expect(receiptNameMatches("chidi", "Chidi Eze")).toBe(true)
    expect(receiptNameMatches("AMAKA EZE", "Chidi Eze")).toBe(false)
    expect(receiptNameMatches("Ibrahim Muza", "Musa Ibrahim")).toBe(false)
    expect(receiptNameMatches("Ibrahiim Musa", "Musa Ibrahim")).toBe(true)
    expect(receiptNameMatches(null, "Musa Ibrahim")).toBe(false)
  })
})

describe("receipt accounts", () => {
  test("full, masked and last-four numbers", () => {
    const side = (account: string) => ({ account, name: null, bank: null })
    expect(matchReceiptAccount(side("0123454417"), accounts)?.id).toBe("main")
    expect(matchReceiptAccount(side("012****417"), accounts)?.id).toBe("main")
    expect(matchReceiptAccount(side("******3051"), accounts)?.id).toBe("bisi")
    expect(matchReceiptAccount(side("9999999999"), accounts)).toBeNull()
  })
  test("never guesses between two accounts with the same digits", () => {
    const twin = {
      ...main,
      id: "twin",
      bankAccountNumber: "7770004417",
      bankAccountHolder: "Tunde Bakare",
      bankName: "UBA",
    }
    expect(
      matchReceiptAccount({ account: "****4417", name: null, bank: null }, [
        main,
        twin,
      ]),
    ).toBeNull()
    expect(
      matchReceiptAccount(
        { account: "****4417", name: "TUNDE BAKARE", bank: "UBA" },
        [main, twin],
      )?.id,
    ).toBe("twin")
  })
  test("holder name with an agreeing bank when no number is printed", () => {
    expect(
      matchReceiptAccount(
        { account: null, name: "BISI OJO", bank: "OPay Digital" },
        accounts,
      )?.id,
    ).toBe("bisi")
    expect(
      matchReceiptAccount(
        { account: null, name: "BISI OJO", bank: "Access" },
        accounts,
      ),
    ).toBeNull()
  })
})

describe("matching a receipt", () => {
  test("19a sender name finds the owing order", () => {
    const outcome = match({ senderName: "MUSA IBRAHIM" })
    expect(outcome).toMatchObject({
      kind: "order_payment",
      reason: "sender",
      excessMinor: 0,
    })
    expect(outcome.kind === "order_payment" && outcome.order.id).toBe("o38")
  })
  test("19b remark names the customer when someone else paid", () => {
    const outcome = match({
      amountMinor: 940_000,
      senderName: "TOLU BELLO",
      narration: "Funmi Bello order",
    })
    expect(outcome).toMatchObject({ kind: "order_payment", reason: "remark" })
    expect(outcome.kind === "order_payment" && outcome.order.id).toBe("o36")
  })
  test("an order number in the remark wins", () => {
    const outcome = match({
      amountMinor: 100_000,
      senderName: "MUSA IBRAHIM",
      narration: "bal S1039",
    })
    expect(outcome.kind === "order_payment" && outcome.order.id).toBe("o39")
  })
  test("19c no match asks, then the typed name finds it", () => {
    expect(
      match({ amountMinor: 2_450_000, senderName: "AMAKA EZE" }),
    ).toMatchObject({ kind: "ask_order" })
    const typed = matchReceiptOrder({
      account: main,
      amountMinor: 2_450_000,
      facts: { narration: null, caption: null, senderName: "AMAKA EZE" },
      orders,
      typed: "chidi",
    })
    expect(typed).toMatchObject({ kind: "order_payment", reason: "typed" })
  })
  test("19d part payment and paying too much", () => {
    expect(
      match({ amountMinor: 4_000_000, senderName: "MUSA IBRAHIM" }),
    ).toMatchObject({
      kind: "order_payment",
      amountMinor: 4_000_000,
      excessMinor: 0,
    })
    expect(
      match({ amountMinor: 3_000_000, senderName: "CHIDI EZE" }),
    ).toMatchObject({
      kind: "order_payment",
      amountMinor: 2_450_000,
      excessMinor: 550_000,
    })
  })
  test("several orders for one customer: exact balance, else choose", () => {
    const two = [
      ...orders,
      {
        id: "o44",
        orderNumber: "S-1044",
        customerName: "Musa Ibrahim",
        customerId: "musa",
        balanceMinor: 1_000_000,
      },
    ]
    const exact = matchReceipt({
      facts: facts({ amountMinor: 1_000_000, senderName: "MUSA IBRAHIM" }),
      accounts,
      orders: two,
      categoryNames: [],
    })
    expect(exact.kind === "order_payment" && exact.order.id).toBe("o44")
    const neither = matchReceipt({
      facts: facts({ amountMinor: 500_000, senderName: "MUSA IBRAHIM" }),
      accounts,
      orders: two,
      categoryNames: [],
    })
    expect(neither).toMatchObject({ kind: "choose_order" })
  })
  test("19e both sides are business accounts: a transfer", () => {
    const outcome = match({
      amountMinor: 18_000_000,
      senderName: "BISI OJO",
      senderAccount: "810****051",
      senderBank: "OPay",
      narration: "today sales",
    })
    expect(outcome).toMatchObject({
      kind: "own_transfer",
      from: { id: "bisi" },
      to: { id: "main" },
    })
  })
  test("19f money out by remark", () => {
    const out = (narration: string) =>
      match({
        amountMinor: 1_500_000,
        senderName: "MAMA ADA PROVISIONS",
        senderAccount: "0123454417",
        recipientName: "IKEDI MOTORS",
        recipientAccount: "2099911111",
        recipientBank: "Zenith",
        narration,
      })
    expect(out("transport goods yaba")).toMatchObject({
      kind: "money_out",
      purpose: { type: "expense", categoryName: "Transport" },
    })
    expect(out("personal use")).toMatchObject({
      kind: "money_out",
      purpose: { type: "owner_withdrawal" },
    })
    expect(out("misc")).toMatchObject({ kind: "money_out", purpose: null })
  })
  test("19h paid into an account that isn't the business's", () => {
    expect(
      match({
        recipientAccount: "0228812000",
        recipientName: "TUNDE BAKARE",
        recipientBank: "GTBank",
      }),
    ).toMatchObject({ kind: "unknown_account" })
  })
  test("19j no amount", () => {
    expect(match({ amountMinor: null })).toMatchObject({ kind: "unreadable" })
  })
})

describe("purpose words", () => {
  test("saved category names win over built-in words", () => {
    expect(receiptPurpose("diesel for gen", ["Generator fuel"])).toEqual({
      type: "expense",
      categoryName: "Generator fuel",
    })
    expect(receiptPurpose("shop rent nov", [])).toEqual({
      type: "expense",
      categoryName: "Rent",
    })
    expect(receiptPurpose("for my upkeep", [])).toEqual({
      type: "owner_withdrawal",
    })
  })
})
