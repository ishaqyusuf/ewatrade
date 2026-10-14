import {
  STAFF_STORE_ACCESS_ROLLOUT_READY,
  StaffStoreAccessError,
} from "@ewatrade/db/staff-store-access"

import {
  type EwaTradeRole,
  canManageSalesOperations,
  normalizeRole,
} from "@ewatrade/auth/roles"
import { canStaffAccessStore } from "@ewatrade/auth/store-access"
import {
  RetailOpsStaffError,
  RetailOpsSubscriptionError,
  StaffDirectoryError,
  StaffInvitationCommandError,
  completeRetailOpsStaffOnboarding,
  executeStaffInvitationCommand,
  getStaffDirectoryMember,
  getStaffInvitationCommand,
  inviteRetailOpsStaff,
  listRetailOpsStaff,
  listStaffActivityPage,
  listStaffDirectoryPage,
  listStaffHistoryPage,
  listStaffInvitations,
  readStaffActivityShown,
  resolveRetailOpsStaffInviteToken,
  reviewStaffInvitation,
  reviewStaffInvitationCommand,
  reviewStaffStatusChange,
  staffInvitationReviewInput,
  updateRetailOpsStaffStatus,
} from "@ewatrade/db/queries"
import type { InvitedRetailOpsStaff } from "@ewatrade/db/queries"
import { getStaffAccessReceipt } from "@ewatrade/db/staff-access-receipt"
import { reviewStaffAccessUpdate } from "@ewatrade/db/staff-access-update"
import { getStaffStatusReceipt } from "@ewatrade/db/staff-status-receipt"
import { enqueueRetailOpsStaffInviteNotification } from "@ewatrade/jobs"
import { buildStaffInvitationLinks } from "@ewatrade/utils/staff-invitation-links"
import { TRPCError } from "@trpc/server"
import {
  retailOpsCompleteStaffOnboardingSchema,
  retailOpsInviteStaffSchema,
  retailOpsResolveStaffInviteTokenSchema,
  retailOpsStaffListSchema,
  retailOpsUpdateStaffStatusSchema,
} from "../../schemas/retail-ops"
import {
  staffInvitationCommandInput,
  staffInvitationCommandReadSchema,
  staffInvitationCommandReviewInput,
  staffInvitationsReadSchema,
} from "../../schemas/retail-ops-staff-invitations"
import {
  retailOpsStaffActivityPageSchema,
  retailOpsStaffActivityShownSchema,
  retailOpsStaffDirectoryMemberSchema,
  retailOpsStaffDirectoryPageSchema,
  retailOpsStaffHistoryPageSchema,
} from "../../schemas/retail-ops-staff-reads"
import {
  staffAccessReadInput,
  staffAccessReviewInput,
} from "../../schemas/staff-access"
import {
  staffStatusReadInput,
  staffStatusReviewInput,
} from "../../schemas/staff-status"
import { assertFinanceAccess } from "../finance-procedure"
import {
  type TRPCContext,
  authenticatedProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../init"

async function staffInvitationCommand<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof StaffInvitationCommandError)
      throw new TRPCError({ code: error.code, message: error.message })
    if (error instanceof StaffStoreAccessError)
      throw new TRPCError({
        code: error.code === "INVALID_INPUT" ? "BAD_REQUEST" : error.code,
        message: error.message,
      })
    throw error
  }
}

async function staffRead<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof StaffDirectoryError)
      throw new TRPCError({ code: error.code, message: error.message })
    throw error
  }
}

function getStaffErrorCode(
  error: RetailOpsStaffError,
): "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" {
  if (error.code === "STAFF_ALREADY_ACTIVE") return "CONFLICT"
  if (error.code === "STAFF_AGE_REQUIRED") return "BAD_REQUEST"
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

/**
 * The current Store and finance scope for staff activity reads; every read,
 * including re-reading an answer's shown events, resolves it fresh.
 */
async function staffActivityScope(ctx: {
  db: TRPCContext["db"]
  tenantContext: NonNullable<TRPCContext["tenantContext"]>
}) {
  const tenant = ctx.tenantContext
  const store = tenant.activeStore
  const role = normalizeRole(tenant.membership.role)
  const businessWide = role === "OWNER" || role === "ADMIN"
  // Finance postings follow the canonical finance entitlement and Books.
  let financeBookIds: string[] | null = null
  try {
    assertFinanceAccess(tenant)
    financeBookIds = (
      await ctx.db.financeBook.findMany({
        where: { tenantId: tenant.tenant.id },
        select: { id: true },
      })
    ).map((book) => book.id)
  } catch (error) {
    if (!(error instanceof TRPCError)) throw error
  }
  if (
    !businessWide &&
    (!store ||
      !tenant.staffAccess ||
      !canStaffAccessStore(tenant.staffAccess, store.id))
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Choose a Store you manage to read staff activity.",
    })
  return {
    storeIds: businessWide || !store ? null : [store.id],
    financeBookIds,
  }
}

export const retailOpsStaffRouter = createTRPCRouter({
  staffAccessReceipt: protectedProcedure
    .input(staffAccessReadInput)
    .query(({ ctx, input }) =>
      staffInvitationCommand(() =>
        getStaffAccessReceipt(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),
  staffStoreAccessReview: protectedProcedure
    .input(staffAccessReviewInput)
    .query(({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        {},
      )
      return staffInvitationCommand(() =>
        reviewStaffAccessUpdate(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
          storeId: store.id,
        }),
      )
    }),
  staffStatusReview: protectedProcedure
    .input(staffStatusReviewInput)
    .query(({ ctx, input }) =>
      staffInvitationCommand(() =>
        reviewStaffStatusChange(
          ctx.db,
          {
            ...input,
            tenantId: ctx.tenantContext.tenant.id,
            actorUserId: ctx.session.user.id,
          },
          { administrativeOnly: true },
        ),
      ),
    ),
  staffStatusReceipt: protectedProcedure
    .input(staffStatusReadInput)
    .query(({ ctx, input }) =>
      staffInvitationCommand(() =>
        getStaffStatusReceipt(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),
  staffInvitationReview: protectedProcedure
    .input(staffInvitationReviewInput)
    .query(async ({ ctx, input }) => {
      try {
        return await reviewStaffInvitation(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        })
      } catch (error) {
        if (error instanceof StaffStoreAccessError)
          throw new TRPCError({
            code: error.code === "INVALID_INPUT" ? "BAD_REQUEST" : error.code,
            message: error.message,
          })
        throw error
      }
    }),

  staffInvitationCommandReview: protectedProcedure
    .input(staffInvitationCommandReviewInput)
    .query(({ ctx, input }) =>
      staffInvitationCommand(() =>
        reviewStaffInvitationCommand(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),
  staffInvitationCommandSave: protectedProcedure
    .input(staffInvitationCommandInput)
    .mutation(({ ctx, input }) =>
      staffInvitationCommand(() =>
        executeStaffInvitationCommand(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),
  staffInvitationCommand: protectedProcedure
    .input(staffInvitationCommandReadSchema)
    .query(({ ctx, input }) =>
      staffInvitationCommand(() =>
        getStaffInvitationCommand(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),
  staffInvitations: protectedProcedure
    .input(staffInvitationsReadSchema)
    .query(({ ctx, input }) =>
      staffInvitationCommand(() =>
        listStaffInvitations(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),

  staffHistoryPage: protectedProcedure
    .input(retailOpsStaffHistoryPageSchema)
    .query(({ ctx, input }) =>
      staffRead(() =>
        listStaffHistoryPage(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),
  /**
   * S05 daily operational activity. Owner/Admin read every Store; anyone else
   * reads only the active Store they can currently access.
   */
  staffActivityPage: protectedProcedure
    .input(retailOpsStaffActivityPageSchema)
    .query(async ({ ctx, input }) => {
      const scope = await staffActivityScope(ctx)
      return staffRead(() =>
        listStaffActivityPage(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          viewerUserId: ctx.session.user.id,
          ...scope,
        }),
      )
    }),
  /** Re-reads exactly the events an answer showed, under current authority. */
  staffActivityShown: protectedProcedure
    .input(retailOpsStaffActivityShownSchema)
    .query(async ({ ctx, input }) => {
      const scope = await staffActivityScope(ctx)
      return staffRead(() =>
        readStaffActivityShown(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          viewerUserId: ctx.session.user.id,
          ...scope,
        }),
      )
    }),
  staffDirectoryPage: protectedProcedure
    .input(retailOpsStaffDirectoryPageSchema)
    .query(({ ctx, input }) =>
      staffRead(() =>
        listStaffDirectoryPage(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),
  staffDirectoryMember: protectedProcedure
    .input(retailOpsStaffDirectoryMemberSchema)
    .query(({ ctx, input }) =>
      staffRead(() =>
        getStaffDirectoryMember(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
          actorUserId: ctx.session.user.id,
        }),
      ),
    ),
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
          expectedRevision: input.expectedRevision,
          reason: input.reason,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof StaffStoreAccessError)
          throw new TRPCError({
            code: error.code === "INVALID_INPUT" ? "BAD_REQUEST" : error.code,
            message: error.message,
          })
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
      if (!STAFF_STORE_ACCESS_ROLLOUT_READY)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Staff Store access rollout is not ready. Invitations are temporarily unavailable.",
        })
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
        if (error instanceof StaffStoreAccessError)
          throw new TRPCError({
            code: error.code === "INVALID_INPUT" ? "BAD_REQUEST" : error.code,
            message: error.message,
          })
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
            cause: error,
          })
        }

        throw error
      }
    }),
})
