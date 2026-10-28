import { expect, test } from "bun:test"
import sharp from "sharp"
import { renderManualReceiptPdf } from "./manual-receipt-pdf"

import { ownedReceiptPdf as pdf } from "./manual-receipt-pdf.fixture"

test("PDF receipt rendering preserves every page and actual visible text pixels", async () => {
  const pages = await renderManualReceiptPdf(pdf(2))
  expect(pages).toHaveLength(2)
  if (!pages) throw new Error("Missing owned PDF render")
  for (const page of pages) {
    expect(page.width).toBe(600)
    expect(page.height).toBe(800)
    const { data } = await sharp(page.bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    // A blank/silently missing-font render cannot qualify as receipt evidence.
    expect(data.filter((channel) => channel < 80).length).toBeGreaterThan(100)
  }
}, 15_000)

test("unsupported PDFs fall back whole rather than silently rendering a subset", async () => {
  expect(await renderManualReceiptPdf(pdf(4))).toBeNull()
  expect(await renderManualReceiptPdf(pdf(1, 2000, 2000))).toBeNull()
  expect(
    await renderManualReceiptPdf(
      new TextEncoder().encode("%PDF-1.7\nunreadable"),
    ),
  ).toBeNull()
  expect(
    await renderManualReceiptPdf(new Uint8Array(4 * 1024 * 1024 + 1)),
  ).toBeNull()
}, 15_000)

test("an aborted render terminates its worker and frees capacity for the next receipt", async () => {
  const control = new AbortController()
  const cancelled = renderManualReceiptPdf(pdf(3), control.signal)
  control.abort()
  expect(await cancelled).toBeNull()
  const next = await renderManualReceiptPdf(pdf())
  expect(next).toHaveLength(1)
}, 15_000)
