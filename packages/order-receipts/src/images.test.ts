import { expect, test } from "bun:test"
import { unzipSync } from "fflate"
import { receiptImageFile } from "./files"
import { renderReceiptImages } from "./images"
import { renderOrderReceipts } from "./pdf"
import { receiptFixture } from "./test-fixture"

test("mobile images rasterize every PDF page and preserve exact PNG bytes in export", async () => {
  const pdf = await renderOrderReceipts([
    receiptFixture(),
    receiptFixture({ id: "second", orderNumber: "ORD-2" }),
  ])
  const pages = await renderReceiptImages(pdf)
  expect(pages).toHaveLength(2)
  const first = pages[0]
  if (!first) throw new Error("Missing rendered page")
  const png = Buffer.from(first.base64, "base64")
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  )
  expect(png.readUInt32BE(16)).toBe(first.width)
  expect(png.readUInt32BE(20)).toBe(first.height)
  expect(first.width).toBeGreaterThan(1000)
  const single = receiptImageFile([first], ["ORD-1"])
  expect(single.mimeType).toBe("image/png")
  expect(Buffer.from(single.bytes)).toEqual(png)
  const archive = receiptImageFile(pages, ["ORD-1", "ORD-2"])
  const files = unzipSync(archive.bytes)
  expect(Object.keys(files)).toHaveLength(2)
  expect(Buffer.from(Object.values(files)[0] ?? new Uint8Array())).toEqual(png)
}, 30000)

test("image preparation rejects invalid input and empty exports", async () => {
  await expect(renderReceiptImages(new Uint8Array([1, 2, 3]))).rejects.toThrow()
  expect(() => receiptImageFile([], [])).toThrow("No receipt images")
})
