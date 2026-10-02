import type { PrismaClient } from "../../../generated/prisma/client"
import { createFinanceBook } from "./accounts"
import {
  type OpeningCostAcceptanceScope,
  assertOpeningCostAcceptanceScope,
  cleanupOpeningCostAcceptance,
} from "./opening-cost.integration-cleanup"

export async function createReservationTraceFixture(
  db: PrismaClient,
  scope: OpeningCostAcceptanceScope,
) {
  const user = await db.user.create({
    data: {
      name: "Private reservation trace QA",
      email: `opening-cost-${scope.runId}@example.invalid`,
    },
  })
  scope.userIds.push(user.id)
  const tenant = await db.tenant.create({
    data: {
      name: "Private reservation trace QA",
      slug: `opening-cost-reservation-trace-${scope.runId}`,
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      users: { create: { userId: user.id, role: "OWNER", status: "ACTIVE" } },
    },
  })
  scope.tenantIds.push(tenant.id)
  const actor = { tenantId: tenant.id, actorUserId: user.id }
  const store = await db.store.create({
    data: {
      tenantId: tenant.id,
      name: "Private reservation trace QA",
      slug: `reservation-trace-${scope.runId}`,
      status: "ACTIVE",
      countryCode: "NG",
    },
  })
  const book = await createFinanceBook(db, {
    ...actor,
    startsAt: new Date("2026-01-01T00:00:00Z"),
  })
  scope.bookIds.push(book.id)
  async function stock(label: string, packaged: boolean) {
    const item = await db.catalogItem.create({
      data: {
        tenantId: tenant.id,
        slug: `reservation-trace-${label}-${scope.runId}`,
        name: `Reservation trace QA ${label}`,
        kind: "PRODUCT",
        product: { create: {} },
        variants: {
          create: { key: "default", name: "Default", isDefault: true },
        },
      },
      include: { product: true, variants: true },
    })
    const product = item.product
    const variant = item.variants[0]
    if (!product || !variant) throw new Error("Missing QA Product/variant")
    const version = await db.unitConfigurationVersion.create({
      data: {
        productId: product.id,
        version: 1,
        status: "CURRENT",
        canonicalBalanceScale: 18,
        units: {
          create: [
            {
              key: "base",
              name: "unit",
              factor: "1",
              stockBehavior: "CANONICAL_SHARED",
              transactionScale: 3,
            },
            {
              key: "entered",
              name: "case",
              factor: "12",
              stockBehavior: packaged
                ? "PACKAGED_STOCK"
                : "ALTERNATE_TRANSACTION",
              transactionScale: 3,
            },
          ],
        },
      },
      include: { units: true },
    })
    const base = version.units.find((u) => u.key === "base")
    const entered = version.units.find((u) => u.key === "entered")
    if (!base || !entered) throw new Error("Missing QA units")
    await db.catalogProduct.update({
      where: { id: product.id },
      data: { currentUnitConfigurationVersionId: version.id },
    })
    const balance = await db.stockBalanceSource.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        productId: product.id,
        variantId: variant.id,
        inventoryUnitId: packaged ? entered.id : base.id,
        kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
      },
    })
    const offering = await db.sellableOffering.create({
      data: {
        tenantId: tenant.id,
        catalogItemId: item.id,
        variantId: variant.id,
        key: "offering",
        kind: "PRODUCT_UNIT",
        status: "ACTIVE",
        name: "Reservation trace QA Offering",
        pricingPolicy: "FIXED",
        fixedPriceMinor: 5000,
        currencyCode: tenant.currencyCode,
        productUnitOffering: {
          create: { tenantId: tenant.id, inventoryUnitId: entered.id },
        },
        storeAvailability: { create: { storeId: store.id, isAvailable: true } },
      },
    })
    return { balance, version, base, entered, offering }
  }
  return {
    actor,
    book,
    store,
    packaged: await stock("known", true),
    shared: await stock("unknown", false),
  }
}

export async function cleanupReservationTraceFixture(
  db: PrismaClient,
  scope: OpeningCostAcceptanceScope,
) {
  // The same-Tenant committed-operation FK is restrictive. Prove exact ownership
  // before removing Reservation owners, then reuse the scoped stock/Finance cleanup.
  await assertOpeningCostAcceptanceScope(db, scope)
  const owned = { tenantId: { in: scope.tenantIds } }
  await db.stockReservation.deleteMany({ where: owned })
  const remaining = await cleanupOpeningCostAcceptance(db, scope)
  const books = { bookId: { in: scope.bookIds } }
  remaining.push(
    ...(await Promise.all([
      db.stockReservation.count({ where: owned }),
      db.financePurchaseReceiptLine.count({ where: books }),
      db.financeSupplierAccount.count({ where: books }),
      db.financeSupplierEntry.count({ where: books }),
      db.financeCommand.count({ where: books }),
      db.financeAccount.count({ where: books }),
      db.financeJournalLine.count({ where: books }),
      db.sellableOffering.count({ where: owned }),
    ])),
  )
  return remaining
}
