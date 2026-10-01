import { createHash } from "node:crypto"
import { prisma } from "@ewatrade/db"
import {
  ServiceCommerceMediaError,
  getActiveTenantForUser,
  getCustomerAccountAgeStatus,
  recordServiceCommerceMediaIntake,
  recordStoredServiceCommerceMediaAsset,
  requestServiceCommerceMediaSafety,
} from "@ewatrade/db/queries"
import { enqueueServiceCommerceMediaSafety } from "@ewatrade/jobs"
import {
  SERVICE_COMMERCE_MEDIA_BASELINE_RETENTION_DAYS,
  detectServiceCommerceMediaMimeType,
  getConfiguredPrivateMediaProvider,
} from "@ewatrade/service-commerce"
import type { OpenAPIHono } from "@hono/zod-openapi"

import { serviceCommerceMediaUploadIntentSchema } from "../schemas/service-commerce-media"
import { createTRPCContext } from "../trpc/init"

type UploadDependencies = {
  enqueueSafety(input: {
    mediaAssetId: string
    storeId: string
    tenantId: string
  }): Promise<unknown>
  record(
    input: Parameters<typeof recordServiceCommerceMediaIntake>[1],
  ): Promise<Awaited<ReturnType<typeof recordServiceCommerceMediaIntake>>>
  recordStored(
    input: Parameters<typeof recordStoredServiceCommerceMediaAsset>[1],
  ): Promise<unknown>
  requestSafety(
    input: Parameters<typeof requestServiceCommerceMediaSafety>[1],
  ): Promise<unknown>
  store(input: {
    bytes: Uint8Array
    fileName: string
    mediaAssetId: string
    mimeType: Parameters<
      ReturnType<typeof getConfiguredPrivateMediaProvider>["store"]
    >[0]["mimeType"]
  }): Promise<{ storageReference: string }>
}

export async function resolveStaffMediaUploadTenant<T>(input: {
  getAccountAgeStatus(): Promise<{ eligible: boolean }>
  getTenantContext(): Promise<T>
}): Promise<{ status: "age_required" } | { status: "ready"; tenant: T }> {
  const age = await input.getAccountAgeStatus()
  if (!age.eligible) return { status: "age_required" }
  return { status: "ready", tenant: await input.getTenantContext() }
}

function uploadDependencies(): UploadDependencies {
  const storage = getConfiguredPrivateMediaProvider()
  return {
    enqueueSafety: enqueueServiceCommerceMediaSafety,
    record: (input) => recordServiceCommerceMediaIntake(prisma, input),
    recordStored: (input) =>
      recordStoredServiceCommerceMediaAsset(prisma, input),
    requestSafety: (input) => requestServiceCommerceMediaSafety(prisma, input),
    store: (input) => storage.store(input),
  }
}

export async function storeStaffServiceCommerceMediaUpload(
  input: {
    actorUserId: string
    bytes: Uint8Array
    clientMediaId: string
    fileName: string
    kind: "image" | "document"
    mimeType:
      | "image/jpeg"
      | "image/png"
      | "image/webp"
      | "image/heic"
      | "image/heif"
      | "application/pdf"
    source: {
      id: string
      kind: "service" | "prescription" | "commerce_inquiry"
    }
    sourceLineId: string
    sourceVersion: string
    storeId: string
    tenantId: string
  },
  dependencies: UploadDependencies = uploadDependencies(),
) {
  const signatureMimeType = detectServiceCommerceMediaMimeType(input.bytes)
  const contentDigest = createHash("sha256").update(input.bytes).digest("hex")
  const recorded = await dependencies.record({
    actorUserId: input.actorUserId,
    channel: "staff",
    clientMediaId: input.clientMediaId,
    contentDigest,
    fileName: input.fileName,
    kind: input.kind,
    mimeType: input.mimeType,
    privateMediaProviderReady: true,
    retentionUntil: new Date(
      Date.now() +
        SERVICE_COMMERCE_MEDIA_BASELINE_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
    ),
    signatureMimeType,
    sizeBytes: input.bytes.byteLength,
    source: input.source,
    sourceLineId: input.sourceLineId,
    sourceVersion: input.sourceVersion,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  if (recorded.replayed && recorded.media.lifecycle !== "pending_upload") {
    return recorded
  }
  const stored = await dependencies.store({
    bytes: input.bytes,
    fileName: input.fileName,
    mediaAssetId: recorded.media.id,
    mimeType: input.mimeType,
  })
  await dependencies.recordStored({
    actorUserId: input.actorUserId,
    contentDigest,
    mediaAssetId: recorded.media.id,
    objectKey: stored.storageReference,
    reason: "staff_media_upload_stored",
    storeId: input.storeId,
    tenantId: input.tenantId,
    verifiedMediaType: input.mimeType,
    verifiedSizeBytes: input.bytes.byteLength,
  })
  await dependencies.requestSafety({
    actorUserId: input.actorUserId,
    mediaAssetId: recorded.media.id,
    reason: "staff_media_upload_ready_for_safety",
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  await dependencies.enqueueSafety({
    mediaAssetId: recorded.media.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  return recorded
}

export function registerServiceCommerceMediaUploadRoutes(app: OpenAPIHono) {
  app.post("/api/service-commerce/media/upload", async (context) => {
    const requestLength = Number(context.req.header("content-length") ?? 0)
    if (requestLength > 11_000_000) {
      return context.json({ error: "Attachment is too large." }, 413)
    }
    const requestContext = await createTRPCContext(undefined, context)
    const session = requestContext.session
    if (!session) {
      return context.json({ error: "Authentication required." }, 401)
    }
    const tenantAccess = await resolveStaffMediaUploadTenant({
      getAccountAgeStatus: () =>
        getCustomerAccountAgeStatus(prisma, session.user.id),
      getTenantContext: () =>
        getActiveTenantForUser(prisma, {
          tenantSlug: requestContext.tenantSlug,
          userId: session.user.id,
        }),
    })
    if (tenantAccess.status === "age_required") {
      return context.json(
        {
          error: "Choose an eligible age range before opening your workspace.",
        },
        412,
      )
    }
    const tenantContext = tenantAccess.tenant
    if (!tenantContext) {
      return context.json({ error: "Tenant not found." }, 404)
    }
    const form = await context.req.formData()
    const file = form.get("file")
    if (!file || typeof file === "string") {
      return context.json({ error: "Attachment file is required." }, 400)
    }
    const parsed = serviceCommerceMediaUploadIntentSchema.safeParse({
      clientMediaId: form.get("clientMediaId"),
      fileName: file.name,
      kind: form.get("kind"),
      mimeType: file.type,
      sizeBytes: file.size,
      source: {
        id: form.get("sourceId"),
        kind: form.get("sourceKind"),
      },
      sourceLineId: form.get("sourceLineId"),
      sourceVersion: form.get("sourceVersion"),
      storeId: form.get("storeId"),
    })
    if (!parsed.success) {
      return context.json({ error: "Attachment metadata is invalid." }, 400)
    }
    if (
      !tenantContext.stores.some((store) => store.id === parsed.data.storeId)
    ) {
      return context.json({ error: "Store not found." }, 404)
    }
    try {
      const result = await storeStaffServiceCommerceMediaUpload({
        ...parsed.data,
        actorUserId: session.user.id,
        bytes: new Uint8Array(await file.arrayBuffer()),
        tenantId: tenantContext.tenant.id,
      })
      return context.json(result, result.replayed ? 200 : 201)
    } catch (error) {
      if (error instanceof ServiceCommerceMediaError) {
        const status =
          error.code === "FORBIDDEN"
            ? 403
            : error.code === "NOT_FOUND"
              ? 404
              : 409
        return context.json({ error: error.message }, status)
      }
      throw error
    }
  })
}
