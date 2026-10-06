import { zipSync } from "fflate"
import { receiptFileStem } from "./types"

export function decodeReceiptBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

export function receiptImageFile(
  pages: Array<{ base64: string }>,
  orderNumbers: string[],
) {
  const first = pages[0]
  if (!first) throw new Error("No receipt images are available.")
  const stem =
    orderNumbers.length === 1
      ? receiptFileStem(orderNumbers[0] ?? "order")
      : "order-receipts"
  if (pages.length === 1)
    return {
      bytes: decodeReceiptBase64(first.base64),
      filename: `${stem}.png`,
      mimeType: "image/png",
    }
  const files: Record<string, Uint8Array> = {}
  pages.forEach((page, index) => {
    files[`${stem}-page-${String(index + 1).padStart(3, "0")}.png`] =
      decodeReceiptBase64(page.base64)
  })
  return {
    bytes: zipSync(files, { level: 0 }),
    filename: `${stem}-images.zip`,
    mimeType: "application/zip",
  }
}
