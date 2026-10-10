import { expect, test } from "bun:test"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
import { listCustomersPage } from "@ewatrade/db/queries"
import {
  generalCatalogPageInput,
  generalCustomerPageInput,
  generalOrderPageInput,
} from "./general-lookup-inputs"

test("assistant page inputs preserve continuation/filters and reject authority fields", () => {
  expect(
    generalOrderPageInput.parse({
      cursor: "order",
      query: "Amina",
      queryMode: "customer",
      statuses: ["CONFIRMED"],
    }),
  ).toMatchObject({
    cursor: "order",
    queryMode: "customer",
    statuses: ["CONFIRMED"],
  })
  expect(
    generalCustomerPageInput.parse({ cursor: "customer", query: "Amina" }),
  ).toEqual({ cursor: "customer", query: "Amina" })
  for (const schema of [
    generalCatalogPageInput,
    generalCustomerPageInput,
    generalOrderPageInput,
  ])
    for (const field of ["tenantId", "storeId", "createdByUserId"])
      expect(schema.safeParse({ [field]: "other" }).success).toBe(false)
  expect(
    generalOrderPageInput.safeParse({
      createdAfter: "2026-10-02T00:00:00Z",
      createdBefore: "2026-10-01T00:00:00Z",
    }).success,
  ).toBe(false)
})
test("customer cursor is checked against tenant and literal filter before page access", async () => {
  const checks: unknown[] = []
  const db = {
    customer: {
      findFirst: async (input: unknown) => {
        checks.push(input)
        return null
      },
      findMany: async () => {
        throw Error("Page queried")
      },
    },
  } as unknown as Parameters<typeof listCustomersPage>[0]
  await expect(
    listCustomersPage(db, {
      tenantId: "tenant",
      cursor: "foreign",
      query: "%",
    }),
  ).rejects.toThrow("list changed")
  expect(checks[0]).toMatchObject({
    where: {
      AND: [
        {
          tenantId: "tenant",
          OR: [
            { email: { contains: "\\%" } },
            { name: { contains: "\\%" } },
            { phone: { contains: "\\%" } },
          ],
        },
        { id: "foreign" },
      ],
    },
  })
})

test("customer-page rehearsal keeps the query while continuing a cursor", () => {
  expect(
    respondGeneralRehearsal([
      {
        role: "user",
        content: "list customers matching Amina after customer-id",
      },
    ]),
  ).toMatchObject({
    kind: "tool",
    toolName: "readCustomers",
    input: { query: "Amina", cursor: "customer-id" },
  })
})

test("catalog page rehearsal keeps search and cursor while scope stays server-owned", () => {
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "list catalog matching eggs after item-id" },
    ]),
  ).toMatchObject({
    kind: "tool",
    toolName: "readCatalogPage",
    input: { query: "eggs", cursor: "item-id" },
  })
  expect(
    generalCatalogPageInput.safeParse({ searchOrder: "relevance" }).success,
  ).toBe(false)
})
