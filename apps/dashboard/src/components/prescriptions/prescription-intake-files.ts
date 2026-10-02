const MAX_PAGES = 12
const MAX_FILE_SIZE_BYTES = 10_000_000

const ALLOWED_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export function validatePrescriptionIntakeFiles(files: readonly File[]) {
  if (files.length > MAX_PAGES) {
    return "Choose no more than 12 prescription pages."
  }

  const invalidType = files.find((file) => !ALLOWED_MEDIA_TYPES.has(file.type))
  if (invalidType) {
    return `${invalidType.name} is not a supported prescription file.`
  }

  const oversized = files.find((file) => file.size > MAX_FILE_SIZE_BYTES)
  if (oversized) {
    return `${oversized.name} is larger than 10 MB.`
  }

  const empty = files.find((file) => file.size === 0)
  if (empty) {
    return `${empty.name} is empty.`
  }

  return null
}
