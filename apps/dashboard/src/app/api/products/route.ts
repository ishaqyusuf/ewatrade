import { canManageProductCatalog } from "@/lib/product-catalog"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import type { ProductStatus } from "@ewatrade/db/enums"
import {
  RetailOpsProductError,
  RetailOpsSubscriptionError,
  createRetailOpsProduct,
} from "@ewatrade/db/queries"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const productVariantSchema = z.object({
  conversionMultiplier: z.coerce.number().positive().optional(),
  name: z.string().trim().min(1).max(80),
  openingStockQuantity: z.coerce.number().int().min(0).default(0),
  priceMinor: z.coerce.number().int().positive(),
})

const createProductSchema = z.object({
  description: z.string().trim().max(1000).optional(),
  imageUrl: z.url().max(2000).optional().or(z.literal("")),
  name: z.string().trim().min(1).max(160),
  openingStockQuantity: z.coerce.number().int().min(0).default(0),
  priceMinor: z.coerce.number().int().positive(),
  primaryUnitName: z.string().trim().min(1).max(80),
  storeId: z.string().trim().min(1).optional(),
  unitTemplateKey: z.string().trim().min(1).max(120).optional(),
  variants: z.array(productVariantSchema).max(4).default([]),
})

type ProductListItem = {
  currencyCode: string
  description: string | null
  id: string
  metadata: unknown
  name: string
  slug: string
  status: string
  updatedAt: Date
  variants: Array<{
    id: string
    inventoryItem: { onHandQuantity: number } | null
    isDefault: boolean
    name: string
    priceMinor: number
    sku: string | null
  }>
}

async function getProductContext(requestedStoreId?: string) {
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

  if (!canManageProductCatalog(ctx.membership.role)) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission to manage products." },
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
        { error: "Create a store before managing products." },
        { status: 404 },
      ),
    }
  }

  return { ctx, session, store }
}

function getImageUrl(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null

  const retailOps = (metadata as { retailOps?: unknown }).retailOps
  if (!retailOps || typeof retailOps !== "object") return null

  const imageUrl = (retailOps as { imageUrl?: unknown }).imageUrl
  return typeof imageUrl === "string" && imageUrl ? imageUrl : null
}

function mapProduct(input: {
  currencyCode: string
  description: string | null
  id: string
  metadata: unknown
  name: string
  slug: string
  status: string
  updatedAt: Date
  variants: Array<{
    id: string
    inventoryItem: { onHandQuantity: number } | null
    isDefault: boolean
    name: string
    priceMinor: number
    sku: string | null
  }>
}) {
  return {
    currencyCode: input.currencyCode,
    description: input.description,
    id: input.id,
    imageUrl: getImageUrl(input.metadata),
    name: input.name,
    slug: input.slug,
    status: input.status,
    units: input.variants.map((variant) => ({
      id: variant.id,
      isDefault: variant.isDefault,
      name: variant.name,
      onHandQuantity: variant.inventoryItem?.onHandQuantity ?? 0,
      priceMinor: variant.priceMinor,
      sku: variant.sku,
    })),
    updatedAt: input.updatedAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get("storeId") ?? undefined
  const search = url.searchParams.get("search")?.trim() ?? ""
  const status = url.searchParams.get("status")?.trim().toUpperCase() ?? ""
  const statusFilter = ["ACTIVE", "ARCHIVED", "DRAFT"].includes(status)
    ? (status as ProductStatus)
    : undefined
  const productContext = await getProductContext(storeId)

  if ("error" in productContext) return productContext.error

  const { ctx, store } = productContext
  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      currencyCode: true,
      description: true,
      id: true,
      metadata: true,
      name: true,
      slug: true,
      status: true,
      updatedAt: true,
      variants: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          inventoryItem: {
            select: {
              onHandQuantity: true,
            },
          },
          isDefault: true,
          name: true,
          priceMinor: true,
          sku: true,
        },
      },
    },
    take: 100,
    where: {
      status: statusFilter,
      storeId: store.id,
      tenantId: ctx.tenant.id,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              {
                variants: {
                  some: {
                    OR: [
                      { name: { contains: search, mode: "insensitive" } },
                      { sku: { contains: search, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
  })
  const histories = products.length
    ? await prisma.productUnitPriceHistory.findMany({
        orderBy: { effectiveAt: "desc" },
        select: {
          effectiveAt: true,
          id: true,
          priceMinor: true,
          previousPriceMinor: true,
          productId: true,
          reason: true,
        },
        take: 100,
        where: {
          productId: { in: products.map((product) => product.id) },
          storeId: store.id,
          tenantId: ctx.tenant.id,
        },
      })
    : []
  const historyByProduct = new Map<string, typeof histories>()

  for (const history of histories) {
    const existing = historyByProduct.get(history.productId) ?? []
    if (existing.length < 3) {
      existing.push(history)
      historyByProduct.set(history.productId, existing)
    }
  }

  return NextResponse.json({
    products: (products as ProductListItem[]).map((product) => ({
      ...mapProduct(product),
      priceHistory: (historyByProduct.get(product.id) ?? []).map((history) => ({
        effectiveAt: history.effectiveAt.toISOString(),
        id: history.id,
        priceMinor: history.priceMinor,
        previousPriceMinor: history.previousPriceMinor,
        reason: history.reason,
      })),
    })),
    store,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = createProductSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const productContext = await getProductContext(parsed.data.storeId)

  if ("error" in productContext) return productContext.error

  const { ctx, session, store } = productContext

  try {
    const product = await createRetailOpsProduct(prisma, {
      actorUserId: session.user.id,
      description: parsed.data.description,
      imageUrl: parsed.data.imageUrl || undefined,
      name: parsed.data.name,
      openingStockQuantity: parsed.data.openingStockQuantity,
      priceMinor: parsed.data.priceMinor,
      primaryUnitName: parsed.data.primaryUnitName,
      storeId: store.id,
      tenantId: ctx.tenant.id,
      unitTemplateKey: parsed.data.unitTemplateKey,
      variants: parsed.data.variants,
    })

    return NextResponse.json({ product, success: true }, { status: 201 })
  } catch (error) {
    if (
      error instanceof RetailOpsProductError ||
      error instanceof RetailOpsSubscriptionError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    throw error
  }
}
