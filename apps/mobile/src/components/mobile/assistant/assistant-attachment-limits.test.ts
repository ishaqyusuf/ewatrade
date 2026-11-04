import { expect, test } from "bun:test"
import {
  SETUP_ATTACHMENTS_PER_CONVERSATION,
  SETUP_ATTACHMENTS_PER_MESSAGE,
  SETUP_ATTACHMENT_LIMITS,
} from "@ewatrade/assistant/setup/attachments"
import {
  ASSISTANT_ATTACHMENT_COPY,
  ASSISTANT_ATTACHMENT_LIMITS,
  checkAssistantFile,
  countPdfPages,
} from "./assistant-attachment-limits"

const MB = 1024 * 1024

test("Ask box limits are the owner's, never looser than the server's", () => {
  expect(ASSISTANT_ATTACHMENT_LIMITS.perMessage).toBe(4)
  expect(ASSISTANT_ATTACHMENT_LIMITS.perMessage).toBe(
    SETUP_ATTACHMENTS_PER_MESSAGE,
  )
  expect(ASSISTANT_ATTACHMENT_LIMITS.perChat).toBe(60)
  expect(ASSISTANT_ATTACHMENT_LIMITS.perChat).toBe(
    SETUP_ATTACHMENTS_PER_CONVERSATION,
  )
  expect(ASSISTANT_ATTACHMENT_LIMITS.photo.maxBytes).toBe(10 * MB)
  expect(ASSISTANT_ATTACHMENT_LIMITS.photo.edge).toBe(2048)
  expect(ASSISTANT_ATTACHMENT_LIMITS.pdf.maxBytes).toBeLessThanOrEqual(5 * MB)
  expect(ASSISTANT_ATTACHMENT_LIMITS.pdf.maxBytes).toBeLessThanOrEqual(
    SETUP_ATTACHMENT_LIMITS.PDF.maxBytes,
  )
  expect(ASSISTANT_ATTACHMENT_LIMITS.pdf.maxPages).toBe(20)
  expect(ASSISTANT_ATTACHMENT_COPY.full).toBe("Up to 4 files per message")
  expect(ASSISTANT_ATTACHMENT_COPY.pdfTooLarge).toBe(
    "Choose a PDF under 2 MB and 20 pages.",
  )
})

test("photos and PDFs pass within their limits; anything else is refused", () => {
  for (const mimeType of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "IMAGE/HEIC",
  ])
    expect(checkAssistantFile({ mimeType, sizeBytes: 9 * MB })).toEqual({
      ok: true,
      kind: "photo",
    })
  expect(
    checkAssistantFile({ mimeType: "image/jpeg", sizeBytes: 10 * MB + 1 }),
  ).toEqual({ ok: false, error: "Choose a photo under 10 MB." })
  expect(
    checkAssistantFile({ mimeType: "application/pdf", sizeBytes: 2 * MB }),
  ).toEqual({ ok: true, kind: "pdf" })
  expect(
    checkAssistantFile({ mimeType: "application/pdf", sizeBytes: 3 * MB }),
  ).toEqual({ ok: false, error: "Choose a PDF under 2 MB and 20 pages." })
  expect(
    checkAssistantFile({ mimeType: "application/pdf", sizeBytes: 0 }).ok,
  ).toBe(false)
  for (const mimeType of ["text/csv", "image/gif", "application/zip", ""])
    expect(checkAssistantFile({ mimeType, sizeBytes: 1000 })).toEqual({
      ok: false,
      error: "Send a photo or a PDF.",
    })
})

test("PDF page objects are counted; packed ones are left to the server", () => {
  const pdf = (pages: number) =>
    new TextEncoder().encode(
      `%PDF-1.4\n1 0 obj << /Type /Pages /Count ${pages} >> endobj\n${Array.from(
        { length: pages },
        (_, i) => `${i + 2} 0 obj << /Type /Page /Parent 1 0 R >> endobj`,
      ).join("\n")}`,
    )
  expect(countPdfPages(pdf(1))).toBe(1)
  expect(countPdfPages(pdf(21))).toBe(21)
  expect(
    countPdfPages(new TextEncoder().encode("%PDF-1.7 /Type/ObjStm stream")),
  ).toBeNull()
})
