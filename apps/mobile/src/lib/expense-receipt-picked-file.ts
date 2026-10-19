import {
  EXPENSE_RECEIPT_CONTENT_TYPES,
  validateExpenseReceiptFile,
} from "@ewatrade/utils/expense-receipt-state"

export type ReceiptPickedAsset = {
  uri: string
  name: string
  size?: number
  mimeType?: string
  file?: { size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> }
}

/** Read bounded originals; remove only the DocumentPicker-owned cache copy. */
export async function readExpenseReceiptPickedFile(input: {
  asset: ReceiptPickedAsset
  web: boolean
  cacheUri: string
  openFile(uri: string): {
    uri: string
    size: number
    exists: boolean
    bytes(): Promise<Uint8Array>
    delete(): void
  }
  assertCurrent(): void
}) {
  const { asset } = input
  const file = input.web ? undefined : input.openFile(asset.uri)
  const owned = file?.uri.startsWith(
    `${input.cacheUri.replace(/\/$/, "")}/DocumentPicker/`,
  )
  try {
    input.assertCurrent()
    const size = input.web ? asset.file?.size : file?.size
    const contentType = EXPENSE_RECEIPT_CONTENT_TYPES.find(
      (type) => type === (asset.file?.type || asset.mimeType),
    )
    if (!contentType || size === undefined || !Number.isSafeInteger(size))
      throw new Error("Choose an original image or PDF receipt.")
    const invalid = validateExpenseReceiptFile({
      type: contentType,
      size,
      name: asset.name,
    })
    if (invalid) throw new Error(invalid)
    if (asset.size !== undefined && asset.size !== size)
      throw new Error("The selected receipt changed. Choose it again.")
    const bytes =
      input.web && asset.file
        ? new Uint8Array(await asset.file.arrayBuffer())
        : await file?.bytes()
    input.assertCurrent()
    if (!bytes || bytes.byteLength !== size)
      throw new Error("The selected receipt changed. Choose it again.")
    return { bytes, contentType, originalFileName: asset.name.trim() }
  } finally {
    if (owned && file?.exists) file.delete()
  }
}
