import { describe, expect, test } from "bun:test"
import { receiptDownloadName } from "./receipt-name"

describe("receipt download names", () => {
  test("a single order names the order first, then the business", () => {
    expect(
      receiptDownloadName({
        businessName: "Jawdah Poultry QA",
        extension: "pdf",
        orderNumbers: ["ORD-012"],
      }),
    ).toBe("ORD-012 Receipt - Jawdah Poultry QA.pdf")
  })

  test("two and many orders stay short and readable", () => {
    expect(
      receiptDownloadName({
        businessName: "Jawdah",
        extension: "pdf",
        orderNumbers: ["ORD-013", "ORD-012"],
      }),
    ).toBe("ORD-013 & ORD-012 Receipts - Jawdah.pdf")
    expect(
      receiptDownloadName({
        businessName: "Jawdah",
        extension: "zip",
        images: true,
        orderNumbers: ["ORD-013", "ORD-012", "ORD-011"],
      }),
    ).toBe("ORD-013 + 2 more Receipts images - Jawdah.zip")
  })

  test("characters that break file paths are removed", () => {
    expect(
      receiptDownloadName({
        businessName: 'A/B: "Shop" <1>',
        extension: "png",
        orderNumbers: ["ORD/9"],
      }),
    ).toBe("ORD 9 Receipt - A B Shop 1.png")
  })

  test("a missing business name falls back to the order alone", () => {
    expect(receiptDownloadName({ extension: "pdf", orderNumbers: [] })).toBe(
      "Order Receipt.pdf",
    )
  })
})
