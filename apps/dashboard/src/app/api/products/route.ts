import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

// ── Schemas ─────────────────────────────────────────────────────────────────

const variantSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(100),
  optionSummary: z.string().max(200).optional(),
  priceMinor: z.number().int().min(0),
  compareAtMinor: z.number().int().min(0).optional(),
  isDefault: z.boolean().default(false),
})

const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  sku: z.string().max(100).optional(),
  listPriceMinor: z.number().int().min(0),
  salePriceMinor: z.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  isMarketplaceListed: z.boolean().default(false),
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

  // Check product-level SKU uniqueness
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

  // Check variant SKU uniqueness (within product)
  const variantSkus = variants.map((v) => v.sku)
  if (new Set(variantSkus).size !== variantSkus.length) {
    return NextResponse.json(
      { error: "Variant SKUs must be unique" },
      { status: 400 },
    )
  }

  const product = await prisma.product.create({
    data: {
      tenantId: ctx.tenant.id,
      storeId: ctx.activeStore.id,
      slug,
      name,
      description: description ?? null,
      sku: sku ?? null,
      listPriceMinor,
      salePriceMinor: salePriceMinor ?? null,
      currencyCode: ctx.activeStore.currencyCode,
      status,
      isPublished: status === "ACTIVE",
      isMarketplaceListed,
      variants: {
        create: variants.map((v) => ({
          sku: v.sku,
          name: v.name,
          optionSummary: v.optionSummary ?? null,
          priceMinor: v.priceMinor,
          compareAtMinor: v.compareAtMinor ?? null,
          isDefault: v.isDefault,
          inventoryItem: {
            create: {
              tenantId: ctx.tenant.id,
              storeId: ctx.activeStore!.id,
              onHandQuantity: 0,
              reservedQuantity: 0,
            },
          },
        })),
      },
    },
    select: { id: true, slug: true, name: true, status: true },
  })

  return NextResponse.json({ success: true, product }, { status: 201 })
}
