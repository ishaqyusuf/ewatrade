import { describe, expect, test } from "bun:test"
import { assertQaFormCoverage } from "./qa-accelerator"
import { createQaFixtureContext } from "./qa-fixtures"
import {
  QA_DASHBOARD_FORM_INVENTORY,
  QA_FORM_COVERAGE,
  QA_MARKETING_FORM_INVENTORY,
  QA_MOBILE_FORM_INVENTORY,
  QA_REACHABLE_RECIPE_IDS,
  assertQaRecipeReachability,
  createQaCustomerFixture,
  createQaInventoryConversionFixture,
  createQaMessageFixture,
  createQaPaymentFixture,
} from "./qa-quick-fill"

describe("QA Quick Fill", () => {
  const context = createQaFixtureContext({
    currencyCode: "NGN",
    domain: "ishack.qa.test",
    invocationId: "run-123",
    now: new Date("2026-08-27T10:00:00Z"),
    seed: "seed-1",
    storeId: "store-1",
    tenantId: "tenant-1",
    timezone: "Africa/Lagos",
  })

  test("generates exact-domain customer data without submitting anything", () => {
    expect(createQaCustomerFixture(context, 2)).toMatchObject({
      email: "qa+run-123-customer-create-2@ishack.qa.test",
    })
    expect(createQaMessageFixture(context).message).toContain(
      "Review before sending",
    )
  })

  test("generates a bounded non-provider payment draft", () => {
    expect(createQaPaymentFixture(context, 900_000)).toEqual({
      amountMinor: 250_000,
      method: "cash",
      reference: "QA-RUN-123",
    })
    expect(() => createQaPaymentFixture(context, 0)).toThrow(
      "An outstanding integer minor-unit balance is required.",
    )
  })

  test("selects an exact compatible packaged-stock conversion", () => {
    const conversion = createQaInventoryConversionFixture([
      {
        availableQuantity: "20",
        balanceSourceId: "carton",
        configurationVersionId: "config-1",
        inventoryUnitFactor: "12",
        inventoryUnitTransactionScale: 0,
        kind: "PACKAGED_STOCK",
        productId: "product-1",
        variantId: "variant-1",
      },
      {
        availableQuantity: "100",
        balanceSourceId: "pack",
        configurationVersionId: "config-1",
        inventoryUnitFactor: "3",
        inventoryUnitTransactionScale: 0,
        kind: "PACKAGED_STOCK",
        productId: "product-1",
        variantId: "variant-1",
      },
    ])
    expect(conversion?.sourceBalanceSourceId).toBe("carton")
    expect(String(conversion?.sourceQuantity)).toBe("3")
    expect(conversion?.targetBalanceSourceId).toBe("pack")
    expect(String(conversion?.targetQuantity)).toBe("12")
    expect(
      createQaInventoryConversionFixture([
        {
          availableQuantity: "2",
          balanceSourceId: "carton",
          configurationVersionId: "config-1",
          inventoryUnitFactor: "12",
          inventoryUnitTransactionScale: 0,
          kind: "PACKAGED_STOCK",
          productId: "product-1",
          variantId: "variant-1",
        },
      ]),
    ).toBeNull()
  })

  test("covers every inventoried cross-platform form exactly once", () => {
    const inventory = [
      ...QA_MARKETING_FORM_INVENTORY,
      ...QA_MOBILE_FORM_INVENTORY,
      ...QA_DASHBOARD_FORM_INVENTORY,
    ]
    expect(assertQaFormCoverage(inventory, QA_FORM_COVERAGE)).toEqual({
      declarations: inventory.length,
      forms: inventory.length,
    })
  })

  test("keeps recipe declarations synchronized with reachable controls", () => {
    expect(assertQaRecipeReachability()).toEqual({
      recipes: QA_REACHABLE_RECIPE_IDS.length,
    })
    expect(
      QA_FORM_COVERAGE.filter((entry) => entry.kind !== "recipe").every(
        (entry) => Boolean(entry.reason),
      ),
    ).toBe(true)
  })
})
