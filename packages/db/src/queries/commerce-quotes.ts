import { createHash, randomBytes } from "node:crypto"

import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
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

export type IssueCommerceQuoteInput = {
  actorUserId: string
  authorize?: (tx: Prisma.TransactionClient) => Promise<void>
  availabilityOutcome: CommerceQuoteAvailabilityOutcomeInput
  clientQuoteId: string
  clientVersionId: string
  customerNote?: string
  discountMinor?: number
  expiresAt?: Date
  fulfilmentFeeMinor?: number
  fulfilmentPromise?: string
  fulfilmentType?: CommerceQuoteFulfilmentTypeInput
  lines: IssueCommerceQuoteLineInput[]
  sourceId: string
  sourceType: CommerceQuoteSourceType
  storeId: string
  taxMinor?: number
  tenantId: string
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
        Awaited<ReturnType<typeof getCatalogOfferingAvailability>>
      >()
      for (const line of input.lines) {
        if (
          !line.offeringId ||
          (line.outcome !== "included" && line.outcome !== "alternative") ||
          snapshots.has(line.offeringId)
        ) {
          continue
        }
        snapshots.set(
          line.offeringId,
          await getCatalogOfferingAvailability(tx, {
            offeringId: line.offeringId,
            storeId: input.storeId,
            tenantId: input.tenantId,
          }),
        )
      }
      return input.lines.map((line) => {
        const snapshot = line.offeringId
          ? snapshots.get(line.offeringId)
          : undefined
        return snapshot
          ? {
              ...line,
              balanceRevision: snapshot.revision,
              configurationVersionId: snapshot.configurationVersionId,
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
    prepareLines: async (_tx, input) => input.lines,
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

export async function issueCommerceQuote(
  db: PrismaClient,
  input: IssueCommerceQuoteInput,
) {
  const source = assertCommerceQuoteSource(input)
  const rawToken = token()
  const payloadHash = hash({
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
  })

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
    const sourceInput = { ...input, sourceId: source.sourceId }
    const sourceState = await sourceHandler.load(tx, sourceInput)
    await sourceHandler.validateLines(tx, sourceInput)

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

    const commandLines = await sourceHandler.prepareLines(tx, sourceInput)

    if (commandLines.length < 1 || commandLines.length > 100) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "A Quote requires between one and 100 lines.",
      )
    }
    const mappedOfferingIds = commandLines.flatMap((line) =>
      line.offeringId ? [line.offeringId] : [],
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
        status: CatalogRecordStatus.ACTIVE,
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
    let subtotalMinor = 0
    const resolvedLines = commandLines.map((line) => {
      const payable =
        line.outcome === "included" || line.outcome === "alternative"
      const offering = line.offeringId ? byId.get(line.offeringId) : undefined
      if (payable && !offering) {
        throw new CommerceQuoteError(
          "OFFERING_UNAVAILABLE",
          "Included Quote lines require an active Offering.",
        )
      }
      if (offering && !offering.storeAvailability[0]?.isAvailable) {
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
        balanceRevision: line.balanceRevision ?? null,
        catalogItemName:
          offering?.catalogItem.name ?? line.catalogItemName?.trim() ?? "Item",
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

    const payableCount = commandLines.filter(
      (line) => line.outcome === "included" || line.outcome === "alternative",
    ).length
    if (
      (input.availabilityOutcome === "unavailable" && payableCount !== 0) ||
      (input.availabilityOutcome === "full" &&
        payableCount !== commandLines.length) ||
      (input.availabilityOutcome === "partial" &&
        (payableCount === 0 || payableCount === commandLines.length))
    ) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Quote availability outcome does not match its lines.",
      )
    }

    const discountMinor = input.discountMinor ?? 0
    const taxMinor = input.taxMinor ?? 0
    const fulfilmentFeeMinor = input.fulfilmentFeeMinor ?? 0
    for (const [label, amount] of [
      ["discount", discountMinor],
      ["tax", taxMinor],
      ["fulfilment fee", fulfilmentFeeMinor],
    ] as const) {
      if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          `Quote ${label} is invalid.`,
        )
      }
    }
    const totalMinor =
      subtotalMinor - discountMinor + taxMinor + fulfilmentFeeMinor
    if (totalMinor < 0) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Quote total cannot be negative.",
      )
    }

    const last = await tx.commerceQuoteVersion.aggregate({
      _max: { version: true },
      where: { quoteId: quote.id },
    })
    if (current) {
      await tx.commerceQuoteVersion.update({
        data: {
          status: CommerceQuoteVersionStatusEnum.SUPERSEDED,
          supersededAt: new Date(),
        },
        where: { id: current.id },
      })
    }
    const version = await tx.commerceQuoteVersion.create({
      data: {
        acceptanceTokenDigest: digest(rawToken),
        availabilityOutcome: mapAvailabilityOutcome(input.availabilityOutcome),
        clientVersionId: input.clientVersionId,
        createdByUserId: input.actorUserId,
        currencyCode: store.currencyCode,
        customerNote: input.customerNote?.trim() || null,
        discountMinor,
        expiresAt: input.expiresAt,
        fulfilmentFeeMinor,
        fulfilmentPromise: input.fulfilmentPromise?.trim() || null,
        fulfilmentType: mapFulfilmentType(
          input.fulfilmentType ?? "unspecified",
        ),
        issuedAt: new Date(),
        payloadHash,
        quoteId: quote.id,
        status: CommerceQuoteVersionStatusEnum.ISSUED,
        subtotalMinor,
        taxMinor,
        totalMinor,
        version: (last._max.version ?? 0) + 1,
      },
    })
    await tx.commerceQuoteLine.createMany({
      data: resolvedLines.map((line) => ({
        ...line,
        quoteVersionId: version.id,
      })),
    })
    await tx.commerceQuote.update({
      data: { currentVersionId: version.id },
      where: { id: quote.id },
    })
    await sourceHandler.recordIssued(
      tx,
      { ...sourceInput, versionId: version.id },
      sourceState,
    )

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
    return {
      accepted: version.status === CommerceQuoteVersionStatusEnum.ACCEPTED,
      availabilityOutcome: version.availabilityOutcome.toLowerCase(),
      currencyCode: version.currencyCode,
      customerNote: version.customerNote,
      discountMinor: version.discountMinor,
      expiresAt: version.expiresAt,
      fulfilmentFeeMinor: version.fulfilmentFeeMinor,
      fulfilmentPromise: version.fulfilmentPromise,
      fulfilmentType: version.fulfilmentType.toLowerCase(),
      lines: version.lines.map((line) => ({
        catalogItemName: line.catalogItemName,
        customerNote: line.customerNote,
        offeringName: line.offeringName,
        outcome: serializeLineOutcome(line.outcome),
        quantity: line.quantity?.toString() ?? null,
        totalMinor: line.totalMinor,
        unitPriceMinor: line.unitPriceMinor,
        variantName: line.variantName,
      })),
      sourceType: version.quote.sourceType.toLowerCase(),
      storeName: version.quote.store.name,
      storeSupportEmail: version.quote.store.supportEmail,
      storeSupportPhone: version.quote.store.supportPhone,
      subtotalMinor: version.subtotalMinor,
      taxMinor: version.taxMinor,
      totalMinor: version.totalMinor,
      version: version.version,
    }
  })
}

export async function getCommerceQuoteAcceptanceContext(
  tx: PrismaClient | Prisma.TransactionClient,
  input: { acceptanceToken: string; clientAcceptanceId: string },
) {
  const access = await resolveCommerceQuoteAccess(tx, input)
  const version = await tx.commerceQuoteVersion.findFirst({
    include: { lines: true, quote: true },
    where: quoteAccessWhere(access),
  })
  if (!version) {
    throw new CommerceQuoteError(
      "PUBLIC_TOKEN_INVALID",
      "Quote is unavailable.",
    )
  }
  if (version.status === CommerceQuoteVersionStatusEnum.ACCEPTED) {
    if (version.acceptanceClientId !== input.clientAcceptanceId) {
      throw new CommerceQuoteError(
        "IDEMPOTENCY_MISMATCH",
        "Quote was already accepted with another command identity.",
      )
    }
    return { replayOrderId: version.acceptedOrderId, version }
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
  if (
    version.availabilityOutcome === CommerceQuoteAvailabilityOutcome.UNAVAILABLE
  ) {
    throw new CommerceQuoteError(
      "QUOTE_CONFLICT",
      "An unavailable Quote cannot be accepted.",
    )
  }
  return { replayOrderId: null, version }
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
