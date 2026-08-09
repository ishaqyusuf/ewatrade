import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CommerceQuoteAvailabilityOutcome,
  CommerceQuoteFulfilmentType,
  CommerceQuoteLineOutcome,
  CommerceQuoteSourceType,
  CommerceQuoteVersionStatus,
} from "../../generated/prisma/enums"

export function validateLegacyServiceQuoteCandidate(input: {
  quoteId: string
  requestId: string | null
  versionCount: number
}) {
  if (!input.requestId) {
    throw new Error(
      `Legacy Service Quote ${input.quoteId} has no Service Request source.`,
    )
  }
  if (input.versionCount < 1) {
    throw new Error(
      `Legacy Service Quote ${input.quoteId} has no version history.`,
    )
  }
}

function mapStatus(status: string) {
  const mapped =
    CommerceQuoteVersionStatus[
      status as keyof typeof CommerceQuoteVersionStatus
    ]
  if (!mapped) throw new Error(`Unsupported legacy Quote status: ${status}.`)
  return mapped
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
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

type LegacyQuoteGraph = Prisma.ServiceQuoteGetPayload<{
  include: {
    versions: { include: { lines: true } }
  }
}>

type CommerceQuoteGraph = Prisma.CommerceQuoteGetPayload<{
  include: {
    currentVersion: { select: { clientVersionId: true } }
    versions: { include: { lines: true } }
  }
}>

function canonicalLegacyLine(
  line: LegacyQuoteGraph["versions"][number]["lines"][number],
) {
  return {
    balanceRevision: null,
    catalogItemName: line.catalogItemName,
    configurationVersionId: null,
    createdAt: line.createdAt,
    customerNote: null,
    offeringId: line.offeringId,
    offeringName: line.offeringName,
    optionSelections: line.optionSelections,
    outcome: CommerceQuoteLineOutcome.INCLUDED,
    quantity: line.quantity.toString(),
    sourceLineId: null,
    totalMinor: line.totalMinor,
    unitPriceMinor: line.unitPriceMinor,
    variantName: line.variantName,
  }
}

function canonicalCommerceLine(
  line: CommerceQuoteGraph["versions"][number]["lines"][number],
) {
  return {
    balanceRevision: line.balanceRevision,
    catalogItemName: line.catalogItemName,
    configurationVersionId: line.configurationVersionId,
    createdAt: line.createdAt,
    customerNote: line.customerNote,
    offeringId: line.offeringId,
    offeringName: line.offeringName,
    optionSelections: line.optionSelections,
    outcome: line.outcome,
    quantity: line.quantity?.toString() ?? null,
    sourceLineId: line.sourceLineId,
    totalMinor: line.totalMinor,
    unitPriceMinor: line.unitPriceMinor,
    variantName: line.variantName,
  }
}

export function validateExistingCommerceQuoteMatchesLegacy(
  legacy: LegacyQuoteGraph,
  existing: CommerceQuoteGraph,
) {
  const legacyCurrentVersion = legacy.currentVersionId
    ? legacy.versions.find((version) => version.id === legacy.currentVersionId)
    : null
  if (legacy.currentVersionId && !legacyCurrentVersion) {
    throw new Error(
      `Legacy Service Quote ${legacy.id} points to a missing current version.`,
    )
  }
  const expected = {
    clientQuoteId: legacy.clientQuoteId,
    createdAt: legacy.createdAt,
    createdByUserId: legacy.createdByUserId,
    currentVersionClientId: legacyCurrentVersion?.clientVersionId ?? null,
    sourceId: legacy.requestId,
    sourceType: CommerceQuoteSourceType.SERVICE_REQUEST,
    storeId: legacy.storeId,
    tenantId: legacy.tenantId,
    versions: legacy.versions.map((version) => ({
      acceptanceClientId: version.acceptanceClientId,
      acceptanceTokenDigest: version.acceptanceTokenDigest,
      acceptedAt: version.acceptedAt,
      acceptedOrderId: version.acceptedOrderId,
      availabilityOutcome: CommerceQuoteAvailabilityOutcome.FULL,
      clientVersionId: version.clientVersionId,
      createdAt: version.createdAt,
      createdByUserId: version.createdByUserId,
      currencyCode: version.currencyCode,
      customerNote: null,
      declinedAt: null,
      discountMinor: version.discountMinor,
      expiresAt: version.expiresAt,
      fulfilmentFeeMinor: 0,
      fulfilmentPromise: null,
      fulfilmentType: CommerceQuoteFulfilmentType.UNSPECIFIED,
      issuedAt: version.issuedAt,
      lines: version.lines
        .map(canonicalLegacyLine)
        .sort((left, right) =>
          stableJson(left).localeCompare(stableJson(right)),
        ),
      payloadHash: version.payloadHash,
      revokedAt: null,
      status: mapStatus(version.status),
      subtotalMinor: version.subtotalMinor,
      supersededAt: version.supersededAt,
      taxMinor: version.taxMinor,
      totalMinor: version.totalMinor,
      version: version.version,
    })),
  }
  const actual = {
    clientQuoteId: existing.clientQuoteId,
    createdAt: existing.createdAt,
    createdByUserId: existing.createdByUserId,
    currentVersionClientId: existing.currentVersion?.clientVersionId ?? null,
    sourceId: existing.sourceId,
    sourceType: existing.sourceType,
    storeId: existing.storeId,
    tenantId: existing.tenantId,
    versions: existing.versions.map((version) => ({
      acceptanceClientId: version.acceptanceClientId,
      acceptanceTokenDigest: version.acceptanceTokenDigest,
      acceptedAt: version.acceptedAt,
      acceptedOrderId: version.acceptedOrderId,
      availabilityOutcome: version.availabilityOutcome,
      clientVersionId: version.clientVersionId,
      createdAt: version.createdAt,
      createdByUserId: version.createdByUserId,
      currencyCode: version.currencyCode,
      customerNote: version.customerNote,
      declinedAt: version.declinedAt,
      discountMinor: version.discountMinor,
      expiresAt: version.expiresAt,
      fulfilmentFeeMinor: version.fulfilmentFeeMinor,
      fulfilmentPromise: version.fulfilmentPromise,
      fulfilmentType: version.fulfilmentType,
      issuedAt: version.issuedAt,
      lines: version.lines
        .map(canonicalCommerceLine)
        .sort((left, right) =>
          stableJson(left).localeCompare(stableJson(right)),
        ),
      payloadHash: version.payloadHash,
      revokedAt: version.revokedAt,
      status: version.status,
      subtotalMinor: version.subtotalMinor,
      supersededAt: version.supersededAt,
      taxMinor: version.taxMinor,
      totalMinor: version.totalMinor,
      version: version.version,
    })),
  }
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `Commerce Quote ${existing.id} does not match legacy Quote ${legacy.id}.`,
    )
  }
}

export async function backfillServiceQuotesToCommerce(db: PrismaClient) {
  const legacyQuotes = await db.serviceQuote.findMany({
    include: {
      versions: {
        include: { lines: true },
        orderBy: { version: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  })
  let migrated = 0
  let alreadyMigrated = 0

  for (const legacy of legacyQuotes) {
    validateLegacyServiceQuoteCandidate({
      quoteId: legacy.id,
      requestId: legacy.requestId,
      versionCount: legacy.versions.length,
    })
    const requestId = legacy.requestId
    if (!requestId) {
      throw new Error(
        `Legacy Service Quote ${legacy.id} has no request source.`,
      )
    }
    const existing = await db.commerceQuote.findUnique({
      include: {
        currentVersion: { select: { clientVersionId: true } },
        versions: {
          include: { lines: true },
          orderBy: { version: "asc" },
        },
      },
      where: {
        tenantId_sourceType_sourceId: {
          sourceId: requestId,
          sourceType: CommerceQuoteSourceType.SERVICE_REQUEST,
          tenantId: legacy.tenantId,
        },
      },
    })
    if (existing) {
      validateExistingCommerceQuoteMatchesLegacy(legacy, existing)
      alreadyMigrated += 1
      continue
    }

    await db.$transaction(async (tx) => {
      const quote = await tx.commerceQuote.create({
        data: {
          clientQuoteId: legacy.clientQuoteId,
          createdAt: legacy.createdAt,
          createdByUserId: legacy.createdByUserId,
          sourceId: requestId,
          sourceType: CommerceQuoteSourceType.SERVICE_REQUEST,
          storeId: legacy.storeId,
          tenantId: legacy.tenantId,
          updatedAt: legacy.updatedAt,
        },
      })
      const versionIds = new Map<string, string>()
      for (const legacyVersion of legacy.versions) {
        const version = await tx.commerceQuoteVersion.create({
          data: {
            acceptanceClientId: legacyVersion.acceptanceClientId,
            acceptanceTokenDigest: legacyVersion.acceptanceTokenDigest,
            acceptedAt: legacyVersion.acceptedAt,
            acceptedOrderId: legacyVersion.acceptedOrderId,
            availabilityOutcome: CommerceQuoteAvailabilityOutcome.FULL,
            clientVersionId: legacyVersion.clientVersionId,
            createdAt: legacyVersion.createdAt,
            createdByUserId: legacyVersion.createdByUserId,
            currencyCode: legacyVersion.currencyCode,
            discountMinor: legacyVersion.discountMinor,
            expiresAt: legacyVersion.expiresAt,
            fulfilmentFeeMinor: 0,
            fulfilmentType: CommerceQuoteFulfilmentType.UNSPECIFIED,
            issuedAt: legacyVersion.issuedAt,
            payloadHash: legacyVersion.payloadHash,
            quoteId: quote.id,
            status: mapStatus(legacyVersion.status),
            subtotalMinor: legacyVersion.subtotalMinor,
            supersededAt: legacyVersion.supersededAt,
            taxMinor: legacyVersion.taxMinor,
            totalMinor: legacyVersion.totalMinor,
            version: legacyVersion.version,
          },
        })
        versionIds.set(legacyVersion.id, version.id)
        await tx.commerceQuoteLine.createMany({
          data: legacyVersion.lines.map((line) => ({
            catalogItemName: line.catalogItemName,
            createdAt: line.createdAt,
            offeringId: line.offeringId,
            offeringName: line.offeringName,
            optionSelections: json(line.optionSelections),
            outcome: CommerceQuoteLineOutcome.INCLUDED,
            quantity: line.quantity,
            quoteVersionId: version.id,
            totalMinor: line.totalMinor,
            unitPriceMinor: line.unitPriceMinor,
            variantName: line.variantName,
          })),
        })
      }
      if (legacy.currentVersionId) {
        const currentVersionId = versionIds.get(legacy.currentVersionId)
        if (!currentVersionId) {
          throw new Error(
            `Legacy Service Quote ${legacy.id} points to a missing current version.`,
          )
        }
        await tx.commerceQuote.update({
          data: { currentVersionId },
          where: { id: quote.id },
        })
      }
    })
    migrated += 1
  }

  const legacyCount = legacyQuotes.length
  const commerceCount = await db.commerceQuote.count({
    where: { sourceType: CommerceQuoteSourceType.SERVICE_REQUEST },
  })
  if (commerceCount < legacyCount) {
    throw new Error(
      `Service Quote backfill validation failed: ${legacyCount} legacy and ${commerceCount} Commerce Quotes.`,
    )
  }
  return { alreadyMigrated, commerceCount, legacyCount, migrated }
}
