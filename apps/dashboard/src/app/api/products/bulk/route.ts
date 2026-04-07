import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["publish", "archive", "delete"]),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await getActiveTenant(session.user.id)
  if (!ctx?.activeStore)
    return NextResponse.json({ error: "Store not found" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { ids, action } = parsed.data
  const storeId = ctx.activeStore.id

  if (action === "publish") {
    const result = await prisma.product.updateMany({
      where: { id: { in: ids }, storeId },
      data: { status: "ACTIVE", isPublished: true },
    })
    return NextResponse.json({ success: true, affected: result.count })
  }

  if (action === "archive") {
    const result = await prisma.product.updateMany({
      where: { id: { in: ids }, storeId },
      data: { status: "ARCHIVED", isPublished: false },
    })
    return NextResponse.json({ success: true, affected: result.count })
  }

  if (action === "delete") {
    const succeeded: string[] = []
    const failed: { id: string; reason: string }[] = []

    for (const id of ids) {
      try {
        await prisma.product.delete({ where: { id, storeId } })
        succeeded.push(id)
      } catch {
        failed.push({
          id,
          reason: "Has order history — archive instead",
        })
      }
    }

    return NextResponse.json({
      success: true,
      affected: succeeded.length,
      failed,
    })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
