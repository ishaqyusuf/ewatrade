import { Directory, File, Paths } from "expo-file-system"
import type * as ImagePicker from "expo-image-picker"
import type { PendingEvidence } from "./service-jobs-model"

function evidenceFileExtension(
  asset: ImagePicker.ImagePickerAsset,
  mediaType: "photo" | "video",
) {
  const fileNameExtension = asset.fileName?.split(".").pop()?.toLowerCase()
  if (fileNameExtension?.match(/^[a-z0-9]{2,5}$/)) return fileNameExtension
  if (asset.mimeType === "image/png") return "png"
  if (asset.mimeType === "image/heic") return "heic"
  if (asset.mimeType === "video/quicktime") return "mov"
  return mediaType === "photo" ? "jpg" : "mp4"
}

export function retainEvidenceAsset(
  asset: ImagePicker.ImagePickerAsset,
  clientEvidenceId: string,
  mediaType: "photo" | "video",
) {
  const evidenceDirectory = new Directory(Paths.document, "service-evidence")
  evidenceDirectory.create({ idempotent: true, intermediates: true })
  const retainedAsset = new File(
    evidenceDirectory,
    `${clientEvidenceId}.${evidenceFileExtension(asset, mediaType)}`,
  )
  new File(asset.uri).copy(retainedAsset)
  return retainedAsset.uri
}

export function discardRetainedEvidence(evidence: PendingEvidence) {
  try {
    new File(evidence.assetReference).delete()
  } catch {
    // A missing local file is already discarded.
  }
}
