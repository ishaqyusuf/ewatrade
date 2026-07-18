import type { DbClient } from "./types"

export type RetailOpsMoneyTotals = {
  cashMinor: number
  grossMinor: number
  transferMinor: number
}

export type RetailOpsSummary = {
  inventory: {
    lowStockCount: number
    productCount: number
    stockUnitCount: number
    totalOnHandQuantity: number
  }
  payments: RetailOpsMoneyTotals & {
    receiptCount: number
  }
  period: {
    from: Date
    to: Date
  }
  sales: {
    completedOrderCount: number
    orderCount: number
    pendingOrderCount: number
    totalMinor: number
  }
  sessions: {
    openCount: number
  }
  store: {
    currencyCode: string
    id: string
    name: string
    slug: string
  }
}

export type RetailOpsInventoryUnit = {
  isDefault: boolean
  onHandQuantity: number
  priceMinor: number
  productId: string
  productName: string
  reservedQuantity: number
  unitId: string
  unitName: string
}

export type RetailOpsSalesByProductRow = {
  grossMinor: number
  productId: string
  productName: string
  quantity: number
  unitName: string
}

type RetailOpsQueryScope = {
  actorUserId?: string
  from?: Date
  storeId: string
  tenantId: string
  to?: Date
}

function getTodayRange(now = new Date()) {
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)

  return {
    from,
    to: now,
  }
}

function getRange(input: { from?: Date; to?: Date }) {
  const fallback = getTodayRange()

  return {
    from: input.from ?? fallback.from,
    to: input.to ?? fallback.to,
  }
}

function normalizePaymentMethod(value: string | null) {
  return value?.trim().toLowerCase() ?? ""
}

export async function getRetailOpsInventorySnapshot(
  db: DbClient,
  input: Pick<RetailOpsQueryScope, "storeId" | "tenantId">,
): Promise<RetailOpsInventoryUnit[]> {
  const products = await db.product.findMany({
    where: {
      kind: "PRODUCT",
      tenantId: input.tenantId,
      storeId: input.storeId,
      status: { not: "ARCHIVED" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      listPriceMinor: true,
      variants: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          priceMinor: true,
          isDefault: true,
          inventoryItem: {
            select: {
              onHandQuantity: true,
              reservedQuantity: true,
            },
          },
        },
      },
    },
  })

  return products.flatMap((product) => {
    if (product.variants.length === 0) {
      return [
        {
          isDefault: true,
          onHandQuantity: 0,
          priceMinor: product.listPriceMinor,
          productId: product.id,
          productName: product.name,
          reservedQuantity: 0,
          unitId: product.id,
          unitName: "Unit",
        },
      ]
    }

    return product.variants.map((variant) => ({
      isDefault: variant.isDefault,
      onHandQuantity: variant.inventoryItem?.onHandQuantity ?? 0,
      priceMinor: variant.priceMinor,
      productId: product.id,
      productName: product.name,
      reservedQuantity: variant.inventoryItem?.reservedQuantity ?? 0,
      unitId: variant.id,
      unitName: variant.name,
    }))
  })
}

export async function getRetailOpsSalesByProduct(
  db: DbClient,
  input: RetailOpsQueryScope,
): Promise<RetailOpsSalesByProductRow[]> {
  const range = getRange(input)
  const orderItems = await db.orderItem.findMany({
    where: {
      order: {
        ...(input.actorUserId
          ? {
              AND: [
                {
                  metadata: {
                    path: ["retailOps", "source"],
                    equals: "retail_ops_sale",
                  },
                },
                {
                  metadata: {
                    path: ["retailOps", "actorUserId"],
                    equals: input.actorUserId,
                  },
                },
              ],
            }
          : {}),
        tenantId: input.tenantId,
        storeId: input.storeId,
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
        status: { not: "CANCELLED" },
      },
    },
    select: {
      productId: true,
      nameSnapshot: true,
      quantity: true,
      totalPriceMinor: true,
      productVariant: {
        select: {
          name: true,
        },
      },
    },
  })

  const grouped = new Map<string, RetailOpsSalesByProductRow>()

  for (const item of orderItems) {
    const unitName = item.productVariant?.name ?? "Unit"
    const key = `${item.productId}:${unitName}`
    const current = grouped.get(key) ?? {
      grossMinor: 0,
      productId: item.productId,
      productName: item.nameSnapshot,
      quantity: 0,
      unitName,
    }

    grouped.set(key, {
      ...current,
      grossMinor: current.grossMinor + item.totalPriceMinor,
      quantity: current.quantity + item.quantity,
    })
  }

  return Array.from(grouped.values()).sort(
    (left, right) => right.grossMinor - left.grossMinor,
  )
}

export async function getRetailOpsDashboardSummary(
  db: DbClient,
  input: RetailOpsQueryScope,
): Promise<RetailOpsSummary> {
  const range = getRange(input)
  const [store, inventory, orders, receipts, openSessionCount] =
    await Promise.all([
      db.store.findFirstOrThrow({
        where: {
          id: input.storeId,
          tenantId: input.tenantId,
          status: { not: "ARCHIVED" },
        },
        select: {
          id: true,
          slug: true,
          name: true,
          currencyCode: true,
        },
      }),
      getRetailOpsInventorySnapshot(db, input),
      db.order.findMany({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          createdAt: {
            gte: range.from,
            lte: range.to,
          },
          status: { not: "CANCELLED" },
        },
        select: {
          id: true,
          status: true,
          totalMinor: true,
        },
      }),
      db.receipt.findMany({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          issuedAt: {
            gte: range.from,
            lte: range.to,
          },
        },
        select: {
          id: true,
          paymentMethod: true,
          totalMinor: true,
        },
      }),
      db.cashierSession.count({
        where: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          status: "OPEN",
        },
      }),
    ])

  const salesTotalMinor = orders.reduce(
    (total, order) => total + order.totalMinor,
    0,
  )
  const paymentTotals = receipts.reduce(
    (totals, receipt) => {
      const paymentMethod = normalizePaymentMethod(receipt.paymentMethod)

      if (paymentMethod.includes("cash")) {
        totals.cashMinor += receipt.totalMinor
      }

      if (
        paymentMethod.includes("transfer") ||
        paymentMethod.includes("bank")
      ) {
        totals.transferMinor += receipt.totalMinor
      }

      totals.grossMinor += receipt.totalMinor

      return totals
    },
    {
      cashMinor: 0,
      grossMinor: 0,
      transferMinor: 0,
    },
  )

  return {
    inventory: {
      lowStockCount: inventory.filter((unit) => unit.onHandQuantity <= 5)
        .length,
      productCount: new Set(inventory.map((unit) => unit.productId)).size,
      stockUnitCount: inventory.length,
      totalOnHandQuantity: inventory.reduce(
        (total, unit) => total + unit.onHandQuantity,
        0,
      ),
    },
    payments: {
      ...paymentTotals,
      receiptCount: receipts.length,
    },
    period: range,
    sales: {
      completedOrderCount: orders.filter(
        (order) => order.status === "COMPLETED",
      ).length,
      orderCount: orders.length,
      pendingOrderCount: orders.filter((order) => order.status === "PENDING")
        .length,
      totalMinor: salesTotalMinor,
    },
    sessions: {
      openCount: openSessionCount,
    },
    store,
  }
}
