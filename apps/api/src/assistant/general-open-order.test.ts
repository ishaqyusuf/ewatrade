import { expect, test } from "bun:test"
import { lookupCommercialOrdersPage } from "@ewatrade/db/queries"
import { orderLookupPageSchema } from "../schemas/order-visibility"
import { generalOpenOrderInput } from "./general-lookup-inputs"
import { generalOrderAnswer } from "./general-order-answer"

test("open-order lookup requires one identity and rejects authority injection", () => {
  expect(
    orderLookupPageSchema.safeParse({ customerId: "customer", cursor: "order" })
      .success,
  ).toBe(true)
  for (const input of [
    {},
    { customerId: "c", phone: "123" },
    { customerId: "c", storeId: "other" },
    { customerId: "c", createdByUserId: "other" },
  ])
    expect(orderLookupPageSchema.safeParse(input).success).toBe(false)
})
test("paged lookup retains creator scope and rejects an inaccessible cursor before reading rows", async () => {
  const captures: unknown[] = []
  const db = {
    commercialOrder: {
      findFirst: async (input: unknown) => {
        captures.push(input)
        return null
      },
      findMany: async () => {
        throw Error("Rows should not be read")
      },
    },
  } as unknown as Parameters<typeof lookupCommercialOrdersPage>[0]
  await expect(
    lookupCommercialOrdersPage(db, {
      tenantId: "t",
      storeId: "s",
      createdByUserId: "rep",
      customerId: "c",
      cursor: "foreign",
    }),
  ).rejects.toThrow("lookup changed")
  expect(captures[0]).toMatchObject({
    where: {
      AND: [
        {
          tenantId: "t",
          storeId: "s",
          createdByUserId: "rep",
          AND: [
            { customerId: "c" },
            { status: { notIn: ["CANCELLED", "REFUNDED"] } },
          ],
        },
        { id: "foreign" },
      ],
    },
  })
})

test("individual order cards agree with aggregate cancelled/refunded unpaid semantics", () => {
  const order = {
    id: "id",
    orderNumber: "ORD",
    currencyCode: "NGN",
    totalMinor: 1000,
    balanceDueMinor: 800,
    status: "CONFIRMED",
    paymentStatus: "PARTIAL",
  }
  expect(generalOrderAnswer(order, "Store").detail).toContain("unpaid ₦8.00")
  for (const status of ["CANCELLED", "REFUNDED"])
    expect(generalOrderAnswer({ ...order, status }, "Store").detail).toContain(
      "unpaid ₦0.00",
    )
  expect(
    generalOpenOrderInput.safeParse({ customerId: "c", limit: 50 }).success,
  ).toBe(false)
})
