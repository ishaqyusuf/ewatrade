import { getDashboardInventory } from "@/lib/inventory-data"
import { canOperateInventory } from "@/lib/inventory-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import {
  RetailOpsStockError,
  recordRetailOpsStockAdjustment,
  recordRetailOpsStockIntake,
  recordRetailOpsUnitConversion,
} from "@ewatrade/db/queries"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const stockIntakeSchema = z.object({
  externalId: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  operation: z.literal("intake"),
  productVariantId: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive().max(1_000_000),
  receivedAt: z.coerce.date().optional(),
  sourceName: z.string().trim().min(1).max(160).optional(),
  storeId: z.string().trim().min(1).optional(),
})

const stockAdjustmentSchema = z.object({
  adjustedAt: z.coerce.date().optional(),
  direction: z.enum(["decrease", "increase"]),
  externalId: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  operation: z.literal("adjustment"),
  productVariantId: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive().max(1_000_000),
  reason: z
    .enum(["correction", "damage", "found_stock", "loss"])
    .default("correction"),
  sourceName: z.string().trim().min(1).max(160).optional(),
  storeId: z.string().trim().min(1).optional(),
})

const unitConversionSchema = z.object({
  convertedAt: z.coerce.date().optional(),
  externalId: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  operation: z.literal("conversion"),
  sourceProductVariantId: z.string().trim().min(1),
  sourceQuantity: z.coerce.number().int().positive().max(1_000_000),
  storeId: z.string().trim().min(1).optional(),
  targetProductVariantId: z.string().trim().min(1),
  targetQuantity: z.coerce.number().int().positive().max(1_000_000),
})

const inventoryOperationSchema = z.discriminatedUnion("operation", [
  stockIntakeSchema,
  stockAdjustmentSchema,
  unitConversionSchema,
])

function getStockErrorStatus(error: RetailOpsStockError) {
  if (error.code === "INSUFFICIENT_STOCK") return 409
  if (error.code === "PRODUCT_VARIANT_NOT_FOUND") return 404

  return 400
}

function createExternalId(operation: string) {
  return `dashboard:${operation}:${crypto.randomUUID()}`
}

async function getInventoryContext(requestedStoreId?: string) {
  const session = await getServerSession()

  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    return {
      error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }),
    }
  }

  if (!canOperateInventory(ctx.membership.role)) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission to operate inventory." },
        { status: 403 },
      ),
    }
  }

  const store = requestedStoreId
    ? ctx.stores.find((item) => item.id === requestedStoreId)
    : (ctx.activeStore ?? ctx.stores[0] ?? null)

  if (!store) {
    return {
      error: NextResponse.json(
        { error: "Create a store before operating inventory." },
        { status: 404 },
      ),
    }
  }

  return { ctx, session, store }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get("storeId") ?? undefined
  const productVariantId =
    url.searchParams.get("productVariantId")?.trim() || undefined
  const inventoryContext = await getInventoryContext(storeId)

  if ("error" in inventoryContext) return inventoryContext.error

  const { ctx, store } = inventoryContext
  const inventory = await getDashboardInventory({
    productVariantId,
    storeId: store.id,
    tenantId: ctx.tenant.id,
  })

  return NextResponse.json({
    ...inventory,
    store,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = inventoryOperationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const inventoryContext = await getInventoryContext(parsed.data.storeId)

  if ("error" in inventoryContext) return inventoryContext.error

  const { ctx, session, store } = inventoryContext

  try {
    if (parsed.data.operation === "intake") {
      const result = await recordRetailOpsStockIntake(prisma, {
        actorUserId: session.user.id,
        externalId:
          parsed.data.externalId ?? createExternalId(parsed.data.operation),
        note: parsed.data.note,
        productVariantId: parsed.data.productVariantId,
        quantity: parsed.data.quantity,
        receivedAt: parsed.data.receivedAt,
        sourceName: parsed.data.sourceName,
        storeId: store.id,
        tenantId: ctx.tenant.id,
      })

      return NextResponse.json({ result })
    }

    if (parsed.data.operation === "adjustment") {
      const result = await recordRetailOpsStockAdjustment(prisma, {
        actorUserId: session.user.id,
        adjustedAt: parsed.data.adjustedAt,
        direction: parsed.data.direction,
        externalId:
          parsed.data.externalId ?? createExternalId(parsed.data.operation),
        note: parsed.data.note,
        productVariantId: parsed.data.productVariantId,
        quantity: parsed.data.quantity,
        reason: parsed.data.reason,
        sourceName: parsed.data.sourceName,
        storeId: store.id,
        tenantId: ctx.tenant.id,
      })

      return NextResponse.json({ result })
    }

    const result = await recordRetailOpsUnitConversion(prisma, {
      actorUserId: session.user.id,
      convertedAt: parsed.data.convertedAt,
      externalId:
        parsed.data.externalId ?? createExternalId(parsed.data.operation),
      note: parsed.data.note,
      sourceProductVariantId: parsed.data.sourceProductVariantId,
      sourceQuantity: parsed.data.sourceQuantity,
      storeId: store.id,
      targetProductVariantId: parsed.data.targetProductVariantId,
      targetQuantity: parsed.data.targetQuantity,
      tenantId: ctx.tenant.id,
    })

    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof RetailOpsStockError) {
      return NextResponse.json(
        { error: error.message },
        { status: getStockErrorStatus(error) },
      )
    }

    throw error
  }
}
