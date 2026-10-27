import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import {
  type OrderCandidate,
  type OrderPreparationRequest,
  orderPreparationDraftSchema,
  resolveOrderPreparation,
} from "@ewatrade/assistant/general/order-preparation"
import { listCatalogItemsPage, listCustomersPage } from "@ewatrade/db/queries"
import type { PrismaClient } from "@ewatrade/db/types"
import { subtractExactDecimals } from "@ewatrade/utils/exact-decimal"
import {
  type GeneralContext,
  assertCapability,
  requireGeneralScope,
} from "./general-context"
import { recordPreparation } from "./preparation-observability"

/** Canonical protected reads only; the existing order form owns creation/payment/fulfillment. */
export async function prepareGeneralOrder(
  ctx: Omit<GeneralContext, "db"> & {
    db: Pick<PrismaClient, "catalogItem" | "customer">
  },
  request: OrderPreparationRequest,
) {
  const startedAt = Date.now()
  const capability = capabilityManifest.find(
    (entry) => entry.id === "sales.order.prepare",
  )
  if (!capability) throw Error("Order preparation capability missing")
  assertCapability(ctx, capability)
  const scope = requireGeneralScope(ctx)
  const searches = await Promise.all(
    [...new Set(request.lines.map((line) => line.name))].map(async (name) => {
      const page = await listCatalogItemsPage(ctx.db, {
        kind: "product",
        query: name,
        searchOrder: "stable",
        limit: 50,
        tenantId: scope.tenantId,
        storeIds: [scope.storeId],
      })
      const candidates: OrderCandidate[] = page.items.flatMap((item) =>
        item.variants.flatMap((variant) =>
          variant.offerings.flatMap((offering) => {
            if (offering.kind !== "product_unit") return []
            const unit = item.product?.currentUnitConfiguration?.units.find(
              (unit) => unit.id === offering.productUnit?.inventoryUnitId,
            )
            const packaged = unit?.stockBehavior === "packaged_stock"
            const balance = item.product?.stockBalances.find(
              (balance) =>
                balance.variantId === variant.id &&
                balance.storeId === scope.storeId &&
                (packaged
                  ? balance.kind === "packaged_stock" &&
                    balance.inventoryUnitId === unit?.id
                  : balance.kind === "shared_pool"),
            )
            return [
              {
                catalogItemId: item.id,
                itemName: item.name,
                variantId: variant.id,
                offeringId: offering.id,
                unitName: unit?.name ?? offering.name,
                canonical: unit?.stockBehavior === "canonical_shared",
                transactionScale: unit?.transactionScale,
                choices: variant.selections.flatMap((selection) => {
                  const group = item.optionGroups.find(
                    (group) => group.id === selection.groupId,
                  )
                  const value = group?.values.find(
                    (value) => value.id === selection.valueId,
                  )
                  return group && value
                    ? [{ optionName: group.name, value: value.label }]
                    : []
                }),
                active:
                  item.status === "active" &&
                  variant.status === "active" &&
                  offering.status === "active",
                available:
                  !!unit &&
                  !!balance &&
                  item.product?.usage !== "INTERNAL_USE" &&
                  offering.stores.some(
                    (store) =>
                      store.storeId === scope.storeId && store.isAvailable,
                  ),
                fixedPriceMinor:
                  offering.pricingPolicy === "fixed"
                    ? offering.fixedPriceMinor
                    : null,
                pricingPolicy: offering.pricingPolicy,
                configurationVersionId:
                  item.product?.currentUnitConfiguration?.id,
                ...(balance && unit
                  ? {
                      stock: {
                        key: balance.id,
                        available: subtractExactDecimals(
                          balance.onHandQuantity,
                          balance.reservedQuantity,
                          6,
                        ),
                        factor: packaged ? "1" : unit.factor,
                      },
                    }
                  : {}),
              },
            ]
          }),
        ),
      )
      return {
        name,
        complete: !page.nextCursor,
        candidates,
        catalogItems: page.items.map((item) => ({
          id: item.id,
          name: item.name,
        })),
      }
    }),
  )
  const resolved = resolveOrderPreparation(request, searches)
  let customer: { id?: string; name: string } | undefined
  if (request.customerName) {
    const page = await listCustomersPage(ctx.db, {
      tenantId: scope.tenantId,
      query: request.customerName,
      limit: 50,
    })
    const exact = page.items.filter(
      (item) =>
        item.name.trim().toLowerCase() ===
        request.customerName?.trim().toLowerCase(),
    )
    if (page.nextCursor || exact.length > 1) {
      resolved.issues.push(
        "Select the exact saved customer; the name search is ambiguous or incomplete.",
      )
      resolved.totalMinor = null
    } else
      customer = {
        name: request.customerName,
        ...(exact[0] ? { id: exact[0].id } : {}),
      }
  }
  const draft = orderPreparationDraftSchema.parse({
    customer,
    origin: { tenantId: scope.tenantId, storeId: scope.storeId },
    currencyCode:
      ctx.tenantContext.activeStore?.currencyCode ??
      ctx.tenantContext.tenant.currencyCode,
    request,
    ...resolved,
  })
  recordPreparation({
    kind: "order",
    durationMs: Date.now() - startedAt,
    lineCount: draft.lines.length,
    unresolvedCount: draft.issues.length,
    missingCount: draft.lines.filter(
      (line) =>
        line.status === "missing_item" || line.status === "missing_choice",
    ).length,
  })
  return draft
}
