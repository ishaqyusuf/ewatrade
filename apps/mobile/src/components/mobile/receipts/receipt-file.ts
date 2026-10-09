import { requireOptionalNativeModule } from "expo"
import * as FileSystem from "expo-file-system/legacy"
import { Platform } from "react-native"

type DownloadSaver = {
  isSupported: () => boolean
  saveToDownloads: (
    sourceUri: string,
    displayName: string,
    mimeType: string,
    folder: string,
  ) => Promise<{ folder: string; name: string; uri: string }>
}

const downloadSaver =
  requireOptionalNativeModule<DownloadSaver>("DownloadSaver")
const DOWNLOAD_FOLDER = "EwaTrade"

export type ReceiptFile = {
  bytes: Uint8Array
  filename: string
  mimeType: string
}

function base64(bytes: Uint8Array) {
  const parts: string[] = []
  for (let start = 0; start < bytes.length; start += 8192) {
    parts.push(String.fromCharCode(...bytes.subarray(start, start + 8192)))
  }
  return btoa(parts.join(""))
}

export async function deliverReceiptFile(
  file: ReceiptFile,
  action: "save" | "share",
) {
  const encoded = base64(file.bytes)
  if (
    action === "save" &&
    Platform.OS === "android" &&
    downloadSaver?.isSupported() &&
    FileSystem.cacheDirectory
  ) {
    // Android 10+: straight into Downloads/EwaTrade, no folder prompt.
    const directory = `${FileSystem.cacheDirectory}receipt-save-${Date.now()}/`
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
    try {
      const uri = `${directory}${file.filename}`
      await FileSystem.writeAsStringAsync(uri, encoded, {
        encoding: FileSystem.EncodingType.Base64,
      })
      const saved = await downloadSaver.saveToDownloads(
        uri,
        file.filename,
        file.mimeType,
        DOWNLOAD_FOLDER,
      )
      return `Saved to ${saved.folder} as ${saved.name}`
    } finally {
      await FileSystem.deleteAsync(directory, { idempotent: true }).catch(
        () => undefined,
      )
    }
  }
  if (action === "save" && Platform.OS === "android") {
    // Older Android, or a build without the native saver: ask for a folder.
    const permission =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
    if (!permission.granted) return "Save cancelled."
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      file.filename,
      file.mimeType,
    )
    try {
      await FileSystem.writeAsStringAsync(uri, encoded, {
        encoding: FileSystem.EncodingType.Base64,
      })
    } catch (error) {
      // Only remove the incomplete file created by this operation.
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
        () => undefined,
      )
      throw error
    }
    return "Receipt saved to your selected folder."
  }
  const sharing = await import("expo-sharing")
  if (!(await sharing.isAvailableAsync()) || !FileSystem.cacheDirectory) {
    throw new Error(
      "File sharing is unavailable. Install the latest app build and try again.",
    )
  }
  const directory = `${FileSystem.cacheDirectory}receipt-${Date.now()}-${Math.random().toString(36).slice(2)}/`
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  try {
    const uri = `${directory}${file.filename}`
    await FileSystem.writeAsStringAsync(uri, encoded, {
      encoding: FileSystem.EncodingType.Base64,
    })
    await sharing.shareAsync(uri, {
      mimeType: file.mimeType,
      UTI:
        file.mimeType === "application/pdf"
          ? "com.adobe.pdf"
          : file.mimeType === "image/png"
            ? "public.png"
            : "public.zip-archive",
      dialogTitle: action === "save" ? "Save receipt" : "Share receipt",
    })
    // The share sheet reports nothing useful back, so show no notice.
    return ""
  } finally {
    await FileSystem.deleteAsync(directory, { idempotent: true }).catch(
      () => undefined,
    )
  }
}
