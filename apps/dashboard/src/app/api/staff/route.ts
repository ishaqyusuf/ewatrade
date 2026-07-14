import { getServerSession } from "@/lib/session"
import { getDashboardStaff } from "@/lib/staff-data"
import { canManageStaff } from "@/lib/staff-management"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import type { InvitedRetailOpsStaff } from "@ewatrade/db/queries"
import {
  RetailOpsStaffError,
  RetailOpsSubscriptionError,
  inviteRetailOpsStaff,
  updateRetailOpsStaffStatus,
} from "@ewatrade/db/queries"
import { enqueueRetailOpsStaffInviteNotification } from "@ewatrade/jobs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod/v4"

const staffRoleFilterSchema = z.enum([
  "admin",
  "all",
  "cashier",
  "manager",
  "operator",
  "owner",
])
const staffStatusFilterSchema = z.enum([
  "active",
  "all",
  "invited",
  "suspended",
])

const inviteStaffSchema = z.object({
  email: z.email().trim().toLowerCase(),
  externalId: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  operation: z.literal("invite"),
  role: z.enum(["cashier", "manager", "operator"]).default("cashier"),
  storeId: z.string().trim().min(1).optional(),
})

const updateStaffStatusSchema = z.object({
  operation: z.literal("status"),
  staffUserId: z.string().trim().min(1),
  status: z.enum(["active", "suspended"]),
  storeId: z.string().trim().min(1).optional(),
})

const staffOperationSchema = z.discriminatedUnion("operation", [
  inviteStaffSchema,
  updateStaffStatusSchema,
])

function getStaffErrorStatus(error: RetailOpsStaffError) {
  if (error.code === "STAFF_ALREADY_ACTIVE") return 409
  if (error.code === "STAFF_SELF_UPDATE_FORBIDDEN") return 403
  if (
    error.code === "STAFF_STATUS_NOT_ALLOWED" ||
    error.code === "STAFF_STATUS_UNCHANGED"
  ) {
    return 400
  }

  return 404
}

function getRetailOpsAppUrl() {
  return (
    process.env.MOBILE_APP_URL ??
    process.env.NEXT_PUBLIC_MOBILE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ewatrade.com/download"
  )
}

function getRetailOpsStaffInviteUrl(token: string | null | undefined) {
  const appUrl = getRetailOpsAppUrl()

  if (!token) return appUrl

  try {
    const url = new URL(appUrl)
    url.pathname = "/staff-onboarding"
    url.searchParams.set("inviteToken", token)
    return url.toString()
  } catch {
    return `${appUrl.replace(/\/$/, "")}/staff-onboarding?inviteToken=${encodeURIComponent(
      token,
    )}`
  }
}

async function enqueueStaffInviteNotification(input: {
  businessName: string
  invitedByName: string
  invitedStaff: InvitedRetailOpsStaff
}) {
  if (!input.invitedStaff.notification.shouldSend) return

  await enqueueRetailOpsStaffInviteNotification({
    appUrl: getRetailOpsAppUrl(),
    businessName: input.businessName,
    inviteUrl: getRetailOpsStaffInviteUrl(
      input.invitedStaff.invite.acceptanceToken,
    ),
    invitedByName: input.invitedByName,
    inviteeEmail: input.invitedStaff.staff.email,
    inviteeName:
      input.invitedStaff.staff.displayName ||
      input.invitedStaff.staff.name ||
      null,
    membershipId: input.invitedStaff.invite.id,
    role: input.invitedStaff.invite.role,
  })
}

function hideStaffInviteAcceptanceToken(invitedStaff: InvitedRetailOpsStaff) {
  return {
    ...invitedStaff,
    invite: {
      ...invitedStaff.invite,
      acceptanceToken: null,
    },
  }
}

function createExternalId(operation: string) {
  return `dashboard:${operation}:${crypto.randomUUID()}`
}

async function getStaffContext(requestedStoreId?: string) {
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

  if (!canManageStaff(ctx.membership.role)) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission to manage staff." },
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
        { error: "Create a store before managing staff." },
        { status: 404 },
      ),
    }
  }

  return { ctx, session, store }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get("storeId") ?? undefined
  const roleParam = url.searchParams.get("role") ?? "all"
  const statusParam = url.searchParams.get("status") ?? "all"
  const role = staffRoleFilterSchema.safeParse(roleParam).success
    ? staffRoleFilterSchema.parse(roleParam)
    : "all"
  const status = staffStatusFilterSchema.safeParse(statusParam).success
    ? staffStatusFilterSchema.parse(statusParam)
    : "all"
  const search = url.searchParams.get("search")?.trim() || undefined
  const staffContext = await getStaffContext(storeId)

  if ("error" in staffContext) return staffContext.error

  const { ctx, store } = staffContext
  const staff = await getDashboardStaff({
    role,
    search,
    status,
    tenantId: ctx.tenant.id,
  })

  return NextResponse.json({
    staff,
    store,
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = staffOperationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const staffContext = await getStaffContext(parsed.data.storeId)

  if ("error" in staffContext) return staffContext.error

  const { ctx, session, store } = staffContext

  try {
    if (parsed.data.operation === "invite") {
      const invitedStaff = await inviteRetailOpsStaff(prisma, {
        actorUserId: session.user.id,
        email: parsed.data.email,
        externalId:
          parsed.data.externalId ?? createExternalId(parsed.data.operation),
        name: parsed.data.name,
        role: parsed.data.role,
        storeId: store.id,
        tenantId: ctx.tenant.id,
      })

      await enqueueStaffInviteNotification({
        businessName: ctx.tenant.name,
        invitedByName: session.user.displayName || session.user.email,
        invitedStaff,
      })

      return NextResponse.json({
        result: hideStaffInviteAcceptanceToken(invitedStaff),
      })
    }

    const result = await updateRetailOpsStaffStatus(prisma, {
      actorUserId: session.user.id,
      staffUserId: parsed.data.staffUserId,
      status: parsed.data.status,
      tenantId: ctx.tenant.id,
    })

    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof RetailOpsStaffError) {
      return NextResponse.json(
        { error: error.message },
        { status: getStaffErrorStatus(error) },
      )
    }

    if (error instanceof RetailOpsSubscriptionError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    throw error
  }
}
