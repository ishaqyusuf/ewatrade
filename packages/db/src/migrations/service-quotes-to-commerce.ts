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
      where: {
        tenantId_sourceType_sourceId: {
          sourceId: requestId,
          sourceType: CommerceQuoteSourceType.SERVICE_REQUEST,
          tenantId: legacy.tenantId,
        },
      },
    })
    if (existing) {
      const versionCount = await db.commerceQuoteVersion.count({
        where: { quoteId: existing.id },
      })
      if (versionCount !== legacy.versions.length) {
        throw new Error(
          `Commerce Quote ${existing.id} does not match legacy version history.`,
        )
      }
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
