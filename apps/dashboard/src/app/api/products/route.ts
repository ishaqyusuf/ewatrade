import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

// ── Schemas ─────────────────────────────────────────────────────────────────

const optionSchema = z.object({
  name: z.string().min(1).max(100),
  values: z.array(z.string().min(1).max(100)).min(1).max(50),
})

// A variant row as sent from the client.
// For products with options, selectedOptions maps option name → chosen value
// e.g. { "Size": "M", "Color": "Red" }
const variantSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(100),
  optionSummary: z.string().max(300).optional(),
  priceMinor: z.number().int().min(0),
  compareAtMinor: z.number().int().min(0).optional(),
  isDefault: z.boolean().default(false),
  selectedOptions: z.record(z.string(), z.string()).optional(),
})

const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  sku: z.string().max(100).optional(),
  listPriceMinor: z.number().int().min(0),
  salePriceMinor: z.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  isMarketplaceListed: z.boolean().default(false),
  // Options are only present for multi-variant products
  options: z.array(optionSchema).max(3).optional(),
  variants: z.array(variantSchema).min(1),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

// ── GET /api/products ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getServerSession()
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx?.activeStore)
    return NextResponse.json({ error: "Store not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get("status")
  const validStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const
  const status = validStatuses.includes(statusParam as (typeof validStatuses)[number])
    ? (statusParam as (typeof validStatuses)[number])
    : null

  const products = await prisma.product.findMany({
    where: {
      storeId: ctx.activeStore.id,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      status: true,
      listPriceMinor: true,
      salePriceMinor: true,
      currencyCode: true,
      isPublished: true,
      isMarketplaceListed: true,
      createdAt: true,
      _count: { select: { variants: true } },
      variants: {
        where: { isActive: true },
        select: {
          inventoryItem: {
            select: { onHandQuantity: true },
          },
        },
      },
    },
  })

  return NextResponse.json({ products })
}

// ── POST /api/products ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx?.activeStore)
    return NextResponse.json({ error: "Store not found" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = createProductSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const {
    name,
    description,
    sku,
    listPriceMinor,
    salePriceMinor,
    status,
    isMarketplaceListed,
    options,
    variants,
  } = parsed.data

  // Generate unique product slug
  const baseSlug = toSlug(name) || "product"
  let slug = baseSlug
  let attempt = 0
  while (true) {
    const existing = await prisma.product.findUnique({
      where: { storeId_slug: { storeId: ctx.activeStore.id, slug } },
    })
    if (!existing) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  // Product-level SKU uniqueness
  if (sku) {
    const existing = await prisma.product.findUnique({
      where: { storeId_sku: { storeId: ctx.activeStore.id, sku } },
    })
    if (existing) {
      return NextResponse.json(
        { error: "A product with this SKU already exists" },
        { status: 409 },
      )
    }
  }

  // Variant SKU uniqueness within this product
  const variantSkus = variants.map((v) => v.sku)
  if (new Set(variantSkus).size !== variantSkus.length) {
    return NextResponse.json(
      { error: "Variant SKUs must be unique" },
      { status: 400 },
    )
  }

  const storeId = ctx.activeStore.id
  const tenantId = ctx.tenant.id

  // ── Transactional create ───────────────────────────────────────────────────
  const product = await prisma.$transaction(async (tx) => {
    // 1. Create product
    const p = await tx.product.create({
      data: {
        tenantId,
        storeId,
        slug,
        name,
        description: description ?? null,
        sku: sku ?? null,
        listPriceMinor,
        salePriceMinor: salePriceMinor ?? null,
        currencyCode: ctx.activeStore!.currencyCode,
        status,
        isPublished: status === "ACTIVE",
        isMarketplaceListed,
      },
      select: { id: true },
    })

    // 2. Create option axes + values, build lookup map
    //    optionValueIdMap: "Size:S" → "cuid..."
    const optionValueIdMap = new Map<string, string>()

    if (options && options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        const opt = options[i]
        const optionRecord = await tx.productOption.create({
          data: {
            productId: p.id,
            name: opt.name,
            position: i,
            values: {
              create: opt.values.map((val, j) => ({ value: val, position: j })),
            },
          },
          select: {
            id: true,
            name: true,
            values: { select: { id: true, value: true } },
          },
        })
        for (const ov of optionRecord.values) {
          optionValueIdMap.set(`${optionRecord.name}:${ov.value}`, ov.id)
        }
      }
    }

    // 3. Create variants with inventory items and option-value links
    for (const v of variants) {
      const variant = await tx.productVariant.create({
        data: {
          productId: p.id,
          sku: v.sku,
          name: v.name,
          optionSummary: v.optionSummary ?? null,
          priceMinor: v.priceMinor,
          compareAtMinor: v.compareAtMinor ?? null,
          isDefault: v.isDefault,
          inventoryItem: {
            create: { tenantId, storeId, onHandQuantity: 0, reservedQuantity: 0 },
          },
        },
        select: { id: true },
      })

      // Link option values if selectedOptions provided
      if (v.selectedOptions && optionValueIdMap.size > 0) {
        const links = Object.entries(v.selectedOptions)
          .map(([optName, val]) => optionValueIdMap.get(`${optName}:${val}`))
          .filter((id): id is string => id !== undefined)

        if (links.length > 0) {
          await tx.productVariantOptionValue.createMany({
            data: links.map((optionValueId) => ({
              variantId: variant.id,
              optionValueId,
            })),
          })
        }
      }
    }

    return p
  })

  return NextResponse.json(
    { success: true, product: { id: product.id, slug } },
    { status: 201 },
  )
}
