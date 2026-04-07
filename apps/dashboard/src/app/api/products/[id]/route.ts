import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

// ── Schemas ──────────────────────────────────────────────────────────────────

const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  listPriceMinor: z.number().int().min(0).optional(),
  salePriceMinor: z.number().int().min(0).optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  isMarketplaceListed: z.boolean().optional(),
  isPublished: z.boolean().optional(),
})

const addVariantSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(100),
  optionSummary: z.string().max(200).optional(),
  priceMinor: z.number().int().min(0),
  compareAtMinor: z.number().int().min(0).optional(),
  isDefault: z.boolean().default(false),
})

const updateVariantSchema = z.object({
  variantId: z.string(),
  name: z.string().min(1).max(200).optional(),
  sku: z.string().min(1).max(100).optional(),
  optionSummary: z.string().max(200).optional().nullable(),
  priceMinor: z.number().int().min(0).optional(),
  compareAtMinor: z.number().int().min(0).optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// ── GET /api/products/[id] ───────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession()
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx?.activeStore)
    return NextResponse.json({ error: "Store not found" }, { status: 404 })

  const product = await prisma.product.findFirst({
    where: { id, storeId: ctx.activeStore.id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      sku: true,
      status: true,
      listPriceMinor: true,
      salePriceMinor: true,
      currencyCode: true,
      isPublished: true,
      isMarketplaceListed: true,
      createdAt: true,
      updatedAt: true,
      options: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          position: true,
          values: {
            orderBy: { position: "asc" },
            select: { id: true, value: true, position: true },
          },
        },
      },
      variants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          optionSummary: true,
          priceMinor: true,
          compareAtMinor: true,
          isDefault: true,
          isActive: true,
          inventoryItem: {
            select: { id: true, onHandQuantity: true, reservedQuantity: true },
          },
          selectedOptions: {
            select: {
              optionValue: {
                select: {
                  id: true,
                  value: true,
                  option: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!product)
    return NextResponse.json({ error: "Product not found" }, { status: 404 })

  return NextResponse.json({ product })
}

// ── PATCH /api/products/[id] ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession()
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx?.activeStore)
    return NextResponse.json({ error: "Store not found" }, { status: 404 })

  // Verify product belongs to this store
  const existing = await prisma.product.findFirst({
    where: { id, storeId: ctx.activeStore.id },
    select: { id: true, sku: true },
  })
  if (!existing)
    return NextResponse.json({ error: "Product not found" }, { status: 404 })

  const body = await request.json().catch(() => null)

  // Check if this is a variant operation
  if (body && "variantOp" in body) {
    return handleVariantOp(body, id, ctx.activeStore.id, ctx.tenant.id)
  }

  const parsed = updateProductSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const data = parsed.data

  // SKU uniqueness check if changing SKU
  if (data.sku !== undefined && data.sku !== null && data.sku !== existing.sku) {
    const skuConflict = await prisma.product.findUnique({
      where: { storeId_sku: { storeId: ctx.activeStore.id, sku: data.sku } },
    })
    if (skuConflict) {
      return NextResponse.json(
        { error: "A product with this SKU already exists" },
        { status: 409 },
      )
    }
  }

  // Derive isPublished from status if status is being updated
  const isPublished =
    data.isPublished !== undefined
      ? data.isPublished
      : data.status === "ACTIVE"
        ? true
        : data.status === "DRAFT" || data.status === "ARCHIVED"
          ? false
          : undefined

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.listPriceMinor !== undefined && {
        listPriceMinor: data.listPriceMinor,
      }),
      ...(data.salePriceMinor !== undefined && {
        salePriceMinor: data.salePriceMinor,
      }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.isMarketplaceListed !== undefined && {
        isMarketplaceListed: data.isMarketplaceListed,
      }),
      ...(isPublished !== undefined && { isPublished }),
    },
    select: { id: true, name: true, status: true, isPublished: true },
  })

  return NextResponse.json({ success: true, product })
}

// ── DELETE /api/products/[id] ────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession()
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx?.activeStore)
    return NextResponse.json({ error: "Store not found" }, { status: 404 })

  const existing = await prisma.product.findFirst({
    where: { id, storeId: ctx.activeStore.id },
    select: { id: true },
  })
  if (!existing)
    return NextResponse.json({ error: "Product not found" }, { status: 404 })

  try {
    await prisma.product.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      {
        error:
          "Cannot delete this product — it has existing order history. Archive it instead.",
      },
      { status: 409 },
    )
  }
}

// ── Variant operation handler ────────────────────────────────────────────────

async function handleVariantOp(
  // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch body
  body: any,
  productId: string,
  storeId: string,
  tenantId: string,
) {
  const op = body.variantOp as string

  if (op === "add") {
    const parsed = addVariantSchema.safeParse(body.data)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid variant data", issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const d = parsed.data

    // Check SKU uniqueness within product
    const existing = await prisma.productVariant.findUnique({
      where: { productId_sku: { productId, sku: d.sku } },
    })
    if (existing) {
      return NextResponse.json(
        { error: "A variant with this SKU already exists" },
        { status: 409 },
      )
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: d.sku,
        name: d.name,
        optionSummary: d.optionSummary ?? null,
        priceMinor: d.priceMinor,
        compareAtMinor: d.compareAtMinor ?? null,
        isDefault: d.isDefault,
        inventoryItem: {
          create: { tenantId, storeId, onHandQuantity: 0, reservedQuantity: 0 },
        },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        priceMinor: true,
        isDefault: true,
        isActive: true,
      },
    })

    return NextResponse.json({ success: true, variant }, { status: 201 })
  }

  if (op === "update") {
    const parsed = updateVariantSchema.safeParse(body.data)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid variant data", issues: parsed.error.issues },
        { status: 400 },
      )
    }
    const { variantId, ...updates } = parsed.data

    // Verify variant belongs to this product
    const existing = await prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json(
        { error: "Variant not found" },
        { status: 404 },
      )
    }

    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.sku !== undefined && { sku: updates.sku }),
        ...(updates.optionSummary !== undefined && {
          optionSummary: updates.optionSummary,
        }),
        ...(updates.priceMinor !== undefined && {
          priceMinor: updates.priceMinor,
        }),
        ...(updates.compareAtMinor !== undefined && {
          compareAtMinor: updates.compareAtMinor,
        }),
        ...(updates.isDefault !== undefined && { isDefault: updates.isDefault }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
      },
      select: { id: true, name: true, sku: true, priceMinor: true, isActive: true },
    })

    return NextResponse.json({ success: true, variant })
  }

  return NextResponse.json({ error: "Unknown variant operation" }, { status: 400 })
}
