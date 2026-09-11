import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  claimStoreConversationPrivacyRequest,
  completeStoreConversationPrivacyRequest,
  createStoreConversationPrivacyRequest,
} from "./store-conversation-privacy"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

function publicEntryDependencies() {
  return {
    customerEntryPoint: {
      findFirst: async () => ({
        id: "entry_1",
        revision: 1,
        store: { name: "Ada Store" },
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 8 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    serviceCommerceStoreProfile: {
      findFirst: async () => ({
        intakeEnabled: true,
        status: "ACTIVE",
        webEnabled: true,
        whatsappEnabled: false,
      }),
    },
    serviceCommerceStoreTeamAssignment: {
      findFirst: async () => ({ id: "assignment_1" }),
    },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
    whatsAppStoreBinding: { findMany: async () => [] },
  }
}

describe("Store Conversation privacy repository", () => {
  test("accepts an exact authenticated account access without contact matching", async () => {
    const writes: Record<string, unknown>[] = []
    const client = {
      ...publicEntryDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationAccountAccess: {
        findFirst: async () => ({
          conversation: {
            guestIdentityId: "guest_1",
            id: "conversation_1",
            store: { name: "Ada Store" },
            storeId: "store_1",
            tenantId: "tenant_1",
          },
          id: "access_1",
        }),
        update: async () => ({ id: "access_1" }),
      },
      storeConversationPrivacyRequest: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          writes.push(data)
          const nested = data.classifications as {
            create: Array<{ classification: string }>
          }
          return {
            classifications: nested.create,
            id: "privacy_1",
            outcomes: [],
            status: "PENDING",
          }
        },
        findUnique: async () => null,
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    const result = await createStoreConversationPrivacyRequest(
      dbClient(client),
      {
        classifications: ["presentation_message", "commercial_record"],
        clientOperationId: "privacy-account-operation-1",
        conversationId: "conversation_1",
        publicToken: "p".repeat(32),
      },
      { accountUserId: "account_1", kind: "account" },
    )

    expect(result).toMatchObject({ id: "privacy_1", replayed: false })
    expect(writes[0]).toMatchObject({
      accountUserId: "account_1",
      guestIdentityId: null,
      principalKind: "ACCOUNT",
      proofChallengeId: null,
    })
    expect(JSON.stringify(writes)).not.toMatch(/email|phone|contact/)
  })

  test("requires and consumes an approved proof for the exact Guest identity", async () => {
    const challengeScopes: Record<string, unknown>[] = []
    const credentialToken = "guest-credential-token-that-is-long-enough"
    const client = {
      ...publicEntryDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          store: { name: "Ada Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationGuestCredential: {
        findFirst: async () => ({
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
          guestIdentity: { id: "guest_1", status: "ACTIVE" },
          guestIdentityId: "guest_1",
          id: "credential_1",
          purpose: "WEB_DEVICE",
          status: "ACTIVE",
        }),
        update: async () => ({ id: "credential_1" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
      storeConversationPrivacyRequest: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const nested = data.classifications as {
            create: Array<{ classification: string }>
          }
          return {
            classifications: nested.create,
            id: "privacy_1",
            outcomes: [],
            status: "PENDING",
          }
        },
        findUnique: async () => null,
      },
      storeConversationSecurityChallenge: {
        updateMany: async ({ where }: { where: Record<string, unknown> }) => {
          challengeScopes.push(where)
          return { count: 1 }
        },
      },
    }
    const proofToken = "approved-privacy-proof-token-that-is-long-enough"

    await createStoreConversationPrivacyRequest(
      dbClient(client),
      {
        classifications: ["verified_contact"],
        clientOperationId: "privacy-guest-operation-1",
        conversationId: "conversation_1",
        publicToken: "p".repeat(32),
      },
      {
        challenge: { challengeId: "challenge_1", proofToken },
        credentialToken,
        kind: "guest",
      },
    )

    expect(challengeScopes[0]).toMatchObject({
      id: "challenge_1",
      purpose: "VERIFICATION",
      status: "APPROVED",
    })
    expect(JSON.stringify(challengeScopes)).not.toContain("guest_1")
    expect(JSON.stringify(challengeScopes)).not.toContain(proofToken)
  })

  test("claims bounded identifier-only privacy work and advances generic media retention", async () => {
    const writes: Record<string, unknown>[] = []
    const request = {
      attemptCount: 1,
      claimToken: null as string | null,
      classifications: [
        { classification: "GENERIC_MEDIA" },
        { classification: "PRESENTATION_MESSAGE" },
      ],
      conversation: { guestIdentityId: "guest_1" },
      conversationId: "conversation_1",
      id: "privacy_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    }
    const transaction = {
      serviceCommerceMediaAsset: {
        updateMany: async (input: Record<string, unknown>) => {
          writes.push(input)
          return { count: 1 }
        },
      },
      storeConversationMessageAttachment: {
        findMany: async () => [
          { sourceAttachment: { mediaAssetId: "media_asset_1" } },
        ],
      },
      storeConversationPrivacyRequest: {
        findUnique: async () => request,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          request.claimToken = String(data.claimToken)
          return { count: 1 }
        },
      },
    }
    const client = dbClient({
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(transaction),
    })

    const claim = await claimStoreConversationPrivacyRequest(client, {
      privacyRequestId: "privacy_1",
    })

    expect(claim).toMatchObject({
      classifications: ["generic_media", "presentation_message"],
      conversationId: "conversation_1",
      genericMediaAssetIds: ["media_asset_1"],
      privacyRequestId: "privacy_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(JSON.stringify(claim)).not.toMatch(
      /objectKey|storageReference|provider|contact|credentialToken/,
    )
    expect(writes).toHaveLength(1)
  })

  test("removes eligible presentation data and truthfully retains authoritative classes", async () => {
    const outcomes: Record<string, unknown>[] = []
    const contactWrites: Record<string, unknown>[] = []
    const request = {
      claimToken: "claim_1",
      classifications: [
        { classification: "GUEST_CREDENTIAL" },
        { classification: "VERIFIED_CONTACT" },
        { classification: "PRESENTATION_MESSAGE" },
        { classification: "GENERIC_MEDIA" },
        { classification: "PROVIDER_ATTEMPT" },
        { classification: "COMMERCIAL_RECORD" },
        { classification: "CLINICAL_RECORD" },
        { classification: "IMMUTABLE_AUDIT" },
        { classification: "SECURITY_EVIDENCE" },
      ],
      conversation: { guestIdentityId: "guest_1" },
      conversationId: "conversation_1",
      id: "privacy_1",
      outcomes: [],
      status: "PROCESSING",
      storeId: "store_1",
      tenantId: "tenant_1",
    }
    const transaction = {
      serviceCommerceMediaAsset: { count: async () => 1 },
      storeConversationGuestCredential: {
        updateMany: async () => ({ count: 2 }),
      },
      storeConversationGuestNotificationContact: {
        findMany: async () => [{ id: "contact_1" }],
        update: async ({ data }: { data: Record<string, unknown> }) => {
          contactWrites.push(data)
          return { id: "contact_1" }
        },
      },
      storeConversationMessage: {
        updateMany: async () => ({ count: 3 }),
      },
      storeConversationPrivacyRequest: {
        findUnique: async () => request,
        update: async () => ({ id: "privacy_1" }),
      },
      storeConversationPrivacyRequestOutcome: {
        createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
          outcomes.push(...data)
          return { count: data.length }
        },
      },
      storeConversationWhatsAppOutboundAttempt: {
        updateMany: async () => ({ count: 1 }),
      },
    }
    const client = dbClient({
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(transaction),
    })

    const result = await completeStoreConversationPrivacyRequest(client, {
      claimToken: "claim_1",
      deletedGenericMediaAssetIds: ["media_asset_1"],
      privacyRequestId: "privacy_1",
    })

    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        { classification: "guest_credential", status: "removed" },
        { classification: "verified_contact", status: "removed" },
        { classification: "presentation_message", status: "removed" },
        { classification: "generic_media", status: "removed" },
        { classification: "provider_attempt", status: "removed" },
        { classification: "commercial_record", status: "retained_required" },
        { classification: "clinical_record", status: "retained_required" },
        { classification: "immutable_audit", status: "retained_required" },
        { classification: "security_evidence", status: "retained_required" },
      ]),
    )
    expect(contactWrites[0]).toMatchObject({
      destinationCiphertext: "privacy-tombstone",
      maskedDestination: "Unavailable",
      status: "REVOKED",
    })
    expect(JSON.stringify(outcomes)).not.toMatch(
      /contact_1|media_asset_1|guest_1|conversation_1/,
    )
  })
})
