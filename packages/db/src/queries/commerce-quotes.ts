import { createHash, randomBytes } from "node:crypto"

import {
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CatalogAvailabilityAttestationType,
  CatalogRecordStatus,
  CommerceInquiryAuditEventType,
  CommerceInquiryStatus,
  CommerceQuoteAvailabilityOutcome,
  CommerceQuoteFulfilmentType,
  CommerceQuoteLineOutcome,
  CommerceQuoteSourceType as CommerceQuoteSourceTypeEnum,
  CommerceQuoteVersionStatus as CommerceQuoteVersionStatusEnum,
  PrescriptionRequestAuditEventType,
  PrescriptionRequestStatus,
  SellableOfferingKind,
  ServiceRequestStatus,
} from "../../generated/prisma/enums"
import { getCatalogOfferingAvailability } from "./catalog-inventory"
import {
  resolveCatalogAvailabilityAttestationForQuote,
  resolveCatalogSourceLinkForQuote,
} from "./service-commerce-catalog"

export type CommerceQuoteSourceType =
  | "commerce_inquiry"
  | "prescription_request"
  | "service_request"

export type CommerceQuoteVersionStatus =
  | "accepted"
  | "declined"
  | "draft"
  | "expired"
  | "issued"
  | "revoked"
  | "superseded"

export type CommerceQuoteAvailabilityOutcomeInput =
  | "full"
  | "partial"
  | "unavailable"

export type CommerceQuoteLineOutcomeInput =
  | "alternative"
  | "declined"
  | "included"
  | "unavailable"

export type CommerceQuoteFulfilmentTypeInput =
  | "delivery"
  | "pickup"
  | "unspecified"

export type CommerceQuoteErrorCode =
  | "IDEMPOTENCY_MISMATCH"
  | "OFFERING_UNAVAILABLE"
  | "PUBLIC_TOKEN_INVALID"
  | "QUOTE_CONFLICT"
  | "QUOTE_SOURCE_NOT_FOUND"
  | "STORE_NOT_FOUND"

export class CommerceQuoteError extends Error {
  readonly code: CommerceQuoteErrorCode

  constructor(code: CommerceQuoteErrorCode, message: string) {
    super(message)
    this.name = "CommerceQuoteError"
    this.code = code
  }
}

export function assertCommerceQuoteSource(input: {
  sourceId: string
  sourceType: CommerceQuoteSourceType
}) {
  const sourceId = input.sourceId.trim()
  if (!sourceId) throw new Error("Quote source is required.")
  return { sourceId, sourceType: input.sourceType }
}

export function assertQuotedSourceQuoteIdentity(input: {
  alreadyQuoted: boolean
  bindToExistingQuote: boolean
  existingClientQuoteId: string | null
  requestedClientQuoteId: string
}) {
  if (
    input.alreadyQuoted &&
    input.bindToExistingQuote &&
    input.existingClientQuoteId !== input.requestedClientQuoteId
  ) {
    throw new CommerceQuoteError(
      "IDEMPOTENCY_MISMATCH",
      "This quoted source is already bound to another Quote command identity.",
    )
  }
}

export function assertQuoteVersionAcceptable(input: {
  currentVersionId: string | null
  expiresAt: Date | null
  now?: Date
  status: CommerceQuoteVersionStatus
  versionId: string
}) {
  const now = input.now ?? new Date()
  if (
    input.status !== "issued" ||
    input.currentVersionId !== input.versionId ||
    (input.expiresAt !== null && input.expiresAt <= now)
  ) {
    throw new Error("Only the current unexpired Quote Version can be accepted.")
  }
}

function token() {
  return randomBytes(32).toString("base64url")
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function hash(value: unknown) {
  return digest(stableJson(value))
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function mapSourceType(sourceType: CommerceQuoteSourceType) {
  const sourceTypes = {
    commerce_inquiry: CommerceQuoteSourceTypeEnum.COMMERCE_INQUIRY,
    prescription_request: CommerceQuoteSourceTypeEnum.PRESCRIPTION_REQUEST,
    service_request: CommerceQuoteSourceTypeEnum.SERVICE_REQUEST,
  } satisfies Record<CommerceQuoteSourceType, CommerceQuoteSourceTypeEnum>
  return sourceTypes[sourceType]
}

function mapLineOutcome(outcome: CommerceQuoteLineOutcomeInput) {
  switch (outcome) {
    case "alternative":
      return CommerceQuoteLineOutcome.ALTERNATIVE
    case "declined":
      return CommerceQuoteLineOutcome.DECLINED
    case "unavailable":
      return CommerceQuoteLineOutcome.UNAVAILABLE
    default:
      return CommerceQuoteLineOutcome.INCLUDED
  }
}

function mapAvailabilityOutcome(
  outcome: CommerceQuoteAvailabilityOutcomeInput,
) {
  switch (outcome) {
    case "partial":
      return CommerceQuoteAvailabilityOutcome.PARTIAL
    case "unavailable":
      return CommerceQuoteAvailabilityOutcome.UNAVAILABLE
    default:
      return CommerceQuoteAvailabilityOutcome.FULL
  }
}

function mapFulfilmentType(type: CommerceQuoteFulfilmentTypeInput) {
  switch (type) {
    case "delivery":
      return CommerceQuoteFulfilmentType.DELIVERY
    case "pickup":
      return CommerceQuoteFulfilmentType.PICKUP
    default:
      return CommerceQuoteFulfilmentType.UNSPECIFIED
  }
}

function serializeLineOutcome(outcome: CommerceQuoteLineOutcome) {
  return outcome.toLowerCase() as CommerceQuoteLineOutcomeInput
}

type QuoteOptionLine = {
  outcome: CommerceQuoteLineOutcome | string
  quoteOptionId?: null | string
}

type QuoteOptionFacts<TLine extends QuoteOptionLine> = {
  availabilityOutcome: CommerceQuoteAvailabilityOutcome | string
  customerNote?: null | string
  discountMinor: number
  fulfilmentFeeMinor: number
  fulfilmentPromise?: null | string
  fulfilmentType: CommerceQuoteFulfilmentType | string
  id: string
  lines: TLine[]
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
}

export function resolveCommerceQuotePayableState<
  TLine extends QuoteOptionLine,
>(version: {
  availabilityOutcome: CommerceQuoteAvailabilityOutcome | string
  customerNote?: null | string
  discountMinor: number
  fulfilmentFeeMinor: number
  fulfilmentPromise?: null | string
  fulfilmentType: CommerceQuoteFulfilmentType | string
  lines?: TLine[]
  optionSelection?: null | { optionId: string }
  options?: Array<QuoteOptionFacts<TLine>>
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
}) {
  const options = version.options ?? []
  if (options.length === 0) {
    return {
      payable: {
        availabilityOutcome: version.availabilityOutcome,
        customerNote: version.customerNote,
        discountMinor: version.discountMinor,
        fulfilmentFeeMinor: version.fulfilmentFeeMinor,
        fulfilmentPromise: version.fulfilmentPromise,
        fulfilmentType: version.fulfilmentType,
        id: null,
        lines: (version.lines ?? []).filter(
          (line) =>
            line.outcome === CommerceQuoteLineOutcome.INCLUDED ||
            line.outcome === CommerceQuoteLineOutcome.ALTERNATIVE,
        ),
        subtotalMinor: version.subtotalMinor,
        taxMinor: version.taxMinor,
        totalMinor: version.totalMinor,
      },
      requiresSelection: false,
    }
  }

  const optionIds = new Set(options.map((option) => option.id))
  if (optionIds.size !== options.length) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Quote Version contains duplicate Offer Option identities.",
    )
  }
  const selectedOptionId = version.optionSelection?.optionId ?? null
  if (selectedOptionId && !optionIds.has(selectedOptionId)) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Selected Offer Option does not belong to this Quote Version.",
    )
  }
  const payableOption = selectedOptionId
    ? (options.find((option) => option.id === selectedOptionId) ?? null)
    : options.length === 1
      ? (options[0] ?? null)
      : null
  const payable = payableOption
    ? {
        ...payableOption,
        lines: payableOption.lines.filter(
          (line) =>
            line.outcome === CommerceQuoteLineOutcome.INCLUDED ||
            line.outcome === CommerceQuoteLineOutcome.ALTERNATIVE,
        ),
      }
    : null
  return { payable, requiresSelection: payable === null }
}

function lineTotal(unitPriceMinor: number, quantity: string) {
  const total = multiplyExactDecimals(String(unitPriceMinor), quantity)
  if (!/^\d+$/.test(total)) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Quoted line total must resolve to a whole minor currency unit.",
    )
  }
  return Number(total)
}

export type IssueCommerceQuoteLineInput = {
  availabilityAttestationId?: string
  availabilityAttestationType?: CatalogAvailabilityAttestationType
  catalogSourceVerified?: boolean
  balanceRevision?: number
  catalogItemName?: string
  customerNote?: string
  configurationVersionId?: string
  offeringId?: string
  offeringName?: string
  optionSelections?: Array<{ group: string; value: string }>
  outcome: CommerceQuoteLineOutcomeInput
  quantity?: string
  sourceLineId?: string
  unitPriceMinor?: number
  variantName?: string
}

export type IssueCommerceQuoteOptionInput = {
  availabilityOutcome: CommerceQuoteAvailabilityOutcomeInput
  clientOptionId: string
  customerNote?: string
  discountMinor?: number
  fulfilmentFeeMinor?: number
  fulfilmentPromise?: string
  fulfilmentType?: CommerceQuoteFulfilmentTypeInput
  label: string
  lines: IssueCommerceQuoteLineInput[]
  taxMinor?: number
}

export function quoteLineRequiresStoreAvailability(input: {
  catalogSourceVerified?: boolean
  kind: SellableOfferingKind
  status: CatalogRecordStatus
  usesManualAttestation: boolean
}) {
  if (input.usesManualAttestation) return false
  return !(
    input.kind === SellableOfferingKind.SERVICE &&
    input.status === CatalogRecordStatus.DRAFT &&
    input.catalogSourceVerified === true
  )
}

export type IssueCommerceQuoteInput = {
  actorUserId: string
  authorize?: (tx: Prisma.TransactionClient) => Promise<void>
  availabilityOutcome?: CommerceQuoteAvailabilityOutcomeInput
  clientQuoteId: string
  clientVersionId: string
  customerNote?: string
  discountMinor?: number
  expiresAt?: Date
  fulfilmentFeeMinor?: number
  fulfilmentPromise?: string
  fulfilmentType?: CommerceQuoteFulfilmentTypeInput
  lines?: IssueCommerceQuoteLineInput[]
  options?: IssueCommerceQuoteOptionInput[]
  sourceId: string
  sourceType: CommerceQuoteSourceType
  storeId: string
  taxMinor?: number
  tenantId: string
}

export function normalizeIssueCommerceQuoteOptions(
  input: Pick<
    IssueCommerceQuoteInput,
    | "availabilityOutcome"
    | "clientVersionId"
    | "customerNote"
    | "discountMinor"
    | "fulfilmentFeeMinor"
    | "fulfilmentPromise"
    | "fulfilmentType"
    | "lines"
    | "options"
    | "taxMinor"
  >,
) {
  if (input.options) {
    if (
      input.lines ||
      input.availabilityOutcome !== undefined ||
      input.customerNote !== undefined ||
      input.discountMinor !== undefined ||
      input.fulfilmentFeeMinor !== undefined ||
      input.fulfilmentPromise !== undefined ||
      input.fulfilmentType !== undefined ||
      input.taxMinor !== undefined
    ) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Offer Options must own their lines, availability, fulfilment and monetary facts.",
      )
    }
    if (input.options.length < 1 || input.options.length > 20) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "A Quote requires between one and 20 Offer Options.",
      )
    }
    const ids = input.options.map((option) => option.clientOptionId.trim())
    const labels = input.options.map((option) => option.label.trim())
    if (
      ids.some((id) => !id || id.length > 191) ||
      new Set(ids).size !== ids.length ||
      labels.some((label) => !label || label.length > 120)
    ) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Offer Option identities and labels must be valid and unique.",
      )
    }
    return input.options.map((option, position) => ({
      ...option,
      clientOptionId: ids[position] as string,
      customerNote: option.customerNote?.trim() || undefined,
      discountMinor: option.discountMinor ?? 0,
      fulfilmentFeeMinor: option.fulfilmentFeeMinor ?? 0,
      fulfilmentPromise: option.fulfilmentPromise?.trim() || undefined,
      fulfilmentType: option.fulfilmentType ?? "unspecified",
      label: labels[position] as string,
      position,
      taxMinor: option.taxMinor ?? 0,
    }))
  }
  if (!input.lines || !input.availabilityOutcome) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "A Quote requires lines or Offer Options.",
    )
  }
  return [
    {
      availabilityOutcome: input.availabilityOutcome,
      clientOptionId: `${input.clientVersionId}:default`,
      customerNote: input.customerNote,
      discountMinor: input.discountMinor,
      fulfilmentFeeMinor: input.fulfilmentFeeMinor,
      fulfilmentPromise: input.fulfilmentPromise,
      fulfilmentType: input.fulfilmentType,
      label: "Quote",
      lines: input.lines,
      position: 0,
      taxMinor: input.taxMinor,
    },
  ]
}

type QuoteSourceHandlerInput = {
  actorUserId: string
  lines: IssueCommerceQuoteLineInput[]
  sourceId: string
  storeId: string
  tenantId: string
}

type QuoteSourceState = { alreadyQuoted: boolean }

type QuoteSourceHandler = {
  allowedOfferingKind: SellableOfferingKind
  bindQuotedSourceToExistingQuote: boolean
  load: (
    tx: Prisma.TransactionClient,
    input: QuoteSourceHandlerInput,
  ) => Promise<QuoteSourceState>
  prepareLines: (
    tx: Prisma.TransactionClient,
    input: QuoteSourceHandlerInput,
  ) => Promise<IssueCommerceQuoteLineInput[]>
  recordIssued: (
    tx: Prisma.TransactionClient,
    input: QuoteSourceHandlerInput & { versionId: string },
    state: QuoteSourceState,
  ) => Promise<void>
  recoverIssuanceToken: boolean
  requiresInventorySnapshot: boolean
  validateLines: (
    tx: Prisma.TransactionClient,
    input: QuoteSourceHandlerInput,
  ) => Promise<void>
}

const quoteSourceHandlers = {
  commerce_inquiry: {
    allowedOfferingKind: SellableOfferingKind.PRODUCT_UNIT,
    bindQuotedSourceToExistingQuote: true,
    load: async (tx, input) => {
      const source = await tx.commerceInquiry.findFirst({
        select: { status: true },
        where: {
          id: input.sourceId,
          status: {
            in: [
              CommerceInquiryStatus.READY_TO_QUOTE,
              CommerceInquiryStatus.QUOTED,
            ],
          },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!source) {
        throw new CommerceQuoteError(
          "QUOTE_SOURCE_NOT_FOUND",
          "Ready Commerce Inquiry source not found.",
        )
      }
      return { alreadyQuoted: source.status === CommerceInquiryStatus.QUOTED }
    },
    prepareLines: async (tx, input) => {
      const snapshots = new Map<
        string,
        Pick<
          IssueCommerceQuoteLineInput,
          | "availabilityAttestationId"
          | "availabilityAttestationType"
          | "balanceRevision"
          | "catalogSourceVerified"
          | "configurationVersionId"
        >
      >()
      for (const line of input.lines) {
        const snapshotKey = `${line.sourceLineId ?? ""}:${line.offeringId ?? ""}`
        if (
          !line.offeringId ||
          (line.outcome !== "included" && line.outcome !== "alternative") ||
          snapshots.has(snapshotKey)
        ) {
          continue
        }
        if (line.availabilityAttestationId && line.sourceLineId) {
          if (!line.quantity) {
            throw new CommerceQuoteError(
              "QUOTE_CONFLICT",
              "Availability-backed Quote lines require a committed quantity.",
            )
          }
          const attestation =
            await resolveCatalogAvailabilityAttestationForQuote(tx, {
              actorUserId: input.actorUserId,
              attestationId: line.availabilityAttestationId,
              offeringId: line.offeringId,
              source: { id: input.sourceId, kind: "commerce_inquiry" },
              sourceLineId: line.sourceLineId,
              storeId: input.storeId,
              tenantId: input.tenantId,
              quantity: line.quantity,
            })
          snapshots.set(snapshotKey, {
            availabilityAttestationId: attestation.id,
            availabilityAttestationType: attestation.type,
            balanceRevision: attestation.balanceRevision ?? undefined,
            catalogSourceVerified: true,
            configurationVersionId:
              attestation.configurationVersionId ?? undefined,
          })
        } else {
          const inventory = await getCatalogOfferingAvailability(tx, {
            offeringId: line.offeringId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          })
          snapshots.set(snapshotKey, {
            balanceRevision: inventory.revision,
            configurationVersionId: inventory.configurationVersionId,
          })
        }
      }
      return input.lines.map((line) => {
        const snapshot = line.offeringId
          ? snapshots.get(`${line.sourceLineId ?? ""}:${line.offeringId}`)
          : undefined
        return snapshot
          ? {
              ...line,
              ...snapshot,
            }
          : line
      })
    },
    recordIssued: async (tx, input, state) => {
      if (state.alreadyQuoted) return
      if (
        (
          await tx.commerceInquiry.updateMany({
            data: { status: CommerceInquiryStatus.QUOTED },
            where: {
              id: input.sourceId,
              status: CommerceInquiryStatus.READY_TO_QUOTE,
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          })
        ).count !== 1
      ) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Commerce Inquiry changed before Quote issuance.",
        )
      }
      await tx.commerceInquiryAuditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          fromStatus: CommerceInquiryStatus.READY_TO_QUOTE,
          inquiryId: input.sourceId,
          storeId: input.storeId,
          tenantId: input.tenantId,
          toStatus: CommerceInquiryStatus.QUOTED,
          type: CommerceInquiryAuditEventType.QUOTE_ISSUED,
        },
      })
    },
    recoverIssuanceToken: true,
    requiresInventorySnapshot: true,
    validateLines: async (tx, input) => {
      const sourceLineIds = input.lines.flatMap((line) =>
        line.sourceLineId?.trim() ? [line.sourceLineId.trim()] : [],
      )
      const uniqueSourceLineIds = [...new Set(sourceLineIds)]
      if (
        sourceLineIds.length !== input.lines.length ||
        uniqueSourceLineIds.length !== input.lines.length ||
        (await tx.commerceInquiryLine.count({
          where: {
            id: { in: uniqueSourceLineIds },
            inquiryId: input.sourceId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
        })) !== input.lines.length
      ) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Every Commerce Inquiry Quote line must reference one current Inquiry line.",
        )
      }
    },
  },
  service_request: {
    allowedOfferingKind: SellableOfferingKind.SERVICE,
    bindQuotedSourceToExistingQuote: false,
    load: async (tx, input) => {
      const source = await tx.serviceRequest.findFirst({
        select: { status: true },
        where: {
          id: input.sourceId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!source) {
        throw new CommerceQuoteError(
          "QUOTE_SOURCE_NOT_FOUND",
          "Service Request source not found.",
        )
      }
      return { alreadyQuoted: source.status === ServiceRequestStatus.QUOTED }
    },
    prepareLines: async (tx, input) => {
      const requestLines = await tx.serviceRequestLine.findMany({
        select: { id: true, offeringId: true },
        where: { requestId: input.sourceId },
      })
      const directByOffering = new Map(
        requestLines.map((line) => [line.offeringId, line.id]),
      )
      const prepared: IssueCommerceQuoteLineInput[] = []
      for (const line of input.lines) {
        if (!line.offeringId) {
          prepared.push(line)
          continue
        }
        const sourceLineId =
          line.sourceLineId ?? directByOffering.get(line.offeringId)
        if (!sourceLineId) {
          throw new CommerceQuoteError(
            "QUOTE_CONFLICT",
            "Every Service Quote line must resolve to its current request line.",
          )
        }
        const offering = await tx.sellableOffering.findFirst({
          select: { status: true },
          where: { id: line.offeringId, tenantId: input.tenantId },
        })
        let catalogSourceVerified = false
        if (offering?.status === CatalogRecordStatus.DRAFT) {
          await resolveCatalogSourceLinkForQuote(tx, {
            actorUserId: input.actorUserId,
            offeringId: line.offeringId,
            source: { id: input.sourceId, kind: "service" },
            sourceLineId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          })
          catalogSourceVerified = true
        }
        prepared.push({ ...line, catalogSourceVerified, sourceLineId })
      }
      return prepared
    },
    recordIssued: async (tx, input) => {
      await tx.serviceRequest.updateMany({
        data: { status: ServiceRequestStatus.QUOTED },
        where: {
          id: input.sourceId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    },
    recoverIssuanceToken: false,
    requiresInventorySnapshot: false,
    validateLines: async () => {},
  },
  prescription_request: {
    allowedOfferingKind: SellableOfferingKind.PRODUCT_UNIT,
    bindQuotedSourceToExistingQuote: false,
    load: async (tx, input) => {
      const source = await tx.prescriptionRequest.findFirst({
        select: { id: true },
        where: {
          id: input.sourceId,
          status: PrescriptionRequestStatus.READY_TO_QUOTE,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!source) {
        throw new CommerceQuoteError(
          "QUOTE_SOURCE_NOT_FOUND",
          "Released Prescription Request source not found.",
        )
      }
      return { alreadyQuoted: false }
    },
    prepareLines: async (_tx, input) => input.lines,
    recordIssued: async (tx, input) => {
      await tx.prescriptionRequest.updateMany({
        data: { status: PrescriptionRequestStatus.QUOTED },
        where: {
          id: input.sourceId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      await tx.prescriptionRequestAuditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          fromStatus: PrescriptionRequestStatus.READY_TO_QUOTE,
          requestId: input.sourceId,
          storeId: input.storeId,
          tenantId: input.tenantId,
          toStatus: PrescriptionRequestStatus.QUOTED,
          type: PrescriptionRequestAuditEventType.QUOTE_ISSUED,
        },
      })
      await tx.prescriptionUsageEvent.create({
        data: {
          deduplicationKey: `quote-issued:${input.versionId}`,
          eventType: "QUOTE_ISSUED",
          occurredAt: new Date(),
          sourceId: input.versionId,
          sourceType: "quote",
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    },
    recoverIssuanceToken: false,
    requiresInventorySnapshot: true,
    validateLines: async () => {},
  },
} satisfies Record<CommerceQuoteSourceType, QuoteSourceHandler>

async function releasePreparedCommerceQuoteVersion(
  tx: Prisma.TransactionClient,
  input: {
    acceptanceTokenDigest: string
    currentVersionId: null | string
    quoteId: string
    sourceHandler: QuoteSourceHandler
    sourceInput: QuoteSourceHandlerInput
    sourceState: QuoteSourceState
    versionId: string
  },
) {
  if (input.currentVersionId) {
    const superseded = await tx.commerceQuoteVersion.updateMany({
      data: {
        status: CommerceQuoteVersionStatusEnum.SUPERSEDED,
        supersededAt: new Date(),
      },
      where: {
        id: input.currentVersionId,
        status: { not: CommerceQuoteVersionStatusEnum.ACCEPTED },
      },
    })
    if (superseded.count !== 1) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "The current Quote Version changed before release.",
      )
    }
  }
  const released = await tx.commerceQuoteVersion.updateMany({
    data: {
      acceptanceTokenDigest: input.acceptanceTokenDigest,
      issuedAt: new Date(),
      status: CommerceQuoteVersionStatusEnum.ISSUED,
    },
    where: {
      id: input.versionId,
      quoteId: input.quoteId,
      status: CommerceQuoteVersionStatusEnum.DRAFT,
    },
  })
  if (released.count !== 1) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Prepared Quote Version changed before release.",
    )
  }
  const current = await tx.commerceQuote.updateMany({
    data: { currentVersionId: input.versionId },
    where: {
      currentVersionId: input.currentVersionId,
      id: input.quoteId,
    },
  })
  if (current.count !== 1) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Quote changed before the prepared Version could be released.",
    )
  }
  await input.sourceHandler.recordIssued(
    tx,
    { ...input.sourceInput, versionId: input.versionId },
    input.sourceState,
  )
}

export async function issueCommerceQuote(
  db: PrismaClient,
  input: IssueCommerceQuoteInput,
) {
  const source = assertCommerceQuoteSource(input)
  const quoteOptions = normalizeIssueCommerceQuoteOptions(input)
  const rawToken = token()
  const payloadHash = hash(
    input.options
      ? {
          expiresAt: input.expiresAt ?? null,
          options: quoteOptions,
          source,
          storeId: input.storeId,
        }
      : {
          availabilityOutcome: input.availabilityOutcome,
          customerNote: input.customerNote,
          discountMinor: input.discountMinor ?? 0,
          expiresAt: input.expiresAt ?? null,
          fulfilmentFeeMinor: input.fulfilmentFeeMinor ?? 0,
          fulfilmentPromise: input.fulfilmentPromise,
          fulfilmentType: input.fulfilmentType ?? "unspecified",
          lines: input.lines,
          source,
          storeId: input.storeId,
          taxMinor: input.taxMinor ?? 0,
        },
  )

  return db.$transaction(async (tx) => {
    await input.authorize?.(tx)
    const store = await tx.store.findFirst({
      select: { currencyCode: true, id: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    })
    if (!store) {
      throw new CommerceQuoteError("STORE_NOT_FOUND", "Store not found.")
    }
    const sourceHandler = quoteSourceHandlers[source.sourceType]
    const sourceInput = {
      ...input,
      lines: quoteOptions.flatMap((option) => option.lines),
      sourceId: source.sourceId,
    }
    const sourceState = await sourceHandler.load(tx, sourceInput)
    for (const option of quoteOptions) {
      await sourceHandler.validateLines(tx, {
        ...sourceInput,
        lines: option.lines,
      })
    }

    if (
      sourceState.alreadyQuoted &&
      sourceHandler.bindQuotedSourceToExistingQuote
    ) {
      const existingSourceQuote = await tx.commerceQuote.findUnique({
        select: { clientQuoteId: true },
        where: {
          tenantId_sourceType_sourceId: {
            sourceId: source.sourceId,
            sourceType: mapSourceType(source.sourceType),
            tenantId: input.tenantId,
          },
        },
      })
      assertQuotedSourceQuoteIdentity({
        alreadyQuoted: sourceState.alreadyQuoted,
        bindToExistingQuote: sourceHandler.bindQuotedSourceToExistingQuote,
        existingClientQuoteId: existingSourceQuote?.clientQuoteId ?? null,
        requestedClientQuoteId: input.clientQuoteId,
      })
    }

    const quote = await tx.commerceQuote.upsert({
      create: {
        clientQuoteId: input.clientQuoteId,
        createdByUserId: input.actorUserId,
        sourceId: source.sourceId,
        sourceType: mapSourceType(source.sourceType),
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {},
      where: {
        tenantId_clientQuoteId: {
          clientQuoteId: input.clientQuoteId,
          tenantId: input.tenantId,
        },
      },
    })
    if (
      quote.sourceId !== source.sourceId ||
      quote.sourceType !== mapSourceType(source.sourceType) ||
      quote.storeId !== input.storeId
    ) {
      throw new CommerceQuoteError(
        "IDEMPOTENCY_MISMATCH",
        "This Quote command identity belongs to another source.",
      )
    }

    const previousVersion = await tx.commerceQuoteVersion.findUnique({
      where: {
        quoteId_clientVersionId: {
          clientVersionId: input.clientVersionId,
          quoteId: quote.id,
        },
      },
    })
    if (previousVersion) {
      if (previousVersion.payloadHash !== payloadHash) {
        throw new CommerceQuoteError(
          "IDEMPOTENCY_MISMATCH",
          "This Quote version command was already used with different details.",
        )
      }
      if (sourceHandler.recoverIssuanceToken) {
        await tx.commerceQuoteReplayAccessToken.upsert({
          create: {
            storeId: input.storeId,
            tenantId: input.tenantId,
            tokenDigest: digest(rawToken),
            versionId: previousVersion.id,
          },
          update: { tokenDigest: digest(rawToken) },
          where: { versionId: previousVersion.id },
        })
        return {
          quoteId: quote.id,
          token: rawToken,
          versionId: previousVersion.id,
        }
      }
      return { quoteId: quote.id, token: null, versionId: previousVersion.id }
    }

    const current = quote.currentVersionId
      ? await tx.commerceQuoteVersion.findUnique({
          where: { id: quote.currentVersionId },
        })
      : null
    if (current?.status === CommerceQuoteVersionStatusEnum.ACCEPTED) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "An accepted Quote cannot be revised.",
      )
    }

    const preparedOptions = []
    for (const option of quoteOptions) {
      const lines = await sourceHandler.prepareLines(tx, {
        ...sourceInput,
        lines: option.lines,
      })
      if (lines.length < 1 || lines.length > 100) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "An Offer Option requires between one and 100 lines.",
        )
      }
      preparedOptions.push({ ...option, lines })
    }
    const mappedOfferingIds = preparedOptions.flatMap((option) =>
      option.lines.flatMap((line) =>
        line.offeringId ? [line.offeringId] : [],
      ),
    )
    const offerings = await tx.sellableOffering.findMany({
      include: {
        catalogItem: true,
        productUnitOffering: true,
        serviceOffering: true,
        storeAvailability: { where: { storeId: input.storeId } },
        variant: {
          include: {
            selections: { include: { group: true, value: true } },
          },
        },
      },
      where: {
        id: { in: mappedOfferingIds },
        status: {
          in: [CatalogRecordStatus.ACTIVE, CatalogRecordStatus.DRAFT],
        },
        tenantId: input.tenantId,
      },
    })
    if (offerings.length !== new Set(mappedOfferingIds).size) {
      throw new CommerceQuoteError(
        "OFFERING_UNAVAILABLE",
        "Quote contains an unavailable Offering.",
      )
    }
    const byId = new Map(offerings.map((offering) => [offering.id, offering]))
    const resolvedOptions = preparedOptions.map((option) => {
      let subtotalMinor = 0
      const lines = option.lines.map((line) => {
        const payable =
          line.outcome === "included" || line.outcome === "alternative"
        const offering = line.offeringId ? byId.get(line.offeringId) : undefined
        if (payable && !offering) {
          throw new CommerceQuoteError(
            "OFFERING_UNAVAILABLE",
            "Included Quote lines require an active Offering.",
          )
        }
        const usesManualAttestation =
          line.availabilityAttestationType ===
          CatalogAvailabilityAttestationType.MANUAL_PROCURE_TO_ORDER
        if (
          offering?.status === CatalogRecordStatus.DRAFT &&
          !usesManualAttestation &&
          !line.catalogSourceVerified
        ) {
          throw new CommerceQuoteError(
            "OFFERING_UNAVAILABLE",
            "Private draft Offerings require a current verified source link.",
          )
        }
        if (
          offering &&
          quoteLineRequiresStoreAvailability({
            catalogSourceVerified: line.catalogSourceVerified,
            kind: offering.kind,
            status: offering.status,
            usesManualAttestation,
          }) &&
          !offering.storeAvailability[0]?.isAvailable
        ) {
          throw new CommerceQuoteError(
            "OFFERING_UNAVAILABLE",
            "Quote contains a Store-unavailable Offering.",
          )
        }
        if (offering && offering.kind !== sourceHandler.allowedOfferingKind) {
          throw new CommerceQuoteError(
            "OFFERING_UNAVAILABLE",
            "Quote line Offering kind does not match its source.",
          )
        }
        if (
          sourceHandler.requiresInventorySnapshot &&
          payable &&
          !usesManualAttestation &&
          (!line.configurationVersionId || line.balanceRevision === undefined)
        ) {
          throw new CommerceQuoteError(
            "QUOTE_CONFLICT",
            "Product Quote lines require inventory revision snapshots.",
          )
        }

        let quantity: string | null = null
        let unitPriceMinor: number | null = null
        let totalMinor = 0
        if (payable) {
          if (
            line.unitPriceMinor === undefined ||
            !Number.isSafeInteger(line.unitPriceMinor) ||
            line.unitPriceMinor < 0 ||
            !line.quantity
          ) {
            throw new CommerceQuoteError(
              "QUOTE_CONFLICT",
              "Included Quote lines require a valid quantity and unit price.",
            )
          }
          const maxScale = offering?.serviceOffering?.quantityScale ?? 6
          quantity = parseExactDecimal(line.quantity, {
            allowZero: false,
            maxScale,
          })
          unitPriceMinor = line.unitPriceMinor
          totalMinor = lineTotal(unitPriceMinor, quantity)
          subtotalMinor += totalMinor
        }

        return {
          availabilityAttestationId: line.availabilityAttestationId ?? null,
          balanceRevision: line.balanceRevision ?? null,
          catalogItemName:
            offering?.catalogItem.name ??
            line.catalogItemName?.trim() ??
            "Item",
          customerNote: line.customerNote?.trim() || null,
          configurationVersionId: line.configurationVersionId ?? null,
          offeringId: offering?.id ?? null,
          offeringName:
            offering?.name ?? line.offeringName?.trim() ?? "Unavailable",
          optionSelections: json(
            offering
              ? offering.variant.selections.map((selection) => ({
                  group: selection.group.name,
                  value: selection.value.label,
                }))
              : (line.optionSelections ?? []),
          ),
          outcome: mapLineOutcome(line.outcome),
          quantity,
          sourceLineId: line.sourceLineId?.trim() || null,
          totalMinor,
          unitPriceMinor,
          variantName: offering?.variant.name ?? line.variantName?.trim() ?? "",
        }
      })

      const payableCount = option.lines.filter(
        (line) => line.outcome === "included" || line.outcome === "alternative",
      ).length
      if (
        (option.availabilityOutcome === "unavailable" && payableCount !== 0) ||
        (option.availabilityOutcome === "full" &&
          payableCount !== option.lines.length) ||
        (option.availabilityOutcome === "partial" &&
          (payableCount === 0 || payableCount === option.lines.length))
      ) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Offer Option availability does not match its lines.",
        )
      }

      const discountMinor = option.discountMinor ?? 0
      const taxMinor = option.taxMinor ?? 0
      const fulfilmentFeeMinor = option.fulfilmentFeeMinor ?? 0
      for (const [label, amount] of [
        ["discount", discountMinor],
        ["tax", taxMinor],
        ["fulfilment fee", fulfilmentFeeMinor],
      ] as const) {
        if (!Number.isSafeInteger(amount) || amount < 0) {
          throw new CommerceQuoteError(
            "QUOTE_CONFLICT",
            `Offer Option ${label} is invalid.`,
          )
        }
      }
      const totalMinor =
        subtotalMinor - discountMinor + taxMinor + fulfilmentFeeMinor
      if (totalMinor < 0) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Offer Option total cannot be negative.",
        )
      }
      return {
        ...option,
        discountMinor,
        fulfilmentFeeMinor,
        lines,
        subtotalMinor,
        taxMinor,
        totalMinor,
      }
    })

    const compatibilityOption =
      resolvedOptions.length === 1 ? resolvedOptions[0] : null
    const commonAvailability = resolvedOptions.every(
      (option) =>
        option.availabilityOutcome === resolvedOptions[0]?.availabilityOutcome,
    )
      ? resolvedOptions[0]?.availabilityOutcome
      : "partial"
    const commonFulfilment = resolvedOptions.every(
      (option) =>
        (option.fulfilmentType ?? "unspecified") ===
        (resolvedOptions[0]?.fulfilmentType ?? "unspecified"),
    )
      ? (resolvedOptions[0]?.fulfilmentType ?? "unspecified")
      : "unspecified"

    const last = await tx.commerceQuoteVersion.aggregate({
      _max: { version: true },
      where: { quoteId: quote.id },
    })
    const version = await tx.commerceQuoteVersion.create({
      data: {
        acceptanceTokenDigest: null,
        availabilityOutcome: mapAvailabilityOutcome(
          compatibilityOption?.availabilityOutcome ??
            commonAvailability ??
            "unavailable",
        ),
        clientVersionId: input.clientVersionId,
        createdByUserId: input.actorUserId,
        currencyCode: store.currencyCode,
        customerNote:
          compatibilityOption?.customerNote?.trim() ||
          input.customerNote?.trim() ||
          null,
        discountMinor: compatibilityOption?.discountMinor ?? 0,
        expiresAt: input.expiresAt,
        fulfilmentFeeMinor: compatibilityOption?.fulfilmentFeeMinor ?? 0,
        fulfilmentPromise:
          compatibilityOption?.fulfilmentPromise?.trim() || null,
        fulfilmentType: mapFulfilmentType(
          compatibilityOption?.fulfilmentType ?? commonFulfilment,
        ),
        issuedAt: null,
        payloadHash,
        quoteId: quote.id,
        status: CommerceQuoteVersionStatusEnum.DRAFT,
        subtotalMinor: compatibilityOption?.subtotalMinor ?? 0,
        taxMinor: compatibilityOption?.taxMinor ?? 0,
        totalMinor: compatibilityOption?.totalMinor ?? 0,
        version: (last._max.version ?? 0) + 1,
      },
    })
    for (const option of resolvedOptions) {
      const persistedOption = await tx.commerceQuoteOption.create({
        data: {
          availabilityOutcome: mapAvailabilityOutcome(
            option.availabilityOutcome,
          ),
          clientOptionId: option.clientOptionId,
          currencyCode: store.currencyCode,
          customerNote: option.customerNote?.trim() || null,
          discountMinor: option.discountMinor,
          fulfilmentFeeMinor: option.fulfilmentFeeMinor,
          fulfilmentPromise: option.fulfilmentPromise?.trim() || null,
          fulfilmentType: mapFulfilmentType(
            option.fulfilmentType ?? "unspecified",
          ),
          label: option.label,
          position: option.position,
          quoteVersionId: version.id,
          subtotalMinor: option.subtotalMinor,
          taxMinor: option.taxMinor,
          totalMinor: option.totalMinor,
        },
      })
      await tx.commerceQuoteLine.createMany({
        data: option.lines.map((line) => ({
          ...line,
          quoteOptionId: persistedOption.id,
          quoteVersionId: version.id,
        })),
      })
    }
    await releasePreparedCommerceQuoteVersion(tx, {
      acceptanceTokenDigest: digest(rawToken),
      currentVersionId: current?.id ?? null,
      quoteId: quote.id,
      sourceHandler,
      sourceInput,
      sourceState,
      versionId: version.id,
    })

    return { quoteId: quote.id, token: rawToken, versionId: version.id }
  })
}

export async function getPublicCommerceQuote(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    authorize?: (
      tx: Prisma.TransactionClient,
      quote: {
        sourceId: string
        sourceType: CommerceQuoteSourceTypeEnum
        storeId: string
        tenantId: string
      },
    ) => Promise<void>
  },
) {
  return db.$transaction(async (tx) => {
    const access = await resolveCommerceQuoteAccess(tx, input)
    const version = await tx.commerceQuoteVersion.findFirst({
      include: {
        lines: true,
        optionSelection: true,
        options: {
          include: { lines: true },
          orderBy: { position: "asc" },
        },
        quote: {
          include: {
            store: {
              select: { name: true, supportEmail: true, supportPhone: true },
            },
          },
        },
      },
      where: quoteAccessWhere(access),
    })
    if (
      !version ||
      version.quote.currentVersionId !== version.id ||
      (version.status !== CommerceQuoteVersionStatusEnum.ISSUED &&
        version.status !== CommerceQuoteVersionStatusEnum.ACCEPTED) ||
      (version.expiresAt && version.expiresAt <= new Date())
    ) {
      throw new CommerceQuoteError(
        "PUBLIC_TOKEN_INVALID",
        "Quote is unavailable.",
      )
    }
    await input.authorize?.(tx, version.quote)
    const payableState = resolveCommerceQuotePayableState(version)
    const publicLine = (line: (typeof version.lines)[number]) => ({
      catalogItemName: line.catalogItemName,
      customerNote: line.customerNote,
      offeringName: line.offeringName,
      outcome: serializeLineOutcome(line.outcome),
      quantity: line.quantity?.toString() ?? null,
      totalMinor: line.totalMinor,
      unitPriceMinor: line.unitPriceMinor,
      variantName: line.variantName,
    })
    const options =
      version.options.length > 0
        ? version.options.map((option) => ({
            availabilityOutcome: option.availabilityOutcome.toLowerCase(),
            currencyCode: option.currencyCode,
            customerNote: option.customerNote,
            discountMinor: option.discountMinor,
            fulfilmentFeeMinor: option.fulfilmentFeeMinor,
            fulfilmentPromise: option.fulfilmentPromise,
            fulfilmentType: option.fulfilmentType.toLowerCase(),
            id: option.id,
            label: option.label,
            lines: option.lines
              .filter(
                (line) =>
                  line.outcome === CommerceQuoteLineOutcome.INCLUDED ||
                  line.outcome === CommerceQuoteLineOutcome.ALTERNATIVE,
              )
              .map(publicLine),
            position: option.position,
            subtotalMinor: option.subtotalMinor,
            taxMinor: option.taxMinor,
            totalMinor: option.totalMinor,
          }))
        : [
            {
              availabilityOutcome: version.availabilityOutcome.toLowerCase(),
              currencyCode: version.currencyCode,
              customerNote: version.customerNote,
              discountMinor: version.discountMinor,
              fulfilmentFeeMinor: version.fulfilmentFeeMinor,
              fulfilmentPromise: version.fulfilmentPromise,
              fulfilmentType: version.fulfilmentType.toLowerCase(),
              id: version.id,
              label: "Quote",
              lines: version.lines
                .filter(
                  (line) =>
                    line.outcome === CommerceQuoteLineOutcome.INCLUDED ||
                    line.outcome === CommerceQuoteLineOutcome.ALTERNATIVE,
                )
                .map(publicLine),
              position: 0,
              subtotalMinor: version.subtotalMinor,
              taxMinor: version.taxMinor,
              totalMinor: version.totalMinor,
            },
          ]
    const payable = payableState.payable
    return {
      accepted: version.status === CommerceQuoteVersionStatusEnum.ACCEPTED,
      availabilityOutcome:
        payable?.availabilityOutcome.toLowerCase() ??
        version.availabilityOutcome.toLowerCase(),
      currencyCode: version.currencyCode,
      customerNote: payable?.customerNote ?? version.customerNote,
      discountMinor: payable?.discountMinor ?? 0,
      expiresAt: version.expiresAt,
      fulfilmentFeeMinor: payable?.fulfilmentFeeMinor ?? 0,
      fulfilmentPromise: payable?.fulfilmentPromise ?? null,
      fulfilmentType: payable?.fulfilmentType.toLowerCase() ?? "unspecified",
      lines: payable?.lines.map(publicLine) ?? [],
      options,
      payable: payable !== null,
      requiresSelection: payableState.requiresSelection,
      selectedOptionId: version.optionSelection?.optionId ?? null,
      sourceType: version.quote.sourceType.toLowerCase(),
      storeName: version.quote.store.name,
      storeSupportEmail: version.quote.store.supportEmail,
      storeSupportPhone: version.quote.store.supportPhone,
      subtotalMinor: payable?.subtotalMinor ?? 0,
      taxMinor: payable?.taxMinor ?? 0,
      totalMinor: payable?.totalMinor ?? 0,
      version: version.version,
    }
  })
}

async function assertSelectedOptionAvailability(
  tx: PrismaClient | Prisma.TransactionClient,
  input: {
    lines: Array<{
      availabilityAttestationId: null | string
      balanceRevision: null | number
      configurationVersionId: null | string
      offeringId: null | string
      quantity: null | Prisma.Decimal
    }>
    storeId: string
    tenantId: string
  },
) {
  for (const line of input.lines) {
    if (!line.offeringId || !line.quantity) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Selected Offer Option contains an incomplete payable line.",
      )
    }
    const offering = await tx.sellableOffering.findFirst({
      select: {
        kind: true,
        status: true,
        storeAvailability: {
          select: { isAvailable: true },
          where: { storeId: input.storeId },
        },
      },
      where: {
        id: line.offeringId,
        status: {
          in: [CatalogRecordStatus.ACTIVE, CatalogRecordStatus.DRAFT],
        },
        tenantId: input.tenantId,
      },
    })
    if (
      !offering ||
      (offering.status === CatalogRecordStatus.ACTIVE &&
        !offering.storeAvailability[0]?.isAvailable)
    ) {
      throw new CommerceQuoteError(
        "OFFERING_UNAVAILABLE",
        "Selected Offer Option contains a Store-unavailable Offering.",
      )
    }
    if (line.availabilityAttestationId) {
      const attestation = await tx.catalogAvailabilityAttestation.findFirst({
        where: {
          id: line.availabilityAttestationId,
          offeringId: line.offeringId,
          storeId: input.storeId,
          supersededAt: null,
          tenantId: input.tenantId,
        },
      })
      if (
        !attestation ||
        attestation.type === CatalogAvailabilityAttestationType.UNAVAILABLE ||
        (attestation.expiresAt && attestation.expiresAt <= new Date()) ||
        !attestation.quantity ||
        compareExactDecimals(
          attestation.quantity.toString(),
          line.quantity.toString(),
        ) < 0
      ) {
        throw new CommerceQuoteError(
          "OFFERING_UNAVAILABLE",
          "Selected Offer Option availability is stale or unavailable.",
        )
      }
      if (
        attestation.type === CatalogAvailabilityAttestationType.TRACKED_IN_STOCK
      ) {
        const current = await getCatalogOfferingAvailability(tx, {
          offeringId: line.offeringId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        if (
          current.configurationVersionId !== line.configurationVersionId ||
          current.revision !== line.balanceRevision
        ) {
          throw new CommerceQuoteError(
            "OFFERING_UNAVAILABLE",
            "Selected Offer Option inventory changed after Quote issuance.",
          )
        }
      }
      continue
    }
    if (line.configurationVersionId && line.balanceRevision !== null) {
      const current = await getCatalogOfferingAvailability(tx, {
        offeringId: line.offeringId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      if (
        current.configurationVersionId !== line.configurationVersionId ||
        current.revision !== line.balanceRevision
      ) {
        throw new CommerceQuoteError(
          "OFFERING_UNAVAILABLE",
          "Selected Offer Option inventory changed after Quote issuance.",
        )
      }
    }
    if (
      offering.kind === SellableOfferingKind.PRODUCT_UNIT &&
      (!line.configurationVersionId || line.balanceRevision === null)
    ) {
      throw new CommerceQuoteError(
        "OFFERING_UNAVAILABLE",
        "Selected Product Option no longer has a current inventory commitment.",
      )
    }
  }
}

export async function selectCommerceQuoteOption(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    authorize?: (
      tx: Prisma.TransactionClient,
      quote: {
        sourceId: string
        sourceType: CommerceQuoteSourceTypeEnum
        storeId: string
        tenantId: string
      },
    ) => Promise<void>
    clientSelectionId: string
    optionId: string
  },
) {
  const clientSelectionId = input.clientSelectionId.trim()
  const optionId = input.optionId.trim()
  if (
    clientSelectionId.length === 0 ||
    clientSelectionId.length > 191 ||
    optionId.length === 0 ||
    optionId.length > 191
  ) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Offer Option selection identity is invalid.",
    )
  }
  const select = async (tx: Prisma.TransactionClient) => {
    const access = await resolveCommerceQuoteAccess(tx, input)
    const version = await tx.commerceQuoteVersion.findFirst({
      include: {
        optionSelection: true,
        options: { include: { lines: true } },
        quote: true,
      },
      where: quoteAccessWhere(access),
    })
    if (!version) {
      throw new CommerceQuoteError(
        "PUBLIC_TOKEN_INVALID",
        "Quote is unavailable.",
      )
    }
    try {
      assertQuoteVersionAcceptable({
        currentVersionId: version.quote.currentVersionId,
        expiresAt: version.expiresAt,
        status: version.status.toLowerCase() as CommerceQuoteVersionStatus,
        versionId: version.id,
      })
    } catch {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Only the current unexpired Quote Version can be selected.",
      )
    }
    await input.authorize?.(tx, version.quote)
    if (version.options.length < 2) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "This Quote does not require an Offer Option selection.",
      )
    }
    const option = version.options.find((item) => item.id === optionId)
    if (!option || option.quoteVersionId !== version.id) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Offer Option is stale or does not belong to this Quote Version.",
      )
    }
    const payloadHash = hash({
      clientSelectionId,
      optionId,
      versionId: version.id,
    })
    if (version.optionSelection) {
      if (
        version.optionSelection.clientSelectionId !== clientSelectionId ||
        version.optionSelection.optionId !== optionId ||
        version.optionSelection.payloadHash !== payloadHash
      ) {
        throw new CommerceQuoteError(
          "IDEMPOTENCY_MISMATCH",
          "This Quote Version already has another Offer Option selection.",
        )
      }
      return { optionId, versionId: version.id }
    }
    if (
      option.availabilityOutcome ===
      CommerceQuoteAvailabilityOutcome.UNAVAILABLE
    ) {
      throw new CommerceQuoteError(
        "OFFERING_UNAVAILABLE",
        "Unavailable Offer Options cannot be selected.",
      )
    }
    await assertSelectedOptionAvailability(tx, {
      lines: option.lines,
      storeId: version.quote.storeId,
      tenantId: version.quote.tenantId,
    })
    await tx.commerceQuoteOptionSelection.create({
      data: {
        clientSelectionId,
        optionId: option.id,
        payloadHash,
        quoteVersionId: version.id,
      },
    })
    return { optionId: option.id, versionId: version.id }
  }

  try {
    return await db.$transaction(select)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.$transaction(select)
    }
    throw error
  }
}

export async function getCommerceQuoteAcceptanceContext(
  tx: PrismaClient | Prisma.TransactionClient,
  input: { acceptanceToken: string; clientAcceptanceId: string },
) {
  const access = await resolveCommerceQuoteAccess(tx, input)
  const version = await tx.commerceQuoteVersion.findFirst({
    include: {
      lines: true,
      optionSelection: true,
      options: { include: { lines: true }, orderBy: { position: "asc" } },
      quote: true,
    },
    where: quoteAccessWhere(access),
  })
  if (!version) {
    throw new CommerceQuoteError(
      "PUBLIC_TOKEN_INVALID",
      "Quote is unavailable.",
    )
  }
  const payableState = resolveCommerceQuotePayableState(version)
  if (version.status === CommerceQuoteVersionStatusEnum.ACCEPTED) {
    if (version.acceptanceClientId !== input.clientAcceptanceId) {
      throw new CommerceQuoteError(
        "IDEMPOTENCY_MISMATCH",
        "Quote was already accepted with another command identity.",
      )
    }
    return {
      payable: payableState.payable,
      replayOrderId: version.acceptedOrderId,
      version,
    }
  }
  try {
    assertQuoteVersionAcceptable({
      currentVersionId: version.quote.currentVersionId,
      expiresAt: version.expiresAt,
      status: version.status.toLowerCase() as CommerceQuoteVersionStatus,
      versionId: version.id,
    })
  } catch {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Only the current unexpired Quote Version can be accepted.",
    )
  }
  if (payableState.requiresSelection) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Choose one current Offer Option before accepting this Quote.",
    )
  }
  if (
    !payableState.payable ||
    payableState.payable.availabilityOutcome ===
      CommerceQuoteAvailabilityOutcome.UNAVAILABLE
  ) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "An unavailable Quote cannot be accepted.",
    )
  }
  await assertSelectedOptionAvailability(tx, {
    lines: payableState.payable.lines,
    storeId: version.quote.storeId,
    tenantId: version.quote.tenantId,
  })
  return { payable: payableState.payable, replayOrderId: null, version }
}

type CommerceQuoteAccess = {
  storeId?: string
  tenantId?: string
  versionId: string
}

function quoteAccessWhere(
  access: CommerceQuoteAccess,
): Prisma.CommerceQuoteVersionWhereInput {
  return {
    id: access.versionId,
    ...(access.storeId && access.tenantId
      ? {
          quote: {
            is: { storeId: access.storeId, tenantId: access.tenantId },
          },
        }
      : {}),
  }
}

export async function resolveCommerceQuoteAccess(
  db: PrismaClient | Prisma.TransactionClient,
  input: { acceptanceToken: string },
): Promise<CommerceQuoteAccess> {
  const tokenDigest = digest(input.acceptanceToken)
  const version = await db.commerceQuoteVersion.findFirst({
    select: { id: true },
    where: { acceptanceTokenDigest: tokenDigest },
  })
  if (version) return { versionId: version.id }

  const replayAccess = await db.commerceQuoteReplayAccessToken.findFirst({
    select: { storeId: true, tenantId: true, versionId: true },
    where: { tokenDigest },
  })
  if (replayAccess) return replayAccess

  const action = await db.prescriptionQuickAction.findFirst({
    select: { entityId: true, storeId: true, tenantId: true },
    where: {
      entityType: "quote_version",
      expiresAt: { gt: new Date() },
      tokenDigest,
    },
  })
  if (!action) {
    throw new CommerceQuoteError(
      "PUBLIC_TOKEN_INVALID",
      "Quote is unavailable.",
    )
  }
  return {
    storeId: action.storeId,
    tenantId: action.tenantId,
    versionId: action.entityId,
  }
}

export async function recordCommerceQuoteAcceptance(
  tx: Prisma.TransactionClient,
  input: {
    clientAcceptanceId: string
    orderId: string
    versionId: string
  },
) {
  return tx.commerceQuoteVersion.update({
    data: {
      acceptanceClientId: input.clientAcceptanceId,
      acceptedAt: new Date(),
      acceptedOrderId: input.orderId,
      status: CommerceQuoteVersionStatusEnum.ACCEPTED,
    },
    where: { id: input.versionId },
  })
}
