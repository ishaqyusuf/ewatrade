import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  assertCommerceQuoteSource,
  assertQuoteVersionAcceptable,
  assertQuotedSourceQuoteIdentity,
  getCommerceQuoteAcceptanceContext,
  issueCommerceQuote,
  quoteLineRequiresStoreAvailability,
  resolveCommerceQuoteAccess,
} from "./commerce-quotes"

describe("Commerce Quote invariants", () => {
  test("lets only source-verified private Service drafts bypass Product availability", () => {
    expect(
      quoteLineRequiresStoreAvailability({
        catalogSourceVerified: true,
        kind: "SERVICE",
        status: "DRAFT",
        usesManualAttestation: false,
      }),
    ).toBe(false)
    expect(
      quoteLineRequiresStoreAvailability({
        catalogSourceVerified: true,
        kind: "PRODUCT_UNIT",
        status: "DRAFT",
        usesManualAttestation: false,
      }),
    ).toBe(true)
    expect(
      quoteLineRequiresStoreAvailability({
        catalogSourceVerified: false,
        kind: "SERVICE",
        status: "DRAFT",
        usesManualAttestation: false,
      }),
    ).toBe(true)
  })

  test("requires exactly one typed source", () => {
    expect(
      assertCommerceQuoteSource({
        sourceId: "service_request_1",
        sourceType: "service_request",
      }),
    ).toEqual({ sourceId: "service_request_1", sourceType: "service_request" })
    expect(() =>
      assertCommerceQuoteSource({
        sourceId: "",
        sourceType: "service_request",
      }),
    ).toThrow("Quote source is required")
    expect(
      assertCommerceQuoteSource({
        sourceId: "inquiry_1",
        sourceType: "commerce_inquiry",
      }),
    ).toEqual({ sourceId: "inquiry_1", sourceType: "commerce_inquiry" })
  })

  test("accepts only the current issued unexpired version", () => {
    const now = new Date("2026-08-08T12:00:00.000Z")
    expect(() =>
      assertQuoteVersionAcceptable({
        currentVersionId: "version_1",
        expiresAt: new Date("2026-08-08T12:01:00.000Z"),
        now,
        status: "issued",
        versionId: "version_1",
      }),
    ).not.toThrow()
    expect(() =>
      assertQuoteVersionAcceptable({
        currentVersionId: "version_2",
        expiresAt: null,
        now,
        status: "issued",
        versionId: "version_1",
      }),
    ).toThrow("Only the current unexpired Quote Version can be accepted")
    expect(() =>
      assertQuoteVersionAcceptable({
        currentVersionId: "version_1",
        expiresAt: new Date("2026-08-08T11:59:59.000Z"),
        now,
        status: "issued",
        versionId: "version_1",
      }),
    ).toThrow("Only the current unexpired Quote Version can be accepted")

    for (const status of [
      "accepted",
      "declined",
      "draft",
      "expired",
      "revoked",
      "superseded",
    ] as const) {
      expect(() =>
        assertQuoteVersionAcceptable({
          currentVersionId: "version_1",
          expiresAt: null,
          now,
          status,
          versionId: "version_1",
        }),
      ).toThrow("Only the current unexpired Quote Version can be accepted")
    }
  })

  test("binds an already-quoted Inquiry to its original Quote identity", () => {
    expect(() =>
      assertQuotedSourceQuoteIdentity({
        alreadyQuoted: true,
        bindToExistingQuote: true,
        existingClientQuoteId: "quote-command-1",
        requestedClientQuoteId: "quote-command-1",
      }),
    ).not.toThrow()
    expect(() =>
      assertQuotedSourceQuoteIdentity({
        alreadyQuoted: true,
        bindToExistingQuote: true,
        existingClientQuoteId: "quote-command-1",
        requestedClientQuoteId: "different-quote-command",
      }),
    ).toThrow("already bound to another Quote command identity")
  })

  test("replays only the original acceptance command identity", async () => {
    let reads = 0
    const db = {
      commerceQuoteVersion: {
        findFirst: async () => {
          reads += 1
          return reads === 1
            ? { id: "version-1" }
            : {
                acceptanceClientId: "acceptance-1",
                acceptedOrderId: "order-1",
                id: "version-1",
                quote: { currentVersionId: "version-1" },
                status: "ACCEPTED",
              }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getCommerceQuoteAcceptanceContext(db, {
        acceptanceToken: "opaque-token",
        clientAcceptanceId: "acceptance-1",
      }),
    ).resolves.toMatchObject({ replayOrderId: "order-1" })
    reads = 0
    await expect(
      getCommerceQuoteAcceptanceContext(db, {
        acceptanceToken: "opaque-token",
        clientAcceptanceId: "different-acceptance",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  })

  test("prevents an unavailable current Quote from creating an Order", async () => {
    let reads = 0
    const db = {
      commerceQuoteVersion: {
        findFirst: async () => {
          reads += 1
          return reads === 1
            ? { id: "version-1" }
            : {
                availabilityOutcome: "UNAVAILABLE",
                expiresAt: null,
                id: "version-1",
                quote: { currentVersionId: "version-1" },
                status: "ISSUED",
              }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getCommerceQuoteAcceptanceContext(db, {
        acceptanceToken: "opaque-token",
        clientAcceptanceId: "acceptance-1",
      }),
    ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
  })

  test("runs a source authorization callback inside the Quote transaction", async () => {
    let inTransaction = false
    let authorized = false
    const client = {
      $transaction: async (
        callback: (tx: PrismaClient) => Promise<unknown>,
      ) => {
        inTransaction = true
        try {
          return await callback(client as unknown as PrismaClient)
        } finally {
          inTransaction = false
        }
      },
      store: { findFirst: async () => null },
    } as unknown as PrismaClient

    await expect(
      issueCommerceQuote(client, {
        actorUserId: "actor-1",
        authorize: async () => {
          expect(inTransaction).toBe(true)
          authorized = true
        },
        availabilityOutcome: "unavailable",
        clientQuoteId: "quote-command-1",
        clientVersionId: "quote-version-command-1",
        lines: [{ outcome: "unavailable", sourceLineId: "source-line-1" }],
        sourceId: "inquiry-1",
        sourceType: "commerce_inquiry",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
    expect(authorized).toBe(true)
  })

  test("resolves a WhatsApp Quote capability by digest without storing its bearer token", async () => {
    const rawToken = "opaque-quick-action-token"
    const db = {
      commerceQuoteVersion: {
        findFirst: async () => null,
      },
      commerceQuoteReplayAccessToken: {
        findFirst: async () => null,
      },
      prescriptionQuickAction: {
        findFirst: async (input: {
          where: {
            entityType: string
            expiresAt: { gt: Date }
            tokenDigest: string
          }
        }) => {
          expect(input.where.entityType).toBe("quote_version")
          expect(input.where.expiresAt.gt).toBeInstanceOf(Date)
          expect(input.where.tokenDigest).not.toBe(rawToken)
          return {
            entityId: "quote-version-1",
            storeId: "store-1",
            tenantId: "tenant-1",
          }
        },
      },
    } as unknown as PrismaClient

    const access = await resolveCommerceQuoteAccess(db, {
      acceptanceToken: rawToken,
    })
    expect(access).toEqual({
      storeId: "store-1",
      tenantId: "tenant-1",
      versionId: "quote-version-1",
    })
  })

  test("resolves a rotatable replay token without invalidating the original Quote token", async () => {
    const db = {
      commerceQuoteReplayAccessToken: {
        findFirst: async () => ({
          storeId: "store-1",
          tenantId: "tenant-1",
          versionId: "version-1",
        }),
      },
      commerceQuoteVersion: { findFirst: async () => null },
    } as unknown as PrismaClient

    await expect(
      resolveCommerceQuoteAccess(db, { acceptanceToken: "replayed-token" }),
    ).resolves.toEqual({
      storeId: "store-1",
      tenantId: "tenant-1",
      versionId: "version-1",
    })
  })
})
