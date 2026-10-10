import { expect, test } from "bun:test"
import { customerHistoryWhere, openOrderWhere } from "./order-visibility"

test("customer history excludes lookup options while preserving rep visibility", () => {
  const lookup = {
    tenantId: "tenant",
    storeId: "store",
    customerId: "customer",
    history: true,
  }
  expect(customerHistoryWhere(lookup)).toEqual({
    tenantId: "tenant",
    storeId: "store",
  })
  expect(customerHistoryWhere({ ...lookup, createdByUserId: "rep" })).toEqual({
    tenantId: "tenant",
    storeId: "store",
    OR: [{ createdByUserId: "rep" }, openOrderWhere],
  })
})
