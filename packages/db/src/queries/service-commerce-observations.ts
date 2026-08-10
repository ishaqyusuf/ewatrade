import {
  type ServiceCommerceChannelOrigin,
  type ServiceCommerceMediaKind,
  type ServiceCommerceMediaMimeType,
  getServiceCommerceObservationRevisionValidation,
  getServiceCommerceObservationValidation,
  serviceCommerceHumanVerifiedObservationDraftSchema,
  serviceCommerceHumanVerifiedObservationSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  ServiceCommerceMediaAuditEventType,
  ServiceCommerceVerifiedObservationLifecycle,
} from "../../generated/prisma/enums"
import {
  getScopedServiceCommerceMediaAttachment,
  resolveCurrentServiceCommerceMediaSource,
} from "./service-commerce-attachments"
import {
  ServiceCommerceMediaError,
  assertActiveServiceCommerceAttendant,
  auditMedia,
  validateServiceCommerceMediaIntakeReadiness,
} from "./service-commerce-media-assets"

function observationAttributes(
  attributes: Array<{ name: string; value: string }>,
) {
  return attributes.map((attribute) => ({
    name: attribute.name.trim(),
    value: attribute.value.trim(),
  }))
}

export function projectSafeServiceCommerceObservation(observation: {
  attachmentId: string
  attributes: unknown
  displayLabel: string
  id: string
  lifecycle: string
  revision: number
  sourceLineId: string | null
  sourceVersion: string
  verifiedAt: Date
  verifiedByUserId: string
}) {
  return {
    attachmentId: observation.attachmentId,
    attributes:
      serviceCommerceHumanVerifiedObservationDraftSchema.shape.attributes.parse(
        observation.attributes,
      ),
    displayLabel: observation.displayLabel,
    id: observation.id,
    lifecycle: observation.lifecycle.toLowerCase(),
    revision: observation.revision,
    sourceLineId: observation.sourceLineId,
    sourceVersion: observation.sourceVersion,
    verifiedAt: observation.verifiedAt,
    verifiedByUserId: observation.verifiedByUserId,
  }
}

export async function createServiceCommerceHumanObservation(
  db: PrismaClient,
  input: {
    actorUserId: string
    attachmentId: string
    attributes: Array<{ name: string; value: string }>
    displayLabel: string
    expectedRevision: number
    storeId: string
    tenantId: string
  },
) {
  try {
    return await db.$transaction(async (tx) => {
      await assertActiveServiceCommerceAttendant(tx, input)
      const attachment = await getScopedServiceCommerceMediaAttachment(
        tx,
        input,
      )
      if (!attachment.sourceLineId) {
        throw new ServiceCommerceMediaError(
          "NOT_READY",
          "A current source line is required before recording an observation.",
        )
      }
      const source = await resolveCurrentServiceCommerceMediaSource(tx, {
        actorUserId: input.actorUserId,
        source: {
          id: attachment.sourceId,
          kind:
            attachment.sourceKind === "COMMERCE_INQUIRY"
              ? "commerce_inquiry"
              : attachment.sourceKind === "PRESCRIPTION_REQUEST"
                ? "prescription"
                : "service",
        },
        sourceLineId: attachment.sourceLineId,
        sourceVersion: attachment.sourceVersion,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      await validateServiceCommerceMediaIntakeReadiness(tx, {
        actorUserId: input.actorUserId,
        attachmentCount: 1,
        byteSize: attachment.mediaAsset.verifiedSizeBytes ?? 0,
        channel:
          attachment.mediaAsset.channelOrigin.toLowerCase() as ServiceCommerceChannelOrigin,
        kind: attachment.mediaAsset.kind.toLowerCase() as ServiceCommerceMediaKind,
        mimeType: (attachment.mediaAsset.verifiedMediaType ??
          attachment.mediaAsset
            .declaredMediaType) as ServiceCommerceMediaMimeType,
        privateMediaProviderReady: true,
        signatureMimeType: attachment.mediaAsset
          .verifiedMediaType as ServiceCommerceMediaMimeType | null,
        storeId: input.storeId,
        tenantId: input.tenantId,
        vertical: source.vertical,
      })
      const current = await tx.serviceCommerceVerifiedObservation.findFirst({
        where: {
          attachmentId: attachment.id,
          lifecycle: ServiceCommerceVerifiedObservationLifecycle.CURRENT,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      const revision = getServiceCommerceObservationRevisionValidation({
        currentObservation: current
          ? {
              attachmentId: current.attachmentId,
              attributes: current.attributes as Array<{
                name: string
                value: string
              }>,
              displayLabel: current.displayLabel,
              id: current.id,
              lifecycle: current.lifecycle.toLowerCase() as "current",
              revision: current.revision,
              sourceLineId: current.sourceLineId,
              sourceVersion: current.sourceVersion,
              verifiedAt: current.verifiedAt,
              verifiedByUserId: current.verifiedByUserId,
            }
          : null,
        expectedRevision: input.expectedRevision,
      })
      if (revision !== "valid") {
        throw new ServiceCommerceMediaError(
          "CONFLICT",
          "The observation was updated before this revision could be saved.",
        )
      }
      const validation = getServiceCommerceObservationValidation({
        assetLifecycle: attachment.mediaAsset.lifecycle.toLowerCase() as "safe",
        attachmentLifecycle: attachment.lifecycle.toLowerCase() as "active",
        currentSourceVersion: source.ref.sourceVersion,
        observation: {
          attachmentId: attachment.id,
          attributes: observationAttributes(input.attributes),
          displayLabel: input.displayLabel.trim(),
          id: "pending",
          lifecycle: "current",
          revision: input.expectedRevision + 1,
          sourceLineId: attachment.sourceLineId,
          sourceVersion: attachment.sourceVersion,
          verifiedAt: new Date(),
          verifiedByUserId: input.actorUserId,
        },
      })
      if (validation !== "valid") {
        throw new ServiceCommerceMediaError(
          "NOT_READY",
          "A safe active attachment with a current source is required.",
        )
      }
      const parsed = serviceCommerceHumanVerifiedObservationSchema.parse({
        attachmentId: attachment.id,
        attributes: observationAttributes(input.attributes),
        displayLabel: input.displayLabel.trim(),
        id: "pending",
        lifecycle: "current",
        revision: input.expectedRevision + 1,
        sourceLineId: attachment.sourceLineId,
        sourceVersion: attachment.sourceVersion,
        verifiedAt: new Date(),
        verifiedByUserId: input.actorUserId,
      })
      if (current) {
        const superseded =
          await tx.serviceCommerceVerifiedObservation.updateMany({
            data: {
              currentKey: null,
              lifecycle: ServiceCommerceVerifiedObservationLifecycle.SUPERSEDED,
              supersededAt: new Date(),
            },
            where: {
              id: current.id,
              lifecycle: ServiceCommerceVerifiedObservationLifecycle.CURRENT,
              revision: input.expectedRevision,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          })
        if (superseded.count !== 1) {
          throw new ServiceCommerceMediaError(
            "CONFLICT",
            "The observation changed before this revision could be saved.",
          )
        }
      }
      const observation = await tx.serviceCommerceVerifiedObservation.create({
        data: {
          attachmentId: attachment.id,
          attributes: parsed.attributes,
          currentKey: attachment.id,
          displayLabel: parsed.displayLabel,
          lifecycle: ServiceCommerceVerifiedObservationLifecycle.CURRENT,
          revision: parsed.revision,
          sourceLineId: attachment.sourceLineId,
          sourceVersion: attachment.sourceVersion,
          storeId: input.storeId,
          tenantId: input.tenantId,
          verifiedAt: parsed.verifiedAt,
          verifiedByUserId: input.actorUserId,
        },
      })
      if (current) {
        await auditMedia(tx, {
          actorUserId: input.actorUserId,
          attachmentId: attachment.id,
          mediaAssetId: attachment.mediaAssetId,
          reason: "observation_superseded",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: ServiceCommerceMediaAuditEventType.OBSERVATION_SUPERSEDED,
        })
      }
      await auditMedia(tx, {
        actorUserId: input.actorUserId,
        attachmentId: attachment.id,
        mediaAssetId: attachment.mediaAssetId,
        reason: "observation_verified",
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: ServiceCommerceMediaAuditEventType.OBSERVATION_VERIFIED,
      })
      return projectSafeServiceCommerceObservation(observation)
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2025")
    ) {
      throw new ServiceCommerceMediaError(
        "CONFLICT",
        "The observation changed before this revision could be saved.",
      )
    }
    throw error
  }
}
