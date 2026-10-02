import { describe, expect, test } from "bun:test"

import type { Prisma } from "../../generated/prisma/client"
import {
  type CommercialCompletionLine,
  areCommercialOrderLinesComplete,
  isCommercialOrderFulfillmentAllowed,
  readCommercialOrderEarnedCompletion,
  readCommercialOrderLinesComplete,
} from "./commercial-order-completion"

const scope = {
  orderId: "order-1",
  storeId: "store-1",
  tenantId: "tenant-1",
}

function productLine(
  quantity: string,
  fulfilled: string[] = [],
  createdAt?: Date,
): CommercialCompletionLine {
  return {
    kind: "PRODUCT_UNIT",
    productFulfillments: fulfilled.map((value) => ({
      ...(createdAt ? { createdAt } : {}),
      quantity: value,
    })),
    quantity,
    serviceJobLines: [],
  }
}

function serviceLine(
  quantity: string,
  serviceJobLines: CommercialCompletionLine["serviceJobLines"] = [],
): CommercialCompletionLine {
  return {
    kind: "SERVICE",
    productFulfillments: [],
    quantity,
    serviceJobLines,
  }
}

function serviceFulfillment(
  overrides: Partial<
    NonNullable<CommercialCompletionLine["serviceFulfillment"]>
  > = {},
): NonNullable<CommercialCompletionLine["serviceFulfillment"]> {
  return {
    orderId: scope.orderId,
    performedAt: new Date("2026-10-01T10:00:00.000Z"),
    quantity: "1",
    tenantId: scope.tenantId,
    ...overrides,
  }
}

function chargeOnlyServiceLine(
  quantity: string,
  fulfillment: CommercialCompletionLine["serviceFulfillment"] = serviceFulfillment(),
): CommercialCompletionLine {
  return {
    id: "line-1",
    ...serviceLine(quantity),
    serviceFulfillment: fulfillment,
    snapshot: {
      serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
      serviceWorkPolicy: "CHARGE_ONLY",
    },
  }
}

function manualReleaseServiceLine(
  quantity: string,
  overrides: Partial<
    NonNullable<CommercialCompletionLine["serviceAuthorization"]>
  > = {},
): CommercialCompletionLine {
  return {
    ...chargeOnlyServiceLine(quantity),
    serviceAuthorization: {
      authorizedAt: new Date("2026-10-01T09:00:00.000Z"),
      orderId: scope.orderId,
      orderLineId: "line-1",
      quantity,
      tenantId: scope.tenantId,
      ...overrides,
    },
    snapshot: {
      serviceAuthorizationPolicy: "MANUAL_RELEASE",
      serviceWorkPolicy: "CHARGE_ONLY",
    },
  }
}

function serviceAllocation(
  overrides: Partial<CommercialCompletionLine["serviceJobLines"][number]> = {},
): CommercialCompletionLine["serviceJobLines"][number] {
  return {
    allocatedQuantity: "1",
    authorizationStatus: "AUTHORIZED",
    completedAt: new Date("2026-10-01T10:00:00.000Z"),
    reworkOfLineId: null,
    serviceJob: {
      commercialOrderId: scope.orderId,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
    },
    status: "COMPLETED",
    ...overrides,
  }
}

const completedAt = new Date("2026-10-01T12:00:00.000Z")
const packedAt = new Date("2026-10-01T09:00:00.000Z")
const fulfillmentAt = new Date("2026-10-01T11:00:00.000Z")

function acceptedPrescriptionVersion(overrides: Record<string, unknown> = {}) {
  return {
    acceptedOrderId: scope.orderId,
    currencyCode: "NGN",
    fulfilmentType: "PICKUP",
    quote: {
      sourceType: "PRESCRIPTION_REQUEST",
      storeId: scope.storeId,
      tenantId: scope.tenantId,
    },
    status: "ACCEPTED",
    totalMinor: 25_000,
    ...overrides,
  }
}

function completedOrder(overrides: Record<string, unknown> = {}) {
  return {
    acceptedCommerceQuoteVersion: null,
    completedAt,
    currencyCode: "NGN",
    prescriptionDeliveryAssignment: null,
    prescriptionPickupFulfillment: null,
    status: "COMPLETED",
    totalMinor: 25_000,
    ...overrides,
  }
}

function prescriptionPickup(overrides: Record<string, unknown> = {}) {
  return {
    handedOffAt: fulfillmentAt,
    orderId: scope.orderId,
    packedAt,
    status: "HANDED_OFF",
    storeId: scope.storeId,
    tenantId: scope.tenantId,
    ...overrides,
  }
}

function prescriptionDelivery(overrides: Record<string, unknown> = {}) {
  return {
    address: { packedAt },
    deliveredAt: fulfillmentAt,
    orderId: scope.orderId,
    proofReference: "proof-1",
    status: "DELIVERED",
    storeId: scope.storeId,
    tenantId: scope.tenantId,
    ...overrides,
  }
}

function earnedCompletionTransaction(
  order: Record<string, unknown> | null,
  lines: CommercialCompletionLine[] = [],
) {
  const orderQueries: unknown[] = []
  const lineQueries: unknown[] = []
  const tx = {
    commercialOrder: {
      findFirst: async (query: unknown) => {
        orderQueries.push(query)
        return order
      },
    },
    commercialOrderLine: {
      findMany: async (query: unknown) => {
        lineQueries.push(query)
        return lines
      },
    },
  } as unknown as Prisma.TransactionClient
  return { lineQueries, orderQueries, tx }
}

describe("commercial Order completion", () => {
  test("requires exact product fulfillment quantity", () => {
    expect(
      areCommercialOrderLinesComplete([productLine("3", ["2"])], scope),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete([productLine("3", ["1", "2"])], scope),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [productLine("3", ["1", "2", "0.000001"])],
        scope,
      ),
    ).toBe(false)
  })

  test("rejects unknown line kinds and invalid ordered or fulfilled quantities", () => {
    expect(
      areCommercialOrderLinesComplete(
        [{ ...productLine("1", ["1"]), kind: "BUNDLE" }],
        scope,
      ),
    ).toBe(false)
    expect(() =>
      areCommercialOrderLinesComplete(
        [productLine("not-a-number", ["1"])],
        scope,
      ),
    ).toThrow()
    expect(() =>
      areCommercialOrderLinesComplete([productLine("1", ["0"])], scope),
    ).toThrow()
  })

  test("uses Order chronology for earned completion but not quantity-only completion", () => {
    const priorProduct = [
      productLine("1", ["1"], new Date(completedAt.getTime() - 1)),
    ]
    expect(
      areCommercialOrderLinesComplete(priorProduct, scope, completedAt),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete([productLine("1", ["1"])], scope),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [productLine("1", ["1"], new Date(completedAt.getTime() + 1))],
        scope,
        completedAt,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [productLine("1", ["1"])],
        scope,
        completedAt,
      ),
    ).toBe(false)

    expect(
      areCommercialOrderLinesComplete(
        [serviceLine("1", [serviceAllocation({ completedAt })])],
        scope,
        completedAt,
      ),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [
          serviceLine("1", [
            serviceAllocation({
              completedAt: new Date(completedAt.getTime() + 1),
            }),
          ]),
        ],
        scope,
        completedAt,
      ),
    ).toBe(false)
  })

  test("allows only fulfillment-eligible Order statuses", () => {
    for (const status of ["CONFIRMED", "FULFILLING", "COMPLETED"]) {
      expect(isCommercialOrderFulfillmentAllowed(status)).toBe(true)
    }
    for (const status of ["CANCELLED", "REFUNDED", "DRAFT", "PENDING"]) {
      expect(isCommercialOrderFulfillmentAllowed(status)).toBe(false)
    }
  })

  test("requires every split Service allocation to finish and be authorized", () => {
    const lines = [
      serviceLine("3", [
        serviceAllocation({ allocatedQuantity: "1" }),
        serviceAllocation({
          allocatedQuantity: "2",
          authorizationStatus: "PENDING_PAYMENT",
          completedAt: null,
          status: "PENDING",
        }),
      ]),
    ]
    expect(areCommercialOrderLinesComplete(lines, scope)).toBe(false)
    lines[0]?.serviceJobLines.splice(
      1,
      1,
      serviceAllocation({ allocatedQuantity: "2" }),
    )
    expect(areCommercialOrderLinesComplete(lines, scope)).toBe(true)
  })

  test("charge-only Service requires immutable policy and exact performed source", () => {
    expect(
      areCommercialOrderLinesComplete(
        [chargeOnlyServiceLine("2", serviceFulfillment({ quantity: "2" }))],
        scope,
      ),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [chargeOnlyServiceLine("2", null)],
        scope,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [chargeOnlyServiceLine("2", serviceFulfillment({ quantity: "1" }))],
        scope,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [chargeOnlyServiceLine("2", serviceFulfillment({ quantity: "3" }))],
        scope,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [
          {
            ...chargeOnlyServiceLine("1"),
            serviceJobLines: [serviceAllocation()],
          },
        ],
        scope,
      ),
    ).toBe(false)
  })

  test("manual-release charge-only completion requires matching dated authorization", () => {
    expect(
      areCommercialOrderLinesComplete([manualReleaseServiceLine("1")], scope),
    ).toBe(true)
    const invalid = [
      manualReleaseServiceLine("1", { tenantId: "tenant-other" }),
      manualReleaseServiceLine("1", { orderId: "order-other" }),
      manualReleaseServiceLine("1", { orderLineId: "line-other" }),
      manualReleaseServiceLine("1", { quantity: "2" }),
      manualReleaseServiceLine("1", { authorizedAt: new Date(Number.NaN) }),
      manualReleaseServiceLine("1", {
        authorizedAt: new Date("2026-10-01T10:00:01.000Z"),
      }),
      {
        ...chargeOnlyServiceLine("1"),
        snapshot: {
          serviceAuthorizationPolicy: "MANUAL_RELEASE",
          serviceWorkPolicy: "CHARGE_ONLY",
        },
      },
    ]
    for (const line of invalid) {
      expect(areCommercialOrderLinesComplete([line], scope)).toBe(false)
    }
    expect(
      areCommercialOrderLinesComplete(
        [manualReleaseServiceLine("1"), productLine("1")],
        scope,
      ),
    ).toBe(false)
  })

  test("charge-only performance requires a recognized immutable authorization policy", () => {
    for (const policy of [null, "UNKNOWN"]) {
      expect(
        areCommercialOrderLinesComplete(
          [
            {
              ...chargeOnlyServiceLine("1"),
              snapshot: {
                serviceAuthorizationPolicy: policy,
                serviceWorkPolicy: "CHARGE_ONLY",
              },
            },
          ],
          scope,
        ),
      ).toBe(false)
    }
    for (const policy of ["ON_ORDER_CONFIRMATION", "AFTER_REQUIRED_PAYMENT"]) {
      expect(
        areCommercialOrderLinesComplete(
          [
            {
              ...chargeOnlyServiceLine("1"),
              snapshot: {
                serviceAuthorizationPolicy: policy,
                serviceWorkPolicy: "CHARGE_ONLY",
              },
            },
          ],
          scope,
        ),
      ).toBe(true)
    }
  })

  test("charge-only Service rejects tampered source scope, unknown policy, and legacy invented evidence", () => {
    const cases = [
      chargeOnlyServiceLine(
        "1",
        serviceFulfillment({ orderId: "order-other" }),
      ),
      chargeOnlyServiceLine(
        "1",
        serviceFulfillment({ tenantId: "tenant-other" }),
      ),
      {
        ...chargeOnlyServiceLine("1"),
        snapshot: { serviceWorkPolicy: "UNKNOWN" },
      },
      {
        ...serviceLine("1", [serviceAllocation()]),
        serviceFulfillment: serviceFulfillment(),
        snapshot: { serviceWorkPolicy: "TRACKED" },
      },
      {
        ...serviceLine("1", [serviceAllocation()]),
        serviceFulfillment: serviceFulfillment(),
        snapshot: { serviceWorkPolicy: null },
      },
      {
        ...serviceLine("1", [serviceAllocation()]),
        serviceFulfillment: serviceFulfillment(),
        snapshot: null,
      },
      {
        ...serviceLine("1", [serviceAllocation()]),
        serviceFulfillment: serviceFulfillment(),
      },
    ]
    for (const line of cases) {
      expect(areCommercialOrderLinesComplete([line], scope)).toBe(false)
    }
  })

  test("uses performedAt for charge-only earned completion chronology", () => {
    expect(
      areCommercialOrderLinesComplete(
        [
          chargeOnlyServiceLine(
            "1",
            serviceFulfillment({
              performedAt: new Date(completedAt.getTime() - 1),
            }),
          ),
        ],
        scope,
        completedAt,
      ),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [
          chargeOnlyServiceLine(
            "1",
            serviceFulfillment({
              performedAt: new Date(completedAt.getTime() + 1),
            }),
          ),
        ],
        scope,
        completedAt,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [
          chargeOnlyServiceLine(
            "9007199254740993.000001",
            serviceFulfillment({
              quantity: "9007199254740993.000001",
            }),
          ),
        ],
        scope,
      ),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [
          chargeOnlyServiceLine(
            "9007199254740993.000001",
            serviceFulfillment({
              quantity: "9007199254740993.000002",
            }),
          ),
        ],
        scope,
      ),
    ).toBe(false)
  })

  test("mixed Product, tracked Service, and charge-only Service finish in either order", () => {
    const product = productLine("1", ["1"], completedAt)
    const tracked = {
      ...serviceLine("1", [serviceAllocation({ completedAt })]),
      snapshot: { serviceWorkPolicy: "TRACKED" },
    }
    const chargeOnly = chargeOnlyServiceLine(
      "1",
      serviceFulfillment({ performedAt: completedAt }),
    )

    expect(
      areCommercialOrderLinesComplete(
        [product, tracked, chargeOnly],
        scope,
        completedAt,
      ),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [product, tracked, chargeOnlyServiceLine("1", null)],
        scope,
        completedAt,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [
          product,
          { ...serviceLine("1"), snapshot: { serviceWorkPolicy: "TRACKED" } },
          chargeOnly,
        ],
        scope,
        completedAt,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [productLine("1"), tracked, chargeOnly],
        scope,
        completedAt,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [chargeOnly, tracked, product],
        scope,
        completedAt,
      ),
    ).toBe(true)
  })

  test("cancelled quantities cannot satisfy all or part of the original obligation", () => {
    expect(
      areCommercialOrderLinesComplete(
        [
          serviceLine("2", [
            serviceAllocation({ allocatedQuantity: "2", status: "CANCELLED" }),
          ]),
        ],
        scope,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [
          serviceLine("2", [
            serviceAllocation({ allocatedQuantity: "1" }),
            serviceAllocation({ allocatedQuantity: "1", status: "CANCELLED" }),
          ]),
        ],
        scope,
      ),
    ).toBe(false)
  })

  test("cancelled allocations cannot hide overallocated roots, and rework alone is not allocation", () => {
    expect(
      areCommercialOrderLinesComplete(
        [
          serviceLine("1", [
            serviceAllocation({ allocatedQuantity: "1" }),
            serviceAllocation({
              allocatedQuantity: "1",
              status: "CANCELLED",
            }),
          ]),
        ],
        scope,
      ),
    ).toBe(false)
    expect(
      areCommercialOrderLinesComplete(
        [
          serviceLine("1", [
            serviceAllocation({ reworkOfLineId: "original-job-line" }),
          ]),
        ],
        scope,
      ),
    ).toBe(false)
  })

  test("rejects missing, unlinked, or unauthorized completed Service sources", () => {
    const cases = [
      serviceLine("1"),
      serviceLine("1", [
        serviceAllocation({
          serviceJob: { ...scope, commercialOrderId: "order-other" },
        }),
      ]),
      serviceLine("1", [
        serviceAllocation({
          serviceJob: {
            commercialOrderId: scope.orderId,
            ...scope,
            storeId: "store-other",
          },
        }),
      ]),
      serviceLine("1", [
        serviceAllocation({
          serviceJob: {
            commercialOrderId: scope.orderId,
            ...scope,
            tenantId: "tenant-other",
          },
        }),
      ]),
      serviceLine("1", [
        serviceAllocation({ authorizationStatus: "PENDING_PAYMENT" }),
      ]),
      serviceLine("1", [serviceAllocation({ completedAt: null })]),
    ]
    for (const line of cases) {
      expect(areCommercialOrderLinesComplete([line], scope)).toBe(false)
    }
  })

  test("mixed Product and Service orders complete regardless of which source finishes first", () => {
    const productFirst = [productLine("1"), serviceLine("1")]
    productFirst[0] = productLine("1", ["1"])
    expect(areCommercialOrderLinesComplete(productFirst, scope)).toBe(false)
    productFirst[1] = serviceLine("1", [serviceAllocation()])
    expect(areCommercialOrderLinesComplete(productFirst, scope)).toBe(true)

    const serviceFirst = [productLine("1"), serviceLine("1")]
    serviceFirst[1] = serviceLine("1", [serviceAllocation()])
    expect(areCommercialOrderLinesComplete(serviceFirst, scope)).toBe(false)
    serviceFirst[0] = productLine("1", ["1"])
    expect(areCommercialOrderLinesComplete(serviceFirst, scope)).toBe(true)
  })

  test("excludes rework when the original Service allocation remains fulfilled", () => {
    expect(
      areCommercialOrderLinesComplete(
        [
          serviceLine("1", [
            serviceAllocation(),
            serviceAllocation({
              allocatedQuantity: "1",
              reworkOfLineId: "original-job-line",
            }),
          ]),
        ],
        scope,
      ),
    ).toBe(true)
  })

  test("does not complete empty Orders or lines without fulfillment allocations", () => {
    expect(areCommercialOrderLinesComplete([], scope)).toBe(false)
    expect(areCommercialOrderLinesComplete([productLine("1")], scope)).toBe(
      false,
    )
    expect(areCommercialOrderLinesComplete([serviceLine("1")], scope)).toBe(
      false,
    )
  })

  test("compares quantities beyond JavaScript integer precision exactly", () => {
    expect(
      areCommercialOrderLinesComplete(
        [
          productLine("9007199254740993.000001", [
            "9007199254740993",
            "0.000001",
          ]),
        ],
        scope,
      ),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [
          productLine("9007199254740993.000001", [
            "9007199254740993",
            "0.000002",
          ]),
        ],
        scope,
      ),
    ).toBe(false)
  })

  test("rereads only scoped order lines and their fulfillment sources", async () => {
    const calls: unknown[] = []
    const line = productLine("2", ["2"])
    const tx = {
      commercialOrderLine: {
        findMany: async (input: unknown) => {
          calls.push(input)
          return [line]
        },
      },
    } as unknown as Prisma.TransactionClient

    await expect(readCommercialOrderLinesComplete(tx, scope)).resolves.toBe(
      true,
    )
    expect(calls).toEqual([
      {
        where: {
          order: { storeId: scope.storeId, tenantId: scope.tenantId },
          orderId: scope.orderId,
        },
        select: {
          id: true,
          kind: true,
          productFulfillments: { select: { createdAt: true, quantity: true } },
          quantity: true,
          snapshot: {
            select: {
              serviceAuthorizationPolicy: true,
              serviceWorkPolicy: true,
            },
          },
          serviceAuthorization: {
            select: {
              authorizedAt: true,
              orderId: true,
              orderLineId: true,
              quantity: true,
              tenantId: true,
            },
          },
          serviceFulfillment: {
            select: {
              orderId: true,
              performedAt: true,
              quantity: true,
              tenantId: true,
            },
          },
          serviceJobLines: {
            select: {
              allocatedQuantity: true,
              authorizationStatus: true,
              completedAt: true,
              reworkOfLineId: true,
              serviceJob: {
                select: {
                  commercialOrderId: true,
                  storeId: true,
                  tenantId: true,
                },
              },
              status: true,
            },
          },
        },
      },
    ])
  })

  test("generic completed Orders still require every generic line to be complete", async () => {
    const complete = earnedCompletionTransaction(completedOrder(), [
      productLine("2", ["2"], new Date("2026-10-01T11:00:00.000Z")),
    ])
    await expect(
      readCommercialOrderEarnedCompletion(complete.tx, scope),
    ).resolves.toBe(true)

    const partial = earnedCompletionTransaction(completedOrder(), [
      productLine("2", ["1"], new Date("2026-10-01T11:00:00.000Z")),
    ])
    await expect(
      readCommercialOrderEarnedCompletion(partial.tx, scope),
    ).resolves.toBe(false)
  })

  test("rejects missing or status-only completed Orders before reading lines", async () => {
    const cases = [
      earnedCompletionTransaction(null, [productLine("1", ["1"])]),
      earnedCompletionTransaction(completedOrder({ completedAt: null }), [
        productLine("1", ["1"]),
      ]),
      earnedCompletionTransaction(completedOrder({ status: "CONFIRMED" }), [
        productLine("1", ["1"]),
      ]),
    ]

    for (const fixture of cases) {
      await expect(
        readCommercialOrderEarnedCompletion(fixture.tx, scope),
      ).resolves.toBe(false)
      expect(fixture.lineQueries).toHaveLength(0)
    }
  })

  test("accepts Prescription pickup only with a matching accepted Quote and handoff proof", async () => {
    const valid = earnedCompletionTransaction(
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
    )
    await expect(
      readCommercialOrderEarnedCompletion(valid.tx, scope),
    ).resolves.toBe(true)

    const invalidOrders = [
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          acceptedOrderId: "order-other",
        }),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          status: "ISSUED",
        }),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          currencyCode: "USD",
        }),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          totalMinor: 25_001,
        }),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          quote: {
            sourceType: "PRESCRIPTION_REQUEST",
            storeId: "store-other",
            tenantId: scope.tenantId,
          },
        }),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          quote: {
            sourceType: "PRESCRIPTION_REQUEST",
            storeId: scope.storeId,
            tenantId: "tenant-other",
          },
        }),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup({ status: "READY" }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup({ packedAt: null }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup({
          packedAt: new Date(fulfillmentAt.getTime() + 1),
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup({
          handedOffAt: null,
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup({
          handedOffAt: new Date(completedAt.getTime() + 1),
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup({
          orderId: "order-other",
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup({
          storeId: "store-other",
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup({
          tenantId: "tenant-other",
        }),
      }),
    ]
    for (const order of invalidOrders) {
      const fixture = earnedCompletionTransaction(order)
      await expect(
        readCommercialOrderEarnedCompletion(fixture.tx, scope),
      ).resolves.toBe(false)
      expect(fixture.lineQueries).toHaveLength(0)
    }
  })

  test("accepts Prescription delivery only with packed address, completion time and proof", async () => {
    const valid = earnedCompletionTransaction(
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery(),
      }),
    )
    await expect(
      readCommercialOrderEarnedCompletion(valid.tx, scope),
    ).resolves.toBe(true)

    const invalidOrders = [
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          status: "FAILED",
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          address: { packedAt: null },
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          address: { packedAt: new Date(fulfillmentAt.getTime() + 1) },
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          deliveredAt: null,
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          proofReference: "   ",
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          deliveredAt: new Date(completedAt.getTime() + 1),
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          orderId: "order-other",
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          storeId: "store-other",
        }),
      }),
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          fulfilmentType: "DELIVERY",
        }),
        prescriptionDeliveryAssignment: prescriptionDelivery({
          tenantId: "tenant-other",
        }),
      }),
    ]
    for (const order of invalidOrders) {
      const fixture = earnedCompletionTransaction(order)
      await expect(
        readCommercialOrderEarnedCompletion(fixture.tx, scope),
      ).resolves.toBe(false)
      expect(fixture.lineQueries).toHaveLength(0)
    }
  })

  test("does not let complete Product lines bypass a missing Prescription Quote", async () => {
    const fullLines = [productLine("1", ["1"], fulfillmentAt)]
    const fixture = earnedCompletionTransaction(
      completedOrder({ prescriptionPickupFulfillment: prescriptionPickup() }),
      fullLines,
    )

    await expect(
      readCommercialOrderEarnedCompletion(fixture.tx, scope),
    ).resolves.toBe(false)
    expect(fixture.lineQueries).toHaveLength(0)
  })

  test("does not let complete Product lines bypass a mismatched Prescription source type", async () => {
    const fixture = earnedCompletionTransaction(
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion({
          quote: {
            sourceType: "SERVICE_REQUEST",
            storeId: scope.storeId,
            tenantId: scope.tenantId,
          },
        }),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
      [productLine("1", ["1"], fulfillmentAt)],
    )

    await expect(
      readCommercialOrderEarnedCompletion(fixture.tx, scope),
    ).resolves.toBe(false)
    expect(fixture.lineQueries).toHaveLength(0)
  })

  test("scopes the earned Order reread and selects the Quote and fulfilment evidence", async () => {
    const fixture = earnedCompletionTransaction(
      completedOrder({
        acceptedCommerceQuoteVersion: acceptedPrescriptionVersion(),
        prescriptionPickupFulfillment: prescriptionPickup(),
      }),
    )
    await expect(
      readCommercialOrderEarnedCompletion(fixture.tx, scope),
    ).resolves.toBe(true)
    expect(fixture.orderQueries).toEqual([
      {
        where: {
          id: scope.orderId,
          storeId: scope.storeId,
          tenantId: scope.tenantId,
        },
        select: {
          completedAt: true,
          currencyCode: true,
          status: true,
          totalMinor: true,
          acceptedCommerceQuoteVersion: {
            select: {
              acceptedOrderId: true,
              currencyCode: true,
              fulfilmentType: true,
              status: true,
              totalMinor: true,
              quote: {
                select: {
                  sourceType: true,
                  storeId: true,
                  tenantId: true,
                },
              },
            },
          },
          prescriptionPickupFulfillment: {
            select: {
              handedOffAt: true,
              orderId: true,
              packedAt: true,
              status: true,
              storeId: true,
              tenantId: true,
            },
          },
          prescriptionDeliveryAssignment: {
            select: {
              deliveredAt: true,
              orderId: true,
              proofReference: true,
              status: true,
              storeId: true,
              tenantId: true,
              address: { select: { packedAt: true } },
            },
          },
        },
      },
    ])
  })
})
