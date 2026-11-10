import { expect, spyOn, test } from "bun:test"
import * as orderReads from "@ewatrade/db/assistant-general"
import * as inventory from "@ewatrade/db/queries"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { type GeneralTransactionContext, orderCreate } from "./general-actions"
import * as nativeOrder from "./general-native-order"

// This browser-shaped Owner context measures the native branch through a spy;
// actual branded linked/Cashier authority is tested by the guarded channel suite.
test("locked native confirmation reads canonical prices and receiving account once, after stock locks", async () => {
  const previous = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "synthetic-query-counter-key-".repeat(2)
  const events: string[] = []
  const native = spyOn(nativeOrder, "isNativeCatalogOrder").mockReturnValue(
    true,
  )
  const prices = spyOn(orderReads, "readGeneralOrderReview").mockImplementation(
    async () => {
      events.push("prices")
      return {
        totalMinor: 4000,
        lines: [],
        rows: Array.from({ length: 4 }, () => ({
          title: "Rice",
          detail: "Piece",
          unitPriceMinor: 1000,
          totalMinor: 1000,
        })),
      }
    },
  )
  const stock = spyOn(
    inventory,
    "getConfiguredCatalogOfferingAvailability",
  ).mockImplementation(async () => {
    events.push("stock")
    return {
      availableBalanceQuantity: parseExactDecimal("100"),
      availableOfferingQuantity: parseExactDecimal("100"),
      onHandQuantity: "100",
      reservedQuantity: "0",
      factor: "1",
      transactionScale: 0,
      balanceUnitName: "Piece",
      offeringUnitName: "Piece",
      offeringName: "Piece",
      variantName: "Default",
      balanceSourceId: "balance",
      configurationVersionId: "config",
      revision: 1,
    }
  })
  const locks = spyOn(
    inventory,
    "lockInventorySourcesForReview",
  ).mockImplementation(async () => {
    events.push("locks")
  })
  const ctx = {
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    session: { user: { id: "user" } },
    tenantContext: {
      tenant: {
        id: "tenant",
        name: "Shop",
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        retailOpsPlanId: "pro",
        currencyCode: "NGN",
        dataClassification: "QA",
      },
      membership: { id: "member", role: "OWNER" },
      activeStore: { id: "store", currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: "OWNER",
        assignments: [],
      },
    },
    db: {
      sellableOffering: {
        findFirst: async () => {
          events.push("existence")
          return { id: "rice" }
        },
      },
      financeBook: {
        findUnique: async () => {
          events.push("account")
          return { id: "book", currencyCode: "NGN" }
        },
      },
      financeAccount: {
        findMany: async () => [
          {
            id: "cash",
            name: "Shop cash",
            purpose: "CASH",
            paymentMethods: [],
            paymentsPausedAt: null,
          },
        ],
      },
    },
  } as unknown as GeneralTransactionContext
  try {
    const target = await orderCreate.validate(
      ctx,
      {
        action: "order_create",
        customerChoice: "walk_in",
        paymentChoice: "partial",
        fulfillNow: true,
        initialPayment: {
          amountMinor: 400,
          method: "cash",
          moneyAccountId: "cash",
        },
        lines: Array.from({ length: 4 }, () => ({
          offeringId: "rice",
          quantity: "1",
          expectedFixedPriceMinor: 1000,
          expectedConfigurationVersionId: "config",
        })),
      },
      true,
    )
    expect(target?.id).toBe("store")
    expect(prices).toHaveBeenCalledTimes(1)
    expect(events.filter((event) => event === "account")).toHaveLength(1)
    expect(events.filter((event) => event === "existence")).toHaveLength(0)
    expect(events.indexOf("locks")).toBeLessThan(events.indexOf("prices"))
    expect(stock).toHaveBeenCalledTimes(2)
  } finally {
    locks.mockRestore()
    stock.mockRestore()
    prices.mockRestore()
    native.mockRestore()
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previous
  }
})
