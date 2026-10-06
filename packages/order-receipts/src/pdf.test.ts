import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { renderOrderReceipts } from "./pdf"
import { receiptFixture } from "./test-fixture"

describe("Receipt PDF renderer", () => {
  test("renders a whole-item total and note without multiplying quantity", async () => {
    const receipt = receiptFixture({
      orderNumber: "ORD-MANUAL",
      lines: [
        {
          id: "manual",
          name: "Broiler · Fully grown",
          unitName: "Bird",
          quantity: "3",
          unitPriceMinor: null,
          totalMinor: 10001,
          note: "Live weight recorded separately",
        },
      ],
      subtotalMinor: 10001,
      totalMinor: 10001,
      receivedMinor: 0,
      balanceMinor: 10001,
      payments: [],
    })
    const bytes = await renderOrderReceipts([receipt])
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const pdf = await getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    }).promise
    const content = await (await pdf.getPage(1)).getTextContent()
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
    expect(text).toContain("Item total")
    expect(text).toContain("100.01")
    expect(text).toContain("Live weight recorded separately")
    expect(text).not.toContain("300.03")
    await pdf.destroy()
  })
  test("embeds an actual font and produces bounded single, group and long PDFs", async () => {
    const folder = new URL(
      "../../../artifacts/order-receipts-dashboard/",
      import.meta.url,
    )
    mkdirSync(folder, { recursive: true })
    const single = receiptFixture()
    const long = receiptFixture({
      id: "long",
      orderNumber: "ORD-LONG",
      lines: Array.from({ length: 80 }, (_, i) => ({
        id: `line-${i}`,
        name: `Item ${i + 1} · Ẹwà quality rice with a long customer-facing description`,
        unitName: "Pack",
        quantity: "1",
        unitPriceMinor: 10000,
        totalMinor: 10000,
      })),
      subtotalMinor: 800000,
      totalMinor: 800000,
      receivedMinor: 400000,
      balanceMinor: 400000,
      paymentLabel: "Part paid",
      payments: [],
    })
    for (const [name, receipts] of [
      ["renderer-single.pdf", [single]],
      [
        "renderer-group.pdf",
        [single, receiptFixture({ id: "second", orderNumber: "ORD-0042" })],
      ],
      ["renderer-long.pdf", [long]],
    ] as const) {
      const bytes = await renderOrderReceipts([...receipts])
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-")
      expect(bytes.toString("latin1")).toContain("/FontFile2")
      writeFileSync(new URL(name, folder), bytes)
    }
  })
  test("refuses unsupported glyphs instead of silently corrupting text", async () => {
    await expect(
      renderOrderReceipts([receiptFixture({ customerName: "你好" })]),
    ).rejects.toThrow("cannot display")
  })
})
