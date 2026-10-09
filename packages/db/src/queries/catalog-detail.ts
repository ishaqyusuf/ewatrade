import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { getCatalogItem } from "./catalog-read"

export type CatalogDetailScope = {
  tenantId: string
  storeId: string
  itemId: string
  inventory: boolean
  createdByUserId?: string
}
export type DetailCursor = { at: string; key: string }
export type DetailPage = { limit: number; cursor?: DetailCursor | null }
export type ActivityCategory = "all" | "catalog" | "orders" | "stock"

// Each source applies the same total ordering before its bounded read.
export function detailCursorWhere(
  source: string,
  dateField: string,
  cursor?: DetailCursor | null,
) {
  if (!cursor) return {}
  const [cursorSource, ...parts] = cursor.key.split(":")
  const id = parts.join(":")
  const sameDate =
    source === cursorSource
      ? { id: { lt: id } }
      : source < (cursorSource ?? "")
        ? {}
        : null
  return {
    OR: [
      { [dateField]: { lt: new Date(cursor.at) } },
      ...(sameDate ? [{ [dateField]: new Date(cursor.at), ...sameDate }] : []),
    ],
  }
}

export function detailPage<T extends { at: string; key: string }>(
  rows: T[],
  limit: number,
) {
  const sorted = [...rows].sort(
    (a, b) =>
      b.at.localeCompare(a.at) || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0),
  )
  const items = sorted.slice(0, limit)
  const last = items.at(-1)
  return {
    items,
    nextCursor:
      sorted.length > limit && last ? { at: last.at, key: last.key } : null,
  }
}

export function catalogOrderWhere(
  scope: CatalogDetailScope,
): Prisma.CommercialOrderLineWhereInput {
  return {
    order: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      createdByUserId: scope.createdByUserId,
    },
    snapshot: { catalogItemId: scope.itemId },
  }
}

const orderGraph = {
  order: true,
  snapshot: true,
} satisfies Prisma.CommercialOrderLineInclude
export function serializeCatalogOrderLine(line: {
  id: string
  orderId: string
  createdAt: Date
  quantity: { toString(): string }
  unitPriceMinor: number | null
  totalMinor: number
  order: {
    orderNumber: string
    customerName: string | null
    status: string
    currencyCode: string
    createdByUserId: string
  }
  snapshot: {
    currencyCode: string
    variantName: string
    inventoryUnitName: string | null
    offeringName: string
    quantity: { toString(): string }
    unitPriceMinor: number | null
    note?: string | null
    totalMinor: number
  } | null
}) {
  return {
    key: `orders:${line.id}`,
    at: line.createdAt.toISOString(),
    id: line.id,
    orderId: line.orderId,
    orderNumber: line.order.orderNumber,
    customer: line.order.customerName ?? "Walk-in",
    status: line.order.status,
    currencyCode: line.snapshot?.currencyCode ?? line.order.currencyCode,
    variantName: line.snapshot?.variantName ?? "",
    unitName:
      line.snapshot?.inventoryUnitName ?? line.snapshot?.offeringName ?? "",
    quantity: (line.snapshot?.quantity ?? line.quantity).toString(),
    unitPriceMinor: line.snapshot?.unitPriceMinor ?? line.unitPriceMinor,
    note: line.snapshot?.note ?? null,
    totalMinor: line.snapshot?.totalMinor ?? line.totalMinor,
    actorUserId: line.order.createdByUserId,
  }
}

async function readCatalogOrderLines(
  db: PrismaClient,
  scope: CatalogDetailScope,
  page: DetailPage,
) {
  const lines = await db.commercialOrderLine.findMany({
    include: orderGraph,
    where: {
      ...catalogOrderWhere(scope),
      ...detailCursorWhere("orders", "createdAt", page.cursor),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1,
  })
  return lines.map(serializeCatalogOrderLine)
}

export async function listCatalogItemOrders(
  db: PrismaClient,
  scope: CatalogDetailScope,
  page: DetailPage,
) {
  return detailPage(await readCatalogOrderLines(db, scope, page), page.limit)
}

export async function getCatalogItemDetail(
  db: PrismaClient,
  scope: CatalogDetailScope,
) {
  const item = await getCatalogItem(db, {
    itemId: scope.itemId,
    tenantId: scope.tenantId,
  })
  if (!item) return null
  const last = await db.commercialOrderLine.findFirst({
    include: orderGraph,
    where: {
      ...catalogOrderWhere(scope),
      order: {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        createdByUserId: scope.createdByUserId,
        status: { not: "CANCELLED" },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  return {
    item: {
      ...item,
      photos: item.photos.filter((entry) => entry.storeId === scope.storeId),
      illustrations: item.illustrations.filter(
        (entry) => entry.storeId === scope.storeId,
      ),
      variants: item.variants.map((variant) => ({
        ...variant,
        offerings: variant.offerings.map((offering) => ({
          ...offering,
          stores: offering.stores.filter(
            (store) => store.storeId === scope.storeId,
          ),
        })),
      })),
      product: item.product
        ? {
            ...item.product,
            stockBalances: scope.inventory
              ? item.product.stockBalances.filter(
                  (balance) => balance.storeId === scope.storeId,
                )
              : [],
          }
        : null,
    },
    inventoryAllowed: scope.inventory,
    lastOrder: last ? serializeCatalogOrderLine(last) : null,
  }
}

// Comparisons use retained values; Decimal callers never convert stock to floats.
export function catalogChangeDirection(comparisons: number[]) {
  const increases = comparisons.some((value) => value > 0)
  const decreases = comparisons.some((value) => value < 0)
  return increases && decreases
    ? "mixed"
    : increases
      ? "increase"
      : decreases
        ? "decrease"
        : null
}

type Activity = {
  key: string
  at: string
  category: Exclude<ActivityCategory, "all">
  title: string
  changeDirection: ReturnType<typeof catalogChangeDirection>
  description: string
  categories: string[]
  actorUserId: string | null
  orderNumber: string | null
  amountMinor: number | null
  previousAmountMinor: number | null
  currencyCode: string | null
}
export async function listCatalogItemActivity(
  db: PrismaClient,
  scope: CatalogDetailScope,
  page: DetailPage & { category: ActivityCategory },
) {
  const rows: Activity[] = []
  const includes = (category: ActivityCategory) =>
    page.category === "all" || page.category === category
  await Promise.all([
    includes("catalog")
      ? (async () => {
          const [item, prices] = await Promise.all([
            db.catalogItem.findFirst({
              where: {
                id: scope.itemId,
                tenantId: scope.tenantId,
                ...detailCursorWhere("created", "createdAt", page.cursor),
              },
              select: { id: true, name: true, createdAt: true },
            }),
            db.catalogPriceChange.findMany({
              where: {
                tenantId: scope.tenantId,
                offering: { catalogItemId: scope.itemId },
                ...detailCursorWhere("price", "effectiveAt", page.cursor),
              },
              include: { offering: { select: { name: true } } },
              orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
              take: page.limit + 1,
            }),
          ])
          if (item)
            rows.push({
              key: `created:${item.id}`,
              at: item.createdAt.toISOString(),
              category: "catalog",
              title: "Item created",
              changeDirection: null,
              categories: [],
              description: item.name,
              actorUserId: null,
              orderNumber: null,
              amountMinor: null,
              previousAmountMinor: null,
              currencyCode: null,
            })
          for (const price of prices)
            rows.push({
              key: `price:${price.id}`,
              at: price.effectiveAt.toISOString(),
              category: "catalog",
              title: "Price recorded",
              categories: [],
              changeDirection:
                price.previousPriceMinor === null
                  ? null
                  : catalogChangeDirection([
                      price.priceMinor - price.previousPriceMinor,
                    ]),
              description: [price.offering.name, price.reason]
                .filter(Boolean)
                .join(" · "),
              actorUserId: price.changedByUserId,
              orderNumber: null,
              amountMinor: price.priceMinor,
              previousAmountMinor: price.previousPriceMinor,
              currencyCode: price.currencyCode,
            })
        })()
      : Promise.resolve(),
    includes("orders")
      ? (async () => {
          const orders = await readCatalogOrderLines(db, scope, page)
          for (const order of orders)
            rows.push({
              key: order.key,
              at: order.at,
              category: "orders",
              title: "Order recorded",
              changeDirection: null,
              categories: [],
              description: `${order.quantity} × ${order.variantName} ${order.unitName} · ${order.status.toLowerCase().replaceAll("_", " ")}`,
              actorUserId: order.actorUserId,
              orderNumber: order.orderNumber,
              amountMinor: order.totalMinor,
              previousAmountMinor: null,
              currencyCode: order.currencyCode,
            })
        })()
      : Promise.resolve(),
    includes("orders")
      ? (async () => {
          const [products, services] = await Promise.all([
            db.productFulfillment.findMany({
              where: {
                orderLine: catalogOrderWhere(scope),
                ...detailCursorWhere(
                  "product_fulfilled",
                  "createdAt",
                  page.cursor,
                ),
              },
              include: {
                orderLine: { include: orderGraph },
                stockOperation: { select: { actorUserId: true } },
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: page.limit + 1,
            }),
            db.commercialServiceFulfillment.findMany({
              where: {
                tenantId: scope.tenantId,
                orderLine: catalogOrderWhere(scope),
                ...detailCursorWhere(
                  "service_performed",
                  "performedAt",
                  page.cursor,
                ),
              },
              include: { orderLine: { include: orderGraph } },
              orderBy: [{ performedAt: "desc" }, { id: "desc" }],
              take: page.limit + 1,
            }),
          ])
          for (const fulfillment of products) {
            const line = serializeCatalogOrderLine(fulfillment.orderLine)
            rows.push({
              key: `product_fulfilled:${fulfillment.id}`,
              at: fulfillment.createdAt.toISOString(),
              category: "orders",
              title: "Product fulfilled",
              changeDirection: null,
              categories: [],
              description: `${fulfillment.quantity.toString()} × ${line.variantName} ${line.unitName}`,
              actorUserId: fulfillment.stockOperation.actorUserId,
              orderNumber: line.orderNumber,
              amountMinor: null,
              previousAmountMinor: null,
              currencyCode: null,
            })
          }
          for (const fulfillment of services) {
            const line = serializeCatalogOrderLine(fulfillment.orderLine)
            rows.push({
              key: `service_performed:${fulfillment.id}`,
              at: fulfillment.performedAt.toISOString(),
              category: "orders",
              title: "Service performed",
              changeDirection: null,
              categories: [],
              description: `${fulfillment.quantity.toString()} × ${line.variantName} ${line.unitName} · ${fulfillment.reason}`,
              actorUserId: fulfillment.actorUserId,
              orderNumber: line.orderNumber,
              amountMinor: null,
              previousAmountMinor: null,
              currencyCode: null,
            })
          }
        })()
      : Promise.resolve(),
    includes("stock") && scope.inventory
      ? (async () => {
          const operations = await db.stockOperation.findMany({
            where: {
              tenantId: scope.tenantId,
              storeId: scope.storeId,
              movements: {
                some: {
                  balanceSource: { product: { catalogItemId: scope.itemId } },
                },
              },
              ...detailCursorWhere("stock", "effectiveAt", page.cursor),
            },
            include: {
              categories: {
                orderBy: { position: "asc" },
                select: { categoryName: { select: { name: true } } },
              },
              movements: {
                where: {
                  balanceSource: { product: { catalogItemId: scope.itemId } },
                },
                take: 3,
                orderBy: { id: "asc" },
                include: {
                  enteredInventoryUnit: { select: { name: true } },
                  balanceSource: {
                    select: {
                      variant: { select: { name: true } },
                      inventoryUnit: { select: { name: true } },
                    },
                  },
                },
              },
            },
            orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
            take: page.limit + 1,
          })
          for (const operation of operations)
            rows.push({
              key: `stock:${operation.id}`,
              at: operation.effectiveAt.toISOString(),
              category: "stock",
              title: operation.type.toLowerCase().replaceAll("_", " "),
              categories: operation.categories.map(
                (category) => category.categoryName.name,
              ),
              changeDirection: catalogChangeDirection(
                operation.movements.map((movement) =>
                  movement.resultingOnHandQuantity.comparedTo(
                    movement.previousOnHandQuantity,
                  ),
                ),
              ),
              description:
                [
                  operation.movements
                    .map(
                      (movement) =>
                        `${movement.balanceSource.variant.name}: ${movement.enteredQuantity.toString()} ${movement.enteredInventoryUnit.name} · balance ${movement.previousOnHandQuantity.toString()} → ${movement.resultingOnHandQuantity.toString()} ${movement.balanceSource.inventoryUnit.name}`,
                    )
                    .join(" · "),
                  operation.reason,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Stock operation recorded",
              actorUserId: operation.actorUserId,
              orderNumber: null,
              amountMinor: null,
              previousAmountMinor: null,
              currencyCode: null,
            })
        })()
      : Promise.resolve(),
  ])
  const result = detailPage(rows, page.limit)
  const actorIds = [
    ...new Set(
      result.items.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])),
    ),
  ]
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : []
  return {
    ...result,
    items: result.items.map((row) => ({
      ...row,
      actorName:
        actors.find((actor) => actor.id === row.actorUserId)?.name ?? null,
    })),
    inventoryAllowed: scope.inventory,
  }
}

export async function catalogDetailItemExists(
  db: PrismaClient,
  scope: CatalogDetailScope,
) {
  return Boolean(
    await db.catalogItem.findFirst({
      where: { id: scope.itemId, tenantId: scope.tenantId },
      select: { id: true },
    }),
  )
}
