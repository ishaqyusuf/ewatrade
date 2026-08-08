import { storePrescriptionMedia } from "@ewatrade/prescriptions"

export async function storePrescriptionMediaUpload(input: {
  base64: string
  clientMediaId: string
  mediaType: string
  originalFileName: string
  pageNumber: number
  scopeId: string
}) {
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(Buffer.from(input.base64, "base64"))
  } catch {
    throw new Error("Prescription media encoding is invalid.")
  }
  return storePrescriptionMedia({
    bytes,
    clientMediaId: input.clientMediaId,
    mediaType: input.mediaType,
    originalFileName: input.originalFileName,
    pageNumber: input.pageNumber,
    scopeId: input.scopeId,
  })
}
