import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  backfillServiceQuotesToCommerce,
  validateLegacyServiceQuoteCandidate,
} from "./service-quotes-to-commerce"

describe("legacy Service Quote backfill", () => {
  test("requires an exact typed source and complete version history", () => {
    expect(() =>
      validateLegacyServiceQuoteCandidate({
        quoteId: "quote-1",
        requestId: null,
        versionCount: 1,
      }),
    ).toThrow("has no Service Request source")
    expect(() =>
      validateLegacyServiceQuoteCandidate({
        quoteId: "quote-1",
        requestId: "request-1",
        versionCount: 0,
      }),
    ).toThrow("has no version history")
    expect(() =>
      validateLegacyServiceQuoteCandidate({
        quoteId: "quote-1",
        requestId: "request-1",
        versionCount: 1,
      }),
    ).not.toThrow()
  })

  test("preserves immutable versions, lines, current version, and accepted Order links", async () => {
    const versionCreates: Array<{ data: Record<string, unknown> }> = []
    const lineCreates: Array<{ data: Array<Record<string, unknown>> }> = []
    const quoteUpdates: unknown[] = []
    const createdAt = new Date("2026-08-01T10:00:00.000Z")
    const legacy = {
      clientQuoteId: "legacy-client-quote",
      createdAt,
      createdByUserId: "user-1",
      currentVersionId: "legacy-version-2",
      id: "legacy-quote-1",
      requestId: "service-request-1",
      storeId: "store-1",
      tenantId: "tenant-1",
      updatedAt: createdAt,
      versions: [
        {
          acceptanceClientId: null,
          acceptanceTokenDigest: "digest-1",
          acceptedAt: null,
          acceptedOrderId: null,
          clientVersionId: "client-version-1",
          createdAt,
          createdByUserId: "user-1",
          currencyCode: "NGN",
          discountMinor: 0,
          expiresAt: null,
          id: "legacy-version-1",
          issuedAt: createdAt,
          lines: [
            {
              catalogItemName: "Laundry",
              createdAt,
              offeringId: "offering-1",
              offeringName: "Standard",
              optionSelections: [],
              quantity: "1",
              totalMinor: 2_000,
              unitPriceMinor: 2_000,
              variantName: "Shirt",
            },
          ],
          payloadHash: "payload-1",
          status: "SUPERSEDED",
          subtotalMinor: 2_000,
          supersededAt: createdAt,
          taxMinor: 0,
          totalMinor: 2_000,
          version: 1,
        },
        {
          acceptanceClientId: "acceptance-1",
          acceptanceTokenDigest: "digest-2",
          acceptedAt: createdAt,
          acceptedOrderId: "order-1",
          clientVersionId: "client-version-2",
          createdAt,
          createdByUserId: "user-1",
          currencyCode: "NGN",
          discountMinor: 0,
          expiresAt: null,
          id: "legacy-version-2",
          issuedAt: createdAt,
          lines: [
            {
              catalogItemName: "Laundry",
              createdAt,
              offeringId: "offering-1",
              offeringName: "Express",
              optionSelections: [],
              quantity: "1",
              totalMinor: 2_500,
              unitPriceMinor: 2_500,
              variantName: "Shirt",
            },
          ],
          payloadHash: "payload-2",
          status: "ACCEPTED",
          subtotalMinor: 2_500,
          supersededAt: null,
          taxMinor: 0,
          totalMinor: 2_500,
          version: 2,
        },
      ],
    }
    const transaction = {
      commerceQuote: {
        create: async () => ({ id: "commerce-quote-1" }),
        update: async (input: unknown) => {
          quoteUpdates.push(input)
          return input
        },
      },
      commerceQuoteLine: {
        createMany: async (input: { data: Array<Record<string, unknown>> }) => {
          lineCreates.push(input)
          return { count: input.data.length }
        },
      },
      commerceQuoteVersion: {
        create: async (input: { data: Record<string, unknown> }) => {
          versionCreates.push(input)
          return {
            id: `commerce-version-${versionCreates.length}`,
          }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      commerceQuote: {
        count: async () => 1,
        findUnique: async () => null,
      },
      serviceQuote: { findMany: async () => [legacy] },
    } as unknown as PrismaClient

    await expect(backfillServiceQuotesToCommerce(db)).resolves.toEqual({
      alreadyMigrated: 0,
      commerceCount: 1,
      legacyCount: 1,
      migrated: 1,
    })
    expect(versionCreates).toHaveLength(2)
    expect(versionCreates[1]?.data).toMatchObject({
      acceptanceClientId: "acceptance-1",
      acceptanceTokenDigest: "digest-2",
      acceptedOrderId: "order-1",
      clientVersionId: "client-version-2",
      quoteId: "commerce-quote-1",
      status: "ACCEPTED",
      version: 2,
    })
    expect(lineCreates[1]?.data[0]).toMatchObject({
      offeringId: "offering-1",
      quoteVersionId: "commerce-version-2",
      totalMinor: 2_500,
    })
    expect(quoteUpdates).toEqual([
      {
        data: { currentVersionId: "commerce-version-2" },
        where: { id: "commerce-quote-1" },
      },
    ])
  })

  function replayFixture() {
    const createdAt = new Date("2026-08-01T10:00:00.000Z")
    const line = {
      catalogItemName: "Laundry",
      createdAt,
      offeringId: "offering-1",
      offeringName: "Standard",
      optionSelections: [],
      quantity: "1",
      totalMinor: 2_000,
      unitPriceMinor: 2_000,
      variantName: "Shirt",
    }
    const legacyVersion = {
      acceptanceClientId: null,
      acceptanceTokenDigest: "digest-1",
      acceptedAt: null,
      acceptedOrderId: null,
      clientVersionId: "client-version-1",
      createdAt,
      createdByUserId: "user-1",
      currencyCode: "NGN",
      discountMinor: 0,
      expiresAt: null,
      id: "legacy-version-1",
      issuedAt: createdAt,
      lines: [line],
      payloadHash: "payload-1",
      status: "ISSUED",
      subtotalMinor: 2_000,
      supersededAt: null,
      taxMinor: 0,
      totalMinor: 2_000,
      version: 1,
    }
    const legacy = {
      clientQuoteId: "legacy-client-quote",
      createdAt,
      createdByUserId: "user-1",
      currentVersionId: legacyVersion.id,
      id: "legacy-quote-1",
      requestId: "service-request-1",
      storeId: "store-1",
      tenantId: "tenant-1",
      updatedAt: createdAt,
      versions: [legacyVersion],
    }
    const existing = {
      clientQuoteId: legacy.clientQuoteId,
      createdAt,
      createdByUserId: legacy.createdByUserId,
      currentVersion: { clientVersionId: legacyVersion.clientVersionId },
      id: "commerce-quote-1",
      sourceId: legacy.requestId,
      sourceType: "SERVICE_REQUEST",
      storeId: legacy.storeId,
      tenantId: legacy.tenantId,
      versions: [
        {
          ...legacyVersion,
          availabilityOutcome: "FULL",
          customerNote: null,
          declinedAt: null,
          fulfilmentFeeMinor: 0,
          fulfilmentPromise: null,
          fulfilmentType: "UNSPECIFIED",
          id: "commerce-version-1",
          lines: [
            {
              ...line,
              balanceRevision: null,
              configurationVersionId: null,
              customerNote: null,
              outcome: "INCLUDED",
              sourceLineId: null,
            },
          ],
          quoteId: "commerce-quote-1",
          revokedAt: null,
        },
      ],
    }
    return { existing, legacy }
  }

  test("reconciles a complete matching Commerce graph before treating replay as migrated", async () => {
    const { existing, legacy } = replayFixture()
    const db = {
      commerceQuote: {
        count: async () => 1,
        findUnique: async () => existing,
      },
      serviceQuote: { findMany: async () => [legacy] },
    } as unknown as PrismaClient

    await expect(backfillServiceQuotesToCommerce(db)).resolves.toEqual({
      alreadyMigrated: 1,
      commerceCount: 1,
      legacyCount: 1,
      migrated: 0,
    })
  })

  test("rejects a same-count Commerce graph with corrupted history", async () => {
    const { existing, legacy } = replayFixture()
    const [existingVersion] = existing.versions
    if (!existingVersion) throw new Error("Replay fixture has no version.")
    existingVersion.totalMinor = 1_999
    const db = {
      commerceQuote: {
        count: async () => 1,
        findUnique: async () => existing,
      },
      serviceQuote: { findMany: async () => [legacy] },
    } as unknown as PrismaClient

    await expect(backfillServiceQuotesToCommerce(db)).rejects.toThrow(
      "does not match legacy Quote",
    )
  })
})
