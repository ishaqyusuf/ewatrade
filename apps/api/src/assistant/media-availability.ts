import { assistantProviderApiKey } from "@ewatrade/ai/provider"
import { isSetupAttachmentStorageAvailable } from "./attachment-storage"

type Environment = Readonly<Record<string, string | undefined>>

/**
 * What a sent file can be read as right now, so the + only offers what will
 * work. PDFs, sheets and text are read in-house; photos need the vision model
 * (OpenAI key), and QA businesses use the test reader. Nothing without storage.
 */
export function assistantMediaAvailability(
  dataClassification: "LIVE" | "QA",
  env: Environment = process.env,
  storageAvailable = isSetupAttachmentStorageAvailable,
) {
  if (!storageAvailable(dataClassification))
    return { photos: false, files: false }
  return {
    photos:
      dataClassification === "QA" ||
      Boolean(assistantProviderApiKey("OPENAI", env)),
    files: true,
  }
}
