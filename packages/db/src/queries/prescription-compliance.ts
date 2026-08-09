import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  PrescriptionIncidentStatus,
  PrescriptionIncidentType,
  PrescriptionMediaAccessAction,
  PrescriptionMediaStatus,
  PrescriptionPrivacyRequestStatus,
  PrescriptionPrivacyRequestType,
  PrescriptionStoreRoleStatus,
  PrescriptionStoreRoleType,
} from "../../generated/prisma/enums"

export class PrescriptionComplianceError extends Error {}

export function assertPrescriptionBreakGlassWindow(input: {
  expiresAt?: Date
  now?: Date
}) {
  if (!input.expiresAt) {
    throw new PrescriptionComplianceError(
      "Break-glass access must have an expiry.",
    )
  }
  const durationMs =
    input.expiresAt.getTime() - (input.now ?? new Date()).getTime()
  if (durationMs <= 0 || durationMs > 60 * 60_000) {
    throw new PrescriptionComplianceError(
      "Break-glass access must expire within 60 minutes.",
    )
  }
}

export function prescriptionRetentionCutoffs(
  policy: {
    addressDays: number
    auditEvidenceDays: number
    commercialRecordDays: number
    messageDays: number
    rawMediaDays: number
    secureTokenDays: number
    transcriptDays: number
  },
  now = new Date(),
) {
  const before = (days: number) => new Date(now.getTime() - days * 86_400_000)
  return {
    addressBefore: before(policy.addressDays),
    auditBefore: before(policy.auditEvidenceDays),
    commercialBefore: before(policy.commercialRecordDays),
    mediaBefore: before(policy.rawMediaDays),
    messageBefore: before(policy.messageDays),
    tokenBefore: before(policy.secureTokenDays),
    transcriptBefore: before(policy.transcriptDays),
  }
}

export async function recordPrescriptionSensitiveAccess(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    accessTypes: string[]
    actorUserId: string
    incidentControlId?: string | null
    reason: string
    requestId?: string | null
    storeId: string
    tenantId: string
  },
) {
  const reason = input.reason.trim()
  if (!reason || input.accessTypes.length === 0) {
    throw new PrescriptionComplianceError(
      "Sensitive access requires a reason and access type.",
    )
  }
  return db.prescriptionSensitiveAccessEvent.createMany({
    data: [...new Set(input.accessTypes)].map((accessType) => ({
      accessType,
      actorUserId: input.actorUserId,
      incidentControlId: input.incidentControlId,
      reason,
      requestId: input.requestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })),
  })
}

export async function authorizePrescriptionBreakGlassAccess(
  db: PrismaClient,
  input: {
    actorUserId: string
    reason: string
    requestId?: string
    storeId: string
    tenantId: string
  },
) {
  const control = await db.prescriptionIncidentControl.findFirst({
    where: {
      activatedByUserId: input.actorUserId,
      expiresAt: { gt: new Date() },
      status: PrescriptionIncidentStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: PrescriptionIncidentType.BREAK_GLASS,
    },
  })
  if (!control) {
    throw new PrescriptionComplianceError(
      "An active, personal break-glass grant is required.",
    )
  }
  await recordPrescriptionSensitiveAccess(db, {
    accessTypes: ["break_glass_used"],
    actorUserId: input.actorUserId,
    incidentControlId: control.id,
    reason: input.reason,
    requestId: input.requestId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  return { controlId: control.id, expiresAt: control.expiresAt }
}

export async function assertPrescriptionOperationalOrBreakGlassAccess(
  db: PrismaClient,
  input: {
    actorUserId: string
    reason: string
    requestId?: string
    storeId: string
    tenantId: string
  },
) {
  const role = await db.prescriptionStoreRole.findFirst({
    select: { id: true },
    where: {
      role: {
        in: [
          PrescriptionStoreRoleType.ATTENDANT,
          PrescriptionStoreRoleType.PHARMACIST,
        ],
      },
      status: PrescriptionStoreRoleStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: input.actorUserId,
    },
  })
  if (role) return { breakGlassControlId: null, roleId: role.id }
  const grant = await authorizePrescriptionBreakGlassAccess(db, input)
  return { breakGlassControlId: grant.controlId, roleId: null }
}

export async function upsertPrescriptionRetentionPolicy(
  db: PrismaClient,
  input: {
    actorUserId: string
    addressDays: number
    auditEvidenceDays: number
    commercialRecordDays: number
    legalHold: boolean
    messageDays: number
    rawMediaDays: number
    secureTokenDays: number
    storeId: string
    tenantId: string
    transcriptDays: number
  },
) {
  for (const value of [
    input.addressDays,
    input.auditEvidenceDays,
    input.commercialRecordDays,
    input.messageDays,
    input.rawMediaDays,
    input.secureTokenDays,
    input.transcriptDays,
  ]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 3_650) {
      throw new PrescriptionComplianceError(
        "Retention periods must be between one day and ten years.",
      )
    }
  }
  const existing = await db.prescriptionRetentionPolicy.findFirst({
    select: { id: true },
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  const values = {
    addressDays: input.addressDays,
    auditEvidenceDays: input.auditEvidenceDays,
    commercialRecordDays: input.commercialRecordDays,
    legalHold: input.legalHold,
    messageDays: input.messageDays,
    rawMediaDays: input.rawMediaDays,
    secureTokenDays: input.secureTokenDays,
    storeId: input.storeId,
    tenantId: input.tenantId,
    transcriptDays: input.transcriptDays,
    updatedByUserId: input.actorUserId,
  }
  return existing
    ? db.prescriptionRetentionPolicy.update({
        data: values,
        where: { id: existing.id },
      })
    : db.prescriptionRetentionPolicy.create({ data: values })
}

export async function getPrescriptionRetentionPolicy(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  return db.prescriptionRetentionPolicy.findFirst({ where: input })
}

export async function claimPrescriptionRetentionBatch(
  db: PrismaClient,
  input: { limit?: number; storeId: string; tenantId: string },
) {
  const policy = await db.prescriptionRetentionPolicy.findFirst({
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  if (!policy || policy.legalHold) return null
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500)
  const cutoffs = prescriptionRetentionCutoffs(policy)
  return {
    addressIds: (
      await db.prescriptionDeliveryAddress.findMany({
        select: { id: true },
        take: limit,
        where: {
          createdAt: {
            lt: cutoffs.addressBefore,
          },
          storeId: policy.storeId,
          tenantId: policy.tenantId,
        },
      })
    ).map((item) => item.id),
    auditRequestEventIds: (
      await db.prescriptionRequestAuditEvent.findMany({
        select: { id: true },
        take: limit,
        where: {
          effectiveAt: { lt: cutoffs.auditBefore },
          NOT: { payload: { equals: { retained: true } } },
          storeId: policy.storeId,
          tenantId: policy.tenantId,
        },
      })
    ).map((item) => item.id),
    auditSensitiveAccessEventIds: (
      await db.prescriptionSensitiveAccessEvent.findMany({
        select: { id: true },
        take: limit,
        where: {
          effectiveAt: { lt: cutoffs.auditBefore },
          reason: { not: "retained_audit_tombstone" },
          storeId: policy.storeId,
          tenantId: policy.tenantId,
        },
      })
    ).map((item) => item.id),
    auditStoreEventIds: (
      await db.prescriptionStoreAuditEvent.findMany({
        select: { id: true },
        take: limit,
        where: {
          effectiveAt: { lt: cutoffs.auditBefore },
          NOT: { payload: { equals: { retained: true } } },
          storeId: policy.storeId,
          tenantId: policy.tenantId,
        },
      })
    ).map((item) => item.id),
    commercialOrderIds: (
      await db.commercialOrder.findMany({
        select: { id: true },
        take: limit,
        where: {
          acceptedCommerceQuoteVersion: {
            is: {
              quote: {
                is: {
                  sourceType: "PRESCRIPTION_REQUEST",
                  storeId: policy.storeId,
                  tenantId: policy.tenantId,
                },
              },
            },
          },
          createdAt: { lt: cutoffs.commercialBefore },
          OR: [
            { customerEmail: { not: null } },
            { customerName: { not: null } },
            { customerPhone: { not: null } },
            { notes: { not: null } },
          ],
          storeId: policy.storeId,
          tenantId: policy.tenantId,
        },
      })
    ).map((item) => item.id),
    commercialRequestIds: (
      await db.prescriptionRequest.findMany({
        select: { id: true },
        take: limit,
        where: {
          createdAt: { lt: cutoffs.commercialBefore },
          NOT: { sourceContext: { equals: { retained: false } } },
          status: {
            in: ["CONVERTED", "DECLINED", "WITHDRAWN", "EXPIRED"],
          },
          storeId: policy.storeId,
          tenantId: policy.tenantId,
        },
      })
    ).map((item) => item.id),
    media: await db.prescriptionMedia.findMany({
      select: { id: true, objectKey: true },
      take: limit,
      where: {
        status: { not: PrescriptionMediaStatus.DELETED },
        storeId: policy.storeId,
        tenantId: policy.tenantId,
        uploadedAt: { lt: cutoffs.mediaBefore },
      },
    }),
    messageIds: (
      await db.whatsAppInboundEvent.findMany({
        select: { id: true },
        take: limit,
        where: {
          storeId: policy.storeId,
          tenantId: policy.tenantId,
          receivedAt: {
            lt: cutoffs.messageBefore,
          },
        },
      })
    ).map((item) => item.id),
    storeId: policy.storeId,
    tenantId: policy.tenantId,
    tokenRequestIds: (
      await db.prescriptionRequest.findMany({
        select: { id: true },
        take: limit,
        where: {
          createdAt: {
            lt: cutoffs.tokenBefore,
          },
          OR: [
            { reuploadTokenDigest: { not: null } },
            { statusTokenDigest: { not: null } },
          ],
          storeId: policy.storeId,
          tenantId: policy.tenantId,
        },
      })
    ).map((item) => item.id),
    transcriptIds: (
      await db.prescriptionTranscription.findMany({
        select: { id: true },
        take: limit,
        where: {
          createdAt: {
            lt: cutoffs.transcriptBefore,
          },
          request: {
            storeId: policy.storeId,
            tenantId: policy.tenantId,
          },
        },
      })
    ).map((item) => item.id),
  }
}

export async function listPrescriptionRetentionStoreIds(db: PrismaClient) {
  return db.prescriptionRetentionPolicy.findMany({
    select: { storeId: true, tenantId: true },
    where: { legalHold: false },
  })
}

export async function completePrescriptionRetentionBatch(
  db: PrismaClient,
  input: {
    addressIds: string[]
    auditRequestEventIds: string[]
    auditSensitiveAccessEventIds: string[]
    auditStoreEventIds: string[]
    commercialOrderIds: string[]
    commercialRequestIds: string[]
    mediaIds: string[]
    messageIds: string[]
    storeId: string
    tenantId: string
    tokenRequestIds: string[]
    transcriptIds: string[]
  },
) {
  return db.$transaction(async (tx) => {
    const media = await tx.prescriptionMedia.findMany({
      select: { id: true },
      where: {
        id: { in: input.mediaIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.prescriptionMedia.updateMany({
      data: {
        deletedAt: new Date(),
        objectKey: "deleted",
        originalFileName: "deleted",
        safetyMetadata: { retained: false },
        status: PrescriptionMediaStatus.DELETED,
      },
      where: {
        id: { in: media.map((item) => item.id) },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (media.length) {
      await tx.prescriptionMediaAccessEvent.createMany({
        data: media.map((item) => ({
          action: PrescriptionMediaAccessAction.DELETED,
          mediaId: item.id,
          reason: "retention_policy",
          storeId: input.storeId,
          tenantId: input.tenantId,
        })),
      })
    }
    await tx.prescriptionTranscription.deleteMany({
      where: {
        id: { in: input.transcriptIds },
        request: { storeId: input.storeId, tenantId: input.tenantId },
      },
    })
    await tx.whatsAppInboundEvent.updateMany({
      data: { normalizedPayload: { redacted: true } },
      where: {
        id: { in: input.messageIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.prescriptionDeliveryAddress.updateMany({
      data: { encryptedPayload: "deleted:v1" },
      where: {
        id: { in: input.addressIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.prescriptionRequest.updateMany({
      data: {
        reuploadTokenDigest: null,
        reuploadTokenExpiresAt: null,
        statusTokenDigest: null,
      },
      where: {
        id: { in: input.tokenRequestIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.prescriptionRequest.updateMany({
      data: {
        clearerMediaReason: null,
        customerEmail: null,
        customerName: null,
        customerPhone: null,
        sourceContext: { retained: false },
      },
      where: {
        id: { in: input.commercialRequestIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.commercialOrder.updateMany({
      data: {
        customerEmail: null,
        customerName: null,
        customerPhone: null,
        notes: null,
      },
      where: {
        id: { in: input.commercialOrderIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.prescriptionRequestAuditEvent.updateMany({
      data: { payload: { retained: true }, reason: null },
      where: {
        id: { in: input.auditRequestEventIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.prescriptionStoreAuditEvent.updateMany({
      data: { payload: { retained: true } },
      where: {
        id: { in: input.auditStoreEventIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.prescriptionSensitiveAccessEvent.updateMany({
      data: { reason: "retained_audit_tombstone" },
      where: {
        id: { in: input.auditSensitiveAccessEventIds },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return {
      addressesRedacted: input.addressIds.length,
      auditEvidenceRedacted:
        input.auditRequestEventIds.length +
        input.auditSensitiveAccessEventIds.length +
        input.auditStoreEventIds.length,
      commercialOrdersRedacted: input.commercialOrderIds.length,
      commercialRequestsRedacted: input.commercialRequestIds.length,
      mediaDeleted: media.length,
      messagesRedacted: input.messageIds.length,
      secureTokensExpired: input.tokenRequestIds.length,
      transcriptsDeleted: input.transcriptIds.length,
    }
  })
}

export async function createPrescriptionPrivacyRequest(
  db: PrismaClient,
  input: {
    actorUserId: string
    reason: string
    storeId: string
    subjectReference: string
    tenantId: string
    type: "access" | "correction" | "erasure" | "export" | "restriction"
    requestedChanges?: {
      customerEmail?: string | null
      customerName?: string | null
      customerPhone?: string | null
    }
  },
) {
  return db.prescriptionPrivacyRequest.create({
    data: {
      reason: input.reason.trim(),
      requestedByUserId: input.actorUserId,
      requestedChanges: input.requestedChanges as Prisma.InputJsonValue,
      storeId: input.storeId,
      subjectReference: input.subjectReference.trim(),
      tenantId: input.tenantId,
      type: input.type.toUpperCase() as PrescriptionPrivacyRequestType,
    },
  })
}

export async function verifyPrescriptionPrivacyRequest(
  db: PrismaClient,
  input: {
    actorUserId: string
    identityVerificationEvidence: string
    privacyRequestId: string
    storeId: string
    tenantId: string
  },
) {
  return db.prescriptionPrivacyRequest.update({
    data: {
      identityVerificationEvidence: input.identityVerificationEvidence.trim(),
      identityVerifiedAt: new Date(),
      identityVerifiedByUserId: input.actorUserId,
      status: PrescriptionPrivacyRequestStatus.VERIFIED,
    },
    where: {
      id: input.privacyRequestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

function privacySubjectWhere(subjectReference: string) {
  const normalized = subjectReference.trim()
  return {
    OR: [
      { reference: normalized },
      { customerPhone: normalized },
      { customerEmail: normalized.toLowerCase() },
    ],
  }
}

export async function claimPrescriptionPrivacyRequest(
  db: PrismaClient,
  input: { privacyRequestId: string },
) {
  return db.$transaction(async (tx) => {
    const request = await tx.prescriptionPrivacyRequest.findUnique({
      include: { store: { include: { prescriptionRetentionPolicy: true } } },
      where: { id: input.privacyRequestId },
    })
    if (
      !request ||
      request.status !== PrescriptionPrivacyRequestStatus.VERIFIED ||
      !request.identityVerifiedAt
    ) {
      return null
    }
    if (
      request.type === PrescriptionPrivacyRequestType.ERASURE &&
      request.store.prescriptionRetentionPolicy?.legalHold
    ) {
      throw new PrescriptionComplianceError(
        "Erasure cannot proceed while this Store is under legal hold.",
      )
    }
    const subjects = await tx.prescriptionRequest.findMany({
      select: {
        id: true,
        media: {
          select: { id: true, objectKey: true },
          where: { status: { not: PrescriptionMediaStatus.DELETED } },
        },
      },
      where: {
        ...privacySubjectWhere(request.subjectReference),
        storeId: request.storeId,
        tenantId: request.tenantId,
      },
    })
    if (!subjects.length) {
      await tx.prescriptionPrivacyRequest.update({
        data: { status: PrescriptionPrivacyRequestStatus.REJECTED },
        where: { id: request.id },
      })
      return null
    }
    await tx.prescriptionPrivacyRequest.update({
      data: { status: PrescriptionPrivacyRequestStatus.PROCESSING },
      where: { id: request.id },
    })
    return {
      media: subjects.flatMap((subject) => subject.media),
      prescriptionRequestIds: subjects.map((subject) => subject.id),
      privacyRequestId: request.id,
      requestedChanges: request.requestedChanges,
      storeId: request.storeId,
      subjectReference: request.subjectReference,
      tenantId: request.tenantId,
      type: request.type,
    }
  })
}

function requestedChanges(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const record = value as Record<string, Prisma.JsonValue>
  const stringOrNull = (key: string) =>
    record[key] === null
      ? null
      : typeof record[key] === "string"
        ? record[key].trim() || null
        : undefined
  return {
    customerEmail: stringOrNull("customerEmail"),
    customerName: stringOrNull("customerName"),
    customerPhone: stringOrNull("customerPhone"),
  }
}

export async function completePrescriptionPrivacyRequest(
  db: PrismaClient,
  input: {
    actorUserId: string
    deletedMediaIds: string[]
    prescriptionRequestIds: string[]
    privacyRequestId: string
    requestedChanges: Prisma.JsonValue | null
    storeId: string
    subjectReference: string
    tenantId: string
    type: PrescriptionPrivacyRequestType
  },
) {
  return db.$transaction(async (tx) => {
    const scope = {
      id: { in: input.prescriptionRequestIds },
      storeId: input.storeId,
      tenantId: input.tenantId,
    }
    if (input.type === PrescriptionPrivacyRequestType.CORRECTION) {
      const changes = requestedChanges(input.requestedChanges)
      if (Object.values(changes).every((value) => value === undefined)) {
        throw new PrescriptionComplianceError(
          "A correction request requires at least one corrected contact field.",
        )
      }
      await tx.prescriptionRequest.updateMany({ data: changes, where: scope })
    }
    if (input.type === PrescriptionPrivacyRequestType.RESTRICTION) {
      await tx.prescriptionRequest.updateMany({
        data: {
          privacyRestrictedAt: new Date(),
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
        },
        where: scope,
      })
    }
    if (input.type === PrescriptionPrivacyRequestType.ERASURE) {
      await tx.prescriptionMedia.updateMany({
        data: {
          deletedAt: new Date(),
          objectKey: "deleted",
          originalFileName: "deleted",
          safetyMetadata: { erased: true },
          status: PrescriptionMediaStatus.DELETED,
        },
        where: {
          id: { in: input.deletedMediaIds },
          requestId: { in: input.prescriptionRequestIds },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      await tx.prescriptionTranscription.deleteMany({
        where: { requestId: { in: input.prescriptionRequestIds } },
      })
      await tx.whatsAppInboundEvent.updateMany({
        data: { normalizedPayload: { erased: true } },
        where: {
          OR: [
            { requestId: { in: input.prescriptionRequestIds } },
            { externalCustomerId: input.subjectReference },
          ],
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      const orders = await tx.commercialOrder.findMany({
        select: { id: true },
        where: {
          acceptedCommerceQuoteVersion: {
            quote: {
              sourceId: { in: input.prescriptionRequestIds },
              sourceType: "PRESCRIPTION_REQUEST",
            },
          },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      const orderIds = orders.map((order) => order.id)
      await tx.prescriptionDeliveryAddress.updateMany({
        data: { encryptedPayload: "deleted:v1" },
        where: {
          orderId: { in: orderIds },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      await tx.commercialOrder.updateMany({
        data: {
          customerEmail: null,
          customerName: null,
          customerPhone: null,
          notes: null,
        },
        where: { id: { in: orderIds } },
      })
      await tx.prescriptionRequest.updateMany({
        data: {
          customerEmail: null,
          customerName: null,
          customerPhone: null,
          reuploadTokenDigest: null,
          reuploadTokenExpiresAt: null,
          sourceContext: { erased: true },
          statusTokenDigest: null,
        },
        where: scope,
      })
    }
    return tx.prescriptionPrivacyRequest.update({
      data: {
        completedAt: new Date(),
        completedByUserId: input.actorUserId,
        resultReference: `privacy-result:${input.privacyRequestId}`,
        status: PrescriptionPrivacyRequestStatus.COMPLETED,
      },
      where: {
        id: input.privacyRequestId,
        status: PrescriptionPrivacyRequestStatus.PROCESSING,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
  })
}

export async function getPrescriptionPrivacyRequestResult(
  db: PrismaClient,
  input: {
    privacyRequestId: string
    storeId: string
    tenantId: string
  },
) {
  const request = await db.prescriptionPrivacyRequest.findFirst({
    where: {
      id: input.privacyRequestId,
      status: PrescriptionPrivacyRequestStatus.COMPLETED,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: {
        in: [
          PrescriptionPrivacyRequestType.ACCESS,
          PrescriptionPrivacyRequestType.EXPORT,
        ],
      },
    },
  })
  if (!request) throw new PrescriptionComplianceError("Export is unavailable.")
  const records = await db.prescriptionRequest.findMany({
    select: {
      consentAcceptedAt: true,
      consentVersion: true,
      createdAt: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      fulfilmentPreference: true,
      media: {
        select: {
          mediaType: true,
          originalFileName: true,
          status: true,
          uploadedAt: true,
        },
      },
      pharmacistReviews: {
        select: { createdAt: true, decision: true, reason: true },
      },
      reference: true,
      source: true,
      status: true,
      transcriptions: {
        select: {
          completedAt: true,
          lines: {
            select: {
              draftText: true,
              lineNumber: true,
              status: true,
              verifiedText: true,
            },
          },
          revision: true,
          status: true,
        },
      },
      updatedAt: true,
    },
    where: {
      ...privacySubjectWhere(request.subjectReference),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return {
    generatedAt: new Date(),
    privacyRequestId: request.id,
    records,
    subjectReference: request.subjectReference,
  }
}

export async function activatePrescriptionIncidentControl(
  db: PrismaClient,
  input: {
    actorUserId: string
    expiresAt?: Date
    reason: string
    storeId: string
    tenantId: string
    type:
      | "break_glass"
      | "freeze_processing"
      | "revoke_public_links"
      | "revoke_whatsapp"
      | "suspend_commerce"
  },
) {
  const type = input.type.toUpperCase() as PrescriptionIncidentType
  if (type === PrescriptionIncidentType.BREAK_GLASS) {
    assertPrescriptionBreakGlassWindow({ expiresAt: input.expiresAt })
  }
  return db.$transaction(async (tx) => {
    const control = await tx.prescriptionIncidentControl.create({
      data: {
        activatedByUserId: input.actorUserId,
        expiresAt: input.expiresAt,
        reason: input.reason.trim(),
        storeId: input.storeId,
        tenantId: input.tenantId,
        type,
      },
    })
    if (type === PrescriptionIncidentType.BREAK_GLASS) {
      await recordPrescriptionSensitiveAccess(tx, {
        accessTypes: ["break_glass_granted"],
        actorUserId: input.actorUserId,
        incidentControlId: control.id,
        reason: input.reason,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    }
    if (
      type === PrescriptionIncidentType.SUSPEND_COMMERCE ||
      type === PrescriptionIncidentType.FREEZE_PROCESSING
    ) {
      await tx.prescriptionStoreSettings.updateMany({
        data: { status: "SUSPENDED" },
        where: { storeId: input.storeId, tenantId: input.tenantId },
      })
    }
    if (type === PrescriptionIncidentType.REVOKE_PUBLIC_LINKS) {
      await tx.prescriptionChannel.updateMany({
        data: { status: "DISABLED" },
        where: { storeId: input.storeId, tenantId: input.tenantId },
      })
    }
    if (type === PrescriptionIncidentType.REVOKE_WHATSAPP) {
      await tx.whatsAppStoreBinding.updateMany({
        data: { status: "SUSPENDED" },
        where: { storeId: input.storeId, tenantId: input.tenantId },
      })
    }
    return control
  })
}

export async function resolvePrescriptionIncidentControl(
  db: PrismaClient,
  input: {
    actorUserId: string
    controlId: string
    reviewReason: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const control = await tx.prescriptionIncidentControl.findFirstOrThrow({
      where: {
        id: input.controlId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const resolved = await tx.prescriptionIncidentControl.update({
      data: {
        resolvedAt: new Date(),
        resolvedByUserId: input.actorUserId,
        status: PrescriptionIncidentStatus.RESOLVED,
      },
      where: { id: control.id },
    })
    if (control.type === PrescriptionIncidentType.BREAK_GLASS) {
      await recordPrescriptionSensitiveAccess(tx, {
        accessTypes: ["break_glass_reviewed"],
        actorUserId: input.actorUserId,
        incidentControlId: control.id,
        reason: input.reviewReason,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    }
    return resolved
  })
}

export async function listPrescriptionComplianceEvents(
  db: PrismaClient,
  input: { limit?: number; storeId: string; tenantId: string },
) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500)
  const [
    mediaAccess,
    requestAudit,
    sensitiveAccess,
    incidents,
    privacyRequests,
    whatsappAudit,
  ] = await Promise.all([
    db.prescriptionMediaAccessEvent.findMany({
      orderBy: { effectiveAt: "desc" },
      take: limit,
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
    db.prescriptionRequestAuditEvent.findMany({
      orderBy: { effectiveAt: "desc" },
      take: limit,
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
    db.prescriptionSensitiveAccessEvent.findMany({
      orderBy: { effectiveAt: "desc" },
      take: limit,
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
    db.prescriptionIncidentControl.findMany({
      orderBy: { activatedAt: "desc" },
      take: limit,
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
    db.prescriptionPrivacyRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
    db.whatsAppConnectionAuditEvent.findMany({
      orderBy: { effectiveAt: "desc" },
      take: limit,
      where: { storeId: input.storeId, tenantId: input.tenantId },
    }),
  ])
  return {
    incidents,
    mediaAccess,
    privacyRequests,
    requestAudit,
    sensitiveAccess,
    whatsappAudit,
  }
}
