import { createHash } from "node:crypto"

import {
  type ServiceCommerceCatalogSourceLineRef,
  type ServiceCommerceSourceRef,
  serviceCommerceCatalogSourceLineRefSchema,
  serviceCommerceSourceRefSchema,
} from "@ewatrade/service-commerce"

import {
  CommerceInquiryStatus,
  PrescriptionLineVerificationStatus,
  PrescriptionRequestStatus,
  ServiceRequestStatus,
} from "../../generated/prisma/enums"
import { assertAnyPrescriptionStoreRole } from "./prescription-settings"
import type { DbClient } from "./types"

export type ServiceCommerceCatalogErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "IDEMPOTENCY_MISMATCH"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_READY"

export class ServiceCommerceCatalogError extends Error {
  constructor(
    readonly code: ServiceCommerceCatalogErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommerceCatalogError"
  }
}

export type ResolvedCatalogSourceLine = {
  displayLabel: string
  kind: "product" | "service"
  ref: ServiceCommerceCatalogSourceLineRef
  vertical: "pharmacy" | "service"
}

type ResolveCatalogSourceLineInput = {
  actorUserId: string
  operation: "adopt" | "read" | "promote" | "quote"
  source: ServiceCommerceSourceRef
  sourceLineId: string
  storeId: string
  tenantId: string
}

function fingerprint(value: Record<string, unknown>) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      ),
    )
    .digest("hex")
}

function sourceLineRef(input: {
  evidence:
    | { capturedAt: Date; kind: "source_snapshot" }
    | { kind: "human_verified"; verifiedAt: Date; verifiedByUserId: string }
  fingerprint: string
  source: ServiceCommerceSourceRef
  sourceLineId: string
  sourceVersion: string
}) {
  return serviceCommerceCatalogSourceLineRefSchema.parse({
    evidence: input.evidence,
    fingerprint: input.fingerprint,
    id: input.sourceLineId,
    source: input.source,
    sourceVersion: input.sourceVersion,
  })
}

function assertAdoptableStatus(
  operation: ResolveCatalogSourceLineInput["operation"],
  status: string,
  allowed: readonly string[],
) {
  if (operation === "adopt" && !allowed.includes(status)) {
    throw new ServiceCommerceCatalogError(
      "CONFLICT",
      "The source line is no longer eligible for Catalog resolution.",
    )
  }
}

async function resolveInquiryLine(
  db: DbClient,
  input: ResolveCatalogSourceLineInput,
): Promise<ResolvedCatalogSourceLine> {
  const line = await db.commerceInquiryLine.findFirst({
    include: {
      inquiry: {
        select: { status: true, updatedAt: true },
      },
    },
    where: {
      id: input.sourceLineId,
      inquiryId: input.source.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!line) {
    throw new ServiceCommerceCatalogError(
      "NOT_FOUND",
      "Commerce Inquiry line not found.",
    )
  }
  assertAdoptableStatus(input.operation, line.inquiry.status, [
    CommerceInquiryStatus.RECEIVED,
    CommerceInquiryStatus.NEEDS_CLARIFICATION,
    CommerceInquiryStatus.READY_TO_QUOTE,
  ])
  const sourceFingerprint = fingerprint({
    description: line.description,
    position: line.position,
    quantity: line.requestedQuantity?.toString() ?? null,
  })
  return {
    displayLabel: line.description,
    kind: "product",
    ref: sourceLineRef({
      evidence: { capturedAt: line.createdAt, kind: "source_snapshot" },
      fingerprint: sourceFingerprint,
      source: input.source,
      sourceLineId: line.id,
      sourceVersion: sourceFingerprint,
    }),
    vertical: "service",
  }
}

async function resolveServiceLine(
  db: DbClient,
  input: ResolveCatalogSourceLineInput,
): Promise<ResolvedCatalogSourceLine> {
  const line = await db.serviceRequestLine.findFirst({
    include: {
      offering: { select: { kind: true } },
      request: { select: { status: true, updatedAt: true } },
    },
    where: {
      id: input.sourceLineId,
      request: {
        id: input.source.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
  })
  if (!line) {
    throw new ServiceCommerceCatalogError(
      "NOT_FOUND",
      "Service Request line not found.",
    )
  }
  assertAdoptableStatus(input.operation, line.request.status, [
    ServiceRequestStatus.SUBMITTED,
    ServiceRequestStatus.NEEDS_INFORMATION,
  ])
  const sourceFingerprint = fingerprint({
    details: line.details,
    offeringId: line.offeringId,
    offeringName: line.offeringName,
    quantity: line.requestedQuantity.toString(),
    variantName: line.variantName,
  })
  return {
    displayLabel: line.details?.trim() || line.offeringName,
    kind: line.offering.kind === "SERVICE" ? "service" : "product",
    ref: sourceLineRef({
      evidence: { capturedAt: line.createdAt, kind: "source_snapshot" },
      fingerprint: sourceFingerprint,
      source: input.source,
      sourceLineId: line.id,
      sourceVersion: sourceFingerprint,
    }),
    vertical: "service",
  }
}

async function resolvePrescriptionLine(
  db: DbClient,
  input: ResolveCatalogSourceLineInput,
): Promise<ResolvedCatalogSourceLine> {
  await assertAnyPrescriptionStoreRole(db, {
    storeId: input.storeId,
    tenantId: input.tenantId,
    userId: input.actorUserId,
  })
  const line = await db.prescriptionTranscriptionLine.findFirst({
    include: {
      mapping: { select: { updatedAt: true } },
      transcription: {
        include: {
          request: {
            select: {
              currentMediaRevision: true,
              currentTranscriptRevision: true,
              status: true,
              storeId: true,
              tenantId: true,
              updatedAt: true,
            },
          },
        },
      },
    },
    where: {
      id: input.sourceLineId,
      status: PrescriptionLineVerificationStatus.VERIFIED,
      transcription: {
        requestId: input.source.id,
        request: { storeId: input.storeId, tenantId: input.tenantId },
      },
    },
  })
  const request = line?.transcription.request
  if (
    !line ||
    !request ||
    !line.verifiedText?.trim() ||
    request.currentTranscriptRevision !== line.transcription.revision ||
    request.currentMediaRevision !== line.transcription.mediaRevision
  ) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "A current human-verified Prescription line is required.",
    )
  }
  assertAdoptableStatus(input.operation, request.status, [
    PrescriptionRequestStatus.PHARMACIST_REVIEW,
    PrescriptionRequestStatus.READY_TO_QUOTE,
  ])
  const sourceFingerprint = fingerprint({
    lineNumber: line.lineNumber,
    lineUpdatedAt: line.updatedAt.toISOString(),
    mappingUpdatedAt: line.mapping?.updatedAt.toISOString() ?? null,
    mediaRevision: request.currentMediaRevision,
    transcriptRevision: line.transcription.revision,
    verifiedText: line.verifiedText,
  })
  return {
    displayLabel: line.verifiedText.trim(),
    kind: "product",
    ref: sourceLineRef({
      evidence: {
        kind: "human_verified",
        verifiedAt: line.verifiedAt ?? line.updatedAt,
        verifiedByUserId: line.verifiedByUserId ?? input.actorUserId,
      },
      fingerprint: sourceFingerprint,
      source: input.source,
      sourceLineId: line.id,
      sourceVersion: sourceFingerprint,
    }),
    vertical: "pharmacy",
  }
}

export async function resolveServiceCommerceCatalogSourceLine(
  db: DbClient,
  rawInput: ResolveCatalogSourceLineInput,
): Promise<ResolvedCatalogSourceLine> {
  const input = {
    ...rawInput,
    source: serviceCommerceSourceRefSchema.parse(rawInput.source),
    sourceLineId: rawInput.sourceLineId.trim(),
  }
  if (!input.sourceLineId) {
    throw new ServiceCommerceCatalogError(
      "INVALID_INPUT",
      "A source line is required.",
    )
  }
  if (input.source.kind === "commerce_inquiry") {
    return resolveInquiryLine(db, input)
  }
  if (input.source.kind === "prescription") {
    return resolvePrescriptionLine(db, input)
  }
  return resolveServiceLine(db, input)
}
