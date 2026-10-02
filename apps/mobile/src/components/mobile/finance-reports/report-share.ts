import * as FileSystem from "expo-file-system/legacy"
import { Platform, Share } from "react-native"

export async function shareFinanceCsv(csv: string, filename: string) {
  if (Platform.OS === "ios") {
    if (!FileSystem.cacheDirectory)
      throw new Error("File sharing is unavailable on this device.")
    const uri = `${FileSystem.cacheDirectory}${Date.now()}-${filename}`
    await FileSystem.writeAsStringAsync(uri, `\uFEFF${csv}`, {
      encoding: FileSystem.EncodingType.UTF8,
    })
    const result = await Share.share({ url: uri })
    return result.action === Share.dismissedAction
      ? "Share cancelled."
      : "CSV passed to the share sheet."
  }
  const result = await Share.share({ title: filename, message: csv })
  return result.action === Share.dismissedAction
    ? "Share cancelled."
    : "CSV text passed to the share sheet."
}

export async function saveFinanceCsv(csv: string, filename: string) {
  if (Platform.OS !== "android") return shareFinanceCsv(csv, filename)
  const permission =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
  if (!permission.granted) return "Save cancelled."
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    filename,
    "text/csv",
  )
  await FileSystem.writeAsStringAsync(uri, `\uFEFF${csv}`, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  return "CSV saved to your selected folder."
}
