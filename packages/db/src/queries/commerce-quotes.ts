import { createHash, randomBytes } from "node:crypto"

import {
  type ServiceCommerceAction,
  deriveServiceCommerceQuoteReleaseActions,
} from "@ewatrade/service-commerce"
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
  ServiceCommerceQuoteApprovalAuditEventType,
  ServiceCommerceQuoteApprovalStatus,
  ServiceRequestStatus,
} from "../../generated/prisma/enums"
import { getCatalogOfferingAvailability } from "./catalog-inventory"
import { revalidateCustomerActionCapabilityInTransaction } from "./service-commerce-actions/projection"
import {
  customerActionTypes,
  customerActionValues,
} from "./service-commerce-actions/shared"
import {
  resolveCatalogAvailabilityAttestationForQuote,
  resolveCatalogSourceLinkForQuote,
} from "./service-commerce-catalog"
import { getServiceCommerceCatalogPriceSuggestionSnapshots } from "./service-commerce-catalog-pricing"
import {
  ServiceCommercePolicyError,
  assertServiceCommercePolicyAllowedInTransaction,
} from "./service-commerce-policy"
import {
  ServiceCommerceQuoteReleaseError,
  resolveQuoteReleaseRuntimeFacts,
  supersedeServiceCommerceQuoteApprovalInTransaction,
} from "./service-commerce-quote-release"
import { materializePrescriptionQuoteReadyEffectsInTransaction } from "./whatsapp-connections"

const COMMERCE_QUOTE_READ_CUSTOMER_ACTIONS = [
  "view_quote",
  "choose_quote_option",
  "pay_now",
  "pick_up",
  "delivery",
] as const satisfies readonly ServiceCommerceAction[]

const COMMERCE_QUOTE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

async function runCommerceQuoteDecisionTransaction<T>(
  db: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await db.$transaction(callback, COMMERCE_QUOTE_TRANSACTION_OPTIONS)
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      if (retryable && attempt === 0) continue
      if (retryable) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Quotation release facts changed before this decision completed.",
        )
      }
      throw error
    }
  }
  throw new CommerceQuoteError(
    "QUOTE_CONFLICT",
    "Quotation release facts changed before this decision completed.",
  )
}

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
  | "QUOTE_RELEASE_FORBIDDEN"
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
  totalMinor?: number
}

type QuoteOptionFacts<
  TLine extends QuoteOptionLine,
  TId extends null | string = string,
> = {
  availabilityOutcome: CommerceQuoteAvailabilityOutcome | string
  customerNote?: null | string
  discountMinor: number
  fulfilmentFeeMinor: number
  fulfilmentPromise?: null | string
  fulfilmentType: CommerceQuoteFulfilmentType | string
  id: TId
  lines: TLine[]
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
}

function resolvePayableOption<
  TLine extends QuoteOptionLine,
  TId extends null | string,
>(option: QuoteOptionFacts<TLine, TId>) {
  const lines = option.lines.filter(
    (line) => line.outcome === CommerceQuoteLineOutcome.INCLUDED,
  )
  if (lines.length === 0) return null

  const hasLegacyAlternatives = option.lines.some(
    (line) => line.outcome === CommerceQuoteLineOutcome.ALTERNATIVE,
  )
  if (!hasLegacyAlternatives) return { ...option, lines }

  const subtotalMinor = lines.reduce((sum, line) => {
    if (
      line.totalMinor === undefined ||
      !Number.isSafeInteger(line.totalMinor) ||
      line.totalMinor < 0
    ) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Legacy Quote alternatives cannot be reconciled safely.",
      )
    }
    return sum + line.totalMinor
  }, 0)
  const totalMinor =
    subtotalMinor -
    option.discountMinor +
    option.taxMinor +
    option.fulfilmentFeeMinor
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "Legacy Quote alternatives cannot be reconciled safely.",
    )
  }
  return {
    ...option,
    availabilityOutcome: CommerceQuoteAvailabilityOutcome.PARTIAL,
    lines,
    subtotalMinor,
    totalMinor,
  }
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
      payable: resolvePayableOption({
        availabilityOutcome: version.availabilityOutcome,
        customerNote: version.customerNote,
        discountMinor: version.discountMinor,
        fulfilmentFeeMinor: version.fulfilmentFeeMinor,
        fulfilmentPromise: version.fulfilmentPromise,
        fulfilmentType: version.fulfilmentType,
        id: null,
        lines: version.lines ?? [],
        subtotalMinor: version.subtotalMinor,
        taxMinor: version.taxMinor,
        totalMinor: version.totalMinor,
      }),
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
  const payable = payableOption ? resolvePayableOption(payableOption) : null
  return {
    payable,
    requiresSelection: options.length > 1 && selectedOptionId === null,
  }
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
  protectActionId?: (actionId: string) => string
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

type QuoteReleaseEffects = {
  communicationIntentId: null | string
}

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
    input: QuoteSourceHandlerInput & {
      actionExpiresAt: Date
      protectActionId?: (actionId: string) => string
      versionId: string
    },
    state: QuoteSourceState,
  ) => Promise<QuoteReleaseEffects>
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
      if (state.alreadyQuoted) return { communicationIntentId: null }
      if (
        (
          await tx.commerceInquiry.updateMany({
            data: {
              revision: { increment: 1 },
              status: CommerceInquiryStatus.QUOTED,
            },
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
      return { communicationIntentId: null }
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
          status: {
            in: [
              ServiceRequestStatus.SUBMITTED,
              ServiceRequestStatus.NEEDS_INFORMATION,
              ServiceRequestStatus.QUOTED,
            ],
          },
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
    recordIssued: async (tx, input, state) => {
      if (state.alreadyQuoted) return { communicationIntentId: null }
      const updated = await tx.serviceRequest.updateMany({
        data: {
          revision: { increment: 1 },
          status: ServiceRequestStatus.QUOTED,
        },
        where: {
          id: input.sourceId,
          status: {
            in: [
              ServiceRequestStatus.SUBMITTED,
              ServiceRequestStatus.NEEDS_INFORMATION,
            ],
          },
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      if (updated.count !== 1) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Service Request changed before Quote release.",
        )
      }
      return { communicationIntentId: null }
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
      if (!input.protectActionId) return { communicationIntentId: null }
      return materializePrescriptionQuoteReadyEffectsInTransaction(tx, {
        expiresAt: input.actionExpiresAt,
        protectActionId: input.protectActionId,
        requestId: input.sourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        versionId: input.versionId,
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
    actorMembershipId: string
    currentVersionId: null | string
    quoteId: string
    sourceHandler: QuoteSourceHandler
    sourceInput: QuoteSourceHandlerInput
    sourceState: QuoteSourceState
    actionExpiresAt: Date
    protectActionId?: (actionId: string) => string
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
    const pendingApproval = await tx.serviceCommerceQuoteApproval.findFirst({
      select: { id: true, policyRevision: true },
      where: {
        quoteVersionId: input.currentVersionId,
        status: ServiceCommerceQuoteApprovalStatus.PENDING,
      },
    })
    if (pendingApproval) {
      await tx.serviceCommerceQuoteApproval.update({
        data: {
          status: ServiceCommerceQuoteApprovalStatus.SUPERSEDED,
          supersededAt: new Date(),
        },
        where: { id: pendingApproval.id },
      })
      await tx.serviceCommerceQuoteApprovalAuditEvent.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          approvalId: pendingApproval.id,
          approvalStatus: ServiceCommerceQuoteApprovalStatus.SUPERSEDED,
          policyRevision: pendingApproval.policyRevision,
          reason: "Superseded by a new immutable Quote Version.",
          storeId: input.sourceInput.storeId,
          tenantId: input.sourceInput.tenantId,
          type: ServiceCommerceQuoteApprovalAuditEventType.SUPERSEDED,
        },
      })
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
  return input.sourceHandler.recordIssued(
    tx,
    {
      ...input.sourceInput,
      actionExpiresAt: input.actionExpiresAt,
      protectActionId: input.protectActionId,
      versionId: input.versionId,
    },
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

  return runCommerceQuoteDecisionTransaction(db, async (tx) => {
    await input.authorize?.(tx)
    let releaseRuntime: Awaited<
      ReturnType<typeof resolveQuoteReleaseRuntimeFacts>
    >
    try {
      releaseRuntime = await resolveQuoteReleaseRuntimeFacts(tx, {
        actorUserId: input.actorUserId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    } catch (error) {
      if (error instanceof ServiceCommerceQuoteReleaseError) {
        throw new CommerceQuoteError("QUOTE_RELEASE_FORBIDDEN", error.message)
      }
      throw error
    }
    if (!releaseRuntime.actor.attendantActive) {
      throw new CommerceQuoteError(
        "QUOTE_RELEASE_FORBIDDEN",
        "An active Store attendant assignment is required to prepare a Quote.",
      )
    }
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
      include: { quoteApproval: true },
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
      if (previousVersion.status === CommerceQuoteVersionStatusEnum.DRAFT) {
        return {
          quoteId: quote.id,
          releaseState:
            previousVersion.quoteApproval?.status ===
            ServiceCommerceQuoteApprovalStatus.REJECTED
              ? ("rejected" as const)
              : ("pending_approval" as const),
          token: null,
          versionId: previousVersion.id,
        }
      }
      const releaseEffects =
        source.sourceType === "prescription_request" &&
        previousVersion.status === CommerceQuoteVersionStatusEnum.ISSUED &&
        input.protectActionId
          ? await materializePrescriptionQuoteReadyEffectsInTransaction(tx, {
              expiresAt:
                previousVersion.expiresAt ??
                new Date(Date.now() + 24 * 60 * 60_000),
              protectActionId: input.protectActionId,
              requestId: source.sourceId,
              storeId: input.storeId,
              tenantId: input.tenantId,
              versionId: previousVersion.id,
            })
          : { communicationIntentId: null }
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
          communicationIntentId: releaseEffects.communicationIntentId,
          quoteId: quote.id,
          releaseState: "released" as const,
          token: rawToken,
          versionId: previousVersion.id,
        }
      }
      return {
        communicationIntentId: releaseEffects.communicationIntentId,
        quoteId: quote.id,
        releaseState: "released" as const,
        token: null,
        versionId: previousVersion.id,
      }
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
    const priceSuggestionSnapshots = new Map(
      (
        await getServiceCommerceCatalogPriceSuggestionSnapshots(tx, {
          currencyCode: store.currencyCode,
          includeTenantHistory: false,
          offeringIds: mappedOfferingIds,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      ).map((snapshot) => [snapshot.offeringId, snapshot.suggestion]),
    )
    const catalogPriceEvaluatedAt = new Date()
    const resolvedOptions = preparedOptions.map((option) => {
      let subtotalMinor = 0
      const lines = option.lines.map((line) => {
        const payable = line.outcome === "included"
        const priced = payable || line.outcome === "alternative"
        const offering = line.offeringId ? byId.get(line.offeringId) : undefined
        if (priced && !offering) {
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
        if (priced) {
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
          if (payable) subtotalMinor += totalMinor
        }
        const suggestion = offering
          ? priceSuggestionSnapshots.get(offering.id)
          : undefined
        const suggestedUnitPriceMinor = suggestion?.priceMinor ?? null

        return {
          availabilityAttestationId: line.availabilityAttestationId ?? null,
          balanceRevision: line.balanceRevision ?? null,
          catalogPriceOverride:
            payable &&
            unitPriceMinor !== null &&
            suggestedUnitPriceMinor !== null &&
            unitPriceMinor !== suggestedUnitPriceMinor,
          catalogPriceEvaluationAt: offering ? catalogPriceEvaluatedAt : null,
          catalogPriceSuggestionEffectiveAt: suggestion?.effectiveAt ?? null,
          catalogPriceSuggestionScope:
            suggestion?.priceMinor === null
              ? null
              : (suggestion?.scope ?? null),
          catalogPriceSuggestionSource:
            suggestion?.priceMinor === null
              ? null
              : (suggestion?.source ?? null),
          catalogSuggestedUnitPriceMinor: suggestedUnitPriceMinor,
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
        (line) => line.outcome === "included",
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
    if (releaseRuntime.policy.mode === "approval_required") {
      const eligibleApprovers =
        releaseRuntime.activeApproverMembershipIds.filter(
          (membershipId) =>
            releaseRuntime.policy.selectedApproverMembershipIds.includes(
              membershipId,
            ) && membershipId !== releaseRuntime.actor.membershipId,
        )
      if (eligibleApprovers.length === 0) {
        throw new CommerceQuoteError(
          "QUOTE_RELEASE_FORBIDDEN",
          "Approval-required release needs another active selected approver.",
        )
      }
      if (current) {
        const superseded = await tx.commerceQuoteVersion.updateMany({
          data: {
            status: CommerceQuoteVersionStatusEnum.SUPERSEDED,
            supersededAt: new Date(),
          },
          where: {
            id: current.id,
            status: { not: CommerceQuoteVersionStatusEnum.ACCEPTED },
          },
        })
        if (superseded.count !== 1) {
          throw new CommerceQuoteError(
            "QUOTE_CONFLICT",
            "The current Quote Version changed before approval preparation.",
          )
        }
        const pending = await tx.serviceCommerceQuoteApproval.findFirst({
          where: {
            quoteVersionId: current.id,
            status: ServiceCommerceQuoteApprovalStatus.PENDING,
          },
        })
        if (pending) {
          await tx.serviceCommerceQuoteApproval.update({
            data: {
              status: ServiceCommerceQuoteApprovalStatus.SUPERSEDED,
              supersededAt: new Date(),
            },
            where: { id: pending.id },
          })
          await tx.serviceCommerceQuoteApprovalAuditEvent.create({
            data: {
              actorMembershipId: releaseRuntime.actor.membershipId,
              approvalId: pending.id,
              approvalStatus: ServiceCommerceQuoteApprovalStatus.SUPERSEDED,
              policyRevision: pending.policyRevision,
              reason: "Superseded by a new immutable Quote Version.",
              storeId: input.storeId,
              tenantId: input.tenantId,
              type: ServiceCommerceQuoteApprovalAuditEventType.SUPERSEDED,
            },
          })
        }
      }
      const madeCurrent = await tx.commerceQuote.updateMany({
        data: { currentVersionId: version.id },
        where: { currentVersionId: current?.id ?? null, id: quote.id },
      })
      if (madeCurrent.count !== 1) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Quote changed before approval preparation completed.",
        )
      }
      const approval = await tx.serviceCommerceQuoteApproval.create({
        data: {
          policyRevision: releaseRuntime.policy.revision,
          quoteId: quote.id,
          quoteVersionId: version.id,
          requesterMembershipId: releaseRuntime.actor.membershipId,
          sourceId: input.sourceId,
          sourceType: mapSourceType(input.sourceType),
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      await tx.serviceCommerceQuoteApprovalAuditEvent.create({
        data: {
          actorMembershipId: releaseRuntime.actor.membershipId,
          approvalId: approval.id,
          approvalStatus: ServiceCommerceQuoteApprovalStatus.PENDING,
          policyRevision: releaseRuntime.policy.revision,
          reason: "Quotation prepared for Store approval.",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: ServiceCommerceQuoteApprovalAuditEventType.REQUESTED,
        },
      })
      return {
        approvalId: approval.id,
        quoteId: quote.id,
        releaseState: "pending_approval" as const,
        token: null,
        versionId: version.id,
      }
    }

    const releaseEffects = await releasePreparedCommerceQuoteVersion(tx, {
      acceptanceTokenDigest: digest(rawToken),
      actionExpiresAt:
        input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60_000),
      actorMembershipId: releaseRuntime.actor.membershipId,
      currentVersionId: current?.id ?? null,
      quoteId: quote.id,
      protectActionId: input.protectActionId,
      sourceHandler,
      sourceInput,
      sourceState,
      versionId: version.id,
    })

    return {
      communicationIntentId: releaseEffects.communicationIntentId,
      quoteId: quote.id,
      releaseState: "released" as const,
      token: rawToken,
      versionId: version.id,
    }
  })
}

function sourceKindFromPersistence(sourceType: CommerceQuoteSourceTypeEnum) {
  if (sourceType === CommerceQuoteSourceTypeEnum.SERVICE_REQUEST) {
    return "service_request" as const
  }
  if (sourceType === CommerceQuoteSourceTypeEnum.PRESCRIPTION_REQUEST) {
    return "prescription_request" as const
  }
  return "commerce_inquiry" as const
}

function sourceKindForRelease(sourceType: CommerceQuoteSourceTypeEnum) {
  if (sourceType === CommerceQuoteSourceTypeEnum.SERVICE_REQUEST) {
    return "service" as const
  }
  if (sourceType === CommerceQuoteSourceTypeEnum.PRESCRIPTION_REQUEST) {
    return "prescription" as const
  }
  return "commerce_inquiry" as const
}

async function assertQuoteReleaseVerticalPolicy(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    sourceId: string
    sourceType: CommerceQuoteSourceTypeEnum
    storeId: string
    tenantId: string
  },
) {
  const vertical =
    input.sourceType === CommerceQuoteSourceTypeEnum.PRESCRIPTION_REQUEST
      ? "pharmacy"
      : input.sourceType === CommerceQuoteSourceTypeEnum.SERVICE_REQUEST
        ? "service"
        : (
            await tx.commerceInquiry.findFirst({
              select: { vertical: true },
              where: {
                id: input.sourceId,
                storeId: input.storeId,
                tenantId: input.tenantId,
              },
            })
          )?.vertical.toLowerCase()
  if (vertical !== "pharmacy" && vertical !== "service") {
    throw new CommerceQuoteError(
      "QUOTE_RELEASE_FORBIDDEN",
      "The quotation source is no longer eligible for release.",
    )
  }
  await assertServiceCommercePolicyAllowedInTransaction(tx, {
    actorUserId: input.actorUserId,
    channel: "staff",
    purpose: "service_commerce_quote_approval_release",
    storeId: input.storeId,
    subject: "quote",
    tenantId: input.tenantId,
    vertical,
  })
}

function inputLineOutcome(
  outcome: CommerceQuoteLineOutcome,
): CommerceQuoteLineOutcomeInput {
  if (outcome === CommerceQuoteLineOutcome.ALTERNATIVE) return "alternative"
  if (outcome === CommerceQuoteLineOutcome.DECLINED) return "declined"
  if (outcome === CommerceQuoteLineOutcome.UNAVAILABLE) return "unavailable"
  return "included"
}

function assertPreparedQuoteOptionTotals(
  options: Array<{
    availabilityOutcome: CommerceQuoteAvailabilityOutcome
    discountMinor: number
    fulfilmentFeeMinor: number
    lines: Array<{ outcome: CommerceQuoteLineOutcome; totalMinor: number }>
    subtotalMinor: number
    taxMinor: number
    totalMinor: number
  }>,
) {
  if (options.length < 1) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "A prepared Quote requires at least one Offer Option.",
    )
  }
  for (const option of options) {
    const included = option.lines.filter(
      (line) => line.outcome === CommerceQuoteLineOutcome.INCLUDED,
    )
    const subtotalMinor = included.reduce(
      (total, line) => total + line.totalMinor,
      0,
    )
    const totalMinor =
      subtotalMinor -
      option.discountMinor +
      option.taxMinor +
      option.fulfilmentFeeMinor
    const availabilityMatches =
      (option.availabilityOutcome ===
        CommerceQuoteAvailabilityOutcome.UNAVAILABLE &&
        included.length === 0) ||
      (option.availabilityOutcome === CommerceQuoteAvailabilityOutcome.FULL &&
        included.length === option.lines.length) ||
      (option.availabilityOutcome ===
        CommerceQuoteAvailabilityOutcome.PARTIAL &&
        included.length > 0 &&
        included.length < option.lines.length)
    if (
      !availabilityMatches ||
      subtotalMinor !== option.subtotalMinor ||
      totalMinor !== option.totalMinor ||
      !Number.isSafeInteger(totalMinor) ||
      totalMinor < 0
    ) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Prepared Quote Option totals or availability changed before release.",
      )
    }
  }
}

type QuoteApprovalDecisionInput = {
  actorUserId: string
  approvalId: string
  clientDecisionId: string
  expectedPolicyRevision: number
  protectActionId?: (actionId: string) => string
  quoteId: string
  quoteVersionId: string
  reason: string
  storeId: string
  tenantId: string
}

async function loadQuoteApprovalDecision(
  tx: Prisma.TransactionClient,
  input: QuoteApprovalDecisionInput,
) {
  const approval = await tx.serviceCommerceQuoteApproval.findFirst({
    include: {
      quote: true,
      quoteVersion: {
        include: {
          options: { include: { lines: true }, orderBy: { position: "asc" } },
        },
      },
    },
    where: {
      id: input.approvalId,
      quoteId: input.quoteId,
      quoteVersionId: input.quoteVersionId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!approval) {
    throw new CommerceQuoteError(
      "QUOTE_RELEASE_FORBIDDEN",
      "Pending quotation approval was not found.",
    )
  }
  return approval
}

function pendingApprovalSupersessionReason(
  approval: Awaited<ReturnType<typeof loadQuoteApprovalDecision>>,
  runtime: Awaited<ReturnType<typeof resolveQuoteReleaseRuntimeFacts>>,
  now = new Date(),
) {
  if (approval.status !== ServiceCommerceQuoteApprovalStatus.PENDING) {
    return null
  }
  if (
    approval.quote.currentVersionId !== approval.quoteVersionId ||
    approval.quoteVersion.status !== CommerceQuoteVersionStatusEnum.DRAFT
  ) {
    return "Superseded because the prepared Quote Version is no longer current."
  }
  if (
    approval.quoteVersion.expiresAt &&
    approval.quoteVersion.expiresAt <= now
  ) {
    return "Superseded because the prepared Quote Version expired."
  }
  if (
    runtime.policy.mode !== "approval_required" ||
    approval.policyRevision !== runtime.policy.revision
  ) {
    return "Superseded because the Store quotation release policy changed."
  }
  const hasDistinctActiveApprover = runtime.activeApproverMembershipIds.some(
    (membershipId) =>
      membershipId !== approval.requesterMembershipId &&
      runtime.policy.selectedApproverMembershipIds.includes(membershipId),
  )
  return hasDistinctActiveApprover
    ? null
    : "Superseded because no different selected active approver remains."
}

async function supersedePendingApproval(
  tx: Prisma.TransactionClient,
  input: QuoteApprovalDecisionInput,
  approval: Awaited<ReturnType<typeof loadQuoteApprovalDecision>>,
  actorMembershipId: string,
  reason: string,
) {
  await supersedeServiceCommerceQuoteApprovalInTransaction(tx, {
    actorMembershipId,
    approvalId: approval.id,
    policyRevision: approval.policyRevision,
    quoteVersionId: approval.quoteVersionId,
    reason,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })
  return { superseded: true as const }
}

export async function approveCommerceQuoteVersion(
  db: PrismaClient,
  input: QuoteApprovalDecisionInput,
) {
  const rawToken = token()
  const decisionPayloadHash = hash({
    approvalId: input.approvalId,
    expectedPolicyRevision: input.expectedPolicyRevision,
    quoteId: input.quoteId,
    quoteVersionId: input.quoteVersionId,
    reason: input.reason.trim(),
    storeId: input.storeId,
  })
  const result = await runCommerceQuoteDecisionTransaction(db, async (tx) => {
    const runtime = await resolveQuoteReleaseRuntimeFacts(tx, input)
    const approval = await loadQuoteApprovalDecision(tx, input)
    if (approval.status === ServiceCommerceQuoteApprovalStatus.APPROVED) {
      const actorStillSelected =
        runtime.actor.quoteApproverActive &&
        runtime.policy.revision === input.expectedPolicyRevision &&
        runtime.policy.selectedApproverMembershipIds.includes(
          runtime.actor.membershipId,
        )
      if (
        !actorStillSelected ||
        approval.decisionClientId !== input.clientDecisionId ||
        approval.decisionPayloadHash !== decisionPayloadHash ||
        approval.decidedByMembershipId !== runtime.actor.membershipId
      ) {
        throw new CommerceQuoteError(
          "IDEMPOTENCY_MISMATCH",
          "This quotation approval was already decided with different input.",
        )
      }
      await tx.commerceQuoteReplayAccessToken.upsert({
        create: {
          storeId: input.storeId,
          tenantId: input.tenantId,
          tokenDigest: digest(rawToken),
          versionId: approval.quoteVersionId,
        },
        update: { tokenDigest: digest(rawToken) },
        where: { versionId: approval.quoteVersionId },
      })
      const releaseEffects =
        approval.sourceType ===
          CommerceQuoteSourceTypeEnum.PRESCRIPTION_REQUEST &&
        approval.quoteVersion.status ===
          CommerceQuoteVersionStatusEnum.ISSUED &&
        input.protectActionId
          ? await materializePrescriptionQuoteReadyEffectsInTransaction(tx, {
              expiresAt:
                approval.quoteVersion.expiresAt ??
                new Date(Date.now() + 24 * 60 * 60_000),
              protectActionId: input.protectActionId,
              requestId: approval.sourceId,
              storeId: input.storeId,
              tenantId: input.tenantId,
              versionId: approval.quoteVersionId,
            })
          : { communicationIntentId: null }
      return {
        approvalId: approval.id,
        communicationIntentId: releaseEffects.communicationIntentId,
        quoteId: approval.quoteId,
        releaseState: "released" as const,
        token: rawToken,
        versionId: approval.quoteVersionId,
      }
    }
    const staleReason = pendingApprovalSupersessionReason(approval, runtime)
    if (staleReason) {
      return supersedePendingApproval(
        tx,
        input,
        approval,
        runtime.actor.membershipId,
        staleReason,
      )
    }
    const sourceType = sourceKindFromPersistence(approval.sourceType)
    const sourceHandler = quoteSourceHandlers[sourceType]
    const sourceLines = approval.quoteVersion.options.flatMap((option) =>
      option.lines.map((line) => ({
        availabilityAttestationId: line.availabilityAttestationId ?? undefined,
        balanceRevision: line.balanceRevision ?? undefined,
        configurationVersionId: line.configurationVersionId ?? undefined,
        offeringId: line.offeringId ?? undefined,
        outcome: inputLineOutcome(line.outcome),
        quantity: line.quantity?.toString(),
        sourceLineId: line.sourceLineId ?? undefined,
        unitPriceMinor: line.unitPriceMinor ?? undefined,
      })),
    )
    const sourceInput = {
      actorUserId: input.actorUserId,
      lines: sourceLines,
      sourceId: approval.sourceId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }
    let sourceState: QuoteSourceState
    try {
      await assertQuoteReleaseVerticalPolicy(tx, {
        actorUserId: input.actorUserId,
        sourceId: approval.sourceId,
        sourceType: approval.sourceType,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      sourceState = await sourceHandler.load(tx, sourceInput)
      for (const option of approval.quoteVersion.options) {
        await sourceHandler.validateLines(tx, {
          ...sourceInput,
          lines: option.lines.map((line) => ({
            offeringId: line.offeringId ?? undefined,
            outcome: inputLineOutcome(line.outcome),
            sourceLineId: line.sourceLineId ?? undefined,
          })),
        })
      }
      assertPreparedQuoteOptionTotals(approval.quoteVersion.options)
      for (const option of approval.quoteVersion.options) {
        await assertSelectedOptionAvailability(tx, {
          lines: option.lines.filter(
            (line) => line.outcome === CommerceQuoteLineOutcome.INCLUDED,
          ),
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      }
    } catch (error) {
      if (
        !(error instanceof CommerceQuoteError) &&
        !(error instanceof ServiceCommercePolicyError)
      ) {
        throw error
      }
      return supersedePendingApproval(
        tx,
        input,
        approval,
        runtime.actor.membershipId,
        "Superseded because source, policy, or availability facts no longer permit release.",
      )
    }
    const actions = deriveServiceCommerceQuoteReleaseActions({
      activeApproverMembershipIds: runtime.activeApproverMembershipIds,
      actor: runtime.actor,
      availabilityReady: true,
      clinicalReleaseReady: true,
      currentVersionId: approval.quote.currentVersionId ?? "",
      decision: {
        id: approval.id,
        lifecycle: "pending",
        policyRevision: approval.policyRevision,
        quoteId: approval.quoteId,
        quoteVersionId: approval.quoteVersionId,
        sourceId: approval.sourceId,
        sourceKind: sourceKindForRelease(approval.sourceType),
        storeId: approval.storeId,
        tenantId: approval.tenantId,
      },
      expiresAt: approval.quoteVersion.expiresAt,
      offerOptionsReady: true,
      policy: runtime.policy,
      policyRevision: input.expectedPolicyRevision,
      quoteCreatorMembershipId: approval.requesterMembershipId,
      quoteId: approval.quoteId,
      quoteVersionId: approval.quoteVersionId,
      quoteVersionState:
        approval.quoteVersion.status === CommerceQuoteVersionStatusEnum.DRAFT
          ? "draft"
          : "issued",
      sourceId: approval.sourceId,
      sourceKind: sourceKindForRelease(approval.sourceType),
      storeId: approval.storeId,
      tenantId: approval.tenantId,
      verticalEligible: true,
    })
    if (!actions.canApprove) {
      throw new CommerceQuoteError(
        "QUOTE_RELEASE_FORBIDDEN",
        "This quotation is no longer eligible for approval.",
      )
    }
    const decided = await tx.serviceCommerceQuoteApproval.updateMany({
      data: {
        decidedAt: new Date(),
        decidedByMembershipId: runtime.actor.membershipId,
        decisionClientId: input.clientDecisionId,
        decisionPayloadHash,
        reason: input.reason.trim(),
        status: ServiceCommerceQuoteApprovalStatus.APPROVED,
      },
      where: {
        id: approval.id,
        policyRevision: input.expectedPolicyRevision,
        status: ServiceCommerceQuoteApprovalStatus.PENDING,
      },
    })
    if (decided.count !== 1) {
      const concurrent = await loadQuoteApprovalDecision(tx, input)
      const exactApprovedReplay =
        concurrent.status === ServiceCommerceQuoteApprovalStatus.APPROVED &&
        concurrent.decisionClientId === input.clientDecisionId &&
        concurrent.decisionPayloadHash === decisionPayloadHash &&
        concurrent.decidedByMembershipId === runtime.actor.membershipId &&
        runtime.actor.quoteApproverActive &&
        runtime.policy.revision === input.expectedPolicyRevision &&
        runtime.policy.selectedApproverMembershipIds.includes(
          runtime.actor.membershipId,
        )
      if (exactApprovedReplay) {
        await tx.commerceQuoteReplayAccessToken.upsert({
          create: {
            storeId: input.storeId,
            tenantId: input.tenantId,
            tokenDigest: digest(rawToken),
            versionId: concurrent.quoteVersionId,
          },
          update: { tokenDigest: digest(rawToken) },
          where: { versionId: concurrent.quoteVersionId },
        })
        const releaseEffects =
          concurrent.sourceType ===
            CommerceQuoteSourceTypeEnum.PRESCRIPTION_REQUEST &&
          concurrent.quoteVersion.status ===
            CommerceQuoteVersionStatusEnum.ISSUED &&
          input.protectActionId
            ? await materializePrescriptionQuoteReadyEffectsInTransaction(tx, {
                expiresAt:
                  concurrent.quoteVersion.expiresAt ??
                  new Date(Date.now() + 24 * 60 * 60_000),
                protectActionId: input.protectActionId,
                requestId: concurrent.sourceId,
                storeId: input.storeId,
                tenantId: input.tenantId,
                versionId: concurrent.quoteVersionId,
              })
            : { communicationIntentId: null }
        return {
          approvalId: concurrent.id,
          communicationIntentId: releaseEffects.communicationIntentId,
          quoteId: concurrent.quoteId,
          releaseState: "released" as const,
          token: rawToken,
          versionId: concurrent.quoteVersionId,
        }
      }
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Quotation approval changed before this decision completed.",
      )
    }
    const released = await tx.commerceQuoteVersion.updateMany({
      data: {
        acceptanceTokenDigest: digest(rawToken),
        issuedAt: new Date(),
        status: CommerceQuoteVersionStatusEnum.ISSUED,
      },
      where: {
        id: approval.quoteVersionId,
        quoteId: approval.quoteId,
        status: CommerceQuoteVersionStatusEnum.DRAFT,
      },
    })
    if (released.count !== 1) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Prepared Quote Version changed before approval release.",
      )
    }
    const releaseEffects = await sourceHandler.recordIssued(
      tx,
      {
        ...sourceInput,
        actionExpiresAt:
          approval.quoteVersion.expiresAt ??
          new Date(Date.now() + 24 * 60 * 60_000),
        protectActionId: input.protectActionId,
        versionId: approval.quoteVersionId,
      },
      sourceState,
    )
    await tx.serviceCommerceQuoteApprovalAuditEvent.create({
      data: {
        actorMembershipId: runtime.actor.membershipId,
        approvalId: approval.id,
        approvalStatus: ServiceCommerceQuoteApprovalStatus.APPROVED,
        policyRevision: approval.policyRevision,
        reason: input.reason.trim(),
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: ServiceCommerceQuoteApprovalAuditEventType.APPROVED,
      },
    })
    return {
      approvalId: approval.id,
      communicationIntentId: releaseEffects.communicationIntentId,
      quoteId: approval.quoteId,
      releaseState: "released" as const,
      token: rawToken,
      versionId: approval.quoteVersionId,
    }
  })
  if ("superseded" in result) {
    throw new CommerceQuoteError(
      "QUOTE_RELEASE_FORBIDDEN",
      "This quotation approval was superseded because its release facts changed.",
    )
  }
  return result
}

export async function rejectCommerceQuoteVersion(
  db: PrismaClient,
  input: QuoteApprovalDecisionInput,
) {
  const decisionPayloadHash = hash({
    approvalId: input.approvalId,
    expectedPolicyRevision: input.expectedPolicyRevision,
    quoteId: input.quoteId,
    quoteVersionId: input.quoteVersionId,
    reason: input.reason.trim(),
    storeId: input.storeId,
  })
  const result = await runCommerceQuoteDecisionTransaction(db, async (tx) => {
    const runtime = await resolveQuoteReleaseRuntimeFacts(tx, input)
    const approval = await loadQuoteApprovalDecision(tx, input)
    if (approval.status === ServiceCommerceQuoteApprovalStatus.REJECTED) {
      const actorStillSelected =
        runtime.actor.quoteApproverActive &&
        runtime.policy.revision === input.expectedPolicyRevision &&
        runtime.policy.selectedApproverMembershipIds.includes(
          runtime.actor.membershipId,
        )
      if (
        !actorStillSelected ||
        approval.decisionClientId !== input.clientDecisionId ||
        approval.decisionPayloadHash !== decisionPayloadHash ||
        approval.decidedByMembershipId !== runtime.actor.membershipId
      ) {
        throw new CommerceQuoteError(
          "IDEMPOTENCY_MISMATCH",
          "This quotation approval was already decided with different input.",
        )
      }
      return {
        approvalId: approval.id,
        releaseState: "rejected" as const,
        versionId: approval.quoteVersionId,
      }
    }
    const staleReason = pendingApprovalSupersessionReason(approval, runtime)
    if (staleReason) {
      return supersedePendingApproval(
        tx,
        input,
        approval,
        runtime.actor.membershipId,
        staleReason,
      )
    }
    const sourceHandler =
      quoteSourceHandlers[sourceKindFromPersistence(approval.sourceType)]
    try {
      await sourceHandler.load(tx, {
        actorUserId: input.actorUserId,
        lines: [],
        sourceId: approval.sourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    } catch (error) {
      if (!(error instanceof CommerceQuoteError)) throw error
      return supersedePendingApproval(
        tx,
        input,
        approval,
        runtime.actor.membershipId,
        "Superseded because the source lifecycle no longer permits a decision.",
      )
    }
    const actions = deriveServiceCommerceQuoteReleaseActions({
      activeApproverMembershipIds: runtime.activeApproverMembershipIds,
      actor: runtime.actor,
      availabilityReady: false,
      clinicalReleaseReady: false,
      currentVersionId: approval.quote.currentVersionId ?? "",
      decision: {
        id: approval.id,
        lifecycle: "pending",
        policyRevision: approval.policyRevision,
        quoteId: approval.quoteId,
        quoteVersionId: approval.quoteVersionId,
        sourceId: approval.sourceId,
        sourceKind: sourceKindForRelease(approval.sourceType),
        storeId: approval.storeId,
        tenantId: approval.tenantId,
      },
      expiresAt: approval.quoteVersion.expiresAt,
      offerOptionsReady: false,
      policy: runtime.policy,
      policyRevision: input.expectedPolicyRevision,
      quoteCreatorMembershipId: approval.requesterMembershipId,
      quoteId: approval.quoteId,
      quoteVersionId: approval.quoteVersionId,
      quoteVersionState:
        approval.quoteVersion.status === CommerceQuoteVersionStatusEnum.DRAFT
          ? "draft"
          : "issued",
      sourceId: approval.sourceId,
      sourceKind: sourceKindForRelease(approval.sourceType),
      storeId: approval.storeId,
      tenantId: approval.tenantId,
      verticalEligible: true,
    })
    if (!actions.canReject) {
      throw new CommerceQuoteError(
        "QUOTE_RELEASE_FORBIDDEN",
        "This quotation is no longer eligible for rejection.",
      )
    }
    const rejected = await tx.serviceCommerceQuoteApproval.updateMany({
      data: {
        decidedAt: new Date(),
        decidedByMembershipId: runtime.actor.membershipId,
        decisionClientId: input.clientDecisionId,
        decisionPayloadHash,
        reason: input.reason.trim(),
        status: ServiceCommerceQuoteApprovalStatus.REJECTED,
      },
      where: {
        id: approval.id,
        policyRevision: input.expectedPolicyRevision,
        status: ServiceCommerceQuoteApprovalStatus.PENDING,
      },
    })
    if (rejected.count !== 1) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Quotation approval changed before this rejection completed.",
      )
    }
    await tx.serviceCommerceQuoteApprovalAuditEvent.create({
      data: {
        actorMembershipId: runtime.actor.membershipId,
        approvalId: approval.id,
        approvalStatus: ServiceCommerceQuoteApprovalStatus.REJECTED,
        policyRevision: approval.policyRevision,
        reason: input.reason.trim(),
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: ServiceCommerceQuoteApprovalAuditEventType.REJECTED,
      },
    })
    return {
      approvalId: approval.id,
      releaseState: "rejected" as const,
      versionId: approval.quoteVersionId,
    }
  })
  if ("superseded" in result) {
    throw new CommerceQuoteError(
      "QUOTE_RELEASE_FORBIDDEN",
      "This quotation approval was superseded because its release facts changed.",
    )
  }
  return result
}

export async function getCommerceQuoteApprovalDetail(
  db: PrismaClient,
  input: {
    actorUserId: string
    approvalId: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const runtime = await resolveQuoteReleaseRuntimeFacts(tx, input)
    if (
      !runtime.actor.managerActive &&
      !runtime.actor.attendantActive &&
      !runtime.actor.quoteApproverActive
    ) {
      throw new CommerceQuoteError(
        "QUOTE_RELEASE_FORBIDDEN",
        "An active Store quotation assignment is required.",
      )
    }
    const approval = await tx.serviceCommerceQuoteApproval.findFirst({
      include: {
        quote: true,
        quoteVersion: {
          include: {
            options: {
              include: { lines: true },
              orderBy: { position: "asc" },
            },
          },
        },
      },
      where: {
        id: input.approvalId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!approval) {
      throw new CommerceQuoteError(
        "QUOTE_RELEASE_FORBIDDEN",
        "Quotation approval was not found.",
      )
    }
    let verticalEligible = true
    let clinicalReleaseReady = true
    try {
      await assertQuoteReleaseVerticalPolicy(tx, {
        actorUserId: input.actorUserId,
        sourceId: approval.sourceId,
        sourceType: approval.sourceType,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      const sourceHandler =
        quoteSourceHandlers[sourceKindFromPersistence(approval.sourceType)]
      await sourceHandler.load(tx, {
        actorUserId: input.actorUserId,
        lines: [],
        sourceId: approval.sourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    } catch (error) {
      if (
        !(error instanceof ServiceCommercePolicyError) &&
        !(error instanceof CommerceQuoteError)
      ) {
        throw error
      }
      verticalEligible = false
      clinicalReleaseReady = false
    }
    let availabilityReady = approval.quoteVersion.options.length > 0
    let offerOptionsReady = approval.quoteVersion.options.length > 0
    if (offerOptionsReady) {
      try {
        assertPreparedQuoteOptionTotals(approval.quoteVersion.options)
        for (const option of approval.quoteVersion.options) {
          await assertSelectedOptionAvailability(tx, {
            lines: option.lines.filter(
              (line) => line.outcome === CommerceQuoteLineOutcome.INCLUDED,
            ),
            storeId: input.storeId,
            tenantId: input.tenantId,
          })
        }
      } catch (error) {
        if (!(error instanceof CommerceQuoteError)) throw error
        availabilityReady = false
        offerOptionsReady = false
      }
    }
    let lifecycle =
      approval.status === ServiceCommerceQuoteApprovalStatus.APPROVED
        ? ("approved" as const)
        : approval.status === ServiceCommerceQuoteApprovalStatus.REJECTED
          ? ("rejected" as const)
          : approval.status === ServiceCommerceQuoteApprovalStatus.SUPERSEDED
            ? ("superseded" as const)
            : ("pending" as const)
    const deriveActions = (
      decisionLifecycle: "approved" | "pending" | "rejected" | "superseded",
    ) =>
      deriveServiceCommerceQuoteReleaseActions({
        activeApproverMembershipIds: runtime.activeApproverMembershipIds,
        actor: runtime.actor,
        availabilityReady,
        clinicalReleaseReady,
        currentVersionId: approval.quote.currentVersionId ?? "",
        decision: {
          id: approval.id,
          lifecycle: decisionLifecycle,
          policyRevision: approval.policyRevision,
          quoteId: approval.quoteId,
          quoteVersionId: approval.quoteVersionId,
          sourceId: approval.sourceId,
          sourceKind: sourceKindForRelease(approval.sourceType),
          storeId: approval.storeId,
          tenantId: approval.tenantId,
        },
        expiresAt: approval.quoteVersion.expiresAt,
        offerOptionsReady,
        policy: runtime.policy,
        policyRevision: approval.policyRevision,
        quoteCreatorMembershipId: approval.requesterMembershipId,
        quoteId: approval.quoteId,
        quoteVersionId: approval.quoteVersionId,
        quoteVersionState:
          approval.quoteVersion.status === CommerceQuoteVersionStatusEnum.DRAFT
            ? "draft"
            : "issued",
        sourceId: approval.sourceId,
        sourceKind: sourceKindForRelease(approval.sourceType),
        storeId: approval.storeId,
        tenantId: approval.tenantId,
        verticalEligible,
      })
    let actions = deriveActions(lifecycle)
    if (lifecycle === "pending") {
      const staleReason =
        pendingApprovalSupersessionReason(approval, runtime) ??
        (!verticalEligible
          ? "Superseded because source or policy facts no longer permit release."
          : !availabilityReady || !offerOptionsReady
            ? "Superseded because the prepared commercial facts are no longer current."
            : null)
      if (staleReason) {
        await supersedePendingApproval(
          tx,
          {
            actorUserId: input.actorUserId,
            approvalId: approval.id,
            clientDecisionId: "reconciliation",
            expectedPolicyRevision: approval.policyRevision,
            quoteId: approval.quoteId,
            quoteVersionId: approval.quoteVersionId,
            reason: staleReason,
            storeId: input.storeId,
            tenantId: input.tenantId,
          },
          approval,
          runtime.actor.membershipId,
          staleReason,
        )
        lifecycle = "superseded"
        actions = deriveActions(lifecycle)
      }
    }
    return {
      actions,
      createdByMembershipId: approval.requesterMembershipId,
      currencyCode: approval.quoteVersion.currencyCode,
      expiresAt: approval.quoteVersion.expiresAt,
      id: approval.id,
      options: approval.quoteVersion.options.map((option) => ({
        availabilityOutcome: option.availabilityOutcome.toLowerCase(),
        id: option.id,
        label: option.label,
        lines: option.lines.map((line) => ({
          catalogItemName: line.catalogItemName,
          offeringName: line.offeringName,
          outcome: line.outcome.toLowerCase(),
          quantity: line.quantity?.toString() ?? null,
          totalMinor: line.totalMinor,
          unitPriceMinor: line.unitPriceMinor,
          variantName: line.variantName,
        })),
        totalMinor: option.totalMinor,
      })),
      policyRevision: approval.policyRevision,
      quoteId: approval.quoteId,
      quoteVersionId: approval.quoteVersionId,
      requestedAt: approval.requestedAt,
      sourceId: approval.sourceId,
      sourceKind: sourceKindForRelease(approval.sourceType),
      status: lifecycle,
      totalMinor: approval.quoteVersion.totalMinor,
      version: approval.quoteVersion.version,
    }
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
    const access = await resolveCommerceQuoteAccess(tx, {
      ...input,
      allowedCustomerActions: COMMERCE_QUOTE_READ_CUSTOMER_ACTIONS,
    })
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
    const publicOption = (
      option: QuoteOptionFacts<(typeof version.lines)[number]>,
      input: { currencyCode: string; label: string; position: number },
    ) => {
      const payableOption = resolvePayableOption(option)
      return {
        availabilityOutcome: (
          payableOption?.availabilityOutcome ??
          CommerceQuoteAvailabilityOutcome.UNAVAILABLE
        ).toLowerCase(),
        currencyCode: input.currencyCode,
        customerNote: option.customerNote,
        discountMinor: payableOption?.discountMinor ?? 0,
        fulfilmentFeeMinor: payableOption?.fulfilmentFeeMinor ?? 0,
        fulfilmentPromise: option.fulfilmentPromise,
        fulfilmentType: option.fulfilmentType.toLowerCase(),
        id: option.id,
        label: input.label,
        lines: option.lines
          .filter(
            (line) =>
              line.outcome === CommerceQuoteLineOutcome.INCLUDED ||
              line.outcome === CommerceQuoteLineOutcome.ALTERNATIVE,
          )
          .map(publicLine),
        position: input.position,
        subtotalMinor: payableOption?.subtotalMinor ?? 0,
        taxMinor: payableOption?.taxMinor ?? 0,
        totalMinor: payableOption?.totalMinor ?? 0,
      }
    }
    const options =
      version.options.length > 0
        ? version.options.map((option) =>
            publicOption(option, {
              currencyCode: option.currencyCode,
              label: option.label,
              position: option.position,
            }),
          )
        : [
            publicOption(version, {
              currencyCode: version.currencyCode,
              label: "Quote",
              position: 0,
            }),
          ]
    const payable = payableState.payable
    return {
      accepted: version.status === CommerceQuoteVersionStatusEnum.ACCEPTED,
      availabilityOutcome:
        payable?.availabilityOutcome.toLowerCase() ??
        version.availabilityOutcome.toLowerCase(),
      currencyCode: version.currencyCode,
      customerAction: access.customerAction ?? null,
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

export async function selectCommerceQuoteOptionInTransaction(
  tx: Prisma.TransactionClient,
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
  const access = await resolveCommerceQuoteAccess(tx, {
    ...input,
    allowedCustomerActions: ["choose_quote_option"],
  })
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
    option.availabilityOutcome === CommerceQuoteAvailabilityOutcome.UNAVAILABLE
  ) {
    throw new CommerceQuoteError(
      "OFFERING_UNAVAILABLE",
      "Unavailable Offer Options cannot be selected.",
    )
  }
  await assertSelectedOptionAvailability(tx, {
    lines: option.lines.filter(
      (line) => line.outcome === CommerceQuoteLineOutcome.INCLUDED,
    ),
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

export async function selectCommerceQuoteOption(
  db: PrismaClient,
  input: Parameters<typeof selectCommerceQuoteOptionInTransaction>[1],
) {
  const select = (tx: Prisma.TransactionClient) =>
    selectCommerceQuoteOptionInTransaction(tx, input)

  try {
    return await db.$transaction(select, COMMERCE_QUOTE_TRANSACTION_OPTIONS)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.$transaction(select, COMMERCE_QUOTE_TRANSACTION_OPTIONS)
    }
    throw error
  }
}

export async function getCommerceQuoteAcceptanceContext(
  tx: PrismaClient | Prisma.TransactionClient,
  input: {
    acceptanceToken: string
    allowedCustomerActions?: readonly ServiceCommerceAction[]
    clientAcceptanceId: string
  },
) {
  const access = await resolveCommerceQuoteAccess(tx, input)
  const version = await tx.commerceQuoteVersion.findFirst({
    include: {
      lines: {
        include: {
          availabilityAttestation: { select: { type: true } },
        },
      },
      optionSelection: true,
      options: {
        include: {
          lines: {
            include: {
              availabilityAttestation: { select: { type: true } },
            },
          },
        },
        orderBy: { position: "asc" },
      },
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
  customerAction?: ServiceCommerceAction
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
  input: {
    acceptanceToken: string
    allowedCustomerActions?: readonly ServiceCommerceAction[]
  },
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
  if (action) {
    return {
      storeId: action.storeId,
      tenantId: action.tenantId,
      versionId: action.entityId,
    }
  }

  if (!input.allowedCustomerActions?.length) {
    throw new CommerceQuoteError(
      "PUBLIC_TOKEN_INVALID",
      "Quote is unavailable.",
    )
  }
  const customerAction =
    await db.serviceCommerceCustomerActionCapability.findFirst({
      include: { executions: { select: { id: true }, take: 1 } },
      where: {
        action: {
          in: input.allowedCustomerActions.map(
            (action) => customerActionTypes[action],
          ),
        },
        expiresAt: { gt: new Date() },
        status: { in: ["ACTIVE", "CONSUMED"] },
        targetType: { in: ["QUOTE_VERSION", "QUOTE_OPTION"] },
        tokenDigest,
      },
    })
  let current = false
  if (customerAction) {
    try {
      current = Boolean(
        await revalidateCustomerActionCapabilityInTransaction(
          db,
          customerAction,
        ),
      )
    } catch {
      current = false
    }
  }
  const completedExactAction =
    customerAction?.status === "CONSUMED" &&
    customerAction.executions.length > 0
  if (!customerAction || (!current && !completedExactAction)) {
    throw new CommerceQuoteError(
      "PUBLIC_TOKEN_INVALID",
      "Quote is unavailable.",
    )
  }
  return {
    customerAction: customerActionValues[customerAction.action],
    storeId: customerAction.storeId,
    tenantId: customerAction.tenantId,
    versionId: customerAction.targetId,
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
