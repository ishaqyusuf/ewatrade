import { expect, test } from "bun:test"
import { getServiceCommerceCatalogPriceSuggestionSnapshots } from "./service-commerce-catalog-pricing"
import type { DbClient } from "./types"

test.each([null, 0, 250])(
  "completed-sale evidence requires a recorded unit price: %j",
  async (unitPriceMinor) => {
    const date = new Date("2026-10-06T00:00:00Z")
    const database = {
      sellableOffering: {
        findMany: async () => [
          {
            id: "offering",
            currencyCode: "NGN",
            fixedPriceMinor: null,
            updatedAt: date,
            priceChanges: [],
          },
        ],
      },
      commerceQuoteLine: { findMany: async () => [] },
      commercialOrderLine: {
        findMany: async ({
          where,
        }: { where: { order: { completedAt: unknown } } }) =>
          where.order.completedAt === null
            ? []
            : [
                {
                  id: "sale-line",
                  offeringId: "offering",
                  unitPriceMinor,
                  order: { completedAt: date, storeId: "store" },
                },
              ],
      },
    }
    // Deliberately implement only the read ports used by this repository query.
    const [snapshot] = await getServiceCommerceCatalogPriceSuggestionSnapshots(
      database as unknown as DbClient,
      {
        currencyCode: "NGN",
        includeTenantHistory: false,
        offeringIds: ["offering"],
        storeId: "store",
        tenantId: "tenant",
      },
    )
    expect(snapshot?.evidence).toHaveLength(unitPriceMinor === null ? 0 : 1)
    expect(snapshot?.suggestion.priceMinor).toBe(unitPriceMinor)
    expect(snapshot?.suggestion.source).toBe(
      unitPriceMinor === null ? "unknown" : "completed_sale",
    )
  },
)
