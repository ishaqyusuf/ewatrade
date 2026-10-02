import { describe, expect, test } from "bun:test"

import { catalogListItemsPageSchema } from "./catalog"
import { financeBillsSchema } from "./finance"
import { commercialOrderListPageSchema } from "./orders"
import { serviceWorkQueuePageSchema } from "./services"

describe("paginated table sort contracts", () => {
  test("accepts the server sort fields and directions for each table", () => {
    expect(
      catalogListItemsPageSchema.parse({
        sort: { field: "updatedAt", direction: "asc" },
      }).sort,
    ).toEqual({ field: "updatedAt", direction: "asc" })
    expect(
      commercialOrderListPageSchema.parse({
        sort: { field: "total", direction: "desc" },
      }).sort,
    ).toEqual({ field: "total", direction: "desc" })
    expect(
      serviceWorkQueuePageSchema.parse({
        sort: { field: "priority", direction: "asc" },
      }).sort,
    ).toEqual({ field: "priority", direction: "asc" })
    expect(
      financeBillsSchema.parse({
        bookId: "book-1",
        sort: { field: "paidMinor", direction: "desc" },
      }).sort,
    ).toEqual({ field: "paidMinor", direction: "desc" })
  })

  test("rejects unsupported fields, directions, and extra sort properties", () => {
    const contracts = [
      { schema: catalogListItemsPageSchema, input: {}, field: "name" },
      {
        schema: commercialOrderListPageSchema,
        input: {},
        field: "orderNumber",
      },
      {
        schema: serviceWorkQueuePageSchema,
        input: {},
        field: "createdAt",
      },
      {
        schema: financeBillsSchema,
        input: { bookId: "book-1" },
        field: "description",
      },
    ] as const
    for (const { schema, input, field } of contracts) {
      expect(() =>
        schema.parse({
          ...input,
          sort: { field: "arbitraryColumn", direction: "asc" },
        }),
      ).toThrow()
      expect(() =>
        schema.parse({
          ...input,
          sort: { field, direction: "sideways" },
        }),
      ).toThrow()
      expect(() =>
        schema.parse({
          ...input,
          sort: { field, direction: "asc", extra: true },
        }),
      ).toThrow()
    }
  })

  test("leaves the sort absent by default", () => {
    expect(catalogListItemsPageSchema.parse({}).sort).toBeUndefined()
    expect(commercialOrderListPageSchema.parse({}).sort).toBeUndefined()
    expect(serviceWorkQueuePageSchema.parse({}).sort).toBeUndefined()
    expect(financeBillsSchema.parse({ bookId: "book-1" }).sort).toBeUndefined()
  })
})
