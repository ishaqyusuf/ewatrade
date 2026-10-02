import type { PrismaClient } from "../../../generated/prisma/client"
import { createFinanceBook } from "./accounts"
import {
  type OpeningCostAcceptanceScope,
  assertOpeningCostAcceptanceScope,
  cleanupOpeningCostAcceptance,
} from "./opening-cost.integration-cleanup"

export async function createCloseoutSourceAcceptanceFixture(
  db: PrismaClient,
  scope: OpeningCostAcceptanceScope,
) {
  const owner = await db.user.create({
    data: {
      name: "Private Closeout source QA",
      email: `opening-cost-${scope.runId}@example.invalid`,
    },
  })
  scope.userIds.push(owner.id)
  const tenant = await db.tenant.create({
    data: {
      name: "Private Closeout source QA",
      slug: `opening-cost-closeout-source-${scope.runId}`,
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      users: { create: { userId: owner.id, role: "OWNER", status: "ACTIVE" } },
    },
  })
  scope.tenantIds.push(tenant.id)
  const actor = { tenantId: tenant.id, actorUserId: owner.id }
  const store = await db.store.create({
    data: {
      tenantId: tenant.id,
      name: "Private Closeout source QA",
      slug: `closeout-source-${scope.runId}`,
      status: "ACTIVE",
      countryCode: "NG",
    },
  })
  const book = await createFinanceBook(db, {
    ...actor,
    startsAt: new Date("2026-01-01T00:00:00Z"),
  })
  scope.bookIds.push(book.id)
  const item = await db.catalogItem.create({
    data: {
      tenantId: tenant.id,
      slug: `closeout-source-${scope.runId}`,
      kind: "PRODUCT",
      name: "Private Closeout source Product",
      product: { create: {} },
      variants: {
        create: [
          { key: "stock", name: "Stock", isDefault: true },
          { key: "zero", name: "Zero sibling", isDefault: false },
        ],
      },
    },
    include: { product: true, variants: true },
  })
  const product = item.product
  const stockVariant = item.variants.find((v) => v.key === "stock")
  const zeroVariant = item.variants.find((v) => v.key === "zero")
  if (!product || !stockVariant || !zeroVariant)
    throw new Error("Missing Closeout QA Product/variants")
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
            key: "case",
            name: "case",
            factor: "12",
            stockBehavior: "PACKAGED_STOCK",
            transactionScale: 3,
          },
        ],
      },
    },
    include: { units: true },
  })
  const unit = version.units.find((u) => u.key === "case")
  const alternate = version.units.find((u) => u.key === "base")
  if (!unit || !alternate) throw new Error("Missing Closeout QA units")
  await db.catalogProduct.update({
    where: { id: product.id },
    data: { currentUnitConfigurationVersionId: version.id },
  })
  const common = {
    tenantId: tenant.id,
    storeId: store.id,
    productId: product.id,
    inventoryUnitId: unit.id,
    kind: "PACKAGED_STOCK" as const,
  }
  const root = await db.stockBalanceSource.create({
    data: { ...common, variantId: stockVariant.id },
  })
  const zeroRoot = await db.stockBalanceSource.create({
    data: { ...common, variantId: zeroVariant.id },
  })
  const reference = `closeout-source-${scope.runId}`
  const zero = await db.stockBalanceSource.create({
    data: {
      ...common,
      variantId: zeroVariant.id,
      custodyType: "STAFF",
      custodyReferenceId: reference,
      parentBalanceSourceId: zeroRoot.id,
    },
  })
  return {
    actor,
    store,
    book,
    root,
    zeroRoot,
    zero,
    reference,
    unit,
    alternate,
    version,
    stockVariant,
    zeroVariant,
  }
}

/** Run-owned Closeouts must be removed before the shared exact-run stock cleanup. */
export async function cleanupCloseoutSourceAcceptanceFixture(
  db: PrismaClient,
  scope: OpeningCostAcceptanceScope,
) {
  await assertOpeningCostAcceptanceScope(db, scope)
  const owned = { tenantId: { in: scope.tenantIds } }
  await db.$transaction(
    async (tx) => {
      await tx.inventoryCloseout.deleteMany({ where: owned })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
  const remaining = await cleanupOpeningCostAcceptance(db, scope)
  remaining.push(
    ...(await Promise.all([
      db.inventoryCloseout.count({ where: owned }),
      db.inventoryCloseoutLine.count({ where: { closeout: owned } }),
      db.financePurchaseReceiptLine.count({
        where: { bookId: { in: scope.bookIds } },
      }),
      db.financeSupplierAccount.count({
        where: { bookId: { in: scope.bookIds } },
      }),
      db.financeSupplierEntry.count({
        where: { bookId: { in: scope.bookIds } },
      }),
      db.financeCommand.count({ where: { bookId: { in: scope.bookIds } } }),
      db.financeAccount.count({ where: { bookId: { in: scope.bookIds } } }),
      db.financeJournalLine.count({ where: { bookId: { in: scope.bookIds } } }),
    ])),
  )
  return remaining
}
