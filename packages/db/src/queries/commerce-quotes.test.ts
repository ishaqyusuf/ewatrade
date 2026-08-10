import { describe, expect, test } from "bun:test"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  assertCommerceQuoteSource,
  assertQuoteVersionAcceptable,
  assertQuotedSourceQuoteIdentity,
  getCommerceQuoteAcceptanceContext,
  issueCommerceQuote,
  normalizeIssueCommerceQuoteOptions,
  quoteLineRequiresStoreAvailability,
  resolveCommerceQuoteAccess,
  resolveCommerceQuotePayableState,
  selectCommerceQuoteOption,
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

  test("keeps a multi-option Quote non-payable until one exact option is selected", () => {
    const redLine = {
      id: "line-red",
      outcome: "INCLUDED",
      quoteOptionId: "option-red",
    }
    const blackLine = {
      id: "line-black",
      outcome: "INCLUDED",
      quoteOptionId: "option-black",
    }
    const version = {
      availabilityOutcome: "PARTIAL",
      discountMinor: 0,
      fulfilmentFeeMinor: 0,
      fulfilmentType: "UNSPECIFIED",
      lines: [],
      optionSelection: null,
      options: [
        {
          availabilityOutcome: "FULL",
          discountMinor: 0,
          fulfilmentFeeMinor: 0,
          fulfilmentType: "PICKUP",
          id: "option-red",
          lines: [redLine],
          subtotalMinor: 20_000,
          taxMinor: 0,
          totalMinor: 20_000,
        },
        {
          availabilityOutcome: "PARTIAL",
          discountMinor: 0,
          fulfilmentFeeMinor: 0,
          fulfilmentType: "PICKUP",
          id: "option-black",
          lines: [
            blackLine,
            {
              id: "black-unavailable",
              outcome: "UNAVAILABLE",
              quoteOptionId: "option-black",
            },
          ],
          subtotalMinor: 30_000,
          taxMinor: 0,
          totalMinor: 30_000,
        },
      ],
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
    }

    expect(resolveCommerceQuotePayableState(version)).toMatchObject({
      payable: null,
      requiresSelection: true,
    })
    expect(
      resolveCommerceQuotePayableState({
        ...version,
        optionSelection: { optionId: "option-black" },
      }),
    ).toMatchObject({
      payable: {
        id: "option-black",
        lines: [{ id: "line-black" }],
        totalMinor: 30_000,
      },
      requiresSelection: false,
    })
  })

  test("preserves a legacy Quote as one default payable option", () => {
    expect(
      resolveCommerceQuotePayableState({
        availabilityOutcome: "FULL",
        discountMinor: 100,
        fulfilmentFeeMinor: 500,
        fulfilmentType: "DELIVERY",
        lines: [
          { id: "line-1", outcome: "INCLUDED", quoteOptionId: null },
          { id: "line-2", outcome: "UNAVAILABLE", quoteOptionId: null },
        ],
        optionSelection: null,
        options: [],
        subtotalMinor: 20_000,
        taxMinor: 150,
        totalMinor: 20_550,
      }),
    ).toMatchObject({
      payable: {
        discountMinor: 100,
        fulfilmentFeeMinor: 500,
        id: null,
        lines: [{ id: "line-1" }],
        subtotalMinor: 20_000,
        taxMinor: 150,
        totalMinor: 20_550,
      },
      requiresSelection: false,
    })
  })

  test("normalizes a simple Quote to one default option and rejects mixed input", () => {
    expect(
      normalizeIssueCommerceQuoteOptions({
        availabilityOutcome: "full",
        clientVersionId: "version-command-1",
        lines: [{ outcome: "included" }],
      }),
    ).toMatchObject([
      {
        clientOptionId: "version-command-1:default",
        label: "Quote",
        lines: [{ outcome: "included" }],
        position: 0,
      },
    ])
    expect(() =>
      normalizeIssueCommerceQuoteOptions({
        availabilityOutcome: "full",
        clientVersionId: "version-command-1",
        lines: [{ outcome: "included" }],
        options: [
          {
            availabilityOutcome: "full",
            clientOptionId: "option-1",
            label: "Option 1",
            lines: [{ outcome: "included" }],
          },
        ],
      }),
    ).toThrow("Offer Options must own")
    expect(() =>
      normalizeIssueCommerceQuoteOptions({
        clientVersionId: "version-command-1",
        discountMinor: 0,
        options: [
          {
            availabilityOutcome: "full",
            clientOptionId: "option-1",
            label: "Option 1",
            lines: [{ outcome: "included" }],
          },
        ],
      }),
    ).toThrow("Offer Options must own")
    expect(
      normalizeIssueCommerceQuoteOptions({
        clientVersionId: "version-command-1",
        options: [
          {
            availabilityOutcome: "full",
            clientOptionId: " option-1 ",
            label: " Option 1 ",
            lines: [{ outcome: "included" }],
          },
        ],
      }),
    ).toMatchObject([
      {
        clientOptionId: "option-1",
        discountMinor: 0,
        fulfilmentFeeMinor: 0,
        fulfilmentType: "unspecified",
        label: "Option 1",
        taxMinor: 0,
      },
    ])
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
                availabilityOutcome: "FULL",
                discountMinor: 0,
                fulfilmentFeeMinor: 0,
                fulfilmentType: "UNSPECIFIED",
                id: "version-1",
                lines: [],
                optionSelection: null,
                options: [],
                quote: { currentVersionId: "version-1" },
                status: "ACCEPTED",
                subtotalMinor: 0,
                taxMinor: 0,
                totalMinor: 0,
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
                discountMinor: 0,
                expiresAt: null,
                fulfilmentFeeMinor: 0,
                fulfilmentType: "UNSPECIFIED",
                id: "version-1",
                lines: [],
                optionSelection: null,
                options: [],
                quote: { currentVersionId: "version-1" },
                status: "ISSUED",
                subtotalMinor: 0,
                taxMinor: 0,
                totalMinor: 0,
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

  test("prepares privately and releases the exact Quote Version before source effects", async () => {
    const events: string[] = []
    const offering = {
      catalogItem: { name: "Consultation" },
      id: "offering-1",
      kind: "SERVICE",
      name: "Standard consultation",
      productUnitOffering: null,
      serviceOffering: { quantityScale: 2 },
      status: "ACTIVE",
      storeAvailability: [{ isAvailable: true }],
      variant: { name: "Default", selections: [] },
    }
    const client = {
      $transaction: async (callback: (tx: PrismaClient) => Promise<unknown>) =>
        callback(client as unknown as PrismaClient),
      commerceQuote: {
        updateMany: async (input: { data: { currentVersionId: string } }) => {
          events.push(`quote:current:${input.data.currentVersionId}`)
          return { count: 1 }
        },
        upsert: async () => ({
          clientQuoteId: "quote-command-1",
          currentVersionId: null,
          id: "quote-1",
          sourceId: "request-1",
          sourceType: "SERVICE_REQUEST",
          storeId: "store-1",
        }),
      },
      commerceQuoteLine: {
        createMany: async () => {
          events.push("lines:create")
        },
      },
      commerceQuoteOption: {
        create: async () => {
          events.push("option:create")
          return { id: "option-1" }
        },
      },
      commerceQuoteVersion: {
        aggregate: async () => ({ _max: { version: null } }),
        create: async (input: {
          data: { acceptanceTokenDigest: null | string; status: string }
        }) => {
          events.push(
            `version:create:${input.data.status}:${input.data.acceptanceTokenDigest ?? "no-token"}`,
          )
          return { ...input.data, id: "version-1", version: 1 }
        },
        findUnique: async () => null,
        updateMany: async (input: {
          data: { status: string }
          where: { id: string }
        }) => {
          events.push(`version:release:${input.data.status}:${input.where.id}`)
          return { count: 1 }
        },
      },
      sellableOffering: {
        findFirst: async () => ({ status: "ACTIVE" }),
        findMany: async () => [offering],
      },
      serviceRequest: {
        findFirst: async () => ({ status: "SUBMITTED" }),
        updateMany: async () => {
          events.push("source:quoted")
          return { count: 1 }
        },
      },
      serviceRequestLine: {
        findMany: async () => [
          { id: "request-line-1", offeringId: "offering-1" },
        ],
      },
      store: {
        findFirst: async () => ({ currencyCode: "NGN", id: "store-1" }),
      },
    } as unknown as PrismaClient

    await expect(
      issueCommerceQuote(client, {
        actorUserId: "actor-1",
        availabilityOutcome: "full",
        clientQuoteId: "quote-command-1",
        clientVersionId: "quote-version-command-1",
        lines: [
          {
            offeringId: "offering-1",
            outcome: "included",
            quantity: "1",
            unitPriceMinor: 7_500,
          },
        ],
        sourceId: "request-1",
        sourceType: "service_request",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toMatchObject({
      quoteId: "quote-1",
      versionId: "version-1",
    })
    expect(events).toEqual([
      "version:create:DRAFT:no-token",
      "option:create",
      "lines:create",
      "version:release:ISSUED:version-1",
      "quote:current:version-1",
      "source:quoted",
    ])
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

  test("selects one current option idempotently inside the Quote transaction", async () => {
    type Selection = {
      clientSelectionId: string
      optionId: string
      payloadHash: string
      quoteVersionId: string
    }
    let selection: null | Selection = null
    let simulateConcurrentWinner = true
    let authorized = 0
    const version = () => ({
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      id: "version-1",
      optionSelection: selection,
      options: [
        {
          availabilityOutcome: "FULL",
          id: "option-red",
          lines: [
            {
              availabilityAttestationId: null,
              balanceRevision: null,
              configurationVersionId: null,
              offeringId: "offering-red",
              quantity: { toString: () => "1" },
            },
          ],
          quoteVersionId: "version-1",
        },
        {
          availabilityOutcome: "FULL",
          id: "option-black",
          lines: [],
          quoteVersionId: "version-1",
        },
      ],
      quote: {
        currentVersionId: "version-1",
        sourceId: "request-1",
        sourceType: "SERVICE_REQUEST",
        storeId: "store-1",
        tenantId: "tenant-1",
      },
      status: "ISSUED",
    })
    let accessRead = true
    const client = {
      $transaction: async (
        callback: (tx: PrismaClient) => Promise<unknown>,
      ) => {
        accessRead = true
        return callback(client as unknown as PrismaClient)
      },
      commerceQuoteOptionSelection: {
        create: async (input: { data: Selection }) => {
          selection = input.data
          if (simulateConcurrentWinner) {
            simulateConcurrentWinner = false
            throw new Prisma.PrismaClientKnownRequestError(
              "Concurrent selection won.",
              { clientVersion: "test", code: "P2002" },
            )
          }
          return input.data
        },
      },
      commerceQuoteVersion: {
        findFirst: async () => {
          if (accessRead) {
            accessRead = false
            return { id: "version-1" }
          }
          return version()
        },
      },
      sellableOffering: {
        findFirst: async () => ({
          kind: "SERVICE",
          status: "DRAFT",
          storeAvailability: [],
        }),
      },
    } as unknown as PrismaClient
    const command = {
      acceptanceToken: "opaque-token",
      authorize: async () => {
        authorized += 1
      },
      clientSelectionId: " selection-command-1 ",
      optionId: " option-red ",
    }

    await expect(selectCommerceQuoteOption(client, command)).resolves.toEqual({
      optionId: "option-red",
      versionId: "version-1",
    })
    await expect(selectCommerceQuoteOption(client, command)).resolves.toEqual({
      optionId: "option-red",
      versionId: "version-1",
    })
    expect(authorized).toBe(3)
    await expect(
      selectCommerceQuoteOption(client, {
        ...command,
        optionId: "option-black",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  })
})
