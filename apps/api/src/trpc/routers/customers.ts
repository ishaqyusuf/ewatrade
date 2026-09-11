import { canOperatePos, normalizeRole } from "@ewatrade/auth/roles"
import {
  CustomerDirectoryError,
  countCustomers,
  createCustomer,
  getCustomerById,
  listCustomersPage,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  customerCreateSchema,
  customerGetByIdSchema,
  customerListPageSchema,
} from "../../schemas/customers"
import { createTRPCRouter, protectedProcedure } from "../init"

function assertCanUseCustomers(role: string) {
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
      return customer
    }),
  count: protectedProcedure.query(async ({ ctx }) => {
    assertCanUseCustomers(ctx.tenantContext.membership.role)
    return countCustomers(ctx.db, {
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

  listPage: protectedProcedure
    .input(customerListPageSchema)
    .query(async ({ ctx, input }) => {
      assertCanUseCustomers(ctx.tenantContext.membership.role)
      return listCustomersPage(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
})
