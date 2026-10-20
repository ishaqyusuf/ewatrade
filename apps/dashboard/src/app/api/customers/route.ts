import { getDashboardCustomerBook } from "@/lib/sales-data"
import { canUseSalesOperations } from "@/lib/sales-operations"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

async function getCustomersContext(requestedStoreId?: string) {
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

  if (!canUseSalesOperations(ctx.membership.role)) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission to review customers." },
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
        { error: "Create a store before reviewing customers." },
        { status: 404 },
      ),
    }
  }

  return { ctx, session, store }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get("storeId") ?? undefined
  const customersContext = await getCustomersContext(storeId)

  if ("error" in customersContext) return customersContext.error

  const { ctx, session, store } = customersContext
  const customers = await getDashboardCustomerBook({
    role: ctx.membership.role,
    search: url.searchParams.get("search")?.trim() || undefined,
    storeId: store.id,
    tenantId: ctx.tenant.id,
    userId: session.user.id,
  })

  return NextResponse.json({
    customers,
    store,
  })
}
