import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const ACTIVE_STORE_COOKIE = "ewatrade.active_store_id"

const activeStoreSchema = z.object({
  storeId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const ctx = await getActiveTenant(session.user.id)

  if (!ctx) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const parsed = activeStoreSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const store = ctx.stores.find((item) => item.id === parsed.data.storeId)

  if (!store) {
    return NextResponse.json(
      { error: "Store not found for this tenant." },
      { status: 404 },
    )
  }

  const response = NextResponse.json({
    success: true,
    store,
  })

  response.cookies.set(ACTIVE_STORE_COOKIE, store.id, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })

  return response
}
