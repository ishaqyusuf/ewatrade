import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  assertCommerceQuoteSource,
  assertQuoteVersionAcceptable,
  getCommerceQuoteAcceptanceContext,
  resolveCommerceQuoteAccess,
} from "./commerce-quotes"

describe("Commerce Quote invariants", () => {
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

  test("resolves a WhatsApp Quote capability by digest without storing its bearer token", async () => {
    const rawToken = "opaque-quick-action-token"
    const db = {
      commerceQuoteVersion: {
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
})
