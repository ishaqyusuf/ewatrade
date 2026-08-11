import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  getAuthorizedServiceCommerceMediaView,
  recordServiceCommerceMediaIntake,
} from "./service-commerce-attachments"
import {
  ServiceCommerceMediaError,
  claimServiceCommerceMediaRetrieval,
  projectSafeServiceCommerceMediaAsset,
  recordServiceCommerceMediaSafety,
  recordStoredServiceCommerceMediaAsset,
  rejectServiceCommerceMediaRetrieval,
  requestServiceCommerceMediaSafety,
  scheduleServiceCommerceMediaRetry,
} from "./service-commerce-media-assets"
import { createServiceCommerceHumanObservation } from "./service-commerce-observations"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

const scope = {
  actorUserId: "attendant_1",
  storeId: "store_1",
  tenantId: "tenant_1",
}

function asset(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    channelOrigin: "WEB",
    declaredMediaType: "image/jpeg",
    declaredSizeBytes: 24,
    id: "asset_1",
    kind: "IMAGE",
    lifecycle: "PENDING_UPLOAD",
    originalFileName: "bag.jpg",
    provider: null,
    providerConnectionId: null,
    providerMediaId: null,
    storeId: scope.storeId,
    tenantId: scope.tenantId,
    verifiedMediaType: null,
    verifiedSizeBytes: null,
    ...overrides,
  }
}

describe("Service Commerce media repositories", () => {
  test("persists media only after source, readiness, policy, and attachment-limit checks", async () => {
    const calls: Array<{ name: string; value: unknown }> = []
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      commerceInquiryLine: {
        findFirst: async () => ({
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          description: "Red bag",
          id: "line_1",
          inquiry: { status: "RECEIVED" },
          position: 1,
          requestedQuantity: 1,
        }),
      },
      serviceCommerceMediaAsset: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          calls.push({ name: "asset.create", value: data })
          return asset({ ...data, id: "asset_1" })
        },
        findFirst: async () => null,
      },
      serviceCommerceMediaAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          calls.push({ name: "audit.create", value: data })
          return { id: "audit_1" }
        },
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceCommerceSourceAttachment: {
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          createdAt: new Date("2026-08-10T12:00:01.000Z"),
          id: "attachment_1",
          lifecycle: "ACTIVE",
        }),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => ({
          attachmentsEnabled: true,
          attachmentsProviderReady: true,
          staffEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: false,
        }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppStoreBinding: { findFirst: async () => null },
    }
    const sourceVersion = createHash("sha256")
      .update(
        JSON.stringify({
          description: "Red bag",
          position: 1,
          quantity: "1",
        }),
      )
      .digest("hex")
    const recorded = await recordServiceCommerceMediaIntake(dbClient(client), {
      ...scope,
      channel: "web",
      clientMediaId: "client_1",
      fileName: "bag.jpg",
      kind: "image",
      mimeType: "image/jpeg",
      privateMediaProviderReady: true,
      retentionUntil: new Date("2027-08-10T12:00:00.000Z"),
      signatureMimeType: "image/jpeg",
      sizeBytes: 24,
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
      sourceLineId: "line_1",
      sourceVersion,
    })

    expect(recorded).toMatchObject({ replayed: false })
    expect(
      calls.find((call) => call.name === "asset.create")?.value,
    ).toMatchObject({
      lifecycle: "PENDING_UPLOAD",
      providerMediaId: null,
      tenantId: scope.tenantId,
    })
    expect(recorded.media).not.toHaveProperty("objectKey")
    expect(recorded.media).not.toHaveProperty("provider")
  })

  test("rejects a reused client identity with different source or payload", async () => {
    const existing = asset({
      attachments: [],
      channelOrigin: "WEB",
      clientMediaId: "client_1",
      provider: null,
      providerMediaId: null,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
    })
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      commerceInquiryLine: {
        findFirst: async () => ({
          createdAt: new Date(),
          description: "Red bag",
          id: "line_1",
          inquiry: { status: "RECEIVED" },
          position: 1,
          requestedQuantity: 1,
        }),
      },
      serviceCommerceMediaAsset: { findFirst: async () => existing },
    }
    await expect(
      recordServiceCommerceMediaIntake(dbClient(client), {
        ...scope,
        channel: "web",
        clientMediaId: "client_1",
        fileName: "changed.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        privateMediaProviderReady: true,
        retentionUntil: new Date("2027-08-10T12:00:00.000Z"),
        signatureMimeType: "image/jpeg",
        sizeBytes: 24,
        source: { id: "inquiry_1", kind: "commerce_inquiry" },
        sourceLineId: "line_1",
        sourceVersion: "wrong-current-source-version",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("accepts every generic web or staff image/document intake shape with a scoped private reference", async () => {
    const sourceVersion = createHash("sha256")
      .update(
        JSON.stringify({
          description: "Red bag",
          position: 1,
          quantity: "1",
        }),
      )
      .digest("hex")
    const cases = [
      {
        channel: "web" as const,
        kind: "image" as const,
        mimeType: "image/jpeg" as const,
      },
      {
        channel: "web" as const,
        kind: "document" as const,
        mimeType: "application/pdf" as const,
      },
      {
        channel: "staff" as const,
        kind: "image" as const,
        mimeType: "image/png" as const,
      },
      {
        channel: "staff" as const,
        kind: "document" as const,
        mimeType: "application/pdf" as const,
      },
    ]

    for (const [index, media] of cases.entries()) {
      const writes: Record<string, unknown>[] = []
      const client = {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback(client),
        commerceInquiryLine: {
          findFirst: async () => ({
            createdAt: new Date("2026-08-10T12:00:00.000Z"),
            description: "Red bag",
            id: "line_1",
            inquiry: { status: "RECEIVED" },
            position: 1,
            requestedQuantity: 1,
          }),
        },
        serviceCommerceMediaAsset: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            writes.push(data)
            return asset({ ...data, id: `asset_${index}` })
          },
          findFirst: async () => null,
        },
        serviceCommerceMediaAuditEvent: {
          create: async () => ({ id: "audit" }),
        },
        serviceCommercePolicyAuditEvent: {
          createMany: async () => ({ count: 1 }),
        },
        serviceCommercePolicyDecision: {
          findMany: async () => allowedServiceCommercePolicyDecisionRows(),
        },
        serviceCommerceSourceAttachment: {
          count: async () => 0,
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            ...data,
            createdAt: new Date("2026-08-10T12:00:01.000Z"),
            id: `attachment_${index}`,
            lifecycle: "ACTIVE",
          }),
        },
        serviceCommerceStoreProfile: {
          findFirst: async () => ({
            attachmentsEnabled: true,
            attachmentsProviderReady: true,
            staffEnabled: true,
            status: "ACTIVE",
            webEnabled: true,
            whatsappEnabled: false,
          }),
        },
        serviceCommerceStoreTeamAssignment: {
          findFirst: async () => ({
            id: "assignment_1",
            membershipId: "member_1",
          }),
        },
        store: { findFirst: async () => ({ countryCode: "NG" }) },
        whatsAppStoreBinding: { findFirst: async () => null },
      }

      const recorded = await recordServiceCommerceMediaIntake(
        dbClient(client),
        {
          ...scope,
          channel: media.channel,
          clientMediaId: `generic-media-${index}`,
          fileName:
            media.kind === "image" ? `bag-${index}.jpg` : `bag-${index}.pdf`,
          kind: media.kind,
          mimeType: media.mimeType,
          privateMediaProviderReady: true,
          retentionUntil: new Date("2027-08-10T12:00:00.000Z"),
          signatureMimeType: media.mimeType,
          sizeBytes: 24,
          source: { id: "inquiry_1", kind: "commerce_inquiry" },
          sourceLineId: "line_1",
          sourceVersion,
        },
      )

      expect(recorded).toMatchObject({ replayed: false })
      expect(writes[0]).toMatchObject({
        channelOrigin: media.channel.toUpperCase(),
        declaredMediaType: media.mimeType,
        kind: media.kind.toUpperCase(),
        lifecycle: "PENDING_UPLOAD",
        retentionClass: "ORDINARY_COMMERCE",
        storeId: scope.storeId,
        tenantId: scope.tenantId,
      })
    }
  })

  test("returns the same safe projection for an exact media replay without creating another asset", async () => {
    const sourceVersion = createHash("sha256")
      .update(
        JSON.stringify({
          description: "Red bag",
          position: 1,
          quantity: "1",
        }),
      )
      .digest("hex")
    const existing = asset({
      attachments: [
        {
          createdAt: new Date("2026-08-10T12:00:01.000Z"),
          id: "attachment_1",
          lifecycle: "ACTIVE",
          mediaAssetId: "asset_1",
          sourceId: "inquiry_1",
          sourceKind: "COMMERCE_INQUIRY",
          sourceLineId: "line_1",
          sourceVersion,
        },
      ],
      channelOrigin: "WEB",
      clientMediaId: "client_replay",
      lifecycle: "PENDING_UPLOAD",
      provider: null,
      providerConnectionId: null,
      providerMediaId: null,
    })
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      commerceInquiryLine: {
        findFirst: async () => ({
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          description: "Red bag",
          id: "line_1",
          inquiry: { status: "RECEIVED" },
          position: 1,
          requestedQuantity: 1,
        }),
      },
      serviceCommerceMediaAsset: { findFirst: async () => existing },
    }

    const replay = await recordServiceCommerceMediaIntake(dbClient(client), {
      ...scope,
      channel: "web",
      clientMediaId: "client_replay",
      fileName: "bag.jpg",
      kind: "image",
      mimeType: "image/jpeg",
      privateMediaProviderReady: true,
      retentionUntil: new Date("2027-08-10T12:00:00.000Z"),
      signatureMimeType: "image/jpeg",
      sizeBytes: 24,
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
      sourceLineId: "line_1",
      sourceVersion,
    })

    expect(replay).toMatchObject({
      attachment: { id: "attachment_1" },
      media: { id: "asset_1", lifecycle: "pending_upload" },
      replayed: true,
    })
  })

  test("audits scoped stored, safety, and retry lifecycle transitions", async () => {
    const calls: Array<Record<string, unknown>> = []
    const current = asset()
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      serviceCommerceMediaAsset: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          calls.push(where)
          return current
        },
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(current, data)
          return { count: 1 }
        },
      },
      serviceCommerceMediaAuditEvent: { create: async () => ({ id: "audit" }) },
    }
    await recordStoredServiceCommerceMediaAsset(dbClient(client), {
      ...scope,
      contentDigest: "a".repeat(64),
      mediaAssetId: "asset_1",
      objectKey: "private/object",
      reason: "stored",
      verifiedMediaType: "image/jpeg",
      verifiedSizeBytes: 24,
    })
    await requestServiceCommerceMediaSafety(dbClient(client), {
      ...scope,
      mediaAssetId: "asset_1",
      reason: "scan",
    })
    await recordServiceCommerceMediaSafety(dbClient(client), {
      ...scope,
      mediaAssetId: "asset_1",
      outcome: "retryable",
      reason: "scanner retry",
    })
    await scheduleServiceCommerceMediaRetry(dbClient(client), {
      ...scope,
      failureCode: "scanner_timeout",
      mediaAssetId: "asset_1",
      nextRetryAt: new Date("2026-08-10T12:05:00.000Z"),
      reason: "retry",
      retryLifecycle: "pending_retrieval",
    })
    expect(current.lifecycle).toBe("PENDING_RETRIEVAL")
    await rejectServiceCommerceMediaRetrieval(dbClient(client), {
      ...scope,
      failureCode: "invalid_signature",
      mediaAssetId: "asset_1",
      reason: "invalid fetched bytes",
    })
    expect(current.lifecycle).toBe("REJECTED")
    expect(calls.every((where) => where.tenantId === scope.tenantId)).toBe(true)
    expect(projectSafeServiceCommerceMediaAsset(current)).not.toHaveProperty(
      "objectKey",
    )
  })

  test("allows a retryable staff upload to be safely re-uploaded without leaking its object reference", async () => {
    const current = asset({ lifecycle: "RETRYABLE" })
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      serviceCommerceMediaAsset: {
        findFirst: async () => current,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(current, data)
          return { count: 1 }
        },
      },
      serviceCommerceMediaAuditEvent: { create: async () => ({ id: "audit" }) },
    }
    await scheduleServiceCommerceMediaRetry(dbClient(client), {
      ...scope,
      failureCode: "private_store_timeout",
      mediaAssetId: "asset_1",
      nextRetryAt: new Date("2026-08-10T12:05:00.000Z"),
      reason: "retry_staff_upload",
      retryLifecycle: "pending_upload",
    })
    const reuploaded = await recordStoredServiceCommerceMediaAsset(
      dbClient(client),
      {
        ...scope,
        contentDigest: "b".repeat(64),
        mediaAssetId: "asset_1",
        objectKey: "private/reuploaded-object",
        reason: "retry_staff_upload_stored",
        verifiedMediaType: "image/jpeg",
        verifiedSizeBytes: 24,
      },
    )

    expect(reuploaded).toMatchObject({ lifecycle: "stored" })
    expect(reuploaded).not.toHaveProperty("objectKey")
    expect(current.lifecycle).toBe("STORED")
  })

  test("returns a private reference only to an active attendant for a safe attachment and audits it", async () => {
    const audit: Record<string, unknown>[] = []
    const sourceVersion = createHash("sha256")
      .update(
        JSON.stringify({
          details: "Red bag",
          offeringId: "offering_1",
          offeringName: "Bag",
          quantity: "1",
          variantName: null,
        }),
      )
      .digest("hex")
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      serviceCommerceMediaAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audit.push(data)
          return { id: "audit" }
        },
      },
      serviceCommerceSourceAttachment: {
        findFirst: async () => ({
          id: "attachment_1",
          lifecycle: "ACTIVE",
          mediaAssetId: "asset_1",
          sourceId: "request_1",
          sourceKind: "SERVICE_REQUEST",
          sourceLineId: "line_1",
          sourceVersion,
          mediaAsset: asset({ lifecycle: "SAFE", objectKey: "private/object" }),
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findFirst: async () => ({
          id: "assignment_1",
          membershipId: "member_1",
        }),
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => ({
          attachmentsEnabled: true,
          attachmentsProviderReady: true,
          staffEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: false,
        }),
      },
      serviceRequestLine: {
        findFirst: async () => ({
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          details: "Red bag",
          id: "line_1",
          offering: { kind: "PRODUCT" },
          offeringId: "offering_1",
          offeringName: "Bag",
          request: { status: "SUBMITTED" },
          requestedQuantity: 1,
          variantName: null,
        }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppStoreBinding: { findFirst: async () => null },
    }
    const view = await getAuthorizedServiceCommerceMediaView(dbClient(client), {
      ...scope,
      attachmentId: "attachment_1",
      expiresAt: new Date(Date.now() + 60_000),
      reason: "attendant review",
    })
    expect(view).toMatchObject({ storageReference: "private/object" })
    expect(audit[0]).toMatchObject({ type: "VIEW_AUTHORIZED" })
  })

  test("creates a revisioned current observation and supersedes only its scoped predecessor", async () => {
    const sourceVersion = createHash("sha256")
      .update(
        JSON.stringify({
          details: "Red bag",
          offeringId: "offering_1",
          offeringName: "Bag",
          quantity: "1",
          variantName: null,
        }),
      )
      .digest("hex")
    const updates: Record<string, unknown>[] = []
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      serviceCommerceMediaAuditEvent: { create: async () => ({ id: "audit" }) },
      serviceCommerceSourceAttachment: {
        findFirst: async () => ({
          id: "attachment_1",
          lifecycle: "ACTIVE",
          mediaAssetId: "asset_1",
          sourceId: "request_1",
          sourceKind: "SERVICE_REQUEST",
          sourceLineId: "line_1",
          sourceVersion,
          mediaAsset: asset({ lifecycle: "SAFE" }),
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findFirst: async () => ({
          id: "assignment_1",
          membershipId: "member_1",
        }),
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => ({
          attachmentsEnabled: true,
          attachmentsProviderReady: true,
          staffEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: false,
        }),
      },
      serviceCommerceVerifiedObservation: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          id: "observation_2",
        }),
        findFirst: async () => ({
          attachmentId: "attachment_1",
          attributes: [],
          displayLabel: "Old bag",
          id: "observation_1",
          lifecycle: "CURRENT",
          revision: 1,
          sourceLineId: "line_1",
          sourceVersion,
          verifiedAt: new Date(),
          verifiedByUserId: "attendant_1",
        }),
        updateMany: async ({
          data,
          where,
        }: {
          data: Record<string, unknown>
          where: Record<string, unknown>
        }) => {
          updates.push({ data, where })
          return { count: 1 }
        },
      },
      serviceRequestLine: {
        findFirst: async () => ({
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          details: "Red bag",
          id: "line_1",
          offering: { kind: "PRODUCT" },
          offeringId: "offering_1",
          offeringName: "Bag",
          request: { status: "SUBMITTED" },
          requestedQuantity: 1,
          variantName: null,
        }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppStoreBinding: { findFirst: async () => null },
    }
    const observation = await createServiceCommerceHumanObservation(
      dbClient(client),
      {
        ...scope,
        attachmentId: "attachment_1",
        attributes: [{ name: "colour", value: "red" }],
        displayLabel: "Red bag",
        expectedRevision: 1,
      },
    )
    expect(observation).toMatchObject({ lifecycle: "current", revision: 2 })
    expect(updates[0]?.where).toMatchObject({
      revision: 1,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
    })
  })

  test("uses explicit media errors for invalid lifecycle transitions", async () => {
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      serviceCommerceMediaAsset: {
        findFirst: async () => asset({ lifecycle: "SAFE" }),
      },
    }
    await expect(
      requestServiceCommerceMediaSafety(dbClient(client), {
        ...scope,
        mediaAssetId: "asset_1",
        reason: "bad transition",
      }),
    ).rejects.toBeInstanceOf(ServiceCommerceMediaError)
  })

  test("claims retrieval only through the media asset's active scoped provider connection", async () => {
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      serviceCommerceMediaAsset: {
        findFirst: async () =>
          asset({
            lifecycle: "PENDING_RETRIEVAL",
            provider: "whatsapp",
            providerConnectionId: "connection_1",
            providerMediaId: "provider_media_1",
          }),
        updateMany: async () => ({ count: 1 }),
      },
      serviceCommerceMediaAuditEvent: { create: async () => ({ id: "audit" }) },
      whatsAppStoreBinding: { findFirst: async () => ({ id: "binding_1" }) },
    }
    await expect(
      claimServiceCommerceMediaRetrieval(dbClient(client), {
        mediaAssetId: "asset_1",
        storeId: scope.storeId,
        tenantId: scope.tenantId,
      }),
    ).resolves.toEqual({
      mediaAssetId: "asset_1",
      provider: "whatsapp",
      providerConnectionId: "connection_1",
      providerMediaId: "provider_media_1",
    })
  })
})
