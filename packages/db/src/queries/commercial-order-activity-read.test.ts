import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getCommercialOrder } from "./commercial-orders"

test("order reads preserve stock-event timestamps under the requested tenant and store", async () => {
  const fulfilledAt = new Date("2026-10-08T10:00:00Z")
  const returnedAt = new Date("2026-10-08T11:00:00Z")
  const calls: unknown[] = []
  const db = {
    commercialOrder: {
      findFirst: async (query: unknown) => {
        calls.push(query)
        return {
          id: "o1",
          createdByUserId: "",
          totalMinor: 10000,
          amountPaidMinor: 0,
          paymentStatus: "PENDING",
          payments: [],
          lines: [
            {
              id: "l1",
              kind: "PRODUCT_UNIT",
              quantity: "2",
              stockReservation: null,
              snapshot: null,
              serviceFulfillment: null,
              serviceAuthorization: null,
              productFulfillments: [
                {
                  id: "f1",
                  quantity: "2",
                  createdAt: fulfilledAt,
                  stockOperationId: "s1",
                },
              ],
              productReturns: [
                {
                  id: "r1",
                  quantity: "1",
                  createdAt: returnedAt,
                  stockOperationId: "s2",
                  disposition: "RESTOCK",
                },
              ],
            },
          ],
        }
      },
    },
  } as unknown as PrismaClient
  const result = await getCommercialOrder(db, {
    orderId: "o1",
    tenantId: "t1",
    storeId: "s1",
  })
  expect(result?.lines[0]?.productFulfillments[0]?.createdAt).toEqual(
    fulfilledAt,
  )
  expect(result?.lines[0]?.productReturns[0]?.createdAt).toEqual(returnedAt)
  expect(calls[0]).toMatchObject({
    where: { id: "o1", tenantId: "t1", storeId: "s1" },
  })
})
