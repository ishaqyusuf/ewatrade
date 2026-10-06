import { FINANCE_BANK_STATEMENT_MAX_CSV_BYTES } from "@ewatrade/utils/finance-bank-statement"

type LocalFile = {
  uri: string
  size: number
  exists: boolean
  bytes: () => Promise<Uint8Array>
  delete: () => void
}

/** Reads only bounded picker files and removes the picker's own cache copy. */
export async function readNativeBankPickedFile({
  asset,
  web,
  cacheUri,
  openFile,
  isCurrent,
}: {
  asset: {
    uri: string
    name: string
    size?: number
    file?: { size: number; arrayBuffer: () => Promise<ArrayBuffer> }
  }
  web: boolean
  cacheUri: string
  openFile: (uri: string) => LocalFile
  isCurrent: () => boolean
}): Promise<Uint8Array | null> {
  const file = web ? undefined : openFile(asset.uri)
  const owned = file?.uri.startsWith(
    `${cacheUri.replace(/\/$/, "")}/DocumentPicker/`,
  )
  let result: Uint8Array | null = null
  let failure: Error | undefined
  try {
    result = await (async () => {
      if (!isCurrent()) return null
      if (!asset.name.toLowerCase().endsWith(".csv"))
        throw new Error("Choose a CSV statement.")
      const size = web ? asset.file?.size : file?.size
      if (
        size === undefined ||
        !Number.isSafeInteger(size) ||
        size < 1 ||
        size > FINANCE_BANK_STATEMENT_MAX_CSV_BYTES ||
        (asset.size !== undefined && asset.size !== size)
      )
        throw new Error("CSV statements must be between 1 byte and 512 KiB.")
      const bytes =
        web && asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : file
            ? await file.bytes()
            : null
      if (!bytes || bytes.byteLength !== size)
        throw new Error(
          "The selected CSV changed while being read. Choose it again.",
        )
      return isCurrent() ? bytes : null
    })()
  } catch (error) {
    failure =
      error instanceof Error ? error : new Error("The CSV could not be read.")
  } finally {
    if (owned && file?.exists) {
      try {
        file.delete()
      } catch {
        failure = new Error(
          "The temporary CSV copy could not be removed. Retry file selection.",
        )
      }
    }
  }
  if (failure) throw failure
  return result
}
