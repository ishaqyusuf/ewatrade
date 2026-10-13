import {
  canManageSalesOperations,
  canManageTenant,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  CatalogError,
  FinanceError,
  type OrderChangeRequirement,
  cancelCommercialOrderChangeApproval,
  decideCommercialOrderChangeApproval,
  getCommercialOrderChangePolicy,
  listPendingCommercialOrderChangeApprovals,
  recordApprovedCommercialOrderChange,
  requestCommercialOrderChangeApproval,
  updateCommercialOrderChangePolicy,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { exactOrderQuantitySchema } from "../../schemas/orders"
import { protectedProcedure } from "../init"
import { orderScope } from "../order-scope"
import { assertCanOperateOrders, orderError } from "./orders"

const method = z.enum(["bank_transfer", "card", "cash", "other", "pos"])
const mode = z.enum(["OFF", "OPEN", "APPROVAL_REQUIRED"])
const reason = z.string().trim().min(1).max(500)

/** Owner/Admin approve; Owner/Admin/Manager may move money when open. */
export function orderChangeActor(role: string) {
  const normalized = normalizeRole(role)
  return {
    isApprover: Boolean(normalized && canManageTenant(normalized)),
    canManageMoney: Boolean(normalized && canManageSalesOperations(normalized)),
  }
}

/** Direct recording only: asking goes through requestChangeApproval. */
export function assertDirectOrderChange(
  requirement: OrderChangeRequirement,
  action: "return" | "refund",
) {
  if (requirement.kind === "direct") return
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      requirement.kind === "blocked"
        ? `${requirement.reason}.`
        : `Ask an owner or admin to approve this ${action} first.`,
  })
}

function assertApprover(role: string) {
  if (!orderChangeActor(role).isApprover)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only owners and admins can do this.",
    })
}

function activeStoreId(ctx: {
  tenantContext: { activeStore?: { id: string } | null }
}) {
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId)
    throw new TRPCError({ code: "NOT_FOUND", message: "Choose a store first." })
  return storeId
}

function mapped(error: unknown): never {
  if (error instanceof CatalogError || error instanceof FinanceError)
    throw orderError(error)
  throw error
}

export const orderChangeApprovalRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("return"),
      orderId: z.string().trim().min(1),
      clientRequestId: z.string().trim().min(8).max(120),
      reason,
      lines: z
        .array(
          z
            .object({
              orderLineId: z.string().trim().min(1),
              quantity: exactOrderQuantitySchema,
              disposition: z.enum([
                "damaged",
                "no_restock",
                "quarantine",
                "restock",
              ]),
            })
            .strict(),
        )
        .min(1)
        .max(50),
      money: z.object({ method }).strict().nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("refund"),
      orderId: z.string().trim().min(1),
      clientRequestId: z.string().trim().min(8).max(120),
      reason,
      amountMinor: z.number().int().positive().max(100_000_000),
      method,
      lowerTotal: z.boolean(),
    })
    .strict(),
])

/**
 * Store returns/refunds settings and approval requests: staff ask, an
 * Owner/Admin decides, the requester records exactly what was approved.
 */
export const orderChangeApprovalProcedures = {
  changePolicy: protectedProcedure.query(async ({ ctx }) => {
    assertCanOperateOrders(ctx.tenantContext.membership.role)
    const policy = await getCommercialOrderChangePolicy(ctx.db, {
      storeId: activeStoreId(ctx),
      tenantId: ctx.tenantContext.tenant.id,
    })
    return {
      ...policy,
      canEdit: orderChangeActor(ctx.tenantContext.membership.role).isApprover,
      storeName: ctx.tenantContext.activeStore?.name ?? null,
    }
  }),

  updateChangePolicy: protectedProcedure
    .input(z.object({ returnsMode: mode, refundsMode: mode }).strict())
    .mutation(async ({ ctx, input }) => {
      assertApprover(ctx.tenantContext.membership.role)
      try {
        return await updateCommercialOrderChangePolicy(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: activeStoreId(ctx),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapped(error)
      }
    }),

  requestChangeApproval: protectedProcedure
    .input(orderChangeApprovalRequestSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      if (orderChangeActor(ctx.tenantContext.membership.role).isApprover)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Owners and admins record this directly.",
        })
      const storeId = activeStoreId(ctx)
      const visible = await ctx.db.commercialOrder.findFirst({
        where: {
          ...(await orderScope(ctx)),
          id: input.orderId,
          tenantId: ctx.tenantContext.tenant.id,
        },
        select: { id: true },
      })
      if (!visible)
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." })
      const common = {
        actorUserId: ctx.session.user.id,
        clientRequestId: input.clientRequestId,
        orderId: input.orderId,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      }
      try {
        return await requestCommercialOrderChangeApproval(
          ctx.db,
          input.kind === "return"
            ? {
                ...common,
                kind: "RETURN",
                payload: {
                  lines: input.lines,
                  money: input.money,
                  reason: input.reason,
                },
              }
            : {
                ...common,
                kind: "REFUND",
                payload: {
                  amountMinor: input.amountMinor,
                  lowerTotal: input.lowerTotal,
                  method: input.method,
                  reason: input.reason,
                },
              },
        )
      } catch (error) {
        mapped(error)
      }
    }),

  withdrawChangeApproval: protectedProcedure
    .input(z.object({ approvalId: z.string().trim().min(1) }).strict())
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await cancelCommercialOrderChangeApproval(ctx.db, {
          actorUserId: ctx.session.user.id,
          approvalId: input.approvalId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapped(error)
      }
    }),

  pendingChangeApprovals: protectedProcedure.query(async ({ ctx }) => {
    assertApprover(ctx.tenantContext.membership.role)
    return listPendingCommercialOrderChangeApprovals(ctx.db, {
      storeId: activeStoreId(ctx),
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  decideChangeApproval: protectedProcedure
    .input(
      z
        .object({
          approvalId: z.string().trim().min(1),
          decision: z.enum(["approve", "reject"]),
          note: z.string().trim().max(500).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertApprover(ctx.tenantContext.membership.role)
      try {
        return await decideCommercialOrderChangeApproval(ctx.db, {
          actorUserId: ctx.session.user.id,
          approvalId: input.approvalId,
          decision: input.decision === "approve" ? "APPROVE" : "REJECT",
          note: input.note,
          storeId: activeStoreId(ctx),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapped(error)
      }
    }),

  recordApprovedChange: protectedProcedure
    .input(
      z
        .object({
          approvalId: z.string().trim().min(1),
          clientOperationId: z.string().trim().min(8).max(120),
          moneyAccountId: z.string().trim().min(1).max(128).optional(),
          reference: z.string().trim().max(160).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      assertCanOperateOrders(ctx.tenantContext.membership.role)
      try {
        return await recordApprovedCommercialOrderChange(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: activeStoreId(ctx),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapped(error)
      }
    }),
}
