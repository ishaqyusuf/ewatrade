import { describe, expect, test } from "bun:test"
import {
  catalogActivitySchema,
  catalogDetailPageSchema,
} from "../schemas/catalog-detail"
import { catalogDetailScope } from "./detail-access"
const input = { itemId: "eggs", storeId: "active" }
const context = {
  tenant: { id: "tenant" },
  membership: { role: "OWNER" },
  activeStore: { id: "active" },
  stores: [{ id: "active" }, { id: "other" }],
}
describe("Catalog detail authority", () => {
  test("uses auth Tenant and owning Inventory permission", () => {
    expect(catalogDetailScope(input, context)).toEqual({
      ...input,
      tenantId: "tenant",
      inventory: true,
    })
    for (const role of ["CASHIER", "OPERATOR"])
      expect(
        catalogDetailScope(input, { ...context, membership: { role } })
          .inventory,
      ).toBe(false)
  })
  test("denies non-operating roles and inaccessible/inactive Store", () => {
    for (const role of ["SUPPORT", "MEMBER", "unknown"])
      expect(() =>
        catalogDetailScope(input, { ...context, membership: { role } }),
      ).toThrow()
    for (const storeId of ["other", "foreign"])
      expect(() => catalogDetailScope({ ...input, storeId }, context)).toThrow()
    expect(() =>
      catalogDetailScope(input, { ...context, activeStore: null, stores: [] }),
    ).toThrow()
  })
  test("accepts TanStack forward paging but rejects authority injection and invalid cursors", () => {
    expect(
      catalogDetailPageSchema.parse({ ...input, direction: "forward" }).limit,
    ).toBe(30)
    for (const patch of [
      { tenantId: "foreign" },
      { inventory: true },
      { limit: 51 },
      { direction: "backward" },
      { cursor: { at: "bad", key: "stock:id" } },
    ])
      expect(
        catalogActivitySchema.safeParse({ ...input, ...patch }).success,
      ).toBe(false)
  })
})
