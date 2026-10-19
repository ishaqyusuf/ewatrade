import { expect, test } from "bun:test"
import { nativeStockAnswerRoute } from "./native-stock-target"

const scope = { tenantId: "t-1", storeId: "store-1" }
const origin = { tenantId: "t-1", storeId: "store-1" }

test("each exact stock answer target opens its own original route", () => {
  expect(
    nativeStockAnswerRoute(
      { kind: "stock_operation", operationId: "op-1", origin },
      scope,
    ),
  ).toEqual({
    pathname: "/stock-operation/[operationId]",
    params: { operationId: "op-1" },
  })
  expect(
    nativeStockAnswerRoute(
      { kind: "stock_count", stockCountId: "c-1", origin },
      scope,
    ),
  ).toEqual({
    pathname: "/stock-count/[stockCountId]",
    params: { stockCountId: "c-1" },
  })
  expect(
    nativeStockAnswerRoute(
      { kind: "stock_transfer", transferId: "t-9", origin },
      scope,
    ),
  ).toEqual({
    pathname: "/stock-transfer/[transferId]",
    params: { transferId: "t-9" },
  })
  expect(
    nativeStockAnswerRoute(
      { kind: "inventory_closeout", closeoutId: "k-1", origin },
      scope,
    ),
  ).toEqual({
    pathname: "/inventory-closeout/[closeoutId]",
    params: { closeoutId: "k-1" },
  })
})

test("another business or Store, a missing scope, or a loose identity opens nothing", () => {
  const exact = { kind: "stock_count", stockCountId: "c-1", origin }
  for (const current of [
    null,
    undefined,
    { tenantId: "t-2", storeId: "store-1" },
    { tenantId: "t-1", storeId: "store-2" },
  ])
    expect(nativeStockAnswerRoute(exact, current)).toBeNull()
  for (const target of [
    { ...exact, stockCountId: " c-1" },
    { ...exact, stockCountId: "https://x.test/c-1" },
    { ...exact, stockCountId: "c%2F1" },
    { ...exact, extra: true },
    { ...exact, origin: { ...origin, actorUserId: "u-1" } },
    { kind: "stock_count", operationId: "c-1", origin },
    { kind: "inventory", recordId: "op-1", origin },
    { kind: "catalog_item", catalogItemId: "p-1", origin },
    null,
  ])
    expect(nativeStockAnswerRoute(target, scope)).toBeNull()
})
