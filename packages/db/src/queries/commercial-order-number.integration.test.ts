import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind,
  CatalogRecordStatus,
  OfferingPricingPolicy,
  SellableOfferingKind,
  ServiceWorkPolicy,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../../generated/prisma/enums"
import { allocateCommercialOrderNumber } from "./commercial-order-number"
import {
  type CreateCommercialOrderInput,
  createCommercialOrder,
  getCommercialOrder,
} from "./commercial-orders"

const databaseUrl = process.env.EWATRADE_DATABASE_URL
const describeWithDatabase =
  databaseUrl && process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip

function getDatabaseUrl() {
  if (!databaseUrl) {
    throw new Error("EWATRADE_DATABASE_URL is required for database integration tests.")
  }

  return databaseUrl
}

async function createCommercialOrderFixture(db: PrismaClient) {
  const tenant = await db.tenant.create({
    data: {
      enabledModes: [TenantMode.MERCHANT],
      name: "Commercial Order Number Test",
      slug: `commercial-order-number-${randomUUID()}`,
      type: TenantType.MERCHANT,
    },
  })
  const [firstStore, secondStore] = await db.$transaction([
    db.store.create({
      data: {
        name: "First Store",
        slug: "first-store",
        status: StoreStatus.ACTIVE,
        tenantId: tenant.id,
      },
    }),
    db.store.create({
      data: {
        name: "Second Store",
        slug: "second-store",
        status: StoreStatus.ACTIVE,
        tenantId: tenant.id,
      },
    }),
  ])
  const item = await db.catalogItem.create({
    data: {
      kind: CatalogItemKind.SERVICE,
      name: "Consultation",
      slug: "consultation",
      status: CatalogRecordStatus.ACTIVE,
      tenantId: tenant.id,
    },
  })
  const variant = await db.sellableVariant.create({
    data: {
      catalogItemId: item.id,
      isDefault: true,
      key: "default",
      name: "Consultation",
      status: CatalogRecordStatus.ACTIVE,
    },
  })
  const offering = await db.sellableOffering.create({
    data: {
      catalogItemId: item.id,
      currencyCode: "NGN",
      fixedPriceMinor: 25_000,
      key: "consultation",
      kind: SellableOfferingKind.SERVICE,
      name: "Consultation",
      pricingPolicy: OfferingPricingPolicy.FIXED,
      serviceOffering: {
        create: { workPolicy: ServiceWorkPolicy.CHARGE_ONLY },
      },
      status: CatalogRecordStatus.ACTIVE,
      storeAvailability: {
        create: [
          { isAvailable: true, storeId: firstStore.id },
          { isAvailable: true, storeId: secondStore.id },
        ],
      },
      tenantId: tenant.id,
      variantId: variant.id,
    },
  })

  return { firstStore, offering, secondStore, tenant }
}

function rawCommercialOrderData(input: {
  clientOrderId: string
  orderNumber: string
  payloadHash: string
  storeId: string
  tenantId: string
}) {
  return {
    clientOrderId: input.clientOrderId,
    createdByUserId: "order-number-test-actor",
    currencyCode: "NGN",
    discountMinor: 0,
    orderNumber: input.orderNumber,
    payloadHash: input.payloadHash,
    schemaVersion: 1,
    serviceChargeMinor: 0,
    storeId: input.storeId,
    subtotalMinor: 0,
    taxMinor: 0,
    tenantId: input.tenantId,
    totalMinor: 0,
  }
}

describeWithDatabase("commercial order number database allocation", () => {
  let db: PrismaClient

  beforeAll(() => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
    })
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  test("serializes concurrent allocations per business", async () => {
    const [tenant, otherTenant] = await db.$transaction([
      db.tenant.create({
        data: {
          enabledModes: [TenantMode.MERCHANT],
          name: "Order Sequence Test",
          slug: `order-sequence-${randomUUID()}`,
          type: TenantType.MERCHANT,
        },
      }),
      db.tenant.create({
        data: {
          enabledModes: [TenantMode.MERCHANT],
          name: "Other Order Sequence Test",
          slug: `order-sequence-other-${randomUUID()}`,
          type: TenantType.MERCHANT,
        },
      }),
    ])

    try {
      const [otherTenantNumber, ...numbers] = await Promise.all([
        db.$transaction((tx) =>
          allocateCommercialOrderNumber(tx, otherTenant.id),
        ),
        ...Array.from({ length: 12 }, () =>
          db.$transaction((tx) => allocateCommercialOrderNumber(tx, tenant.id)),
        ),
      ])

      expect(otherTenantNumber).toBe("ORD-001")
      expect(numbers.toSorted()).toEqual([
        "ORD-001",
        "ORD-002",
        "ORD-003",
        "ORD-004",
        "ORD-005",
        "ORD-006",
        "ORD-007",
        "ORD-008",
        "ORD-009",
        "ORD-010",
        "ORD-011",
        "ORD-012",
      ])
    } finally {
      await db.tenant.deleteMany({
        where: { id: { in: [tenant.id, otherTenant.id] } },
      })
    }
  })

  test("does not consume a number when its transaction rolls back", async () => {
    const tenant = await db.tenant.create({
      data: {
        enabledModes: [TenantMode.MERCHANT],
        name: "Order Sequence Rollback Test",
        slug: `order-sequence-rollback-${randomUUID()}`,
        type: TenantType.MERCHANT,
      },
    })

    try {
      await expect(
        db.$transaction(async (tx) => {
          await allocateCommercialOrderNumber(tx, tenant.id)
          throw new Error("ROLL_BACK_SEQUENCE")
        }),
      ).rejects.toThrow("ROLL_BACK_SEQUENCE")

      await expect(
        db.$transaction((tx) => allocateCommercialOrderNumber(tx, tenant.id)),
      ).resolves.toBe("ORD-001")
    } finally {
      await db.tenant.delete({ where: { id: tenant.id } })
    }
  })

  test("creates tenant-wide numbers and recovers a concurrent idempotent replay", async () => {
    const fixture = await createCommercialOrderFixture(db)
    const commonInput: Omit<
      CreateCommercialOrderInput,
      "clientOrderId" | "storeId"
    > = {
      actorUserId: "order-number-test-actor",
      createTrackedServiceWork: false,
      lines: [{ offeringId: fixture.offering.id, quantity: "1" }],
      schemaVersion: 1,
      tenantId: fixture.tenant.id,
    }

    try {
      const first = await createCommercialOrder(db, {
        ...commonInput,
        clientOrderId: `first-${randomUUID()}`,
        storeId: fixture.firstStore.id,
      })
      const distinctOrders = await Promise.all([
        createCommercialOrder(db, {
          ...commonInput,
          clientOrderId: `distinct-first-store-${randomUUID()}`,
          storeId: fixture.firstStore.id,
        }),
        createCommercialOrder(db, {
          ...commonInput,
          clientOrderId: `distinct-second-store-${randomUUID()}`,
          storeId: fixture.secondStore.id,
        }),
      ])
      const concurrentInput = {
        ...commonInput,
        clientOrderId: `concurrent-${randomUUID()}`,
        storeId: fixture.secondStore.id,
      }
      const [concurrent, replay] = await Promise.all([
        createCommercialOrder(db, concurrentInput),
        createCommercialOrder(db, concurrentInput),
      ])
      const next = await createCommercialOrder(db, {
        ...commonInput,
        clientOrderId: `next-${randomUUID()}`,
        storeId: fixture.firstStore.id,
      })

      expect(first.orderNumber).toBe("ORD-001")
      expect(
        distinctOrders.map((order) => order.orderNumber).toSorted(),
      ).toEqual(["ORD-002", "ORD-003"])
      expect(concurrent.orderNumber).toBe("ORD-004")
      expect(replay.id).toBe(concurrent.id)
      expect(next.orderNumber).toBe("ORD-005")

      const legacy = await db.commercialOrder.create({
        data: rawCommercialOrderData({
          clientOrderId: `legacy-${randomUUID()}`,
          orderNumber: "EO-LEGACY-REFERENCE",
          payloadHash: "legacy-payload",
          storeId: fixture.firstStore.id,
          tenantId: fixture.tenant.id,
        }),
      })
      const retrievedLegacy = await getCommercialOrder(db, {
        orderId: legacy.id,
        tenantId: fixture.tenant.id,
      })

      expect(retrievedLegacy?.orderNumber).toBe("EO-LEGACY-REFERENCE")
      const createDuplicateNumber = async () =>
        db.commercialOrder.create({
          data: rawCommercialOrderData({
            clientOrderId: `duplicate-number-${randomUUID()}`,
            orderNumber: next.orderNumber,
            payloadHash: "duplicate-number-payload",
            storeId: fixture.secondStore.id,
            tenantId: fixture.tenant.id,
          }),
        })

      await expect(createDuplicateNumber()).rejects.toMatchObject({
        code: "P2002",
      })
    } finally {
      await db.commercialOrder.deleteMany({
        where: { tenantId: fixture.tenant.id },
      })
      await db.tenant.delete({ where: { id: fixture.tenant.id } })
    }
  })
})
