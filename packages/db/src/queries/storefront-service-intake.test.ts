import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  getStorefrontServiceIntake,
  submitStorefrontServiceRequest,
} from "./storefront-service-intake"
import { siteContentHash } from "./storefront-sites"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const host = "sample-crafts.ewatrade.com"
const input = {
  clientRequestId: "c090da8c-782a-4da6-8d4f-0b067037598a",
  formId: "form-1",
  itemId: "item-1",
  offeringId: "offering-1",
  quantity: "2",
  customerName: "Demo Customer",
  customerPhone: "08030000000",
  details: "Please clean the handles.",
}

function fixture(second = false, quote = false) {
  const committedLines: Record<string, unknown>[] = []
  let pendingLines: Record<string, unknown>[] = []
  let published = true
  let inTransaction = false
  let beforeWrite: (() => void) | undefined
  let persisted: Record<string, unknown> | null = null
  let pending: Record<string, unknown> | null = null
  const offering = {
    id: "offering-1",
    catalogItemId: "item-1",
    name: "Deep clean",
    fixedPriceMinor: 500000,
    currencyCode: "NGN",
    pricingPolicy: "FIXED",
    status: "ACTIVE",
    serviceOffering: { quantityScale: 0, guidance: null },
    storeAvailability: [{ storeId: "store-1", isAvailable: true }],
    variant: {
      id: "variant-1",
      name: "Deep clean",
      isDefault: true,
      selections: [],
      stockBalanceSources: [],
    },
    catalogItem: { name: "Leather Bag Cleaning" },
  }
  const offerings = [
    offering,
    ...(second
      ? [
          {
            ...offering,
            id: "offering-2",
            name: "Iron only",
            fixedPriceMinor: quote ? null : 250000,
            pricingPolicy: quote ? "QUOTE_REQUIRED" : "FIXED",
            variant: {
              ...offering.variant,
              id: "variant-2",
              name: "Iron only",
            },
          },
        ]
      : []),
  ]
  const form = {
    id: "form-1",
    label: "Service request",
    storeId: "store-1",
    tenantId: "tenant-1",
    store: { name: "Main Store", currencyCode: "NGN" },
    offerings: offerings.map((offering) => ({
      offeringId: offering.id,
      offering,
    })),
  }
  const db = {
    tenant: {
      findFirst: async ({ where }: { where: { slug: string } }) =>
        where.slug === "sample-crafts"
          ? {
              id: "tenant-1",
              name: "Sample Crafts",
              slug: "sample-crafts",
              dataClassification: "LIVE",
              metadata: { retailOpsPlanId: "growth" },
              subscription: {
                plan: { key: "growth" },
                provider: "MANUAL",
                status: "ACTIVE",
                billingSubscriptionId: null,
                currentPeriodEndsAt: null,
              },
              stores: [
                {
                  id: "store-1",
                  name: "Main Store",
                  currencyCode: "NGN",
                  countryCode: "NG",
                  description: null,
                  supportPhone: null,
                },
              ],
            }
          : null,
    },
    site: {
      findMany: async () =>
        published
          ? [
              {
                id: "site-1",
                storeId: "store-1",
                tenantId: "tenant-1",
                status: "PUBLISHED",
                store: { status: "ACTIVE" },
                activeRelease: {
                  id: "release-1",
                  siteId: "site-1",
                  storeId: "store-1",
                  tenantId: "tenant-1",
                  composition: {},
                  contentHash: siteContentHash({}),
                },
              },
            ]
          : [],
    },
    catalogItem: {
      findMany: async () => [
        {
          id: "item-1",
          name: "Leather Bag Cleaning",
          kind: "SERVICE",
          description: null,
          categoryRecord: null,
          illustrations: [],
          offerings,
        },
      ],
      findFirst: async () => null,
    },
    catalogCategory: { findMany: async () => [] },
    stockBalanceSource: { groupBy: async () => [] },
    serviceRequestForm: { findFirst: async () => form },
    serviceRequest: {
      findFirst: async ({ where }: { where: { id?: string } }) =>
        where.id ? (pending ?? persisted) : persisted,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        pending = { ...data, id: "request-1", revision: 1 }
        return pending
      },
    },
    serviceRequestLine: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        pendingLines.push(data)
        return { id: `line-${pendingLines.length}` }
      },
    },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
    serviceCommercePolicyDecision: {
      findMany: async () => allowedServiceCommercePolicyDecisionRows(),
    },
    serviceCommercePolicyAuditEvent: { createMany: async () => ({ count: 1 }) },
    $queryRaw: async () => [],
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      if (inTransaction) throw new Error("Nested transaction")
      inTransaction = true
      beforeWrite?.()
      pending = null
      pendingLines = []
      try {
        const result = await run(db)
        if (pending) {
          persisted = pending
          committedLines.push(...pendingLines)
        }
        return result
      } finally {
        pending = null
        inTransaction = false
      }
    },
  }
  return {
    db: db as unknown as PrismaClient,
    persisted: () => persisted,
    lines: () => committedLines,
    withdrawSecond: () => {
      offerings.splice(1)
      form.offerings.splice(1)
    },
    beforeWrite: (callback: () => void) => {
      beforeWrite = callback
    },
    pause: () => {
      published = false
    },
  }
}

async function local<T>(run: () => Promise<T>) {
  const keys = [
    "NODE_ENV",
    "APP_ENV",
    "DEV_PROFILE",
    "NEXT_PUBLIC_PLATFORM_DOMAIN",
    "STORE_CONVERSATION_TEXT_SAFETY_PROVIDER",
  ]
  const previous = keys.map((key) => process.env[key])
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "local",
    DEV_PROFILE: "local",
    NEXT_PUBLIC_PLATFORM_DOMAIN: "ewatrade.com",
    STORE_CONVERSATION_TEXT_SAFETY_PROVIDER: "qa-fixture",
  })
  try {
    return await run()
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key]
      else process.env[key] = previous[i]
    })
  }
}

describe("standalone storefront service intake", () => {
  test("projects a published Store's form without any conversation or age delegates", () =>
    local(async () => {
      const f = fixture()
      const form = await getStorefrontServiceIntake(f.db, host, input.itemId)
      expect(form?.form.offerings).toHaveLength(1)
      expect(form?.site.storeId).toBe("store-1")
      expect(
        await getStorefrontServiceIntake(f.db, "other-shop.ewatrade.com"),
      ).toBeNull()
    }))
  test("saves through the canonical command and replays the same operation once", () =>
    local(async () => {
      const f = fixture()
      const first = await submitStorefrontServiceRequest(f.db, input, host)
      expect(first).toMatchObject({
        requestId: "request-1",
        quantity: "2",
        estimatedTotalMinor: 1000000,
        serviceName: "Leather Bag Cleaning",
      })
      expect(f.persisted()).toMatchObject({
        storeId: "store-1",
        tenantId: "tenant-1",
        contactOptIn: false,
        channelOrigin: "WEB",
      })
      expect(
        (await submitStorefrontServiceRequest(f.db, input, host)).requestId,
      ).toBe(first.requestId)
      await expect(
        submitStorefrontServiceRequest(f.db, { ...input, quantity: "3" }, host),
      ).rejects.toThrow("already used")
    }))
  test("rejects a foreign form, item, option and invalid quantity before persisting", () =>
    local(async () => {
      for (const change of [
        { formId: "other-form" },
        { itemId: "other-item" },
        { offeringId: "other-offer" },
        { quantity: "0.5" },
        { quantity: "51" },
        { customerPhone: "not-a-phone" },
      ]) {
        const f = fixture()
        await expect(
          submitStorefrontServiceRequest(f.db, { ...input, ...change }, host),
        ).rejects.toThrow()
        expect(f.persisted()).toBeNull()
      }
    }))
  test("rolls back when publication is withdrawn between rendering and commit", () =>
    local(async () => {
      const f = fixture()
      f.beforeWrite(f.pause)
      await expect(
        submitStorefrontServiceRequest(f.db, input, host),
      ).rejects.toThrow("unavailable")
      expect(f.persisted()).toBeNull()
    }))
  test("does not persist rejected free text", () =>
    local(async () => {
      const f = fixture()
      await expect(
        submitStorefrontServiceRequest(
          f.db,
          { ...input, details: "[[qa-reject]]" },
          host,
        ),
      ).rejects.toThrow()
      expect(f.persisted()).toBeNull()
    }))
})

describe("multiple storefront offering options", () => {
  const lines = [
    { offeringId: "offering-1", quantity: "2" },
    { offeringId: "offering-2", quantity: "3" },
  ]
  test("all selected lines persist atomically once; changing a later quantity conflicts", () =>
    local(async () => {
      const f = fixture(true)
      const first = await submitStorefrontServiceRequest(
        f.db,
        { ...input, lines },
        host,
      )
      expect(first.lines).toHaveLength(2)
      expect(first.estimatedTotalMinor).toBe(1750000)
      expect(f.lines().map((line) => line.offeringId)).toEqual([
        "offering-1",
        "offering-2",
      ])
      await submitStorefrontServiceRequest(f.db, { ...input, lines }, host)
      expect(f.lines()).toHaveLength(2)
      await expect(
        submitStorefrontServiceRequest(
          f.db,
          {
            ...input,
            lines: [lines[0], { offeringId: "offering-2", quantity: "4" }],
          },
          host,
        ),
      ).rejects.toThrow("already used")
      expect(f.lines()).toHaveLength(2)
    }))
  test("foreign, duplicate or invalid later lines cannot persist an initial subset", () =>
    local(async () => {
      for (const selected of [
        [lines[0], { offeringId: "foreign", quantity: "1" }],
        [lines[0], lines[0]],
        [lines[0], { offeringId: "offering-2", quantity: "0.5" }],
      ]) {
        const f = fixture(true)
        await expect(
          submitStorefrontServiceRequest(
            f.db,
            { ...input, lines: selected },
            host,
          ),
        ).rejects.toThrow()
        expect(f.persisted()).toBeNull()
        expect(f.lines()).toHaveLength(0)
      }
    }))
  test("withdrawal of a later option before commit rolls the complete request back", () =>
    local(async () => {
      const f = fixture(true)
      f.beforeWrite(f.withdrawSecond)
      await expect(
        submitStorefrontServiceRequest(f.db, { ...input, lines }, host),
      ).rejects.toThrow("outside this Form")
      expect(f.persisted()).toBeNull()
      expect(f.lines()).toHaveLength(0)
    }))
  test("a quote-priced line retains unknown total without losing fixed-line estimates", () =>
    local(async () => {
      const f = fixture(true, true)
      const result = await submitStorefrontServiceRequest(
        f.db,
        { ...input, lines },
        host,
      )
      expect(result.estimatedTotalMinor).toBeNull()
      expect(result.lines.map((line) => line.estimatedTotalMinor)).toEqual([
        1000000,
        null,
      ])
    }))
})
