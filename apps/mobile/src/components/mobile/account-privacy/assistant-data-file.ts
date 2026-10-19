import * as Crypto from "expo-crypto"
import { Directory, File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"
import {
  type AssistantDataFile,
  AssistantDataTransferError,
} from "./assistant-data-transfer"

/** A generated cache directory is the only filesystem target this flow may remove. */
export async function createAssistantDataFile(
  bytes: Uint8Array,
): Promise<AssistantDataFile> {
  const directory = new Directory(
    Paths.cache,
    `assistant-export-${Crypto.randomUUID()}`,
  )
  directory.create()
  const file = new File(directory, "ewatrade-assistant-data.json")
  const remove = async () => {
    if (directory.exists) directory.delete()
  }
  try {
    file.create()
    file.write(bytes)
    return { uri: file.uri, remove }
  } catch (error) {
    try {
      await remove()
    } catch {
      throw new AssistantDataTransferError("CLEANUP_FAILED")
    }
    throw error
  }
}

export async function shareAssistantDataFile(
  uri: string,
  assertCurrent: () => void,
) {
  if (!(await Sharing.isAvailableAsync())) throw Error("SHARING_UNAVAILABLE")
  assertCurrent()
  await Sharing.shareAsync(uri, {
    mimeType: "application/json",
    UTI: "public.json",
    dialogTitle: "Save or share assistant data",
  })
}
