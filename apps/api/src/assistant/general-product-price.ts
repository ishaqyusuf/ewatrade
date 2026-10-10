import { generalMoney } from "@ewatrade/assistant/general/contracts"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  CatalogError,
  updateCatalogPriceInTransaction,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type PriceAction = Extract<GeneralAction, { action: "product_price_update" }>

async function priceTarget(
  ctx: GeneralTransactionContext,
  payload: PriceAction,
) {
  const scope = requireGeneralScope(ctx)
  const offering = await ctx.db.sellableOffering.findFirst({
    where: {
      id: payload.offeringId,
      tenantId: scope.tenantId,
      kind: "PRODUCT_UNIT",
      status: "ACTIVE",
      pricingPolicy: "FIXED",
      catalogItem: { kind: "PRODUCT", status: "ACTIVE" },
      variant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      catalogItemId: true,
      name: true,
      revision: true,
      fixedPriceMinor: true,
      currencyCode: true,
      updatedAt: true,
      catalogItem: { select: { name: true, updatedAt: true } },
      variant: { select: { name: true, updatedAt: true } },
    },
  })
  if (!offering || offering.fixedPriceMinor === null)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Choose an active product offering with a fixed price.",
    })
  if (offering.fixedPriceMinor === payload.priceMinor)
    throw new TRPCError({
      code: "CONFLICT",
      message: "This price is already saved.",
    })
  return {
    offering: { ...offering, fixedPriceMinor: offering.fixedPriceMinor },
    target: {
      id: offering.id,
      revision: proposalDigest(JSON.stringify(offering)),
    },
  }
}

export const productPriceUpdate: GeneralActionAdapter<PriceAction> = {
  async validate(ctx, payload) {
    return (await priceTarget(ctx, payload)).target
  },
  async review(ctx, payload) {
    const { offering, target } = await priceTarget(ctx, payload)
    const amount = (minor: number) => generalMoney(minor, offering.currencyCode)
    return {
      target,
      lines: [
        `${offering.catalogItem.name} · ${offering.variant.name} · ${offering.name}`,
        `Price: ${amount(offering.fixedPriceMinor)} → ${amount(payload.priceMinor)}`,
        `Reason: ${payload.reason}`,
        "Applies in every Store selling this offering. Other units and variants stay unchanged.",
        "Past orders keep their saved prices.",
      ],
    }
  },
  stale: "This offering changed. Edit and review its current price again.",
  unavailable:
    "This price update is unavailable or already matches the saved price.",
  async execute(ctx, payload) {
    const scope = requireGeneralScope(ctx)
    const { offering } = await priceTarget(ctx, payload)
    try {
      await updateCatalogPriceInTransaction(ctx.db, {
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
        offeringId: offering.id,
        expectedRevision: offering.revision,
        priceMinor: payload.priceMinor,
        reason: payload.reason,
      })
    } catch (error) {
      if (error instanceof CatalogError)
        throw new TRPCError({ code: "CONFLICT", message: error.message })
      throw error
    }
    return {
      kind: "product",
      recordId: offering.catalogItemId,
      title: "Product price updated",
      detail: `${offering.catalogItem.name} · ${offering.name} · ${generalMoney(payload.priceMinor, offering.currencyCode)}`,
    }
  },
}
