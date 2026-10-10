import { canOperatePos, normalizeRole } from "@ewatrade/auth/roles"
import {
  CustomerDirectoryError,
  countCustomers,
  createCustomer,
  customerRevision,
  getCustomerById,
  listCustomersPage,
  lookupCommercialOrders,
  updateCustomerInTransaction,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  customerCountSchema,
  customerCreateSchema,
  customerGetByIdSchema,
  customerListPageSchema,
  customerUpdateSchema,
} from "../../schemas/customers"
import { createTRPCRouter, protectedProcedure } from "../init"
import { orderScope } from "../order-scope"

export function assertCanUseCustomers(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canOperatePos(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to use the customer directory.",
    })
  }
}

export const customersRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(customerGetByIdSchema)
    .query(async ({ ctx, input }) => {
      assertCanUseCustomers(ctx.tenantContext.membership.role)
      const customer = await getCustomerById(ctx.db, {
        customerId: input.customerId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (!customer)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer not found.",
        })
      return {
        ...customer,
        revision: customerRevision(customer),
        orders: await lookupCommercialOrders(ctx.db, {
          ...(await orderScope(ctx, {
            storeId: ctx.tenantContext.activeStore?.id,
          })),
          customerId: customer.id,
          history: true,
        }),
      }
    }),
  count: protectedProcedure
    .input(customerCountSchema)
    .query(async ({ ctx, input }) => {
      assertCanUseCustomers(ctx.tenantContext.membership.role)
      return countCustomers(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  create: protectedProcedure
    .input(customerCreateSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanUseCustomers(ctx.tenantContext.membership.role)
      try {
        return await createCustomer(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CustomerDirectoryError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: error.message,
          })
        }
        throw error
      }
    }),

  update: protectedProcedure
    .input(customerUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanUseCustomers(ctx.tenantContext.membership.role)
      const { customerId, expectedRevision, ...fields } = input
      try {
        return await ctx.db.$transaction((tx) =>
          updateCustomerInTransaction(tx, {
            ...fields,
            customerId,
            expectedRevision,
            tenantId: ctx.tenantContext.tenant.id,
          }),
        )
      } catch (error) {
        if (error instanceof CustomerDirectoryError)
          throw new TRPCError({
            code:
              error.code === "CUSTOMER_NOT_FOUND"
                ? "NOT_FOUND"
                : error.code === "NO_CUSTOMER_CHANGES"
                  ? "BAD_REQUEST"
                  : "CONFLICT",
            message: error.message,
          })
        throw error
      }
    }),

  listPage: protectedProcedure
    .input(customerListPageSchema)
    .query(async ({ ctx, input }) => {
      assertCanUseCustomers(ctx.tenantContext.membership.role)
      try {
        return await listCustomersPage(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (
          error instanceof CustomerDirectoryError &&
          error.code === "INVALID_CUSTOMER_CURSOR"
        )
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message })
        throw error
      }
    }),
})
