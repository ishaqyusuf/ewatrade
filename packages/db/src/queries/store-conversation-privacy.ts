import { randomUUID } from "node:crypto"

import {
  STORE_CONVERSATION_PRESENTATION_TOMBSTONE,
  type StoreConversationRetentionClassification,
  projectStoreConversationPrivacyOutcomes,
  storeConversationPrivacyRequestInputSchema,
  storeConversationPrivacyRequestStatusInputSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  ServiceCommerceMediaLifecycle,
  type StoreConversationGuestCredentialPurpose,
  StoreConversationGuestCredentialStatus,
  StoreConversationNotificationContactStatus,
  StoreConversationPrivacyClassification,
  StoreConversationPrivacyOutcomeStatus,
  StoreConversationPrivacyPrincipalKind,
  StoreConversationPrivacyRequestStatus,
} from "../../generated/prisma/enums"
import { loadStoreConversationForAccount } from "./store-conversation-accounts"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import { consumeStoreConversationSecurityChallenge } from "./store-conversation-security"
import {
  StoreConversationError,
  digestStoreConversationValue,
  loadStoreConversationForGuest,
  resolveStoreConversationEntry,
  storeConversationPayloadHash,
} from "./store-conversations-core"

const classifications = {
  clinical_record: StoreConversationPrivacyClassification.CLINICAL_RECORD,
  commercial_record: StoreConversationPrivacyClassification.COMMERCIAL_RECORD,
  generic_media: StoreConversationPrivacyClassification.GENERIC_MEDIA,
  guest_credential: StoreConversationPrivacyClassification.GUEST_CREDENTIAL,
  immutable_audit: StoreConversationPrivacyClassification.IMMUTABLE_AUDIT,
  presentation_message:
    StoreConversationPrivacyClassification.PRESENTATION_MESSAGE,
  provider_attempt: StoreConversationPrivacyClassification.PROVIDER_ATTEMPT,
  security_evidence: StoreConversationPrivacyClassification.SECURITY_EVIDENCE,
  verified_contact: StoreConversationPrivacyClassification.VERIFIED_CONTACT,
} as const

const sharedClassifications = Object.fromEntries(
  Object.entries(classifications).map(([shared, database]) => [
    database,
    shared,
  ]),
) as Record<
  StoreConversationPrivacyClassification,
  StoreConversationRetentionClassification
>

const outcomes = {
  removed: StoreConversationPrivacyOutcomeStatus.REMOVED,
  retained_required: StoreConversationPrivacyOutcomeStatus.RETAINED_REQUIRED,
  unavailable: StoreConversationPrivacyOutcomeStatus.UNAVAILABLE,
} as const

type PrivacyPrincipal =
  | { accountUserId: string; kind: "account" }
  | {
      challenge: { challengeId: string; proofToken: string }
      credentialToken: string
      installationToken?: string
      kind: "guest"
      purpose?: StoreConversationGuestCredentialPurpose
    }

function projectPrivacyRequest(request: {
  classifications: Array<{
    classification: StoreConversationPrivacyClassification
  }>
  id: string
  outcomes?: Array<{
    classification: StoreConversationPrivacyClassification
    status: StoreConversationPrivacyOutcomeStatus
  }>
  status: StoreConversationPrivacyRequestStatus
}) {
  return {
    classifications: request.classifications.map(
      (item) => sharedClassifications[item.classification],
    ),
    id: request.id,
    outcomes: (request.outcomes ?? []).map((item) => ({
      classification: sharedClassifications[item.classification],
      status: item.status.toLowerCase() as
        | "removed"
        | "retained_required"
        | "unavailable",
    })),
    status: request.status.toLowerCase() as
      | "pending"
      | "processing"
      | "completed"
      | "failed",
  }
}

export async function createStoreConversationPrivacyRequest(
  db: PrismaClient,
  input: {
    classifications: StoreConversationRetentionClassification[]
    clientOperationId: string
    conversationId: string
    publicToken: string
  },
  principal: PrivacyPrincipal,
) {
  const parsed = storeConversationPrivacyRequestInputSchema.parse({
    ...input,
    ...(principal.kind === "guest" ? { challenge: principal.challenge } : {}),
  })
  return runStoreConversationActionTransaction(db, async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: parsed.publicToken,
    })
    const guest =
      principal.kind === "guest"
        ? await loadStoreConversationForGuest(tx, {
            conversationId: parsed.conversationId,
            credentialToken: principal.credentialToken,
            installationToken: principal.installationToken,
            now: new Date(),
            purpose: principal.purpose,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
        : null
    const account =
      principal.kind === "account"
        ? await loadStoreConversationForAccount(tx, {
            accountUserId: principal.accountUserId,
            conversationId: parsed.conversationId,
            now: new Date(),
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
        : null
    const conversation = (guest ?? account)?.conversation
    if (!conversation) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    }
    const principalReference =
      principal.kind === "account"
        ? `account:${principal.accountUserId}`
        : `guest:${guest?.credential.guestIdentityId}`
    const operationDigest = digestStoreConversationValue(
      `privacy:${principalReference}:${parsed.clientOperationId}`,
    )
    const payloadHash = storeConversationPayloadHash({
      classifications: parsed.classifications,
      conversationId: conversation.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const replay = await tx.storeConversationPrivacyRequest.findUnique({
      include: { classifications: true, outcomes: true },
      where: { operationDigest },
    })
    if (replay) {
      if (replay.payloadHash !== payloadHash) {
        throw new StoreConversationError(
          "CONFLICT",
          "This privacy request does not match the original operation.",
        )
      }
      return { ...projectPrivacyRequest(replay), replayed: true }
    }

    if (principal.kind === "guest") {
      const guestIdentityId = guest?.credential.guestIdentityId
      if (!guestIdentityId) {
        throw new StoreConversationError(
          "FORBIDDEN",
          "Guest privacy proof is unavailable.",
        )
      }
      await consumeStoreConversationSecurityChallenge(tx, {
        challengeId: principal.challenge.challengeId,
        principalKey: guestIdentityId,
        proofToken: principal.challenge.proofToken,
        purpose: "verification",
      })
    }

    const created = await tx.storeConversationPrivacyRequest.create({
      data: {
        accountUserId:
          principal.kind === "account" ? principal.accountUserId : null,
        classifications: {
          create: parsed.classifications.map((classification) => ({
            classification: classifications[classification],
          })),
        },
        conversationId: conversation.id,
        guestIdentityId:
          principal.kind === "guest"
            ? (guest?.credential.guestIdentityId ?? null)
            : null,
        operationDigest,
        payloadHash,
        principalKind:
          principal.kind === "account"
            ? StoreConversationPrivacyPrincipalKind.ACCOUNT
            : StoreConversationPrivacyPrincipalKind.GUEST,
        proofChallengeId:
          principal.kind === "guest" ? principal.challenge.challengeId : null,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
      include: { classifications: true, outcomes: true },
    })
    return { ...projectPrivacyRequest(created), replayed: false }
  })
}

export async function getStoreConversationPrivacyRequest(
  db: PrismaClient,
  input: {
    conversationId: string
    privacyRequestId: string
    publicToken: string
  },
  principal:
    | { accountUserId: string; kind: "account" }
    | {
        credentialToken: string
        installationToken?: string
        kind: "guest"
        purpose?: StoreConversationGuestCredentialPurpose
      },
) {
  const parsed = storeConversationPrivacyRequestStatusInputSchema.parse(input)
  return runStoreConversationActionTransaction(db, async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: parsed.publicToken,
    })
    if (principal.kind === "account") {
      await loadStoreConversationForAccount(tx, {
        accountUserId: principal.accountUserId,
        conversationId: parsed.conversationId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        touchAccess: false,
      })
    } else {
      await loadStoreConversationForGuest(tx, {
        conversationId: parsed.conversationId,
        credentialToken: principal.credentialToken,
        installationToken: principal.installationToken,
        now: new Date(),
        purpose: principal.purpose,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        touchCredential: false,
      })
    }
    const request = await tx.storeConversationPrivacyRequest.findFirst({
      include: { classifications: true, outcomes: true },
      where: {
        conversationId: parsed.conversationId,
        id: parsed.privacyRequestId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!request) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "Privacy request not found.",
      )
    }
    return projectPrivacyRequest(request)
  })
}

export async function claimStoreConversationPrivacyRequest(
  db: PrismaClient,
  input: { privacyRequestId: string },
  options: { now?: Date } = {},
) {
  const now = options.now ?? new Date()
  const claimToken: string = randomUUID()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const claimed = await tx.storeConversationPrivacyRequest.updateMany({
      data: {
        attemptCount: { increment: 1 },
        claimExpiresAt: new Date(now.getTime() + 15 * 60_000),
        claimToken,
        claimedAt: now,
        status: StoreConversationPrivacyRequestStatus.PROCESSING,
      },
      where: {
        id: input.privacyRequestId,
        OR: [
          { status: StoreConversationPrivacyRequestStatus.PENDING },
          {
            claimExpiresAt: { lte: now },
            status: StoreConversationPrivacyRequestStatus.PROCESSING,
          },
        ],
        AND: [
          {
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
        ],
      },
    })
    if (claimed.count !== 1) return null
    const request = await tx.storeConversationPrivacyRequest.findUnique({
      include: {
        classifications: true,
        conversation: { select: { guestIdentityId: true } },
      },
      where: { id: input.privacyRequestId },
    })
    if (!request || request.claimToken !== claimToken) return null
    const genericMediaRequested = request.classifications.some(
      (item) =>
        item.classification ===
        StoreConversationPrivacyClassification.GENERIC_MEDIA,
    )
    const genericMedia = genericMediaRequested
      ? await tx.storeConversationMessageAttachment.findMany({
          select: {
            sourceAttachment: {
              select: { mediaAssetId: true },
            },
          },
          take: 100,
          where: {
            conversationId: request.conversationId,
            prescriptionMediaId: null,
            sourceAttachmentId: { not: null },
            storeId: request.storeId,
            tenantId: request.tenantId,
          },
        })
      : []
    if (genericMedia.length > 0) {
      await tx.serviceCommerceMediaAsset.updateMany({
        data: { retentionUntil: now },
        where: {
          id: {
            in: genericMedia.flatMap((item) =>
              item.sourceAttachment ? [item.sourceAttachment.mediaAssetId] : [],
            ),
          },
          storeId: request.storeId,
          tenantId: request.tenantId,
        },
      })
    }
    return {
      claimToken,
      classifications: request.classifications.map(
        (item) => sharedClassifications[item.classification],
      ),
      conversationId: request.conversationId,
      genericMediaAssetIds: genericMedia.flatMap((item) =>
        item.sourceAttachment ? [item.sourceAttachment.mediaAssetId] : [],
      ),
      privacyRequestId: request.id,
      storeId: request.storeId,
      tenantId: request.tenantId,
    }
  })
}

export async function completeStoreConversationPrivacyRequest(
  db: PrismaClient,
  input: {
    claimToken: string
    deletedGenericMediaAssetIds: string[]
    privacyRequestId: string
  },
) {
  return runStoreConversationActionTransaction(db, async (tx) => {
    const request = await tx.storeConversationPrivacyRequest.findUnique({
      include: {
        classifications: true,
        conversation: { select: { guestIdentityId: true } },
        outcomes: true,
      },
      where: { id: input.privacyRequestId },
    })
    if (!request) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "Privacy request not found.",
      )
    }
    if (request.status === StoreConversationPrivacyRequestStatus.COMPLETED) {
      return projectPrivacyRequest(request)
    }
    if (
      request.status !== StoreConversationPrivacyRequestStatus.PROCESSING ||
      request.claimToken !== input.claimToken
    ) {
      throw new StoreConversationError(
        "CONFLICT",
        "Privacy request claim is no longer current.",
      )
    }
    const requested = request.classifications.map(
      (item) => sharedClassifications[item.classification],
    )
    const available = new Set<StoreConversationRetentionClassification>()
    const removed = new Set<StoreConversationRetentionClassification>()

    if (requested.includes("guest_credential")) {
      available.add("guest_credential")
      await tx.storeConversationGuestCredential.updateMany({
        data: {
          revokedAt: new Date(),
          status: StoreConversationGuestCredentialStatus.REVOKED,
        },
        where: {
          guestIdentityId: request.conversation.guestIdentityId,
          status: {
            in: [
              StoreConversationGuestCredentialStatus.ACTIVE,
              StoreConversationGuestCredentialStatus.ROTATED,
            ],
          },
        },
      })
      removed.add("guest_credential")
    }
    if (requested.includes("verified_contact")) {
      const contacts =
        await tx.storeConversationGuestNotificationContact.findMany({
          select: { id: true },
          take: 100,
          where: { guestIdentityId: request.conversation.guestIdentityId },
        })
      for (const contact of contacts) {
        await tx.storeConversationGuestNotificationContact.update({
          data: {
            destinationCiphertext: "privacy-tombstone",
            destinationDigest: digestStoreConversationValue(
              `privacy-contact:${request.id}:${contact.id}`,
            ),
            maskedDestination: "Unavailable",
            revokedAt: new Date(),
            status: StoreConversationNotificationContactStatus.REVOKED,
          },
          where: { id: contact.id },
        })
      }
      if (contacts.length > 0) {
        available.add("verified_contact")
        removed.add("verified_contact")
      }
    }
    if (requested.includes("presentation_message")) {
      const messages = await tx.storeConversationMessage.updateMany({
        data: {
          body: STORE_CONVERSATION_PRESENTATION_TOMBSTONE,
          presentationRedactedAt: new Date(),
        },
        where: {
          conversationId: request.conversationId,
          presentationRedactedAt: null,
          storeId: request.storeId,
          tenantId: request.tenantId,
        },
      })
      if (messages.count > 0) {
        available.add("presentation_message")
        removed.add("presentation_message")
      }
    }
    if (requested.includes("provider_attempt")) {
      const attempts =
        await tx.storeConversationWhatsAppOutboundAttempt.updateMany({
          data: { failureCode: null, providerReferenceDigest: null },
          where: { conversationId: request.conversationId },
        })
      if (attempts.count > 0) {
        available.add("provider_attempt")
        removed.add("provider_attempt")
      }
    }
    if (requested.includes("generic_media")) {
      const deleted = await tx.serviceCommerceMediaAsset.count({
        where: {
          id: { in: input.deletedGenericMediaAssetIds },
          lifecycle: ServiceCommerceMediaLifecycle.DELETED,
          storeId: request.storeId,
          tenantId: request.tenantId,
        },
      })
      if (deleted > 0) {
        available.add("generic_media")
        removed.add("generic_media")
      }
    }
    for (const classification of [
      "commercial_record",
      "clinical_record",
      "immutable_audit",
      "security_evidence",
    ] as const) {
      if (requested.includes(classification)) available.add(classification)
    }

    const projectedOutcomes = projectStoreConversationPrivacyOutcomes({
      available,
      removed,
      requested,
    })
    await tx.storeConversationPrivacyRequestOutcome.createMany({
      data: projectedOutcomes.map((outcome) => ({
        classification: classifications[outcome.classification],
        privacyRequestId: request.id,
        reasonCode:
          outcome.status === "removed"
            ? "eligible_presentation_removed"
            : outcome.status === "retained_required"
              ? "authoritative_record_retained"
              : "classification_unavailable",
        status: outcomes[outcome.status],
      })),
      skipDuplicates: true,
    })
    await tx.storeConversationPrivacyRequest.update({
      data: {
        claimExpiresAt: null,
        claimToken: null,
        completedAt: new Date(),
        status: StoreConversationPrivacyRequestStatus.COMPLETED,
      },
      where: { id: request.id },
    })
    return {
      classifications: requested,
      id: request.id,
      outcomes: projectedOutcomes,
      status: "completed" as const,
    }
  })
}
