import {
  SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENTS_PER_INTAKE,
  SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES,
  SERVICE_COMMERCE_MEDIA_MIME_TYPES,
  type ServiceCommerceHumanVerifiedObservation,
  type ServiceCommerceMediaAssetLifecycle,
  type ServiceCommerceMediaIntakeBlocker,
  type ServiceCommerceMediaKind,
  type ServiceCommerceMediaMimeType,
  type ServiceCommerceMediaViewerGrantState,
  type ServiceCommerceObservationRevisionValidationStatus,
  type ServiceCommerceObservationValidationStatus,
  type ServiceCommercePrivateMediaSafetyLifecycle,
  type ServiceCommerceSourceAttachmentLifecycle,
} from "./schemas"

export type PrivateMediaProviderStoreInput = {
  bytes: Uint8Array
  fileName: string
  mediaAssetId: string
  mimeType: ServiceCommerceMediaMimeType
}

export type PrivateMediaProviderReadInput = {
  mediaAssetId: string
  storageReference: string
}

export type PrivateMediaProviderViewerGrantInput = {
  expiresAt: Date
  mediaAssetId: string
  storageReference: string
}

export type PrivateMediaProvider = {
  createViewerGrant(input: PrivateMediaProviderViewerGrantInput): Promise<{
    expiresAt: Date
    url: string
  }>
  delete(input: PrivateMediaProviderReadInput): Promise<void>
  read(input: PrivateMediaProviderReadInput): Promise<{
    bytes: Uint8Array
    fileName: string
    mimeType: ServiceCommerceMediaMimeType
  }>
  store(input: PrivateMediaProviderStoreInput): Promise<{
    storageReference: string
  }>
}

export type InMemoryPrivateMediaProvider = PrivateMediaProvider & {
  consumeViewerGrant(token: string): {
    bytes: Uint8Array
    fileName: string
    mimeType: ServiceCommerceMediaMimeType
  }
}

export type PrivateMediaSafetyProviderInput = {
  byteSize: number
  contentDigest: string
  mediaAssetId: string
  mimeType: ServiceCommerceMediaMimeType
  storageReference: string
}

export type PrivateMediaSafetyProvider = {
  inspect(input: PrivateMediaSafetyProviderInput): Promise<{
    lifecycle: ServiceCommercePrivateMediaSafetyLifecycle
  }>
}

export function createInMemoryPrivateMediaProvider(
  options: {
    now?: () => number
    viewerPath?: string
  } = {},
): InMemoryPrivateMediaProvider {
  const objects = new Map<
    string,
    {
      bytes: Uint8Array
      fileName: string
      mediaAssetId: string
      mimeType: ServiceCommerceMediaMimeType
    }
  >()
  const grants = new Map<
    string,
    { expiresAt: number; mediaAssetId: string; storageReference: string }
  >()
  const now = options.now ?? Date.now
  const viewerPath = options.viewerPath ?? "/api/service-commerce/media"

  return {
    async createViewerGrant(input) {
      const expiresAt = input.expiresAt.getTime()
      const remainingSeconds = Math.ceil((expiresAt - now()) / 1_000)
      if (remainingSeconds < 1 || remainingSeconds > 60) {
        throw new Error(
          "Private media viewer grants must expire within 60 seconds.",
        )
      }
      const object = objects.get(input.storageReference)
      if (!object || object.mediaAssetId !== input.mediaAssetId) {
        throw new Error("Private media object was not found.")
      }
      const token = crypto.randomUUID()
      grants.set(token, {
        expiresAt,
        mediaAssetId: input.mediaAssetId,
        storageReference: input.storageReference,
      })
      return {
        expiresAt: input.expiresAt,
        url: `${viewerPath}/${token}`,
      }
    },
    consumeViewerGrant(token) {
      const grant = grants.get(token)
      grants.delete(token)
      if (!grant || grant.expiresAt <= now()) {
        throw new Error("Private media viewer grant is unavailable.")
      }
      const object = objects.get(grant.storageReference)
      if (!object || object.mediaAssetId !== grant.mediaAssetId) {
        throw new Error("Private media object was not found.")
      }
      return {
        bytes: new Uint8Array(object.bytes),
        fileName: object.fileName,
        mimeType: object.mimeType,
      }
    },
    async delete(input) {
      const object = objects.get(input.storageReference)
      if (!object) {
        return
      }
      if (object.mediaAssetId !== input.mediaAssetId) {
        throw new Error("Private media object was not found.")
      }
      objects.delete(input.storageReference)
    },
    async read(input) {
      const object = objects.get(input.storageReference)
      if (!object || object.mediaAssetId !== input.mediaAssetId) {
        throw new Error("Private media object was not found.")
      }
      return {
        bytes: new Uint8Array(object.bytes),
        fileName: object.fileName,
        mimeType: object.mimeType,
      }
    },
    async store(input) {
      const storageReference = `memory:${input.mediaAssetId}`
      objects.set(storageReference, {
        bytes: new Uint8Array(input.bytes),
        fileName: input.fileName,
        mediaAssetId: input.mediaAssetId,
        mimeType: input.mimeType,
      })
      return { storageReference }
    },
  }
}

export function createDeterministicPrivateMediaSafetyProvider(
  input: {
    defaultLifecycle?: ServiceCommercePrivateMediaSafetyLifecycle
    outcomesByContentDigest?: Record<
      string,
      ServiceCommercePrivateMediaSafetyLifecycle
    >
  } = {},
): PrivateMediaSafetyProvider {
  return {
    async inspect(safetyInput) {
      return {
        lifecycle:
          input.outcomesByContentDigest?.[safetyInput.contentDigest] ??
          input.defaultLifecycle ??
          "safe",
      }
    },
  }
}

let developmentPrivateMediaProvider: InMemoryPrivateMediaProvider | undefined
let developmentPrivateMediaSafetyProvider:
  | PrivateMediaSafetyProvider
  | undefined

export function getConfiguredPrivateMediaProvider(): PrivateMediaProvider {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A production Service Commerce private media provider is not configured.",
    )
  }
  developmentPrivateMediaProvider ??= createInMemoryPrivateMediaProvider()
  return developmentPrivateMediaProvider
}

export function getConfiguredPrivateMediaSafetyProvider(): PrivateMediaSafetyProvider {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A production Service Commerce private media safety provider is not configured.",
    )
  }
  developmentPrivateMediaSafetyProvider ??=
    createDeterministicPrivateMediaSafetyProvider()
  return developmentPrivateMediaSafetyProvider
}

export function consumeDevelopmentPrivateMediaViewerGrant(token: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development media delivery is disabled in production.")
  }
  if (!developmentPrivateMediaProvider) {
    throw new Error("Private media viewer grant is unavailable.")
  }
  return developmentPrivateMediaProvider.consumeViewerGrant(token)
}

const MEDIA_ASSET_TRANSITIONS: Record<
  ServiceCommerceMediaAssetLifecycle,
  ServiceCommerceMediaAssetLifecycle[]
> = {
  deleted: [],
  pending_retrieval: ["stored", "retryable", "rejected", "deleted"],
  pending_upload: ["stored", "retryable", "rejected", "deleted"],
  quarantined: ["retention_hold", "deleted"],
  rejected: ["retention_hold", "deleted"],
  retention_hold: ["deleted"],
  retryable: [
    "pending_retrieval",
    "pending_upload",
    "safety_pending",
    "rejected",
    "retention_hold",
    "deleted",
  ],
  safe: ["retention_hold", "deleted"],
  safety_pending: ["safe", "quarantined", "rejected", "retryable", "deleted"],
  stored: ["safety_pending", "retryable", "deleted"],
}

const SOURCE_ATTACHMENT_TRANSITIONS: Record<
  ServiceCommerceSourceAttachmentLifecycle,
  ServiceCommerceSourceAttachmentLifecycle[]
> = {
  active: ["replaced", "removed"],
  removed: [],
  replaced: [],
}

const HUMAN_VERIFIED_OBSERVATION_TRANSITIONS: Record<
  ServiceCommerceHumanVerifiedObservation["lifecycle"],
  ServiceCommerceHumanVerifiedObservation["lifecycle"][]
> = {
  current: ["superseded", "withdrawn"],
  superseded: [],
  withdrawn: [],
}

function mediaKindMatchesMimeType(
  kind: ServiceCommerceMediaKind,
  mimeType: ServiceCommerceMediaMimeType,
): boolean {
  if (kind === "image") return mimeType.startsWith("image/")
  if (kind === "audio") return mimeType.startsWith("audio/")
  return mimeType === "application/pdf"
}

function matches(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end))
}

export function detectServiceCommerceMediaMimeType(
  bytes: Uint8Array,
): ServiceCommerceMediaMimeType | null {
  if (matches(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (matches(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf"
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp"
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12).toLowerCase()
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) {
      return "image/heic"
    }
    if (["heif", "heim", "heis", "mif1", "msf1"].includes(brand)) {
      return "image/heif"
    }
    if (["m4a ", "m4b ", "isom", "mp41", "mp42"].includes(brand)) {
      return "audio/mp4"
    }
  }
  if (matches(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm"
  if (ascii(bytes, 0, 4) === "OggS") return "audio/ogg"
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") {
    return "audio/wav"
  }
  if (
    ascii(bytes, 0, 3) === "ID3" ||
    (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0)
  ) {
    return "audio/mpeg"
  }
  return null
}

export function getServiceCommerceMediaIntakeValidation(input: {
  attachmentCount: number
  attachmentsEnabled: boolean
  byteSize: number
  channelReady: boolean
  kind: ServiceCommerceMediaKind
  mimeType: ServiceCommerceMediaMimeType
  policyAllowed: boolean
  privateMediaProviderReady: boolean
  signatureMimeType: ServiceCommerceMediaMimeType | null
}): { accepted: boolean; blockers: ServiceCommerceMediaIntakeBlocker[] } {
  const blockers: ServiceCommerceMediaIntakeBlocker[] = []

  if (!input.attachmentsEnabled) blockers.push("attachments_disabled")
  if (!input.channelReady) blockers.push("channel_unavailable")
  if (!input.policyAllowed) blockers.push("policy_restricted")
  if (!input.privateMediaProviderReady) {
    blockers.push("private_media_provider_unavailable")
  }
  if (
    input.attachmentCount > SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENTS_PER_INTAKE
  ) {
    blockers.push("attachment_limit_exceeded")
  }
  if (input.byteSize > SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES) {
    blockers.push("attachment_too_large")
  }
  if (!SERVICE_COMMERCE_MEDIA_MIME_TYPES.includes(input.mimeType)) {
    blockers.push("unsupported_mime_type")
  }
  if (
    !input.signatureMimeType ||
    input.signatureMimeType !== input.mimeType ||
    !mediaKindMatchesMimeType(input.kind, input.signatureMimeType)
  ) {
    blockers.push("signature_mime_mismatch")
  }

  return { accepted: blockers.length === 0, blockers }
}

export function canTransitionServiceCommerceMediaAsset(
  current: ServiceCommerceMediaAssetLifecycle,
  next: ServiceCommerceMediaAssetLifecycle,
): boolean {
  return MEDIA_ASSET_TRANSITIONS[current].includes(next)
}

export function canTransitionServiceCommerceSourceAttachment(
  current: ServiceCommerceSourceAttachmentLifecycle,
  next: ServiceCommerceSourceAttachmentLifecycle,
): boolean {
  return SOURCE_ATTACHMENT_TRANSITIONS[current].includes(next)
}

export function canTransitionServiceCommerceHumanVerifiedObservation(
  current: ServiceCommerceHumanVerifiedObservation["lifecycle"],
  next: ServiceCommerceHumanVerifiedObservation["lifecycle"],
): boolean {
  return HUMAN_VERIFIED_OBSERVATION_TRANSITIONS[current].includes(next)
}

export function getServiceCommerceMediaViewerGrantState(input: {
  accessAuthorized: boolean
  assetLifecycle: ServiceCommerceMediaAssetLifecycle
  attachmentLifecycle: ServiceCommerceSourceAttachmentLifecycle
  expiresAt: Date
  now?: Date
}): ServiceCommerceMediaViewerGrantState {
  if (!input.accessAuthorized) return "access_denied"
  if (input.attachmentLifecycle !== "active") return "attachment_inactive"
  if (input.assetLifecycle !== "safe") return "asset_not_safe"
  if (input.expiresAt <= (input.now ?? new Date())) return "expired"
  return "available"
}

export function getServiceCommerceObservationValidation(input: {
  assetLifecycle: ServiceCommerceMediaAssetLifecycle
  attachmentLifecycle: ServiceCommerceSourceAttachmentLifecycle
  currentSourceVersion: string
  observation: ServiceCommerceHumanVerifiedObservation
}): ServiceCommerceObservationValidationStatus {
  if (input.observation.lifecycle !== "current") {
    return "observation_inactive"
  }
  if (input.attachmentLifecycle !== "active") return "attachment_inactive"
  if (input.assetLifecycle !== "safe") return "asset_not_safe"
  if (input.observation.sourceVersion !== input.currentSourceVersion) {
    return "stale_source"
  }
  return "valid"
}

export function getServiceCommerceObservationRevisionValidation(input: {
  currentObservation: ServiceCommerceHumanVerifiedObservation | null
  expectedRevision: number
}): ServiceCommerceObservationRevisionValidationStatus {
  if (!input.currentObservation) {
    return input.expectedRevision === 0 ? "valid" : "stale_observation"
  }
  if (
    input.currentObservation.lifecycle !== "current" ||
    input.currentObservation.revision !== input.expectedRevision
  ) {
    return "stale_observation"
  }
  return "valid"
}
