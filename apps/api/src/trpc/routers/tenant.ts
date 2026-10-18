import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import {
  StoreLinkConflictError,
  completeOwnerSignupSetup,
  readOwnerSignupSetup,
  saveOwnerSignupDraft,
} from "@ewatrade/db/queries"
import {
  OwnerBusinessAgeError,
  RetailOpsSubscriptionError,
  createOwnerBusiness,
  createTenantStore,
  findOrCreateInventoryStore,
  getCustomerAccountAgeStatus,
  getWorkspaceFeatureAvailability,
  requireEligibleOwnerAge,
} from "@ewatrade/db/queries"
import { AppError } from "@ewatrade/errors"
import { issueAnalyticsContext } from "@ewatrade/events/identity-server"
import { isQaAnalyticsPrincipal } from "@ewatrade/events/qa-policy-server"
import { readOwnerSignupDraft } from "@ewatrade/utils/owner-signup"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { ownerSignupDraftSchema } from "../../schemas/owner-signup"
import { createBusinessSchema, createStoreSchema } from "../../schemas/tenant"
import { qaScopedMembershipWhere } from "../../utils/qa-session-access"
import {
  authenticatedProcedure,
  createTRPCRouter,
  mobileEntryProcedure,
  protectedProcedure,
} from "../init"

function assertCanManageTenantStores(role: string) {
  const normalizedRole = normalizeRole(role)

  if (!normalizedRole || !canManageTenant(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage business stores.",
    })
  }
}

export const tenantRouter = createTRPCRouter({
  ownerSignupSetup: authenticatedProcedure.query(({ ctx }) =>
    readOwnerSignupSetup(ctx.db, ctx.session.user.id),
  ),
  saveOwnerSignupDraft: authenticatedProcedure
    .input(ownerSignupDraftSchema)
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(
        (tx) => saveOwnerSignupDraft(tx, ctx.session.user.id, input),
        { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
      ),
    ),
  completeOwnerSignup: authenticatedProcedure
    .input(ownerSignupDraftSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.$transaction(
          (tx) => completeOwnerSignupSetup(tx, ctx.session.user.id, input),
          { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
        )
      } catch (error) {
        if (error instanceof StoreLinkConflictError)
          throw new TRPCError({ code: "CONFLICT", message: error.message })
        throw error
      }
    }),
  ownerSignupSummary: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageTenantStores(ctx.tenantContext.membership.role)
    const session = await ctx.db.onboardingSession.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        completed: true,
      },
      orderBy: { createdAt: "desc" },
      select: { formData: true },
    })
    const formData =
      session?.formData &&
      typeof session.formData === "object" &&
      !Array.isArray(session.formData)
        ? session.formData
        : null
    const draft = readOwnerSignupDraft(formData?.ownerSignup)
    if (!draft) return null
    const memberships = await ctx.db.membership.findMany({
      where: {
        userId: ctx.session.user.id,
        role: "OWNER",
        status: "ACTIVE",
        tenant: {
          isActive: true,
          slug: { in: draft.businesses.map((b) => b.slug) },
        },
      },
      select: { tenant: { select: { id: true, name: true, slug: true } } },
    })
    const ready = memberships.map((m) => m.tenant)
    return {
      planId: draft.planId,
      readyBusinesses: ready,
      pendingBusinesses: draft.businesses.filter(
        (b) => !ready.some((r) => r.slug === b.slug),
      ),
    }
  }),
  createBusiness: authenticatedProcedure
    .input(createBusinessSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.$transaction((tx) =>
          createOwnerBusiness(tx, {
            addressLine1: input.addressLine1,
            businessName: input.businessName,
            city: input.city,
            countryCode: input.countryCode,
            currencyCode: input.currencyCode,
            userId: ctx.session.user.id,
            phone: input.supportPhone,
            ...input.onboarding,
          }),
        )
      } catch (error) {
        if (error instanceof OwnerBusinessAgeError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
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

  // A derived QA session lists only its own selected business; ordinary
  // sessions list every active Membership.
  businesses: mobileEntryProcedure.query(async ({ ctx }) => {
    const age = await getCustomerAccountAgeStatus(ctx.db, ctx.session.user.id)
    if (!age.eligible) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Choose an eligible age range before opening your workspace.",
      })
    }
    const memberships = await ctx.db.membership.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        tenant: {
          select: {
            currencyCode: true,
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      where: ctx.qaSessionScope
        ? qaScopedMembershipWhere(ctx.session.user.id, ctx.qaSessionScope)
        : { status: "ACTIVE", userId: ctx.session.user.id },
    })
    if (ctx.qaSessionScope && memberships.length === 0)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your selected QA business or Store is no longer available.",
      })

    return memberships.map((membership) => ({
      currencyCode: membership.tenant.currencyCode,
      id: membership.tenant.id,
      name: membership.tenant.name,
      role: membership.role,
      slug: membership.tenant.slug,
    }))
  }),

  analyticsContext: protectedProcedure.query(({ ctx }) => {
    const enabled = !isQaAnalyticsPrincipal({
      email: ctx.session.user.email,
      qaSession: Boolean(ctx.qaSessionScope),
      dataClassification: ctx.tenantContext.tenant.dataClassification,
    })
    return {
      enabled,
      context: enabled
        ? issueAnalyticsContext({
            project: "ewatrade-mobile",
            userId: ctx.session.user.id,
            tenantId: ctx.tenantContext.tenant.id,
            tenantName: ctx.tenantContext.tenant.name,
            role: ctx.tenantContext.membership.role,
            internal: Boolean(ctx.session.user.isPlatformAdmin),
          })
        : null,
    }
  }),

  current: protectedProcedure.query(async ({ ctx }) => {
    return { ...ctx.tenantContext, actorUserId: ctx.session.user.id }
  }),

  storeContext: protectedProcedure
    .input(z.object({ storeId: z.string().trim().min(1) }).strict())
    .query(({ ctx, input }) => {
      const store = ctx.tenantContext.stores.find(
        (row) => row.id === input.storeId && row.status === "ACTIVE",
      )
      if (!store)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Store access is unavailable.",
        })
      const access = ctx.tenantContext.staffAccess
      const role =
        access?.mode === "SCOPED" &&
        !["OWNER", "ADMIN"].includes(access.businessRole)
          ? access.assignments.find((row) => row.storeId === store.id)?.role
          : ctx.tenantContext.membership.role
      if (!role)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Store access is unavailable.",
        })
      return {
        ...ctx.tenantContext,
        activeStore: store,
        membership: { ...ctx.tenantContext.membership, role },
      }
    }),

  featureAvailability: protectedProcedure.query(async ({ ctx }) => {
    const store =
      ctx.tenantContext.activeStore ?? ctx.tenantContext.stores[0] ?? null

    if (!store) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Create a store before loading workspace features.",
      })
    }

    return getWorkspaceFeatureAvailability(ctx.db, {
      storeId: store.id,
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  stores: protectedProcedure.query(async ({ ctx }) => {
    return ctx.tenantContext.stores
  }),

  createInventoryStore: protectedProcedure
    .input(createStoreSchema.pick({ name: true }))
    .mutation(async ({ ctx, input }) => {
      assertCanManageTenantStores(ctx.tenantContext.membership.role)
      try {
        await requireEligibleOwnerAge(ctx.db, ctx.session.user.id)
        return await findOrCreateInventoryStore(ctx.db, {
          name: input.name,
          tenantId: ctx.tenantContext.tenant.id,
          createdByUserId: ctx.session.user.id,
          currencyCode: ctx.tenantContext.tenant.currencyCode ?? "NGN",
        })
      } catch (error) {
        if (error instanceof OwnerBusinessAgeError)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          })
        if (error instanceof RetailOpsSubscriptionError)
          throw new TRPCError({
            code: "FORBIDDEN",
            cause: new AppError({ code: "STORE_LIMIT_REACHED", cause: error }),
          })
        throw error
      }
    }),

  createStore: protectedProcedure
    .input(createStoreSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageTenantStores(ctx.tenantContext.membership.role)
      const { onboarding, ...storeInput } = input

      try {
        await requireEligibleOwnerAge(ctx.db, ctx.session.user.id)
        return await createTenantStore(ctx.db, {
          createdByUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
          ...storeInput,
          currencyCode:
            storeInput.currencyCode ??
            ctx.tenantContext.tenant.currencyCode ??
            "NGN",
          onboarding: onboarding
            ? { ...onboarding, source: "trpc_store_create" }
            : undefined,
        })
      } catch (error) {
        if (error instanceof OwnerBusinessAgeError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          })
        }
        if (error instanceof RetailOpsSubscriptionError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
            cause: new AppError({ code: "STORE_LIMIT_REACHED", cause: error }),
          })
        }

        throw error
      }
    }),
})
