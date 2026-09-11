import { createHash } from "node:crypto"

import { prisma } from "@ewatrade/db"
import { StoreConversationGuestCredentialPurpose } from "@ewatrade/db/enums"
import {
  PrescriptionRequestError,
  ServiceCommerceMediaError,
  StoreConversationError,
  appendGuestStoreConversationAttachment,
  commitGuestStoreConversationPrescriptionAttachment,
  createChannelCommerceInquiry,
  recordServiceCommerceMediaIntake,
  recordStoredServiceCommerceMediaAsset,
  requestServiceCommerceMediaSafety,
  resolveCreatedStoreConversationCommerceInquiryAttachmentTarget,
  resolveGuestStoreConversationAttachmentCapability,
  resolveGuestStoreConversationAttachmentUpload,
  submitServiceCommercePrescriptionRequest,
} from "@ewatrade/db/queries"
import {
  enqueuePrescriptionMediaSafety,
  enqueueServiceCommerceMediaSafety,
} from "@ewatrade/jobs"
import {
  getConfiguredPrivateMediaProvider as getPrescriptionMediaProvider,
  storePrescriptionMedia,
} from "@ewatrade/prescriptions"
import {
  SERVICE_COMMERCE_MEDIA_BASELINE_RETENTION_DAYS,
  SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES,
  type StoreConversationAttachmentCapabilityProjection,
  detectServiceCommerceMediaMimeType,
  getConfiguredPrivateMediaProvider as getGenericMediaProvider,
  storeConversationAttachmentCapabilityInputSchema,
  storeConversationAttachmentKindSchema,
  storeConversationAttachmentTargetSchema,
} from "@ewatrade/service-commerce"
import { z } from "zod"

import {
  issueStoreConversationAttachmentUploadAuthorization,
  verifyStoreConversationAttachmentUploadAuthorization,
} from "./conversation-attachment-upload-authorization"
import {
  StoreConversationVoiceNoteMetadataError,
  inspectStoreConversationVoiceNote,
} from "./voice-note-metadata"

const idSchema = z.string().trim().min(1).max(191)
const clientOperationIdSchema = z.string().trim().min(8).max(160)
const publicTokenSchema = z.string().trim().min(32).max(200)

const multipartMetadataSchema = z
  .object({
    clientMediaId: idSchema,
    clientOperationId: clientOperationIdSchema,
    conversationId: idSchema,
    kind: storeConversationAttachmentKindSchema,
    prescriptionConsentAccepted: z.boolean().optional(),
    publicToken: publicTokenSchema,
    target: storeConversationAttachmentTargetSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.target.kind === "new_prescription_request" &&
      input.prescriptionConsentAccepted !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Prescription privacy consent is required.",
        path: ["prescriptionConsentAccepted"],
      })
    }
    if (
      input.target.kind !== "new_prescription_request" &&
      input.prescriptionConsentAccepted !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Prescription consent does not apply to this Request.",
        path: ["prescriptionConsentAccepted"],
      })
    }
  })

export type StoreConversationAttachmentTransportChannel = "mobile" | "web"

function credentialPurpose(
  channel: StoreConversationAttachmentTransportChannel,
) {
  return channel === "mobile"
    ? StoreConversationGuestCredentialPurpose.MOBILE_DEVICE
    : StoreConversationGuestCredentialPurpose.WEB_DEVICE
}

export class StoreConversationAttachmentTransportError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "GUEST_CREDENTIAL_EXPIRED"
      | "CONFLICT"
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "NOT_READY"
      | "STORE_UNAVAILABLE"
      | "TOO_LARGE"
      | "UNAVAILABLE",
    message: string,
  ) {
    super(message)
    this.name = "StoreConversationAttachmentTransportError"
  }
}

type ResolveUpload = typeof resolveGuestStoreConversationAttachmentUpload

type AttachmentDependencies = {
  append: typeof appendGuestStoreConversationAttachment
  commitPrescription: typeof commitGuestStoreConversationPrescriptionAttachment
  createInquiry: typeof createChannelCommerceInquiry
  deleteGeneric(input: {
    mediaAssetId: string
    storageReference: string
  }): Promise<void>
  deletePrescription(objectKey: string): Promise<void>
  enqueueGenericSafety: typeof enqueueServiceCommerceMediaSafety
  enqueuePrescriptionSafety: typeof enqueuePrescriptionMediaSafety
  findPrescriptionMedia(input: {
    clientMediaId: string
    requestId: string
    storeId: string
    tenantId: string
  }): Promise<{ id: string } | null>
  findPrescriptionReplay(input: {
    clientMediaId: string
    clientRequestId: string
    storeId: string
    tenantId: string
  }): Promise<{
    clientMediaId: string
    id: string
    mediaType: string
    originalFileName: string
    requestId: string
    sha256: string
    sizeBytes: number
  } | null>
  recordGeneric: typeof recordServiceCommerceMediaIntake
  recordGenericSafety: typeof requestServiceCommerceMediaSafety
  recordGenericStored: typeof recordStoredServiceCommerceMediaAsset
  resolveCreatedInquiryTarget: typeof resolveCreatedStoreConversationCommerceInquiryAttachmentTarget
  resolveUpload: ResolveUpload
  storeGeneric: (input: {
    bytes: Uint8Array
    fileName: string
    mediaAssetId: string
    mimeType:
      | "application/pdf"
      | "audio/mp4"
      | "audio/mpeg"
      | "audio/ogg"
      | "audio/wav"
      | "audio/webm"
      | "image/heic"
      | "image/heif"
      | "image/jpeg"
      | "image/png"
      | "image/webp"
  }) => Promise<{ storageReference: string }>
  storePrescription: typeof storePrescriptionMedia
  submitPrescription: typeof submitServiceCommercePrescriptionRequest
}

function dependencies(): AttachmentDependencies {
  return {
    append: (db, input) => appendGuestStoreConversationAttachment(db, input),
    commitPrescription: (db, input) =>
      commitGuestStoreConversationPrescriptionAttachment(db, input),
    createInquiry: (db, input) => createChannelCommerceInquiry(db, input),
    deleteGeneric: (input) => getGenericMediaProvider().delete(input),
    deletePrescription: (objectKey) =>
      getPrescriptionMediaProvider().delete(objectKey),
    enqueueGenericSafety: enqueueServiceCommerceMediaSafety,
    enqueuePrescriptionSafety: enqueuePrescriptionMediaSafety,
    findPrescriptionMedia: (input) =>
      prisma.prescriptionMedia.findFirst({
        select: { id: true },
        where: input,
      }),
    findPrescriptionReplay: (input) =>
      prisma.prescriptionMedia.findFirst({
        select: {
          clientMediaId: true,
          id: true,
          mediaType: true,
          originalFileName: true,
          requestId: true,
          sha256: true,
          sizeBytes: true,
        },
        where: {
          clientMediaId: input.clientMediaId,
          request: { clientRequestId: input.clientRequestId },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
    recordGeneric: (db, input) => recordServiceCommerceMediaIntake(db, input),
    recordGenericSafety: (db, input) =>
      requestServiceCommerceMediaSafety(db, input),
    recordGenericStored: (db, input) =>
      recordStoredServiceCommerceMediaAsset(db, input),
    resolveCreatedInquiryTarget: (db, input) =>
      resolveCreatedStoreConversationCommerceInquiryAttachmentTarget(db, input),
    resolveUpload: (db, input) =>
      resolveGuestStoreConversationAttachmentUpload(db, input),
    storeGeneric: (input) => getGenericMediaProvider().store(input),
    storePrescription: (input) => storePrescriptionMedia(input),
    submitPrescription: (db, input) =>
      submitServiceCommercePrescriptionRequest(db, input),
  }
}

function providerIsReady(
  target: z.infer<typeof storeConversationAttachmentTargetSchema>,
) {
  try {
    if (
      target.kind === "new_prescription_request" ||
      (target.kind === "existing_request" &&
        target.request.kind === "prescription_request")
    ) {
      getPrescriptionMediaProvider()
    } else {
      getGenericMediaProvider()
    }
    return true
  } catch {
    return false
  }
}

function safeTransportError(
  error: unknown,
): StoreConversationAttachmentTransportError {
  if (error instanceof StoreConversationAttachmentTransportError) return error
  if (error instanceof StoreConversationError) {
    return new StoreConversationAttachmentTransportError(
      error.code === "GUEST_CREDENTIAL_EXPIRED"
        ? "GUEST_CREDENTIAL_EXPIRED"
        : error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "STORE_UNAVAILABLE"
              ? "STORE_UNAVAILABLE"
              : "NOT_READY",
      error.message,
    )
  }
  if (error instanceof ServiceCommerceMediaError) {
    return new StoreConversationAttachmentTransportError(
      error.code === "FORBIDDEN"
        ? "FORBIDDEN"
        : error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "IDEMPOTENCY_MISMATCH" ||
              error.code === "CONFLICT" ||
              error.code === "INVALID_STATE"
            ? "CONFLICT"
            : "NOT_READY",
      error.code === "IDEMPOTENCY_MISMATCH"
        ? "This attachment retry does not match the original file. Remove it and choose the file again."
        : "This attachment changed or is not ready. Refresh and try again.",
    )
  }
  if (error instanceof PrescriptionRequestError) {
    return new StoreConversationAttachmentTransportError(
      error.code === "REQUEST_NOT_FOUND" ? "NOT_FOUND" : "CONFLICT",
      error.code === "IDEMPOTENCY_MISMATCH"
        ? "This attachment retry does not match the original file. Remove it and choose the file again."
        : "This Prescription Request changed. Refresh and try again.",
    )
  }
  if (error instanceof StoreConversationVoiceNoteMetadataError) {
    return new StoreConversationAttachmentTransportError(
      error.code === "TOO_LARGE" ? "TOO_LARGE" : "INVALID_INPUT",
      error.message,
    )
  }
  if (error instanceof Error && error.name === "ZodError") {
    return new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "Attachment details are invalid.",
    )
  }
  return new StoreConversationAttachmentTransportError(
    "UNAVAILABLE",
    "Attachments are currently unavailable.",
  )
}

function requestForNewSource(input: {
  id: string
  kind: "commerce_inquiry" | "prescription_request"
}) {
  return { id: input.id, kind: input.kind, revision: 1 } as const
}

export async function resolveStoreConversationAttachmentCapability(
  input: {
    channel: StoreConversationAttachmentTransportChannel
    credentialToken: string
    installationToken?: string
    conversationId: string
    publicToken: string
    target: z.infer<typeof storeConversationAttachmentTargetSchema>
  },
  deps: {
    resolveCapability: typeof resolveGuestStoreConversationAttachmentCapability
  } = {
    resolveCapability: (db, command) =>
      resolveGuestStoreConversationAttachmentCapability(db, command),
  },
): Promise<StoreConversationAttachmentCapabilityProjection> {
  const parsed = storeConversationAttachmentCapabilityInputSchema.parse({
    conversationId: input.conversationId,
    publicToken: input.publicToken,
    target: input.target,
  })
  try {
    const capability = await deps.resolveCapability(prisma, {
      channel: input.channel,
      conversationId: parsed.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      privateMediaProviderReady: providerIsReady(input.target),
      publicToken: parsed.publicToken,
      purpose: credentialPurpose(input.channel),
      target: input.target,
    })
    return {
      ...capability,
      uploadAuthorization: capability.available
        ? issueStoreConversationAttachmentUploadAuthorization({
            channel: input.channel,
            conversationId: parsed.conversationId,
            credentialToken: input.credentialToken,
            installationToken: input.installationToken,
            publicToken: parsed.publicToken,
            target: input.target,
          })
        : null,
    }
  } catch (error) {
    throw safeTransportError(error)
  }
}

export async function processGuestStoreConversationAttachment(
  input: {
    bytes: Uint8Array
    channel: StoreConversationAttachmentTransportChannel
    clientMediaId: string
    clientOperationId: string
    conversationId: string
    credentialToken: string
    fileName: string
    installationToken?: string
    kind: "audio" | "document" | "image"
    mimeType: string
    prescriptionConsentAccepted?: boolean
    publicToken: string
    target: z.infer<typeof storeConversationAttachmentTargetSchema>
  },
  deps: AttachmentDependencies = dependencies(),
) {
  if (
    input.target.kind === "new_prescription_request" &&
    input.prescriptionConsentAccepted !== true
  ) {
    throw new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "Accept the Prescription privacy notice before sending media.",
    )
  }
  if (
    input.target.kind !== "new_prescription_request" &&
    input.prescriptionConsentAccepted !== undefined
  ) {
    throw new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "Prescription consent does not apply to this Request.",
    )
  }
  if (input.bytes.byteLength > SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES) {
    throw new StoreConversationAttachmentTransportError(
      "TOO_LARGE",
      "Attachment is too large.",
    )
  }
  const signatureMimeType = detectServiceCommerceMediaMimeType(input.bytes)
  if (!signatureMimeType || signatureMimeType !== input.mimeType) {
    throw new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "The attachment content does not match its file type.",
    )
  }
  const contentDigest = createHash("sha256").update(input.bytes).digest("hex")

  try {
    let resolved = await deps.resolveUpload(prisma, {
      channel: input.channel,
      conversationId: input.conversationId,
      credentialToken: input.credentialToken,
      file: {
        attachmentCount: 1,
        byteSize: input.bytes.byteLength,
        kind: input.kind,
        mimeType: signatureMimeType,
        signatureMimeType,
      },
      installationToken: input.installationToken,
      privateMediaProviderReady: providerIsReady(input.target),
      publicToken: input.publicToken,
      purpose: credentialPurpose(input.channel),
      target: input.target,
    })
    const voiceMetadata =
      input.kind === "audio"
        ? await inspectStoreConversationVoiceNote({
            bytes: input.bytes,
            declaredMimeType: input.mimeType,
          })
        : null

    if (resolved.target.kind === "new_commerce_inquiry") {
      const inquiry = await deps.createInquiry(prisma, {
        actorUserId: resolved.actorUserId,
        channelOrigin: "web",
        clientInquiryId: `${input.clientOperationId}:request`,
        consent: {
          contactOptIn: false,
          privacyNoticeVersion: "store-conversation-private-media-v1",
        },
        customerName: "Guest customer",
        demand: { kind: "commerce_inquiry", reason: "needs_identification" },
        intakeContext: resolved.intakeContext,
        lines: [{ description: "Customer attachment" }],
        storeId: resolved.storeId,
        summary: "Customer attachment",
        tenantId: resolved.tenantId,
        vertical: "service",
      })
      const request = requestForNewSource({
        id: inquiry.id,
        kind: "commerce_inquiry",
      })
      const target = await deps.resolveCreatedInquiryTarget(prisma, {
        actorUserId: resolved.actorUserId,
        inquiryId: request.id,
        storeId: resolved.storeId,
        tenantId: resolved.tenantId,
      })
      resolved = { ...resolved, target }
    }

    if (resolved.target.kind === "new_prescription_request") {
      const existing = await deps.findPrescriptionReplay({
        clientMediaId: input.clientMediaId,
        clientRequestId: `${input.clientOperationId}:request`,
        storeId: resolved.storeId,
        tenantId: resolved.tenantId,
      })
      if (existing) {
        if (
          existing.mediaType !== signatureMimeType ||
          existing.originalFileName !== input.fileName ||
          existing.sha256 !== contentDigest ||
          existing.sizeBytes !== input.bytes.byteLength
        ) {
          throw new PrescriptionRequestError(
            "IDEMPOTENCY_MISMATCH",
            "This clinical media identity was already used with different content.",
          )
        }
        return await deps.append(prisma, {
          channel: input.channel,
          clientOperationId: input.clientOperationId,
          conversationId: input.conversationId,
          credentialToken: input.credentialToken,
          installationToken: input.installationToken,
          owner: { kind: "prescription", prescriptionMediaId: existing.id },
          publicToken: input.publicToken,
          purpose: credentialPurpose(input.channel),
          request: requestForNewSource({
            id: existing.requestId,
            kind: "prescription_request",
          }),
        })
      }
      const manifest = await deps.storePrescription({
        bytes: input.bytes,
        clientMediaId: input.clientMediaId,
        mediaType: signatureMimeType,
        originalFileName: input.fileName,
        pageNumber: 1,
        scopeId: resolved.storeId,
      })
      let created: Awaited<
        ReturnType<typeof submitServiceCommercePrescriptionRequest>
      >
      try {
        created = await deps.submitPrescription(prisma, {
          actorUserId: resolved.actorUserId,
          channel: "web",
          clientRequestId: `${input.clientOperationId}:request`,
          consentAcceptedAt: new Date(),
          consentVersion: "store-conversation-private-media-v1",
          fulfilmentPreference: "unspecified",
          intakeContext: resolved.intakeContext,
          media: [manifest],
          storeId: resolved.storeId,
          tenantId: resolved.tenantId,
        })
      } catch (error) {
        await deps.deletePrescription(manifest.objectKey).catch(() => undefined)
        throw error
      }
      if (created.created) {
        await deps
          .enqueuePrescriptionSafety(created.requestId)
          .catch(() => undefined)
      } else {
        await deps.deletePrescription(manifest.objectKey)
      }
      const prescriptionMedia = await deps.findPrescriptionMedia({
        clientMediaId: input.clientMediaId,
        requestId: created.requestId,
        storeId: resolved.storeId,
        tenantId: resolved.tenantId,
      })
      if (!prescriptionMedia) {
        throw new StoreConversationAttachmentTransportError(
          "UNAVAILABLE",
          "The prescription attachment could not be linked.",
        )
      }
      return await deps.append(prisma, {
        channel: input.channel,
        clientOperationId: input.clientOperationId,
        conversationId: input.conversationId,
        credentialToken: input.credentialToken,
        installationToken: input.installationToken,
        owner: {
          kind: "prescription",
          prescriptionMediaId: prescriptionMedia.id,
        },
        publicToken: input.publicToken,
        purpose: credentialPurpose(input.channel),
        request: requestForNewSource({
          id: created.requestId,
          kind: "prescription_request",
        }),
      })
    }

    if (resolved.target.kind === "prescription") {
      const manifest = await deps.storePrescription({
        bytes: input.bytes,
        clientMediaId: input.clientMediaId,
        mediaType: signatureMimeType,
        originalFileName: input.fileName,
        pageNumber: 1,
        scopeId: resolved.storeId,
      })
      if (input.target.kind !== "existing_request") {
        await deps.deletePrescription(manifest.objectKey)
        throw new StoreConversationAttachmentTransportError(
          "NOT_READY",
          "Choose the current Prescription Request for this attachment.",
        )
      }
      let committed: Awaited<
        ReturnType<typeof commitGuestStoreConversationPrescriptionAttachment>
      >
      try {
        committed = await deps.commitPrescription(prisma, {
          channel: input.channel,
          clientOperationId: input.clientOperationId,
          conversationId: input.conversationId,
          credentialToken: input.credentialToken,
          expectedMediaRevision: input.target.request.revision,
          installationToken: input.installationToken,
          media: manifest,
          publicToken: input.publicToken,
          purpose: credentialPurpose(input.channel),
          requestId: resolved.target.requestId,
        })
      } catch (error) {
        await deps.deletePrescription(manifest.objectKey).catch(() => undefined)
        throw error
      }
      if (committed.replayed) {
        await deps.deletePrescription(manifest.objectKey)
      } else {
        await deps
          .enqueuePrescriptionSafety(resolved.target.requestId)
          .catch(() => undefined)
      }
      return committed
    }
    if (resolved.target.kind !== "generic") {
      throw new StoreConversationAttachmentTransportError(
        "NOT_READY",
        "Choose a current Request for this attachment.",
      )
    }

    const recorded = await deps.recordGeneric(prisma, {
      actorUserId: resolved.actorUserId,
      channel: "web",
      clientMediaId: input.clientMediaId,
      contentDigest,
      fileName: input.fileName,
      kind: input.kind,
      mimeType: signatureMimeType,
      privateMediaProviderReady: true,
      retentionUntil: new Date(
        Date.now() +
          SERVICE_COMMERCE_MEDIA_BASELINE_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      ),
      signatureMimeType,
      sizeBytes: input.bytes.byteLength,
      source: resolved.target.source,
      sourceLineId: resolved.target.sourceLineId,
      sourceVersion: resolved.target.sourceVersion,
      storeId: resolved.storeId,
      tenantId: resolved.tenantId,
      verifiedDurationMs: voiceMetadata?.durationMs,
    })
    const initialGenericLifecycle = recorded.media.lifecycle
    if (initialGenericLifecycle === "pending_upload") {
      const stored = await deps.storeGeneric({
        bytes: input.bytes,
        fileName: input.fileName,
        mediaAssetId: recorded.media.id,
        mimeType: signatureMimeType,
      })
      try {
        await deps.recordGenericStored(prisma, {
          actorUserId: resolved.actorUserId,
          contentDigest,
          mediaAssetId: recorded.media.id,
          objectKey: stored.storageReference,
          reason: "store_conversation_customer_media_stored",
          storeId: resolved.storeId,
          tenantId: resolved.tenantId,
          verifiedMediaType: signatureMimeType,
          verifiedSizeBytes: input.bytes.byteLength,
        })
      } catch (error) {
        await deps
          .deleteGeneric({
            mediaAssetId: recorded.media.id,
            storageReference: stored.storageReference,
          })
          .catch(() => undefined)
        throw error
      }
    }
    const exactRequest =
      input.target.kind === "existing_request"
        ? input.target.request
        : requestForNewSource({
            id: resolved.target.source.id,
            kind: "commerce_inquiry",
          })
    const committed = await deps.append(prisma, {
      channel: input.channel,
      clientOperationId: input.clientOperationId,
      conversationId: input.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      owner: { kind: "generic", sourceAttachmentId: recorded.attachment.id },
      publicToken: input.publicToken,
      purpose: credentialPurpose(input.channel),
      request: exactRequest,
    })
    if (
      initialGenericLifecycle === "pending_upload" ||
      initialGenericLifecycle === "stored"
    ) {
      await deps
        .recordGenericSafety(prisma, {
          actorUserId: resolved.actorUserId,
          mediaAssetId: recorded.media.id,
          reason: "store_conversation_customer_media_ready_for_safety",
          storeId: resolved.storeId,
          tenantId: resolved.tenantId,
        })
        .catch(() => undefined)
    }
    if (
      initialGenericLifecycle === "pending_upload" ||
      initialGenericLifecycle === "stored" ||
      initialGenericLifecycle === "safety_pending"
    ) {
      await deps
        .enqueueGenericSafety({
          mediaAssetId: recorded.media.id,
          storeId: resolved.storeId,
          tenantId: resolved.tenantId,
        })
        .catch(() => undefined)
    }
    return committed
  } catch (error) {
    throw safeTransportError(error)
  }
}

export async function parseGuestStoreConversationAttachmentRequest(
  request: {
    formData(): Promise<{
      get(name: string): File | string | null
      getAll(name: string): Array<File | string>
    }>
    headers: { get(name: string): string | null }
    url: string
  },
  auth: {
    channel: StoreConversationAttachmentTransportChannel
    credentialToken: string | null | undefined
    installationToken?: string | null
    uploadAuthorization?: string | null
  },
  dependencies: {
    authorizeUpload?: (input: {
      channel: StoreConversationAttachmentTransportChannel
      credentialToken: string
      installationToken?: string
      token: string
    }) => Promise<
      ReturnType<typeof verifyStoreConversationAttachmentUploadAuthorization>
    >
  } = {},
) {
  if (!auth.credentialToken) {
    throw new StoreConversationAttachmentTransportError(
      "GUEST_CREDENTIAL_EXPIRED",
      "Open the Store link to continue.",
    )
  }
  if (auth.channel === "mobile" && !auth.installationToken) {
    throw new StoreConversationAttachmentTransportError(
      "FORBIDDEN",
      "This app installation could not be verified.",
    )
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "Attachment size is required.",
    )
  }
  if (contentLength > SERVICE_COMMERCE_MEDIA_MAX_ATTACHMENT_BYTES + 500_000) {
    throw new StoreConversationAttachmentTransportError(
      "TOO_LARGE",
      "Attachment is too large.",
    )
  }
  if (!auth.uploadAuthorization) {
    throw new StoreConversationAttachmentTransportError(
      "FORBIDDEN",
      "Refresh attachment access before sending this file.",
    )
  }
  let authorized: ReturnType<
    typeof verifyStoreConversationAttachmentUploadAuthorization
  >
  try {
    authorized = dependencies.authorizeUpload
      ? await dependencies.authorizeUpload({
          channel: auth.channel,
          credentialToken: auth.credentialToken,
          installationToken: auth.installationToken ?? undefined,
          token: auth.uploadAuthorization,
        })
      : verifyStoreConversationAttachmentUploadAuthorization({
          channel: auth.channel,
          credentialToken: auth.credentialToken,
          installationToken: auth.installationToken ?? undefined,
          token: auth.uploadAuthorization,
        })
  } catch {
    throw new StoreConversationAttachmentTransportError(
      "FORBIDDEN",
      "Refresh attachment access before sending this file.",
    )
  }
  if (!dependencies.authorizeUpload) {
    const currentCapability =
      await resolveStoreConversationAttachmentCapability({
        channel: auth.channel,
        conversationId: authorized.conversationId,
        credentialToken: auth.credentialToken,
        installationToken: auth.installationToken ?? undefined,
        publicToken: authorized.publicToken,
        target: authorized.target,
      })
    if (!currentCapability.available) {
      throw new StoreConversationAttachmentTransportError(
        "STORE_UNAVAILABLE",
        "This Store is not accepting new chat messages right now.",
      )
    }
  }
  const form = await request.formData().catch(() => {
    throw new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "Attachment form data is invalid.",
    )
  })
  const files = form.getAll("file")
  if (files.length !== 1 || !(files[0] instanceof File)) {
    throw new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "Choose one attachment.",
    )
  }
  const file = files[0]
  if (
    !file.name.trim() ||
    file.name.length > 255 ||
    new TextEncoder().encode(file.name).byteLength > 255
  ) {
    throw new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "Attachment file name is invalid.",
    )
  }
  let target: unknown
  try {
    target = JSON.parse(String(form.get("target") ?? ""))
  } catch {
    throw new StoreConversationAttachmentTransportError(
      "INVALID_INPUT",
      "Choose a valid Request for this attachment.",
    )
  }
  const metadata = multipartMetadataSchema.parse({
    clientMediaId: form.get("clientMediaId"),
    clientOperationId: form.get("clientOperationId"),
    conversationId: form.get("conversationId"),
    kind: form.get("kind"),
    prescriptionConsentAccepted:
      form.get("prescriptionConsentAccepted") === null
        ? undefined
        : form.get("prescriptionConsentAccepted") === "true",
    publicToken: form.get("publicToken"),
    target,
  })
  if (
    metadata.conversationId !== authorized.conversationId ||
    metadata.publicToken !== authorized.publicToken ||
    JSON.stringify(metadata.target) !== JSON.stringify(authorized.target)
  ) {
    throw new StoreConversationAttachmentTransportError(
      "FORBIDDEN",
      "Refresh attachment access before sending this file.",
    )
  }
  return processGuestStoreConversationAttachment({
    ...metadata,
    bytes: new Uint8Array(await file.arrayBuffer()),
    channel: auth.channel,
    credentialToken: auth.credentialToken,
    fileName: file.name,
    installationToken: auth.installationToken ?? undefined,
    mimeType: file.type,
  })
}

export function storeConversationAttachmentErrorResponse(error: unknown) {
  const mapped = safeTransportError(error)
  const status =
    mapped.code === "TOO_LARGE"
      ? 413
      : mapped.code === "INVALID_INPUT"
        ? 400
        : mapped.code === "GUEST_CREDENTIAL_EXPIRED"
          ? 401
          : mapped.code === "FORBIDDEN"
            ? 403
            : mapped.code === "NOT_FOUND"
              ? 404
              : mapped.code === "NOT_READY"
                ? 409
                : mapped.code === "STORE_UNAVAILABLE"
                  ? 412
                  : mapped.code === "CONFLICT"
                    ? 409
                    : 503
  return Response.json(
    { code: mapped.code, message: mapped.message },
    { headers: { "Cache-Control": "no-store" }, status },
  )
}
