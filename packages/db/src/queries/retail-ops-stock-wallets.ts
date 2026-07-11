import {
  type MembershipRole,
  type MembershipStatus,
  Prisma,
  type PrismaClient,
} from "../generated/prisma/client"
import {
  InventoryMovementDirection as DurableInventoryMovementDirection,
  InventoryMovementSource as DurableInventoryMovementSource,
  InventoryMovementType as DurableInventoryMovementType,
} from "../generated/prisma/enums"

export type AssignRetailOpsStaffStockInput = {
  actorUserId: string
  assignedAt?: Date
  externalId?: string
  note?: string
  productVariantId: string
  quantity: number
  staffUserId: string
  storeId: string
  tenantId: string
}

export type ReturnRetailOpsStaffStockInput = {
  actorUserId: string
  externalId?: string
  note?: string
  productVariantId: string
  quantity: number
  returnedAt?: Date
  staffUserId: string
  storeId: string
  tenantId: string
}

export type ListRetailOpsStaffStockWalletsInput = {
  limit?: number
  staffUserId?: string
  storeId: string
  tenantId: string
}

export type RetailOpsStaffStockWalletBalance = {
  product: {
    id: string
    name: string
  }
  quantity: number
  staff: {
    displayName: string
    email: string
    id: string
  }
  unit: {
    id: string
    name: string
    sku: string
  }
  updatedAt: Date
}

export type AssignedRetailOpsStaffStock = {
  assignment: {
    actorUserId: string
    assignedAt: Date
    externalId: string | null
    note: string | null
    quantity: number
  }
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  }
  wallet: RetailOpsStaffStockWalletBalance & {
    previousQuantity: number
  }
}

export type ReturnedRetailOpsStaffStock = {
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  }
  stockReturn: {
    actorUserId: string
    externalId: string | null
    note: string | null
    quantity: number
    returnedAt: Date
  }
  wallet: RetailOpsStaffStockWalletBalance & {
    previousQuantity: number
  }
}

export type RetailOpsStaffStockWalletSale = {
  order: {
    id: string
    orderNumber: string
  }
  product: {
    id: string
    name: string
  }
  remainingQuantity: number
  soldAt: Date
  soldQuantity: number
  staff: {
    displayName: string
    email: string
    id: string
  }
  unit: {
    id: string
    name: string
    sku: string
  }
  previousQuantity: number
}

export type RetailOpsStaffStockWalletMovementType =
  | "staff_assignment"
  | "staff_return"

export type RetailOpsStaffStockWalletMovementEntry = {
  actorUserId: string
  direction: "in" | "out"
  externalId: string
  happenedAt: string
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  }
  note: string | null
  product: {
    id: string
    name: string
  }
  quantity: number
  staff: {
    displayName: string
    email: string
    id: string
  }
  type: RetailOpsStaffStockWalletMovementType
  unit: {
    id: string
    name: string
    sku: string
  }
  wallet: {
    previousQuantity: number
    quantity: number
  }
}

type RetailOpsStockWalletErrorCode =
  | "INSUFFICIENT_STOCK"
  | "PRODUCT_VARIANT_NOT_FOUND"
  | "STAFF_NOT_FOUND"
  | "STORE_NOT_FOUND"

type JsonRecord = Record<string, unknown>

type RetailOpsStockWalletAssignmentMetadata = {
  actorUserId: string
  assignedAt: string
  externalId: string | null
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  }
  note: string | null
  product: {
    id: string
    name: string
  }
  quantity: number
  staff: {
    displayName: string
    email: string
    id: string
  }
  unit: {
    id: string
    name: string
    sku: string
  }
  wallet: {
    previousQuantity: number
    quantity: number
  }
}

type RetailOpsStockWalletSaleMetadata = {
  order: {
    id: string
    orderNumber: string
  }
  product: {
    id: string
    name: string
  }
  remainingQuantity: number
  soldAt: string
  soldQuantity: number
  staff: {
    displayName: string
    email: string
    id: string
  }
  unit: {
    id: string
    name: string
    sku: string
  }
  previousQuantity: number
}

type RetailOpsStockWalletReturnMetadata = {
  actorUserId: string
  externalId: string | null
  inventory: {
    onHandQuantity: number
    previousOnHandQuantity: number
    productVariantId: string
  }
  note: string | null
  product: {
    id: string
    name: string
  }
  quantity: number
  returnedAt: string
  staff: {
    displayName: string
    email: string
    id: string
  }
  unit: {
    id: string
    name: string
    sku: string
  }
  wallet: {
    previousQuantity: number
    quantity: number
  }
}

export class RetailOpsStockWalletError extends Error {
  code: RetailOpsStockWalletErrorCode

  constructor(code: RetailOpsStockWalletErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsStockWalletError"
    this.code = code
  }
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return value as JsonRecord
}

function getRetailOpsMetadata(metadata: unknown) {
  return asRecord(asRecord(metadata).retailOps)
}

function getStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null
}

function getNumberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function getDateField(value: unknown) {
  const rawValue = getStringField(value)

  if (!rawValue) return null

  const date = new Date(rawValue)

  return Number.isNaN(date.getTime()) ? null : date
}

function isAssignableStaffMembership(input: {
  role: MembershipRole
  status: MembershipStatus
}) {
  return (
    ["CASHIER", "MANAGER", "OPERATOR"].includes(input.role) &&
    input.status === "ACTIVE"
  )
}

function isReturnableStaffMembership(input: {
  role: MembershipRole
  status: MembershipStatus
}) {
  return (
    ["CASHIER", "MANAGER", "OPERATOR"].includes(input.role) &&
    input.status !== "REMOVED"
  )
}

function getDisplayName(user: {
  displayName: string | null
  email: string
  name: string
}) {
  return user.displayName || user.name || user.email
}

function getWalletKey(input: {
  productVariantId: string
  staffUserId: string
}) {
  return `${input.staffUserId}:${input.productVariantId}`
}

function getStockWalletBalances(
  metadata: unknown,
): RetailOpsStaffStockWalletBalance[] {
  const balances = getRetailOpsMetadata(metadata).staffStockWallets

  if (!Array.isArray(balances)) return []

  return balances.flatMap((balance) => {
    const record = asRecord(balance)
    const product = asRecord(record.product)
    const staff = asRecord(record.staff)
    const unit = asRecord(record.unit)
    const quantity = getNumberField(record.quantity)
    const updatedAt = getDateField(record.updatedAt)
    const productId = getStringField(product.id)
    const productName = getStringField(product.name)
    const staffDisplayName = getStringField(staff.displayName)
    const staffEmail = getStringField(staff.email)
    const staffId = getStringField(staff.id)
    const unitId = getStringField(unit.id)
    const unitName = getStringField(unit.name)
    const unitSku = getStringField(unit.sku)

    if (
      quantity === null ||
      !updatedAt ||
      !productId ||
      !productName ||
      !staffDisplayName ||
      !staffEmail ||
      !staffId ||
      !unitId ||
      !unitName ||
      !unitSku
    ) {
      return []
    }

    return [
      {
        product: {
          id: productId,
          name: productName,
        },
        quantity,
        staff: {
          displayName: staffDisplayName,
          email: staffEmail,
          id: staffId,
        },
        unit: {
          id: unitId,
          name: unitName,
          sku: unitSku,
        },
        updatedAt,
      },
    ]
  })
}

function serializeStockWalletBalance(
  balance: RetailOpsStaffStockWalletBalance,
) {
  return {
    ...balance,
    updatedAt: balance.updatedAt.toISOString(),
  }
}

function getStockWalletAssignments(
  metadata: unknown,
): RetailOpsStockWalletAssignmentMetadata[] {
  const assignments = getRetailOpsMetadata(metadata).staffStockAssignments

  if (!Array.isArray(assignments)) return []

  return assignments.flatMap((assignment) => {
    const record = asRecord(assignment)
    const actorUserId = getStringField(record.actorUserId)
    const assignedAt = getStringField(record.assignedAt)
    const quantity = getNumberField(record.quantity)

    if (!actorUserId || !assignedAt || quantity === null) return []

    return [record as RetailOpsStockWalletAssignmentMetadata]
  })
}

function getStockWalletSales(
  metadata: unknown,
): RetailOpsStockWalletSaleMetadata[] {
  const sales = getRetailOpsMetadata(metadata).staffStockWalletSales

  if (!Array.isArray(sales)) return []

  return sales.flatMap((sale) => {
    const record = asRecord(sale)
    const soldAt = getStringField(record.soldAt)
    const soldQuantity = getNumberField(record.soldQuantity)

    if (!soldAt || soldQuantity === null) return []

    return [record as RetailOpsStockWalletSaleMetadata]
  })
}

function getStockWalletReturns(
  metadata: unknown,
): RetailOpsStockWalletReturnMetadata[] {
  const stockReturns = getRetailOpsMetadata(metadata).staffStockReturns

  if (!Array.isArray(stockReturns)) return []

  return stockReturns.flatMap((stockReturn) => {
    const record = asRecord(stockReturn)
    const actorUserId = getStringField(record.actorUserId)
    const returnedAt = getStringField(record.returnedAt)
    const quantity = getNumberField(record.quantity)

    if (!actorUserId || !returnedAt || quantity === null) return []

    return [record as RetailOpsStockWalletReturnMetadata]
  })
}

function getStockWalletMovementExternalId(input: {
  actorUserId: string
  externalId: string | null
  happenedAt: string
  staffUserId: string
  type: RetailOpsStaffStockWalletMovementType
  unitId: string
}) {
  return (
    input.externalId ??
    `${input.type}:${input.actorUserId}:${input.staffUserId}:${input.unitId}:${input.happenedAt}`
  )
}

export function listRetailOpsStaffStockWalletMovementEntries(
  metadata: unknown,
): RetailOpsStaffStockWalletMovementEntry[] {
  const assignments = getStockWalletAssignments(metadata).map(
    (assignment): RetailOpsStaffStockWalletMovementEntry => ({
      actorUserId: assignment.actorUserId,
      direction: "out",
      externalId: getStockWalletMovementExternalId({
        actorUserId: assignment.actorUserId,
        externalId: assignment.externalId,
        happenedAt: assignment.assignedAt,
        staffUserId: assignment.staff.id,
        type: "staff_assignment",
        unitId: assignment.unit.id,
      }),
      happenedAt: assignment.assignedAt,
      inventory: assignment.inventory,
      note: assignment.note,
      product: assignment.product,
      quantity: assignment.quantity,
      staff: assignment.staff,
      type: "staff_assignment",
      unit: assignment.unit,
      wallet: assignment.wallet,
    }),
  )
  const returns = getStockWalletReturns(metadata).map(
    (stockReturn): RetailOpsStaffStockWalletMovementEntry => ({
      actorUserId: stockReturn.actorUserId,
      direction: "in",
      externalId: getStockWalletMovementExternalId({
        actorUserId: stockReturn.actorUserId,
        externalId: stockReturn.externalId,
        happenedAt: stockReturn.returnedAt,
        staffUserId: stockReturn.staff.id,
        type: "staff_return",
        unitId: stockReturn.unit.id,
      }),
      happenedAt: stockReturn.returnedAt,
      inventory: stockReturn.inventory,
      note: stockReturn.note,
      product: stockReturn.product,
      quantity: stockReturn.quantity,
      staff: stockReturn.staff,
      type: "staff_return",
      unit: stockReturn.unit,
      wallet: stockReturn.wallet,
    }),
  )

  return [...assignments, ...returns]
}

function findStockAssignmentReplay(metadata: unknown, externalId: string) {
  const assignment = getStockWalletAssignments(metadata).find(
    (currentAssignment) => currentAssignment.externalId === externalId,
  )

  if (!assignment) return null

  const assignedAt = getDateField(assignment.assignedAt)

  if (!assignedAt) return null

  return {
    assignment: {
      actorUserId: assignment.actorUserId,
      assignedAt,
      externalId: assignment.externalId,
      note: assignment.note,
      quantity: assignment.quantity,
    },
    inventory: assignment.inventory,
    wallet: {
      product: assignment.product,
      quantity: assignment.wallet.quantity,
      staff: assignment.staff,
      unit: assignment.unit,
      updatedAt: assignedAt,
      previousQuantity: assignment.wallet.previousQuantity,
    },
  }
}

function findStockReturnReplay(metadata: unknown, externalId: string) {
  const stockReturn = getStockWalletReturns(metadata).find(
    (currentReturn) => currentReturn.externalId === externalId,
  )

  if (!stockReturn) return null

  const returnedAt = getDateField(stockReturn.returnedAt)

  if (!returnedAt) return null

  return {
    inventory: stockReturn.inventory,
    stockReturn: {
      actorUserId: stockReturn.actorUserId,
      externalId: stockReturn.externalId,
      note: stockReturn.note,
      quantity: stockReturn.quantity,
      returnedAt,
    },
    wallet: {
      product: stockReturn.product,
      quantity: stockReturn.wallet.quantity,
      staff: stockReturn.staff,
      unit: stockReturn.unit,
      updatedAt: returnedAt,
      previousQuantity: stockReturn.wallet.previousQuantity,
    },
  }
}

function isDurableStaffStockWalletUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

async function writeDurableStaffStockWalletMovement(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    actorUserId: string
    externalId: string | null
    happenedAt: Date
    inventory: {
      id: string
      onHandQuantity: number
      previousOnHandQuantity: number
    }
    movementType:
      | typeof DurableInventoryMovementType.STAFF_ASSIGNMENT
      | typeof DurableInventoryMovementType.STAFF_RETURN
    note: string | null
    product: {
      id: string
      name: string
    }
    productVariantId: string
    quantity: number
    staffUserId: string
    storeId: string
    tenantId: string
    wallet: {
      previousQuantity: number
      quantity: number
    }
  },
) {
  const source =
    input.movementType === DurableInventoryMovementType.STAFF_ASSIGNMENT
      ? DurableInventoryMovementSource.STAFF_STOCK_ASSIGNMENT
      : DurableInventoryMovementSource.STAFF_STOCK_RETURN
  const direction =
    input.movementType === DurableInventoryMovementType.STAFF_ASSIGNMENT
      ? DurableInventoryMovementDirection.OUTBOUND
      : DurableInventoryMovementDirection.INBOUND
  const groupPrefix =
    input.movementType === DurableInventoryMovementType.STAFF_ASSIGNMENT
      ? "staff_assignment"
      : "staff_return"
  const movementGroupId = `${groupPrefix}:${
    input.externalId ?? `${input.staffUserId}:${input.productVariantId}:${input.happenedAt.toISOString()}`
  }`
  const metadata = {
    retailOps: {
      productName: input.product.name,
      stockSource: "staff_wallet",
    },
  } as Prisma.InputJsonValue

  try {
    const wallet = await db.staffStockWallet.upsert({
      where: {
        tenantId_storeId_staffUserId_productVariantId: {
          productVariantId: input.productVariantId,
          staffUserId: input.staffUserId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
      create: {
        lastMovementAt: input.happenedAt,
        metadata,
        onHandQuantity: input.wallet.quantity,
        productId: input.product.id,
        productVariantId: input.productVariantId,
        staffUserId: input.staffUserId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        updatedByUserId: input.actorUserId,
      },
      update: {
        lastMovementAt: input.happenedAt,
        metadata,
        onHandQuantity: input.wallet.quantity,
        productId: input.product.id,
        updatedByUserId: input.actorUserId,
      },
      select: {
        id: true,
      },
    })

    if (input.externalId) {
      await db.inventoryMovement.upsert({
        where: {
          tenantId_storeId_type_externalId: {
            externalId: input.externalId,
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: input.movementType,
          },
        },
        create: {
          actorUserId: input.actorUserId,
          direction,
          externalId: input.externalId,
          happenedAt: input.happenedAt,
          inventoryItemId: input.inventory.id,
          metadata,
          movementGroupId,
          note: input.note,
          onHandQuantity: input.inventory.onHandQuantity,
          previousOnHandQuantity: input.inventory.previousOnHandQuantity,
          previousStaffWalletQuantity: input.wallet.previousQuantity,
          productId: input.product.id,
          productVariantId: input.productVariantId,
          quantity: input.quantity,
          source,
          sourceReferenceId: input.externalId,
          staffStockWalletId: wallet.id,
          staffUserId: input.staffUserId,
          staffWalletQuantity: input.wallet.quantity,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: input.movementType,
        },
        update: {
          actorUserId: input.actorUserId,
          direction,
          happenedAt: input.happenedAt,
          inventoryItemId: input.inventory.id,
          metadata,
          movementGroupId,
          note: input.note,
          onHandQuantity: input.inventory.onHandQuantity,
          previousOnHandQuantity: input.inventory.previousOnHandQuantity,
          previousStaffWalletQuantity: input.wallet.previousQuantity,
          productId: input.product.id,
          productVariantId: input.productVariantId,
          quantity: input.quantity,
          source,
          sourceReferenceId: input.externalId,
          staffStockWalletId: wallet.id,
          staffUserId: input.staffUserId,
          staffWalletQuantity: input.wallet.quantity,
        },
        select: {
          id: true,
        },
      })

      return
    }

    await db.inventoryMovement.create({
      data: {
        actorUserId: input.actorUserId,
        direction,
        externalId: null,
        happenedAt: input.happenedAt,
        inventoryItemId: input.inventory.id,
        metadata,
        movementGroupId,
        note: input.note,
        onHandQuantity: input.inventory.onHandQuantity,
        previousOnHandQuantity: input.inventory.previousOnHandQuantity,
        previousStaffWalletQuantity: input.wallet.previousQuantity,
        productId: input.product.id,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        source,
        sourceReferenceId: input.externalId,
        staffStockWalletId: wallet.id,
        staffUserId: input.staffUserId,
        staffWalletQuantity: input.wallet.quantity,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: input.movementType,
      },
      select: {
        id: true,
      },
    })
  } catch (error) {
    if (isDurableStaffStockWalletUnavailable(error)) return

    throw error
  }
}

export function getRetailOpsStaffStockWalletBalance(
  metadata: unknown,
  input: {
    productVariantId: string
    staffUserId: string
  },
) {
  return (
    getStockWalletBalances(metadata).find(
      (balance) =>
        balance.staff.id === input.staffUserId &&
        balance.unit.id === input.productVariantId,
    ) ?? null
  )
}

async function listDurableRetailOpsStaffStockWallets(
  db: PrismaClient,
  input: ListRetailOpsStaffStockWalletsInput,
  limit: number,
): Promise<RetailOpsStaffStockWalletBalance[]> {
  try {
    const wallets = await db.staffStockWallet.findMany({
      where: {
        ...(input.staffUserId ? { staffUserId: input.staffUserId } : {}),
        onHandQuantity: {
          gt: 0,
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      orderBy: [{ lastMovementAt: "desc" }, { updatedAt: "desc" }],
      take: limit,
      select: {
        lastMovementAt: true,
        onHandQuantity: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
        staffUser: {
          select: {
            displayName: true,
            email: true,
            id: true,
            name: true,
          },
        },
        updatedAt: true,
      },
    })

    return wallets.map((wallet) => ({
      product: wallet.product,
      quantity: wallet.onHandQuantity,
      staff: {
        displayName: getDisplayName(wallet.staffUser),
        email: wallet.staffUser.email,
        id: wallet.staffUser.id,
      },
      unit: {
        id: wallet.productVariant.id,
        name: wallet.productVariant.name,
        sku: wallet.productVariant.sku,
      },
      updatedAt: wallet.lastMovementAt ?? wallet.updatedAt,
    }))
  } catch (error) {
    if (isDurableStaffStockWalletUnavailable(error)) return []

    throw error
  }
}

function getStockWalletBalanceKey(balance: RetailOpsStaffStockWalletBalance) {
  return getWalletKey({
    productVariantId: balance.unit.id,
    staffUserId: balance.staff.id,
  })
}

function mergeStaffStockWalletBalances(input: {
  durableRows: RetailOpsStaffStockWalletBalance[]
  fallbackRows: RetailOpsStaffStockWalletBalance[]
  limit: number
}) {
  const seenKeys = new Set<string>()

  return [...input.durableRows, ...input.fallbackRows]
    .filter((balance) => {
      const key = getStockWalletBalanceKey(balance)

      if (seenKeys.has(key)) return false

      seenKeys.add(key)

      return true
    })
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, input.limit)
}

function withStockWalletAssignment(
  metadata: unknown,
  input: {
    assignment: RetailOpsStockWalletAssignmentMetadata
    balance: RetailOpsStaffStockWalletBalance
  },
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const balanceKey = getWalletKey({
    productVariantId: input.balance.unit.id,
    staffUserId: input.balance.staff.id,
  })
  const balances = getStockWalletBalances(metadata).filter(
    (balance) =>
      getWalletKey({
        productVariantId: balance.unit.id,
        staffUserId: balance.staff.id,
      }) !== balanceKey,
  )
  const assignments = getStockWalletAssignments(metadata).filter(
    (assignment) =>
      !input.assignment.externalId ||
      assignment.externalId !== input.assignment.externalId,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      staffStockAssignments: [input.assignment, ...assignments].slice(0, 250),
      staffStockWallets: [
        serializeStockWalletBalance(input.balance),
        ...balances.map(serializeStockWalletBalance),
      ].slice(0, 500),
    },
  } as Prisma.InputJsonValue
}

function withStockWalletReturn(
  metadata: unknown,
  input: {
    balance: RetailOpsStaffStockWalletBalance
    stockReturn: RetailOpsStockWalletReturnMetadata
  },
) {
  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const balanceKey = getWalletKey({
    productVariantId: input.balance.unit.id,
    staffUserId: input.balance.staff.id,
  })
  const balances = getStockWalletBalances(metadata).filter(
    (balance) =>
      getWalletKey({
        productVariantId: balance.unit.id,
        staffUserId: balance.staff.id,
      }) !== balanceKey,
  )

  return {
    ...currentMetadata,
    retailOps: {
      ...retailOps,
      staffStockReturns: [
        input.stockReturn,
        ...getStockWalletReturns(metadata),
      ].slice(0, 250),
      staffStockWallets: [
        ...(input.balance.quantity > 0
          ? [serializeStockWalletBalance(input.balance)]
          : []),
        ...balances.map(serializeStockWalletBalance),
      ].slice(0, 500),
    },
  } as Prisma.InputJsonValue
}

function serializeStockWalletSale(sale: RetailOpsStaffStockWalletSale) {
  return {
    ...sale,
    soldAt: sale.soldAt.toISOString(),
  }
}

export function withRetailOpsStaffStockWalletSale(
  metadata: unknown,
  input: {
    order: {
      id: string
      orderNumber: string
    }
    productVariantId: string
    quantity: number
    soldAt: Date
    staffUserId: string
  },
) {
  const balance = getRetailOpsStaffStockWalletBalance(metadata, {
    productVariantId: input.productVariantId,
    staffUserId: input.staffUserId,
  })

  if (!balance) return null

  if (balance.quantity < input.quantity) {
    throw new RetailOpsStockWalletError(
      "INSUFFICIENT_STOCK",
      "Not enough assigned staff stock is available for this sale.",
    )
  }

  const currentMetadata = asRecord(metadata)
  const retailOps = getRetailOpsMetadata(metadata)
  const balanceKey = getWalletKey({
    productVariantId: input.productVariantId,
    staffUserId: input.staffUserId,
  })
  const remainingQuantity = balance.quantity - input.quantity
  const nextBalance = {
    ...balance,
    quantity: remainingQuantity,
    updatedAt: input.soldAt,
  }
  const balances = getStockWalletBalances(metadata).filter(
    (currentBalance) =>
      getWalletKey({
        productVariantId: currentBalance.unit.id,
        staffUserId: currentBalance.staff.id,
      }) !== balanceKey,
  )
  const sale: RetailOpsStaffStockWalletSale = {
    order: input.order,
    previousQuantity: balance.quantity,
    product: balance.product,
    remainingQuantity,
    soldAt: input.soldAt,
    soldQuantity: input.quantity,
    staff: balance.staff,
    unit: balance.unit,
  }

  return {
    metadata: {
      ...currentMetadata,
      retailOps: {
        ...retailOps,
        staffStockWalletSales: [
          serializeStockWalletSale(sale),
          ...getStockWalletSales(metadata),
        ].slice(0, 250),
        staffStockWallets: [
          ...(remainingQuantity > 0
            ? [serializeStockWalletBalance(nextBalance)]
            : []),
          ...balances.map(serializeStockWalletBalance),
        ].slice(0, 500),
      },
    } as Prisma.InputJsonValue,
    sale,
  }
}

export async function listRetailOpsStaffStockWallets(
  db: PrismaClient,
  input: ListRetailOpsStaffStockWalletsInput,
): Promise<RetailOpsStaffStockWalletBalance[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const [store, durableRows] = await Promise.all([
    db.store.findFirst({
    where: {
      id: input.storeId,
      tenantId: input.tenantId,
      status: { not: "ARCHIVED" },
    },
    select: {
      metadata: true,
    },
    }),
    listDurableRetailOpsStaffStockWallets(db, input, limit),
  ])

  if (!store) return []

  const fallbackRows = getStockWalletBalances(store.metadata)
    .filter((balance) =>
      input.staffUserId ? balance.staff.id === input.staffUserId : true,
    )

  return mergeStaffStockWalletBalances({
    durableRows,
    fallbackRows,
    limit,
  })
}

export async function assignRetailOpsStaffStock(
  db: PrismaClient,
  input: AssignRetailOpsStaffStockInput,
): Promise<AssignedRetailOpsStaffStock> {
  const assignedAt = input.assignedAt ?? new Date()
  const externalId = input.externalId?.trim() || null

  return db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: {
        id: input.storeId,
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
      select: {
        id: true,
        metadata: true,
      },
    })

    if (!store) {
      throw new RetailOpsStockWalletError(
        "STORE_NOT_FOUND",
        "Store not found for this tenant.",
      )
    }

    const replayedAssignment = externalId
      ? findStockAssignmentReplay(store.metadata, externalId)
      : null

    if (replayedAssignment) return replayedAssignment

    const [staffMembership, productVariant] = await Promise.all([
      tx.membership.findFirst({
        where: {
          tenantId: input.tenantId,
          userId: input.staffUserId,
        },
        select: {
          role: true,
          status: true,
          user: {
            select: {
              displayName: true,
              email: true,
              id: true,
              name: true,
            },
          },
        },
      }),
      tx.productVariant.findFirst({
        where: {
          id: input.productVariantId,
          isActive: true,
          product: {
            storeId: input.storeId,
            tenantId: input.tenantId,
            status: { not: "ARCHIVED" },
          },
        },
        select: {
          id: true,
          name: true,
          sku: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ])

    if (
      !staffMembership ||
      !isAssignableStaffMembership({
        role: staffMembership.role,
        status: staffMembership.status,
      })
    ) {
      throw new RetailOpsStockWalletError(
        "STAFF_NOT_FOUND",
        "Active sales staff not found for this business.",
      )
    }

    if (!productVariant) {
      throw new RetailOpsStockWalletError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "Product unit not found for this store.",
      )
    }

    const inventoryItem = await tx.inventoryItem.findUnique({
      where: {
        productVariantId: productVariant.id,
      },
      select: {
        id: true,
        onHandQuantity: true,
        reservedQuantity: true,
      },
    })

    if (
      !inventoryItem ||
      inventoryItem.onHandQuantity - inventoryItem.reservedQuantity <
        input.quantity
    ) {
      throw new RetailOpsStockWalletError(
        "INSUFFICIENT_STOCK",
        "Not enough unassigned stock is available for this staff assignment.",
      )
    }

    const stockUpdate = await tx.inventoryItem.updateMany({
      where: {
        id: inventoryItem.id,
        onHandQuantity: {
          gte: inventoryItem.reservedQuantity + input.quantity,
        },
        reservedQuantity: inventoryItem.reservedQuantity,
      },
      data: {
        onHandQuantity: { decrement: input.quantity },
        updatedByUserId: input.actorUserId,
      },
    })

    if (stockUpdate.count !== 1) {
      throw new RetailOpsStockWalletError(
        "INSUFFICIENT_STOCK",
        "Not enough unassigned stock is available for this staff assignment.",
      )
    }

    const updatedInventory = await tx.inventoryItem.findUniqueOrThrow({
      where: {
        id: inventoryItem.id,
      },
      select: {
        onHandQuantity: true,
      },
    })
    const currentBalance = getStockWalletBalances(store.metadata).find(
      (balance) =>
        balance.staff.id === input.staffUserId &&
        balance.unit.id === productVariant.id,
    )
    const previousQuantity = currentBalance?.quantity ?? 0
    const nextQuantity = previousQuantity + input.quantity
    const balance: RetailOpsStaffStockWalletBalance = {
      product: {
        id: productVariant.product.id,
        name: productVariant.product.name,
      },
      quantity: nextQuantity,
      staff: {
        displayName: getDisplayName(staffMembership.user),
        email: staffMembership.user.email,
        id: staffMembership.user.id,
      },
      unit: {
        id: productVariant.id,
        name: productVariant.name,
        sku: productVariant.sku,
      },
      updatedAt: assignedAt,
    }
    const assignment: RetailOpsStockWalletAssignmentMetadata = {
      actorUserId: input.actorUserId,
      assignedAt: assignedAt.toISOString(),
      externalId,
      inventory: {
        onHandQuantity: updatedInventory.onHandQuantity,
        previousOnHandQuantity: inventoryItem.onHandQuantity,
        productVariantId: productVariant.id,
      },
      note: input.note?.trim() || null,
      product: balance.product,
      quantity: input.quantity,
      staff: balance.staff,
      unit: balance.unit,
      wallet: {
        previousQuantity,
        quantity: nextQuantity,
      },
    }

    await tx.store.update({
      where: {
        id: store.id,
      },
      data: {
        metadata: withStockWalletAssignment(store.metadata, {
          assignment,
          balance,
        }),
      },
      select: {
        id: true,
      },
    })

    await writeDurableStaffStockWalletMovement(tx, {
      actorUserId: input.actorUserId,
      externalId,
      happenedAt: assignedAt,
      inventory: {
        id: inventoryItem.id,
        onHandQuantity: assignment.inventory.onHandQuantity,
        previousOnHandQuantity: assignment.inventory.previousOnHandQuantity,
      },
      movementType: DurableInventoryMovementType.STAFF_ASSIGNMENT,
      note: assignment.note,
      product: balance.product,
      productVariantId: productVariant.id,
      quantity: input.quantity,
      staffUserId: input.staffUserId,
      storeId: input.storeId,
      tenantId: input.tenantId,
      wallet: {
        previousQuantity,
        quantity: nextQuantity,
      },
    })

    return {
      assignment: {
        actorUserId: input.actorUserId,
        assignedAt,
        externalId,
        note: assignment.note,
        quantity: input.quantity,
      },
      inventory: assignment.inventory,
      wallet: {
        ...balance,
        previousQuantity,
      },
    }
  })
}

export async function returnRetailOpsStaffStock(
  db: PrismaClient,
  input: ReturnRetailOpsStaffStockInput,
): Promise<ReturnedRetailOpsStaffStock> {
  const returnedAt = input.returnedAt ?? new Date()
  const externalId = input.externalId?.trim() || null

  return db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: {
        id: input.storeId,
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" },
      },
      select: {
        id: true,
        metadata: true,
      },
    })

    if (!store) {
      throw new RetailOpsStockWalletError(
        "STORE_NOT_FOUND",
        "Store not found for this tenant.",
      )
    }

    const replayedReturn = externalId
      ? findStockReturnReplay(store.metadata, externalId)
      : null

    if (replayedReturn) return replayedReturn

    const [staffMembership, productVariant] = await Promise.all([
      tx.membership.findFirst({
        where: {
          tenantId: input.tenantId,
          userId: input.staffUserId,
        },
        select: {
          role: true,
          status: true,
        },
      }),
      tx.productVariant.findFirst({
        where: {
          id: input.productVariantId,
          product: {
            storeId: input.storeId,
            tenantId: input.tenantId,
            status: { not: "ARCHIVED" },
          },
        },
        select: {
          id: true,
        },
      }),
    ])

    if (
      !staffMembership ||
      !isReturnableStaffMembership({
        role: staffMembership.role,
        status: staffMembership.status,
      })
    ) {
      throw new RetailOpsStockWalletError(
        "STAFF_NOT_FOUND",
        "Sales staff not found for this business.",
      )
    }

    if (!productVariant) {
      throw new RetailOpsStockWalletError(
        "PRODUCT_VARIANT_NOT_FOUND",
        "Product unit not found for this store.",
      )
    }

    const currentBalance = getRetailOpsStaffStockWalletBalance(store.metadata, {
      productVariantId: productVariant.id,
      staffUserId: input.staffUserId,
    })

    if (!currentBalance || currentBalance.quantity < input.quantity) {
      throw new RetailOpsStockWalletError(
        "INSUFFICIENT_STOCK",
        "Not enough assigned staff stock is available for this return.",
      )
    }

    const inventoryItem = await tx.inventoryItem.findUnique({
      where: {
        productVariantId: productVariant.id,
      },
      select: {
        id: true,
        onHandQuantity: true,
      },
    })
    const updatedInventory = await tx.inventoryItem.upsert({
      where: {
        productVariantId: productVariant.id,
      },
      create: {
        onHandQuantity: input.quantity,
        productVariantId: productVariant.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
        updatedByUserId: input.actorUserId,
      },
      update: {
        onHandQuantity: { increment: input.quantity },
        updatedByUserId: input.actorUserId,
      },
      select: {
        id: true,
        onHandQuantity: true,
      },
    })
    const previousQuantity = currentBalance.quantity
    const nextQuantity = previousQuantity - input.quantity
    const nextBalance: RetailOpsStaffStockWalletBalance = {
      ...currentBalance,
      quantity: nextQuantity,
      updatedAt: returnedAt,
    }
    const stockReturn: RetailOpsStockWalletReturnMetadata = {
      actorUserId: input.actorUserId,
      externalId,
      inventory: {
        onHandQuantity: updatedInventory.onHandQuantity,
        previousOnHandQuantity: inventoryItem?.onHandQuantity ?? 0,
        productVariantId: productVariant.id,
      },
      note: input.note?.trim() || null,
      product: currentBalance.product,
      quantity: input.quantity,
      returnedAt: returnedAt.toISOString(),
      staff: currentBalance.staff,
      unit: currentBalance.unit,
      wallet: {
        previousQuantity,
        quantity: nextQuantity,
      },
    }

    await tx.store.update({
      where: {
        id: store.id,
      },
      data: {
        metadata: withStockWalletReturn(store.metadata, {
          balance: nextBalance,
          stockReturn,
        }),
      },
      select: {
        id: true,
      },
    })

    await writeDurableStaffStockWalletMovement(tx, {
      actorUserId: input.actorUserId,
      externalId,
      happenedAt: returnedAt,
      inventory: {
        id: updatedInventory.id,
        onHandQuantity: stockReturn.inventory.onHandQuantity,
        previousOnHandQuantity: stockReturn.inventory.previousOnHandQuantity,
      },
      movementType: DurableInventoryMovementType.STAFF_RETURN,
      note: stockReturn.note,
      product: currentBalance.product,
      productVariantId: productVariant.id,
      quantity: input.quantity,
      staffUserId: input.staffUserId,
      storeId: input.storeId,
      tenantId: input.tenantId,
      wallet: {
        previousQuantity,
        quantity: nextQuantity,
      },
    })

    return {
      inventory: stockReturn.inventory,
      stockReturn: {
        actorUserId: input.actorUserId,
        externalId,
        note: stockReturn.note,
        quantity: input.quantity,
        returnedAt,
      },
      wallet: {
        ...nextBalance,
        previousQuantity,
      },
    }
  })
}
