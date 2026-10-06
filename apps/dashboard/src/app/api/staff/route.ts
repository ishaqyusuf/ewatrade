import { getServerSession } from "@/lib/session"
import { getDashboardStaff } from "@/lib/staff-data"
import { canManageStaff } from "@/lib/staff-management"
import { getActiveTenant } from "@/lib/tenant"
import { prisma } from "@ewatrade/db"
import type { InvitedRetailOpsStaff } from "@ewatrade/db/queries"
import {
  RetailOpsStaffError,
  RetailOpsSubscriptionError,
  STAFF_STORE_ACCESS_ROLLOUT_READY,
  StaffStoreAccessError,
  inviteRetailOpsStaff,
  updateRetailOpsStaffStatus,
  updateRetailOpsStaffStoreAccess,
} from "@ewatrade/db/queries"
import { enqueueRetailOpsStaffInviteNotification } from "@ewatrade/jobs"
import {
  buildStaffInvitationLinks,
  isQaStaffInvitation,
} from "@ewatrade/utils/staff-invitation-links"
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
  assignments: z
    .array(
      z.object({
        storeId: z.string().trim().min(1),
        role: z.enum(["cashier", "operator", "manager"]),
      }),
    )
    .min(1)
    .max(100),
  catalogEditor: z.boolean().default(false),
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

const updateAccessSchema = z.object({
  operation: z.literal("access"),
  staffUserId: z.string().trim().min(1),
  expectedRevision: z.number().int().positive(),
  confirmLegacyCutover: z.boolean().default(false),
  assignments: z.array(inviteStaffSchema.shape.assignments.element).max(100),
  catalogEditor: z.boolean().default(false),
  defaultStoreId: z.string().trim().min(1).nullable(),
  storeId: z.string().trim().min(1).optional(),
})

const staffOperationSchema = z.discriminatedUnion("operation", [
  inviteStaffSchema,
  updateStaffStatusSchema,
  updateAccessSchema,
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

async function enqueueStaffInviteNotification(input: {
  businessName: string
  invitedByName: string
  invitedStaff: InvitedRetailOpsStaff
}) {
  if (!input.invitedStaff.notification.shouldSend) return

  const links = buildStaffInvitationLinks(
    process.env,
    input.invitedStaff.invite.acceptanceToken,
  )
  await enqueueRetailOpsStaffInviteNotification({
    appUrl: links.appUrl,
    businessName: input.businessName,
    inviteUrl: links.inviteUrl,
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

  if (!canManageStaff(ctx.membership.role, ctx.membership.staffAccessMode)) {
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

  const staffUserId = url.searchParams.get("staffUserId")
  const access =
    staffUserId && ["OWNER", "ADMIN"].includes(ctx.membership.role)
      ? await prisma.membership.findUnique({
          where: {
            tenantId_userId: { tenantId: ctx.tenant.id, userId: staffUserId },
          },
          select: {
            role: true,
            status: true,
            staffAccessMode: true,
            catalogEditor: true,
            staffAccessRevision: true,
            staffStoreAssignments: {
              where: { status: "ACTIVE" },
              select: { storeId: true, role: true },
            },
            retailOpsStaffProfile: { select: { defaultStoreId: true } },
          },
        })
      : null
  return NextResponse.json({
    staff,
    access,
    storeAccessReady: STAFF_STORE_ACCESS_ROLLOUT_READY,

    stores: ctx.stores.filter((item) => item.status === "ACTIVE"),
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
      if (!STAFF_STORE_ACCESS_ROLLOUT_READY) {
        return NextResponse.json(
          { error: "Store staff assignments are not available yet." },
          { status: 503 },
        )
      }
      const invitedStaff = await inviteRetailOpsStaff(prisma, {
        storeAccess: {
          assignments: parsed.data.assignments.map((row) => ({
            storeId: row.storeId,
            role:
              row.role === "cashier"
                ? "CASHIER"
                : row.role === "operator"
                  ? "OPERATOR"
                  : "MANAGER",
          })),
          catalogEditor: parsed.data.catalogEditor,
          defaultStoreId: parsed.data.assignments[0]?.storeId ?? store.id,
        },
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

      return NextResponse.json(
        {
          result: hideStaffInviteAcceptanceToken(invitedStaff),
          ...(invitedStaff.invite.acceptanceToken &&
          isQaStaffInvitation(invitedStaff.staff.email, process.env)
            ? {
                qaInviteUrl: buildStaffInvitationLinks(
                  process.env,
                  invitedStaff.invite.acceptanceToken,
                ).inviteUrl,
              }
            : {}),
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    if (parsed.data.operation === "access") {
      if (!STAFF_STORE_ACCESS_ROLLOUT_READY)
        return NextResponse.json(
          { error: "Store staff assignments are not available yet." },
          { status: 503 },
        )
      const result = await updateRetailOpsStaffStoreAccess(prisma, {
        tenantId: ctx.tenant.id,
        actorUserId: session.user.id,
        staffUserId: parsed.data.staffUserId,
        expectedRevision: parsed.data.expectedRevision,
        confirmLegacyCutover: parsed.data.confirmLegacyCutover,
        defaultStoreId: parsed.data.defaultStoreId,
        catalogEditor: parsed.data.catalogEditor,
        assignments: parsed.data.assignments.map((row) => ({
          storeId: row.storeId,
          role:
            row.role === "cashier"
              ? "CASHIER"
              : row.role === "operator"
                ? "OPERATOR"
                : "MANAGER",
        })),
      })
      return NextResponse.json(
        { result },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    const result = await updateRetailOpsStaffStatus(prisma, {
      actorUserId: session.user.id,
      staffUserId: parsed.data.staffUserId,
      status: parsed.data.status,
      tenantId: ctx.tenant.id,
    })

    return NextResponse.json({ result })
  } catch (error) {
    if (error instanceof StaffStoreAccessError) {
      return NextResponse.json(
        { error: error.message },
        {
          status:
            error.code === "FORBIDDEN"
              ? 403
              : error.code === "CONFLICT"
                ? 409
                : 400,
        },
      )
    }
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
