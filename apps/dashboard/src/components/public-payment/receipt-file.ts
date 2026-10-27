import {
  type ReceiptContentType,
  type StoredReceipt,
  receiptContentTypes,
} from "./report-storage"

export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024
export const RECEIPT_ACCEPT = receiptContentTypes.join(",")

export type PickedReceipt = { file: File; meta: StoredReceipt }

export class ReceiptFileError extends Error {}

function isReceiptType(value: string): value is ReceiptContentType {
  return (receiptContentTypes as readonly string[]).includes(value)
}

export function receiptSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function sha256Hex(file: File) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle)
    throw new ReceiptFileError(
      "This browser can't attach receipts. You can still tell them without one.",
    )
  const hash = await subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Checks type and size, then fingerprints the exact bytes that will be uploaded. */
export async function readReceipt(file: File): Promise<PickedReceipt> {
  if (!isReceiptType(file.type))
    throw new ReceiptFileError("Choose a JPEG, PNG or WebP photo, or a PDF.")
  if (file.size < 1) throw new ReceiptFileError("That file is empty.")
  if (file.size > RECEIPT_MAX_BYTES)
    throw new ReceiptFileError("Choose a file up to 4 MB.")
  return {
    file,
    meta: {
      contentType: file.type,
      contentDigest: await sha256Hex(file),
      sizeBytes: file.size,
      fileName: file.name.slice(0, 120) || "receipt",
    },
  }
}
