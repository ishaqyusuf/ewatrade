import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import {
  isSimpleSaleIntent,
  saleFactsFromText,
  similarSaleNames,
  simpleSaleAction,
  simpleSaleStep,
} from "./simple-sale"
import { canonicalStatedMoneyDraft } from "./stated-money"
test("captions start a productless draft without requiring an image", () => {
  for (const text of [
    "Sales Reciept",
    "Sales Paid by yusuf ishaq",
    "Part paid by salman",
  ]) {
    expect(isSimpleSaleIntent(text)).toBe(true)
    const sale = generalActionSchema.parse({
      action: "sale_record",
      ...saleFactsFromText(text),
    })
    if (sale.action !== "sale_record") throw Error("wrong action")
    expect(sale.attachmentIds).toEqual([])
    expect(simpleSaleStep(sale)).toBe("received")
  }
  expect(isSimpleSaleIntent("sales report")).toBe(false)
  expect(isSimpleSaleIntent("refund sale")).toBe(false)
})
test("names and amounts come only from text", () => {
  expect(saleFactsFromText("Sales Paid by yusuf ishaq")).toEqual({
    customerName: "yusuf ishaq",
  })
  expect(saleFactsFromText("Part paid by salman")).toEqual({
    customerName: "salman",
    partial: true,
  })
  expect(saleFactsFromText("35,000, total is 105,000")).toEqual({
    receivedMinor: 3500000,
    totalMinor: 10500000,
    partial: true,
  })
  expect(saleFactsFromText("paid 2,500.50")).toEqual({ receivedMinor: 250050 })
  expect(saleFactsFromText("35,00")).toEqual({})
  expect(saleFactsFromText("Walk-in").customerChoice).toBe("walk_in")
})
test("partial payments require the full total before review", () => {
  const sale = simpleSaleAction.parse({
    action: "sale_record",
    accountName: "Ishaq PalmPay",
    createAccount: true,
    customerChoice: "walk_in",
    partial: true,
    description: "Two bags of rice",
  })
  expect(simpleSaleStep(sale)).toBe("received")
  expect(simpleSaleStep({ ...sale, receivedMinor: 3500000 })).toBe("total")
  expect(
    simpleSaleStep({ ...sale, receivedMinor: 3500000, totalMinor: 10500000 }),
  ).toBe("review")
  expect(
    simpleSaleStep({ ...sale, partial: false, receivedMinor: 3500000 }),
  ).toBe("review")
})
test("customer name stays unresolved until an explicit choice", () => {
  const sale = simpleSaleAction.parse({
    action: "sale_record",
    moneyAccountId: "bank",
    customerName: "Salman",
    receivedMinor: 10000,
    description: "Phone repair",
  })
  expect(simpleSaleStep(sale)).toBe("customer")
  expect(simpleSaleStep({ ...sale, customerId: "customer" })).toBe("review")
  expect(simpleSaleStep({ ...sale, customerChoice: "new" })).toBe("review")
  expect(
    simpleSaleStep({ ...sale, customerName: undefined, customerChoice: "new" }),
  ).toBe("customer")
})
test("normalized names, typos and reordered names give suggestions", () => {
  const names = [
    { name: "Ishaq PalmPay" },
    { name: "Yusuf Ishaq" },
    { name: "Salman" },
    { name: "Amina" },
  ]
  expect(similarSaleNames("ishaq palmpay", names)[0]?.name).toBe(
    "Ishaq PalmPay",
  )
  expect(similarSaleNames("Yusif Ishaq", names)[0]?.name).toBe("Yusuf Ishaq")
  expect(similarSaleNames("Ishaq Yusuf", names)[0]?.name).toBe("Yusuf Ishaq")
  expect(similarSaleNames("Salmam", names)[0]?.name).toBe("Salman")
  expect(similarSaleNames("Completelydifferent", names)).toEqual([])
})
test("model states major units, stored draft uses minor units, extraction is refused", () => {
  expect(
    canonicalStatedMoneyDraft({
      action: "sale_record",
      received: "35000",
      total: "105000",
    }),
  ).toMatchObject({ receivedMinor: 3500000, totalMinor: 10500000 })
  expect(
    simpleSaleAction.safeParse({ action: "sale_record", receivedMinor: -1 })
      .success,
  ).toBe(false)
  expect(
    simpleSaleAction.safeParse({
      action: "sale_record",
      extraction: { amount: 500 },
    }).success,
  ).toBe(false)
})

test("short sale caption asks amount; explicit amount and account defaults to Walk-in", () => {
  expect(
    simpleSaleStep(simpleSaleAction.parse({ action: "sale_record" })),
  ).toBe("received")
  for (const text of [
    "Sale 20k to Ishaq Palmpay account",
    "Sale 20,000 to Ishaq Palmpay account",
  ]) {
    const facts = saleFactsFromText(text)
    expect(facts).toEqual({
      receivedMinor: 2000000,
      accountName: "Ishaq Palmpay",
    })
    const sale = simpleSaleAction.parse({
      action: "sale_record",
      ...facts,
      createAccount: true,
    })
    expect(simpleSaleStep(sale)).toBe("description")
    expect(simpleSaleStep({ ...sale, description: "Two bags of rice" })).toBe(
      "review",
    )
  }
  expect(saleFactsFromText("20k")).toEqual({ receivedMinor: 2000000 })
  expect(saleFactsFromText("total 105k")).toEqual({ totalMinor: 10500000 })
})

test("new order with paid-to account and 50k starts a sale", () => {
  const text = "new order 50k paid to palm pay ishaq"
  expect(isSimpleSaleIntent(text)).toBe(true)
  expect(saleFactsFromText(text)).toEqual({
    receivedMinor: 5000000,
    accountName: "palm pay ishaq",
  })
  expect(
    similarSaleNames("palm pay ishaq", [{ name: "Ishaq PalmPay" }])[0]?.name,
  ).toBe("Ishaq PalmPay")
})

test("everyday order captions parse payment, account and optional customer", () => {
  const examples = [
    ["order 20k paid to cash", { receivedMinor: 2000000, accountName: "cash" }],
    [
      "order 50k by ishaq yusuf transfer to palmpay 02 account",
      {
        receivedMinor: 5000000,
        customerName: "ishaq yusuf",
        accountName: "palmpay 02",
      },
    ],
    [
      "sale 100k part paid 20k into Cash account",
      {
        receivedMinor: 2000000,
        totalMinor: 10000000,
        partial: true,
        accountName: "Cash",
      },
    ],
    [
      "Sales receipt paid 20,000 total 50,000",
      { receivedMinor: 2000000, totalMinor: 5000000, partial: true },
    ],
    [
      "new order 50000 transferred to PalmPay 02",
      { receivedMinor: 5000000, accountName: "PalmPay 02" },
    ],
  ] as const
  for (const [text, facts] of examples) {
    expect(isSimpleSaleIntent(text)).toBe(true)
    expect(saleFactsFromText(text)).toEqual(facts)
  }
  for (const text of [
    "show order",
    "order summary",
    "edit order",
    "refund order",
    "sales report",
  ])
    expect(isSimpleSaleIntent(text)).toBe(false)
})

test("amount units stay exact and unsupported kobo never becomes a major-unit sale", () => {
  expect(saleFactsFromText("order 50 thousand paid to cash")).toEqual({
    receivedMinor: 5000000,
    accountName: "cash",
  })
  expect(saleFactsFromText("order 0.5m paid to cash")).toEqual({
    receivedMinor: 50000000,
    accountName: "cash",
  })
  expect(
    saleFactsFromText("order 20kobo paid to cash").receivedMinor,
  ).toBeUndefined()
  expect(saleFactsFromText("order 20 total unknown")).toMatchObject({
    partial: true,
    receivedMinor: 2000,
  })
})

test("explicit non-sale funding never starts a sale", () => {
  for (const text of [
    "Owner contribution. I already put my own 20,000 naira into Shop cash today. No sale.",
    "Put 20k in Cash without creating a sale",
    "20k into Bank account, not a sale",
    "Record owner funds, do not create an order",
    "Customer deposit 50k into PalmPay",
    "Opening balance 20k in Cash",
  ])
    expect(isSimpleSaleIntent(text)).toBe(false)
  expect(isSimpleSaleIntent("Sale 20k paid to cash")).toBe(true)
})
