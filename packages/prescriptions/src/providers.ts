export type PrescriptionMediaType =
  | "application/pdf"
  | "image/heic"
  | "image/heif"
  | "image/jpeg"
  | "image/png"
  | "image/webp"

const ALLOWED_MEDIA_TYPES = new Set<PrescriptionMediaType>([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export const PRESCRIPTION_MEDIA_MAX_BYTES = 10_000_000
export const PRESCRIPTION_MEDIA_MAX_PAGES = 12

export type PrescriptionMediaDescriptor = {
  mediaType: string
  pageNumber: number
  sizeBytes: number
}

export function validatePrescriptionMedia(
  input: PrescriptionMediaDescriptor,
): asserts input is PrescriptionMediaDescriptor & {
  mediaType: PrescriptionMediaType
} {
  if (!ALLOWED_MEDIA_TYPES.has(input.mediaType as PrescriptionMediaType)) {
    throw new Error("Unsupported prescription media type")
  }
  if (input.sizeBytes < 1) {
    throw new Error("Prescription media cannot be empty")
  }
  if (input.sizeBytes > PRESCRIPTION_MEDIA_MAX_BYTES) {
    throw new Error("Prescription media exceeds the 10 MB page limit")
  }
  if (input.pageNumber < 1 || input.pageNumber > PRESCRIPTION_MEDIA_MAX_PAGES) {
    throw new Error("Prescription media page is outside the supported range")
  }
}

export type PutPrivateMediaInput = {
  bytes: Uint8Array
  mediaType: string
  objectKey: string
}

export type PrivateMediaObject = {
  mediaType: string
  objectKey: string
  sizeBytes: number
  visibility: "private"
}

export interface PrivateMediaProvider {
  createAuthorizedDelivery(input: {
    expiresInSeconds: number
    objectKey: string
  }): Promise<{ expiresAt: Date; url: string }>
  delete(objectKey: string): Promise<void>
  get(objectKey: string): Promise<Uint8Array>
  put(input: PutPrivateMediaInput): Promise<PrivateMediaObject>
}

export class InMemoryPrivateMediaProvider implements PrivateMediaProvider {
  readonly #objects = new Map<
    string,
    { bytes: Uint8Array; mediaType: string }
  >()
  readonly #deliveries = new Map<
    string,
    { expiresAt: number; objectKey: string }
  >()
  readonly #now: () => number

  constructor(options: { now?: () => number } = {}) {
    this.#now = options.now ?? Date.now
  }

  async put(input: PutPrivateMediaInput): Promise<PrivateMediaObject> {
    if (!input.objectKey.trim()) {
      throw new Error("Private media object key is required")
    }
    this.#objects.set(input.objectKey, {
      bytes: input.bytes.slice(),
      mediaType: input.mediaType,
    })
    return {
      mediaType: input.mediaType,
      objectKey: input.objectKey,
      sizeBytes: input.bytes.byteLength,
      visibility: "private",
    }
  }

  async get(objectKey: string) {
    const object = this.#objects.get(objectKey)
    if (!object) throw new Error("Private media object was not found")
    return object.bytes.slice()
  }

  async delete(objectKey: string) {
    this.#objects.delete(objectKey)
  }

  async createAuthorizedDelivery(input: {
    expiresInSeconds: number
    objectKey: string
  }) {
    if (input.expiresInSeconds < 1 || input.expiresInSeconds > 60) {
      throw new Error("Authorized media delivery cannot exceed 60 seconds")
    }
    if (!this.#objects.has(input.objectKey)) {
      throw new Error("Private media object was not found")
    }
    const token = crypto.randomUUID()
    const expiresAt = this.#now() + input.expiresInSeconds * 1_000
    this.#deliveries.set(token, { expiresAt, objectKey: input.objectKey })
    return {
      expiresAt: new Date(expiresAt),
      url: `/api/prescriptions/media/${token}`,
    }
  }

  consumeAuthorizedDelivery(token: string) {
    const delivery = this.#deliveries.get(token)
    this.#deliveries.delete(token)
    if (!delivery || delivery.expiresAt <= this.#now()) {
      throw new Error("Authorized media delivery is unavailable")
    }
    const object = this.#objects.get(delivery.objectKey)
    if (!object) throw new Error("Private media object was not found")
    return { bytes: object.bytes.slice(), mediaType: object.mediaType }
  }
}

let developmentPrivateMediaProvider: InMemoryPrivateMediaProvider | undefined

export function getConfiguredPrivateMediaProvider(): PrivateMediaProvider {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A production private Prescription media provider is not configured.",
    )
  }
  developmentPrivateMediaProvider ??= new InMemoryPrivateMediaProvider()
  return developmentPrivateMediaProvider
}

export function consumeDevelopmentAuthorizedMedia(token: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development media delivery is disabled in production.")
  }
  if (!developmentPrivateMediaProvider) {
    throw new Error("Authorized media delivery is unavailable")
  }
  return developmentPrivateMediaProvider.consumeAuthorizedDelivery(token)
}

async function sha256(bytes: Uint8Array) {
  const safeBytes = new Uint8Array(bytes.byteLength)
  safeBytes.set(bytes)
  const digest = await crypto.subtle.digest("SHA-256", safeBytes.buffer)
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")
}

export async function storePrescriptionMedia(
  input: {
    bytes: Uint8Array
    clientMediaId: string
    mediaType: string
    originalFileName: string
    pageNumber: number
    scopeId: string
  },
  provider: PrivateMediaProvider = getConfiguredPrivateMediaProvider(),
) {
  const descriptor = {
    mediaType: input.mediaType,
    pageNumber: input.pageNumber,
    sizeBytes: input.bytes.byteLength,
  }
  validatePrescriptionMedia(descriptor)
  const objectKey = `prescriptions/${input.scopeId}/${crypto.randomUUID()}`
  const stored = await provider.put({
    bytes: input.bytes,
    mediaType: descriptor.mediaType,
    objectKey,
  })
  return {
    clientMediaId: input.clientMediaId,
    mediaType: descriptor.mediaType,
    objectKey: stored.objectKey,
    originalFileName: input.originalFileName,
    pageNumber: input.pageNumber,
    sha256: await sha256(input.bytes),
    sizeBytes: stored.sizeBytes,
  }
}

export type OcrMode =
  | "low-confidence"
  | "partial"
  | "success"
  | "timeout"
  | "unavailable"

export type OcrInput = {
  mediaRevision: number
  mode?: OcrMode
  objectKeys: string[]
  requestId: string
}

export type OcrLine = {
  confidence: number | null
  draftText: string
  lineNumber: number
}

export type OcrResult =
  | { lines: OcrLine[]; outcome: "completed" | "partial" }
  | {
      failureCode: "provider_timeout" | "provider_unavailable"
      outcome: "failed"
    }

export interface PrescriptionOcrProvider {
  readonly key: string
  transcribe(input: OcrInput): Promise<OcrResult>
}

export function createDeterministicOcrProvider(): PrescriptionOcrProvider {
  return {
    key: "deterministic-fake",
    async transcribe(input) {
      if (input.mode === "timeout") {
        return { failureCode: "provider_timeout", outcome: "failed" }
      }
      if (input.mode === "unavailable") {
        return { failureCode: "provider_unavailable", outcome: "failed" }
      }
      const lowConfidence = input.mode === "low-confidence"
      const lines = input.objectKeys.map((_, index) => ({
        confidence: lowConfidence ? 0.25 : 0.98,
        draftText: `Transcribed line ${index + 1}`,
        lineNumber: index + 1,
      }))
      return {
        lines,
        outcome: input.mode === "partial" ? "partial" : "completed",
      }
    },
  }
}

export type MediaSafetyResult = {
  outcome: "quarantined" | "rejected" | "safe"
  providerEventId: string
  safetyMetadata?: Record<string, unknown>
}

export interface PrescriptionMediaSafetyProvider {
  readonly key: string
  scan(input: {
    mediaId: string
    objectKey: string
  }): Promise<MediaSafetyResult>
}

export function createDeterministicMediaSafetyProvider(): PrescriptionMediaSafetyProvider {
  return {
    key: "deterministic-fake",
    async scan(input) {
      const outcome = input.objectKey.includes("quarantine")
        ? ("quarantined" as const)
        : input.objectKey.includes("reject")
          ? ("rejected" as const)
          : ("safe" as const)
      return {
        outcome,
        providerEventId: `scan:${input.mediaId}`,
        safetyMetadata: { providerKey: "deterministic-fake" },
      }
    },
  }
}
