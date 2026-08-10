import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"

import { createCallerFactory } from "../../init"
import { serviceCommerceMediaRouter } from "./media"

const createCaller = createCallerFactory(serviceCommerceMediaRouter)

describe("Service Commerce media router", () => {
  test("returns safe staff attachment metadata without private provider fields", async () => {
    const sourceVersion = createHash("sha256")
      .update(
        JSON.stringify({
          description: "Red bag",
          position: 1,
          quantity: "1",
        }),
      )
      .digest("hex")
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
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
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => [
          {
            approvalReference: "approved-test-evidence",
            channel: "WEB",
            effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
            evidenceReference: "private-test-evidence",
            expiresAt: new Date("2030-01-01T00:00:00.000Z"),
            id: "policy_1",
            jurisdictionCode: "NG",
            licenceReference: null,
            outcome: "ALLOWED",
            reason: "Test policy decision",
            reviewedByUserId: "reviewer_1",
            revision: 1,
            revokedAt: null,
            storeId: "store_1",
            subject: "ATTACHMENTS",
            tenantId: "tenant_1",
            vertical: "SERVICE",
          },
        ],
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
      serviceCommerceSourceAttachment: {
        findFirst: async () => ({
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          id: "attachment_1",
          lifecycle: "ACTIVE",
          mediaAsset: {
            channelOrigin: "WEB",
            createdAt: new Date("2026-08-10T12:00:00.000Z"),
            declaredMediaType: "image/jpeg",
            id: "asset_1",
            kind: "IMAGE",
            lifecycle: "SAFE",
            objectKey: "private/tenant_1/asset_1",
            originalFileName: "red-bag.jpg",
            provider: "private-storage",
            providerMediaId: "provider_media_1",
            verifiedMediaType: "image/jpeg",
            verifiedSizeBytes: 320_000,
          },
          mediaAssetId: "asset_1",
          observations: [],
          sourceId: "inquiry_1",
          sourceKind: "COMMERCE_INQUIRY",
          sourceLineId: "line_1",
          sourceVersion,
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findFirst: async () => ({ id: "assignment_1" }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppStoreBinding: { findFirst: async () => null },
    }
    const caller = createCaller({
      db,
      session: { user: { id: "attendant_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "OWNER" },
        stores: [{ id: "store_1" }],
        tenant: { id: "tenant_1" },
      },
    } as never)

    const result = await caller.mediaAttachment({
      attachmentId: "attachment_1",
      storeId: "store_1",
    })

    expect(result).toMatchObject({
      attachment: {
        id: "attachment_1",
        source: { id: "inquiry_1", kind: "commerce_inquiry" },
      },
      media: { id: "asset_1", lifecycle: "safe" },
      observation: null,
      recovery: { action: "ready", retryable: false },
    })
    expect(JSON.stringify(result)).not.toContain("private/tenant_1/asset_1")
    expect(JSON.stringify(result)).not.toContain("provider_media_1")
  })
})
