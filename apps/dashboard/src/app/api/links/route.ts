import { getServerSession } from "@/lib/session"
import { getDashboardShareLinks } from "@/lib/share-links-data"
import {
  canManageAllShareLinks,
  canUseShareLinks,
} from "@/lib/share-links-operations"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import {
  RetailOpsShareLinkError,
  createRetailOpsProductShareLink,
  deactivateRetailOpsProductShareLink,
  updateRetailOpsSharedLinkOrderRequestStatus,
} from "@ewatrade/db/queries"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const orderStatusSchema = z.enum(["all", "cancelled", "completed", "pending"])

const createLinkSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  operation: z.literal("create_link"),
  productId: z.string().trim().min(1),
  storeId: z.string().trim().min(1).optional(),
})

const deactivateLinkSchema = z.object({
  operation: z.literal("deactivate_link"),
  productId: z.string().trim().min(1),
  shareLinkId: z.string().trim().min(1),
  storeId: z.string().trim().min(1).optional(),
})

const followUpSchema = z.object({
  fulfillmentMethod: z.enum(["delivery", "other", "pickup"]).optional(),
  fulfillmentNote: z.string().trim().max(500).optional(),
  fulfillmentStatus: z
    .enum(["delivered", "pending", "picked_up", "ready_for_pickup"])
    .optional(),
  operation: z.literal("order_follow_up"),
  orderId: z.string().trim().min(1),
  paymentMethod: z.enum(["card", "cash", "transfer"]).optional(),
  status: z.enum(["cancelled", "completed"]),
  storeId: z.string().trim().min(1).optional(),
})

const linkOperationSchema = z.discriminatedUnion("operation", [
  createLinkSchema,
  deactivateLinkSchema,
  followUpSchema,
])

function getOrderStatus(value: string | null) {
  const parsed = orderStatusSchema.safeParse(value ?? undefined)

  return parsed.success ? parsed.data : "pending"
}

function getPublicProductBaseUrl() {
  return (
    process.env.STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ewatrade.com"
  )
}

function createExternalId(operation: string) {
  return `dashboard:${operation}:${crypto.randomUUID()}`
}

function getShareLinkErrorStatus(error: RetailOpsShareLinkError) {
  if (
    error.code === "INSUFFICIENT_STOCK" ||
    error.code === "ORDER_REQUEST_ALREADY_FINALIZED"
  ) {
    return 409
  }

  if (
    error.code === "ORDER_REQUEST_FORBIDDEN" ||
    error.code === "SHARE_LINK_FORBIDDEN"
  ) {
    return 403
  }

  return 404
}

async function getLinksContext(requestedStoreId?: string) {
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

  if (!canUseShareLinks(ctx.membership.role)) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission to manage generated links." },
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
        { error: "Create a store before managing generated links." },
        { status: 404 },
      ),
    }
  }

  return { ctx, session, store }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get("storeId") ?? undefined
  const linksContext = await getLinksContext(storeId)

  if ("error" in linksContext) return linksContext.error

  const { ctx, session, store } = linksContext
  const data = await getDashboardShareLinks({
    orderStatus: getOrderStatus(url.searchParams.get("orderStatus")),
    role: ctx.membership.role,
    storeId: store.id,
    tenantId: ctx.tenant.id,
    userId: session.user.id,
  })

  return NextResponse.json({
    ...data,
    store,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = linkOperationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const linksContext = await getLinksContext(parsed.data.storeId)

  if ("error" in linksContext) return linksContext.error

  const { ctx, session, store } = linksContext

  try {
    if (parsed.data.operation === "create_link") {
      const result = await createRetailOpsProductShareLink(prisma, {
        actorUserId: session.user.id,
        externalId: createExternalId(parsed.data.operation),
        label: parsed.data.label,
        productId: parsed.data.productId,
        publicBaseUrl: getPublicProductBaseUrl(),
        storeId: store.id,
        tenantId: ctx.tenant.id,
      })

      return NextResponse.json({ result })
    }

    if (parsed.data.operation === "deactivate_link") {
      const result = await deactivateRetailOpsProductShareLink(prisma, {
        actorUserId: session.user.id,
        canManageAllLinks: canManageAllShareLinks(ctx.membership.role),
        externalId: createExternalId(parsed.data.operation),
        productId: parsed.data.productId,
        shareLinkId: parsed.data.shareLinkId,
        storeId: store.id,
        tenantId: ctx.tenant.id,
      })

      return NextResponse.json({ result })
    }

    const result = await updateRetailOpsSharedLinkOrderRequestStatus(prisma, {
      actorUserId: session.user.id,
      canManageAllRequests: canManageAllShareLinks(ctx.membership.role),
      fulfillmentMethod: parsed.data.fulfillmentMethod,
      fulfillmentNote: parsed.data.fulfillmentNote,
      fulfillmentStatus: parsed.data.fulfillmentStatus,
      orderId: parsed.data.orderId,
      paymentMethod: parsed.data.paymentMethod,
      status: parsed.data.status,
      storeId: store.id,
      tenantId: ctx.tenant.id,
    })

    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof RetailOpsShareLinkError) {
      return NextResponse.json(
        { error: error.message },
        { status: getShareLinkErrorStatus(error) },
      )
    }

    throw error
  }
}
