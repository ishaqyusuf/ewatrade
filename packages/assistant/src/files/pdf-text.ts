/**
 * Server-only PDF text extraction with page provenance. No OCR: scanned pages
 * without a text layer come back empty and the owner is told to send a photo.
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
// PDF.js runs its worker in-process on servers (see order-receipts).
import "pdfjs-dist/legacy/build/pdf.worker.mjs"
import { SetupFileParseError } from "./spreadsheet"

export type ParsedPages = {
  type: "pages"
  pages: Array<{ page: number; text: string }>
  totalPages: number
  truncated: boolean
}

type TextItem = { str?: string; hasEOL?: boolean }

export async function extractPdfText(
  bytes: Uint8Array,
  options: { maxPages?: number; maxChars?: number } = {},
): Promise<ParsedPages> {
  const maxPages = options.maxPages ?? 20
  const maxChars = options.maxChars ?? 40_000
  const task = getDocument({
    data: Uint8Array.from(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  })
  let document: Awaited<typeof task.promise>
  try {
    document = await task.promise
  } catch (error) {
    await task.destroy().catch(() => undefined)
    if (error instanceof Error && error.name === "PasswordException")
      throw new SetupFileParseError(
        "ENCRYPTED",
        "This PDF is password protected. Remove the password and try again.",
      )
    throw new SetupFileParseError("UNREADABLE", "This PDF could not be read.")
  }
  try {
    const pages: ParsedPages["pages"] = []
    let used = 0
    let truncated = document.numPages > maxPages
    for (
      let number = 1;
      number <= Math.min(document.numPages, maxPages);
      number++
    ) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      const text = (content.items as TextItem[])
        .map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : ""}`)
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
      page.cleanup()
      if (!text) continue
      const room = maxChars - used
      if (room <= 0) {
        truncated = true
        break
      }
      const kept = text.slice(0, room)
      if (kept.length < text.length) truncated = true
      used += kept.length
      pages.push({ page: number, text: kept })
    }
    if (pages.length === 0)
      throw new SetupFileParseError(
        "EMPTY",
        "This PDF has no readable text. Send a photo of the pages instead.",
      )
    return { type: "pages", pages, totalPages: document.numPages, truncated }
  } finally {
    await document.destroy().catch(() => undefined)
  }
}
