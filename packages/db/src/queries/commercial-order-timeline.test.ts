import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getCommercialOrderTimeline } from "./commercial-order-timeline"

const at = (time: string) => new Date(`2026-10-11T${time}.000Z`)
const line = (id: string, name: string, unit: string) => ({
  id,
  kind: "PRODUCT_UNIT",
  quantity: "2",
  snapshot: {
    catalogItemName: name,
    inventoryUnitName: unit,
    customLineRole: null,
    note: null,
  },
  productFulfillments: [] as unknown[],
  productReturns: [] as unknown[],
  serviceFulfillment: null,
})

function fakeDb(order: Record<string, unknown>) {
  return {
    commercialOrder: { findFirst: async () => order },
    stockOperation: {
      findMany: async () => [
        {
          id: "op1",
          actorUserId: "musa",
          clientOperationId: "batch:l1",
          effectiveAt: at("10:31:00"),
        },
      ],
    },
    commercialOrderFulfillmentCommand: { findMany: async () => [] },
    user: {
      findMany: async () => [
        {
          id: "ishaq",
          name: "Ishaq",
          displayName: null,
          email: "i@x",
          memberships: [],
        },
        {
          id: "musa",
          name: "Musa",
          displayName: null,
          email: "m@x",
          memberships: [],
        },
      ],
    },
  } as unknown as PrismaClient
}

const baseOrder = {
  id: "order",
  orderNumber: "ORD-0140",
  currencyCode: "NGN",
  status: "CONFIRMED",
  createdAt: at("09:58:00"),
  createdByUserId: "musa",
  completedAt: null,
  updatedAt: at("12:00:00"),
  payments: [],
  amendments: [],
  replacementAmendments: [
    { id: "a0", order: { id: "old", orderNumber: "ORD-0139" } },
  ],
}
const scope = {
  tenantId: "tenant",
  scope: { tenantId: "tenant" },
  orderId: "order",
}

test("payments, fulfilment and metadata changes read in time order with actors", async () => {
  const l1 = line("l1", "Day-old chicks", "chick")
  l1.productFulfillments = [
    {
      id: "f1",
      quantity: "2",
      createdAt: at("10:31:00"),
      stockOperationId: "op1",
    },
  ]
  const timeline = await getCommercialOrderTimeline(
    fakeDb({
      ...baseOrder,
      lines: [l1, line("l2", "Feed 25kg", "bag")],
      payments: [
        {
          id: "p1",
          type: "PAYMENT",
          method: "BANK_TRANSFER",
          amountMinor: 4000000,
          reference: "GTB 2231",
          recordedByUserId: "musa",
          recordedAt: at("10:05:00"),
        },
      ],
      amendments: [
        {
          id: "m1",
          kind: "METADATA",
          actorUserId: "ishaq",
          reason: "Customer asked",
          createdAt: at("10:14:00"),
          beforeSnapshot: {
            customerName: "Walk-in",
            deliveryDueAt: "2026-10-11T14:00:00.000Z",
            notes: null,
          },
          afterSnapshot: {
            metadata: {
              customerName: "Chinedu Okafor",
              deliveryDueAt: "2026-10-11T16:00:00.000Z",
              notes: null,
            },
            changedFields: ["customerId", "customerName", "deliveryDueAt"],
          },
          replacementOrder: null,
        },
      ],
    }),
    scope,
  )
  expect(timeline.items.map((item) => item.kind)).toEqual([
    "created",
    "payment",
    "changed",
    "fulfilled",
  ])
  const [created, payment, changed, fulfilled] = timeline.items
  expect(created?.linkedOrder).toEqual({ id: "old", orderNumber: "ORD-0139" })
  expect(created?.actor).toEqual({ id: "musa", name: "Musa" })
  expect(payment).toMatchObject({
    amountMinor: 4000000,
    method: "BANK_TRANSFER",
  })
  expect(changed).toMatchObject({
    reason: "Customer asked",
    actor: { id: "ishaq", name: "Ishaq" },
    changes: [
      { field: "customer", before: "Walk-in", after: "Chinedu Okafor" },
      {
        field: "deliveryDueAt",
        before: "2026-10-11T14:00:00.000Z",
        after: "2026-10-11T16:00:00.000Z",
      },
    ],
  })
  expect(fulfilled?.lines).toEqual([
    { label: "Day-old chicks - chick", quantity: "2" },
  ])
})

test("replacement and cancellation keep line changes, links and released stock", async () => {
  const lines = [
    line("l1", "Day-old chicks", "chick"),
    line("l2", "Feed 25kg", "bag"),
  ]
  const replaced = await getCommercialOrderTimeline(
    fakeDb({
      ...baseOrder,
      status: "CANCELLED",
      replacementAmendments: [],
      lines,
      amendments: [
        {
          id: "r1",
          kind: "REPLACE",
          actorUserId: "ishaq",
          reason: "Customer added more",
          createdAt: at("11:00:00"),
          beforeSnapshot: {},
          afterSnapshot: {
            terms: {
              lines: [
                {
                  orderLineId: "l1",
                  quantity: "2",
                  originalQuantity: "2",
                  unitPriceMinor: 85000,
                  originalUnitPriceMinor: 85000,
                },
                {
                  orderLineId: "l2",
                  quantity: "3",
                  originalQuantity: "2",
                  unitPriceMinor: 1400000,
                  originalUnitPriceMinor: 1400000,
                },
              ],
              originalTotalMinor: 2970000,
              totalMinor: 4370000,
            },
          },
          replacementOrder: { id: "new", orderNumber: "ORD-0141" },
        },
      ],
    }),
    scope,
  )
  const replace = replaced.items.at(-1)
  expect(replace).toMatchObject({
    kind: "replaced",
    linkedOrder: { id: "new", orderNumber: "ORD-0141" },
    changes: [
      {
        field: "line",
        label: "Feed 25kg - bag",
        before: { quantity: "2", unitPriceMinor: 1400000 },
        after: { quantity: "3", unitPriceMinor: 1400000 },
      },
      { field: "total", before: 2970000, after: 4370000 },
    ],
  })
  // A replacement already closes the order; no second "cancelled" entry.
  expect(replaced.items.filter((item) => item.kind === "cancelled")).toEqual([])

  const cancelled = await getCommercialOrderTimeline(
    fakeDb({
      ...baseOrder,
      status: "CANCELLED",
      replacementAmendments: [],
      lines,
      amendments: [
        {
          id: "c1",
          kind: "CANCEL",
          actorUserId: "ishaq",
          reason: "Customer changed their mind",
          createdAt: at("11:20:00"),
          beforeSnapshot: {},
          afterSnapshot: {
            releasedReservations: [{ orderLineId: "l2", quantity: "2" }],
          },
          replacementOrder: null,
        },
      ],
    }),
    scope,
  )
  expect(cancelled.items.at(-1)).toMatchObject({
    kind: "cancelled",
    reason: "Customer changed their mind",
    changes: [
      { field: "stockReleased", label: "Feed 25kg - bag", quantity: "2" },
    ],
  })
})

test("refunds carry the reason the refund form saved as the payment note", async () => {
  const timeline = await getCommercialOrderTimeline(
    fakeDb({
      ...baseOrder,
      replacementAmendments: [],
      lines: [line("l1", "Day-old chicks", "chick")],
      payments: [
        {
          id: "r1",
          type: "REFUND",
          method: "CASH",
          amountMinor: 8000,
          reference: null,
          note: "Item returned",
          recordedByUserId: "ishaq",
          recordedAt: at("12:00:00"),
        },
      ],
    }),
    scope,
  )
  expect(timeline.items.at(-1)).toMatchObject({
    kind: "refund",
    amountMinor: 8000,
    reason: "Item returned",
  })
})
