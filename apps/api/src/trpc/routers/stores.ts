import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import {
  StoreContactError,
  getStoreContact,
  getStoreOrderVisibility,
  getStorePublicListing,
  setStorePublicListing,
  updateStoreContact,
  updateStoreOrderVisibility,
} from "@ewatrade/db/queries"
import type { TenantContext } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  orderVisibilitySchema,
  updateOrderVisibilitySchema,
} from "../../schemas/order-visibility"
import {
  storeContactSchema,
  updateStoreContactSchema,
} from "../../schemas/store-contact"
import {
  storePublicListingSchema,
  updateStorePublicListingSchema,
} from "../../schemas/store-public-listing"
import { createTRPCRouter, protectedProcedure } from "../init"

function storeIdFor(tenant: TenantContext, requested?: string) {
  const id = requested ?? tenant.activeStore?.id ?? tenant.stores[0]?.id
  if (!id || !tenant.stores.some((store) => store.id === id)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Store not found for this business.",
    })
  }
  return id
}

function requireStore<T>(store: T | null): T {
  if (!store)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Store not found for this business.",
    })
  return store
}

const contactProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = normalizeRole(ctx.tenantContext.membership.role)
  if (!role || !canManageTenant(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only Owners and Admins can manage Store contact details.",
    })
  return next()
})

function contactStoreIdFor(tenant: TenantContext, requested?: string) {
  const id = requested ?? tenant.activeStore?.id
  if (!id)
    throw new TRPCError({ code: "NOT_FOUND", message: "Select a Store first." })
  return storeIdFor(tenant, id)
}

async function contactResult<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof StoreContactError)
      throw new TRPCError({ code: error.code, message: error.message })
    throw error
  }
}

/** Platform catalog opt-in is an Owner/Admin business decision, like contact details. */
const listingProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = normalizeRole(ctx.tenantContext.membership.role)
  if (!role || !canManageTenant(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only Owners and Admins can list the business publicly.",
    })
  return next()
})

export const storesRouter = createTRPCRouter({
  publicListing: listingProcedure
    .input(storePublicListingSchema)
    .query(async ({ ctx, input }) =>
      requireStore(
        await getStorePublicListing(ctx.db, {
          tenantId: ctx.tenantContext.tenant.id,
          storeId: contactStoreIdFor(ctx.tenantContext, input.storeId),
        }),
      ),
    ),
  updatePublicListing: listingProcedure
    .input(updateStorePublicListingSchema)
    .mutation(async ({ ctx, input }) =>
      requireStore(
        await setStorePublicListing(
          ctx.db,
          {
            tenantId: ctx.tenantContext.tenant.id,
            storeId: contactStoreIdFor(ctx.tenantContext, input.storeId),
          },
          input.listed,
        ),
      ),
    ),
  contact: contactProcedure.input(storeContactSchema).query(({ ctx, input }) =>
    contactResult(() =>
      getStoreContact(ctx.db, {
        tenantId: ctx.tenantContext.tenant.id,
        actorUserId: ctx.session.user.id,
        storeId: contactStoreIdFor(ctx.tenantContext, input.storeId),
      }),
    ),
  ),
  updateContact: contactProcedure
    .input(updateStoreContactSchema)
    .mutation(({ ctx, input }) =>
      contactResult(() =>
        updateStoreContact(
          ctx.db,
          {
            tenantId: ctx.tenantContext.tenant.id,
            actorUserId: ctx.session.user.id,
            storeId: contactStoreIdFor(ctx.tenantContext, input.storeId),
          },
          input,
        ),
      ),
    ),
  orderVisibility: protectedProcedure
    .input(orderVisibilitySchema)
    .query(async ({ ctx, input }) =>
      requireStore(
        await getStoreOrderVisibility(ctx.db, {
          tenantId: ctx.tenantContext.tenant.id,
          storeId: storeIdFor(ctx.tenantContext, input.storeId),
        }),
      ),
    ),
  updateOrderVisibility: protectedProcedure
    .input(updateOrderVisibilitySchema)
    .mutation(async ({ ctx, input }) => {
      const role = normalizeRole(ctx.tenantContext.membership.role)
      if (!role || !canManageTenant(role))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Owners and Admins can manage Staff rules.",
        })
      return requireStore(
        await updateStoreOrderVisibility(ctx.db, {
          tenantId: ctx.tenantContext.tenant.id,
          storeId: storeIdFor(ctx.tenantContext, input.storeId),
          userId: ctx.session.user.id,
          visibility: input.visibility,
        }),
      )
    }),
})
