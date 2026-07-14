import { canManageProductCatalog } from "@/lib/product-catalog"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import {
  RetailOpsProductError,
  updateRetailOpsProductUnitPrice,
} from "@ewatrade/db/queries"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const updateProductSchema = z.object({
  description: z.string().trim().max(1000).nullable().optional(),
  name: z.string().trim().min(1).max(160),
  priceMinor: z.coerce.number().int().positive(),
  primaryUnitName: z.string().trim().min(1).max(80),
  status: z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]).default("ACTIVE"),
  storeId: z.string().trim().min(1).optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  if (!canManageProductCatalog(ctx.membership.role)) {
    return NextResponse.json(
      { error: "You do not have permission to manage products." },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = updateProductSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { productId } = await context.params
  const store = parsed.data.storeId
    ? ctx.stores.find((item) => item.id === parsed.data.storeId)
    : (ctx.activeStore ?? ctx.stores[0] ?? null)

  if (!store) {
    return NextResponse.json(
      { error: "Create a store before managing products." },
      { status: 404 },
    )
  }

  const product = await prisma.product.findFirst({
    select: {
      id: true,
      variants: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          isDefault: true,
          priceMinor: true,
        },
      },
    },
    where: {
      id: productId,
      storeId: store.id,
      tenantId: ctx.tenant.id,
    },
  })
  const defaultUnit =
    product?.variants.find((variant) => variant.isDefault) ??
    product?.variants[0] ??
    null

  if (!product || !defaultUnit) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 })
  }

  await prisma.product.update({
    data: {
      description: parsed.data.description ?? null,
      listPriceMinor: parsed.data.priceMinor,
      name: parsed.data.name,
      status: parsed.data.status,
      variants: {
        update: {
          data: {
            name: parsed.data.primaryUnitName,
          },
          where: {
            id: defaultUnit.id,
          },
        },
      },
    },
    where: {
      id: product.id,
    },
  })

  if (defaultUnit.priceMinor !== parsed.data.priceMinor) {
    try {
      await updateRetailOpsProductUnitPrice(prisma, {
        actorUserId: session.user.id,
        priceMinor: parsed.data.priceMinor,
        productVariantId: defaultUnit.id,
        reason: "Dashboard product edit",
        storeId: store.id,
        tenantId: ctx.tenant.id,
      })
    } catch (error) {
      if (error instanceof RetailOpsProductError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      throw error
    }
  }

  return NextResponse.json({ success: true })
}
