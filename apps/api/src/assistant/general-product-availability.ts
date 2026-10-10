import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  CatalogError,
  setCatalogOfferingStoreAvailabilityInTransaction,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Action = Extract<GeneralAction, { action: "product_availability_update" }>
async function availabilityTarget(
  ctx: GeneralTransactionContext,
  payload: Action,
) {
  const scope = requireGeneralScope(ctx)
  const offering = await ctx.db.sellableOffering.findFirst({
    where: {
      id: payload.offeringId,
      tenantId: scope.tenantId,
      kind: "PRODUCT_UNIT",
      status: "ACTIVE",
      catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
      variant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      catalogItemId: true,
      name: true,
      revision: true,
      updatedAt: true,
      catalogItem: { select: { name: true, updatedAt: true } },
      variant: { select: { name: true, updatedAt: true } },
      storeAvailability: {
        where: { storeId: scope.storeId },
        select: { isAvailable: true, updatedAt: true },
      },
    },
  })
  if (!offering)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Choose an active product selling unit.",
    })
  const current = offering.storeAvailability[0] ?? null
  if (Boolean(current?.isAvailable) === payload.isAvailable)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This selling availability is already saved.",
    })
  return {
    scope,
    offering,
    current,
    target: {
      id: offering.id,
      revision: proposalDigest({ storeId: scope.storeId, offering }),
    },
  }
}
export const productAvailabilityUpdate: GeneralActionAdapter<Action> = {
  async validate(ctx, payload) {
    return (await availabilityTarget(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { offering, current, target } = await availabilityTarget(ctx, payload)
    return {
      target,
      lines: [
        `${offering.catalogItem.name} · ${offering.variant.name} · ${offering.name}`,
        `Selling: ${current?.isAvailable ? "Available" : "Unavailable"} → ${payload.isAvailable ? "Available" : "Unavailable"}`,
        `Only ${ctx.tenantContext.activeStore?.name ?? "the current Store"}. Other Stores and selling units stay unchanged.`,
        "Stock quantities, reservations, prices and past orders stay unchanged.",
      ],
    }
  },
  stale:
    "Selling availability changed. Edit and review the current state again.",
  unavailable:
    "This selling availability update is unavailable or already saved.",
  async execute(ctx, payload) {
    const { scope, offering, current } = await availabilityTarget(ctx, payload)
    try {
      await setCatalogOfferingStoreAvailabilityInTransaction(ctx.db, {
        ...scope,
        actorUserId: scope.userId,
        offeringId: offering.id,
        isAvailable: payload.isAvailable,
        expectedAvailability: current,
      })
    } catch (error) {
      if (error instanceof CatalogError)
        throw new TRPCError({ code: "CONFLICT", message: error.message })
      throw error
    }
    return {
      kind: "product",
      recordId: offering.catalogItemId,
      title: "Selling availability updated",
      detail: `${offering.catalogItem.name} · ${offering.name} · ${payload.isAvailable ? "Available" : "Unavailable"} in ${ctx.tenantContext.activeStore?.name ?? "this Store"}`,
    }
  },
}
