import {
  type EwaTradeRole,
  canManageSalesOperations,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  RetailOpsStaffError,
  RetailOpsSubscriptionError,
  completeRetailOpsStaffOnboarding,
  inviteRetailOpsStaff,
  listRetailOpsStaff,
  resolveRetailOpsStaffInviteToken,
  updateRetailOpsStaffStatus,
} from "@ewatrade/db/queries"
import type { InvitedRetailOpsStaff } from "@ewatrade/db/queries"
import { enqueueRetailOpsStaffInviteNotification } from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"
import {
  retailOpsCompleteStaffOnboardingSchema,
  retailOpsInviteStaffSchema,
  retailOpsResolveStaffInviteTokenSchema,
  retailOpsStaffListSchema,
  retailOpsUpdateStaffStatusSchema,
} from "../../schemas/retail-ops"
import {
  authenticatedProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../init"

function getStaffErrorCode(
  error: RetailOpsStaffError,
): "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" {
  if (error.code === "STAFF_ALREADY_ACTIVE") return "CONFLICT"
  if (error.code === "STAFF_SELF_UPDATE_FORBIDDEN") return "FORBIDDEN"
  if (error.code === "STAFF_STATUS_NOT_ALLOWED") return "BAD_REQUEST"
  if (error.code === "STAFF_STATUS_UNCHANGED") return "CONFLICT"

  return "NOT_FOUND"
}

function getRetailOpsRole(role: string): EwaTradeRole {
  const normalizedRole = normalizeRole(role)

  if (!normalizedRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to use Retail Ops.",
    })
  }

  return normalizedRole
}

function assertCanManageRetailOpsStaff(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageSalesOperations(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage Retail Ops staff.",
    })
  }
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

function hideStaffInviteAcceptanceToken(
  invitedStaff: InvitedRetailOpsStaff,
): InvitedRetailOpsStaff {
  return {
    ...invitedStaff,
    invite: {
      ...invitedStaff.invite,
      acceptanceToken: null,
    },
  }
}

function resolveStore(
  stores: Array<{
    id: string
    name: string
    slug: string
  }>,
  activeStore: {
    id: string
    name: string
    slug: string
  } | null,
  input: {
    storeId?: string
  },
) {
  if (input.storeId) {
    const store = stores.find(
      (currentStore) => currentStore.id === input.storeId,
    )

    if (!store) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this tenant.",
      })
    }

    return store
  }

  const store = activeStore ?? stores[0] ?? null

  if (!store) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a store before opening Retail Ops.",
    })
  }

  return store
}

export const retailOpsStaffRouter = createTRPCRouter({
  completeStaffOnboarding: authenticatedProcedure
    .input(retailOpsCompleteStaffOnboardingSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await completeRetailOpsStaffOnboarding(ctx.db, {
          displayName: input.displayName,
          name: input.name,
          tenantSlug: input.tenantSlug ?? ctx.tenantSlug ?? undefined,
          userId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsStaffError) {
          throw new TRPCError({
            code: getStaffErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  resolveStaffInviteToken: publicProcedure
    .input(retailOpsResolveStaffInviteTokenSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await resolveRetailOpsStaffInviteToken(ctx.db, {
          token: input.token,
        })
      } catch (error) {
        if (error instanceof RetailOpsStaffError) {
          throw new TRPCError({
            code: getStaffErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  staff: protectedProcedure
    .input(retailOpsStaffListSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageRetailOpsStaff(ctx.tenantContext.membership.role)

      resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      return listRetailOpsStaff(ctx.db, {
        limit: input.limit,
        role: input.role,
        search: input.search,
        status: input.status,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  updateStaffStatus: protectedProcedure
    .input(retailOpsUpdateStaffStatusSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageRetailOpsStaff(ctx.tenantContext.membership.role)

      resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await updateRetailOpsStaffStatus(ctx.db, {
          actorUserId: ctx.session.user.id,
          staffUserId: input.staffUserId,
          status: input.status,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsStaffError) {
          throw new TRPCError({
            code: getStaffErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  inviteStaff: protectedProcedure
    .input(retailOpsInviteStaffSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageRetailOpsStaff(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        const invitedStaff = await inviteRetailOpsStaff(ctx.db, {
          actorUserId: ctx.session.user.id,
          email: input.email,
          externalId: input.externalId,
          name: input.name,
          role: input.role,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })

        await enqueueStaffInviteNotification({
          businessName: ctx.tenantContext.tenant.name,
          invitedByName:
            ctx.session.user.displayName ||
            ctx.session.user.name ||
            ctx.session.user.email,
          invitedStaff,
        })

        return hideStaffInviteAcceptanceToken(invitedStaff)
      } catch (error) {
        if (error instanceof RetailOpsStaffError) {
          throw new TRPCError({
            code: getStaffErrorCode(error),
            message: error.message,
          })
        }

        if (error instanceof RetailOpsSubscriptionError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          })
        }

        throw error
      }
    }),
})
