import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
import { countCatalogItems, countCustomers } from "@ewatrade/db/queries"
import { catalogCountSchema } from "../schemas/catalog"
import { customerCountSchema } from "../schemas/customers"
import { generalCountAnswer } from "./general-count-answer"

test("count queries use filters and never fetch a limited page", async () => {
  const queries: unknown[] = []
  const count = async (q: unknown) => {
    queries.push(q)
    return 1001
  }
  const db = {
    catalogItem: { count },
    customer: { count },
  } as unknown as Parameters<typeof countCatalogItems>[0]
  expect(
    await countCatalogItems(db, {
      tenantId: "t",
      kind: "product",
      status: "active",
      nameContains: "Egg",
    }),
  ).toBe(1001)
  expect(queries[0]).toMatchObject({
    where: {
      tenantId: "t",
      kind: "PRODUCT",
      status: "ACTIVE",
      name: { contains: "Egg", mode: "insensitive" },
    },
  })
  expect(await countCustomers(db, { tenantId: "t", query: "Amina" })).toBe(1001)
  expect(queries[1]).toMatchObject({
    where: {
      tenantId: "t",
      OR: [
        { name: { contains: "Amina" } },
        { email: { contains: "Amina" } },
        { phone: { contains: "Amina" } },
      ],
    },
  })
})
test("count schemas preserve old customer calls but reject injected scope", () => {
  expect(customerCountSchema.safeParse(undefined).success).toBe(true)
  expect(
    customerCountSchema.safeParse({ query: "Amina", tenantId: "other" })
      .success,
  ).toBe(false)
  expect(
    catalogCountSchema.safeParse({ kind: "product", storeId: "other" }).success,
  ).toBe(false)
})
test("count cards reject inexact numbers and rehearsal preserves named filters", () => {
  const input = { title: "Count", count: 0, scope: "Business", detail: "Exact" }
  expect(generalAnswerSchema.safeParse(generalCountAnswer(input)).success).toBe(
    true,
  )
  expect(() =>
    generalCountAnswer({ ...input, count: Number.MAX_SAFE_INTEGER + 1 }),
  ).toThrow("Exact count unavailable")
  const run = (content: string) =>
    respondGeneralRehearsal([{ role: "user", content }])
  expect(run("count products active named Egg")).toMatchObject({
    toolName: "readCatalogCount",
    input: { kind: "product", status: "active", nameContains: "Egg" },
  })
  expect(run("count customers matching Amina")).toMatchObject({
    toolName: "readCustomerCount",
    input: { query: "Amina" },
  })
  expect(run("count stores")).toMatchObject({
    toolName: "readStoreCount",
    input: {},
  })
})
