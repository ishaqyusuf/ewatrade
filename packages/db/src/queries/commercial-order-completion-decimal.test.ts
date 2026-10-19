import { describe, expect, test } from "bun:test"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { Prisma } from "../../generated/prisma/browser"
import {
  type CommercialCompletionLine,
  areCommercialOrderLinesComplete,
} from "./commercial-order-completion"

const scope = { orderId: "order", storeId: "store", tenantId: "tenant" }
const completedAt = new Date("2026-10-15T10:00:00Z")
const decimal = (value: string) => new Prisma.Decimal(value)
function product(
  ordered: string,
  fulfilled: string[],
): CommercialCompletionLine {
  return {
    kind: "PRODUCT_UNIT",
    quantity: decimal(ordered),
    productFulfillments: fulfilled.map((value) => ({
      quantity: decimal(value),
      createdAt: completedAt,
    })),
    serviceJobLines: [],
  }
}
function service(
  ordered: string,
  allocated: string[],
): CommercialCompletionLine {
  return {
    kind: "SERVICE",
    quantity: decimal(ordered),
    productFulfillments: [],
    serviceJobLines: allocated.map((value) => ({
      allocatedQuantity: decimal(value),
      authorizationStatus: "AUTHORIZED",
      completedAt,
      reworkOfLineId: null,
      status: "COMPLETED",
      serviceJob: {
        commercialOrderId: scope.orderId,
        storeId: scope.storeId,
        tenantId: scope.tenantId,
      },
    })),
  }
}

describe("native stored completion quantities", () => {
  test("actual Prisma scientific formatting retains exact product totals", () => {
    expect(decimal("1000000000000000000000").toString()).toBe("1e+21")
    expect(
      areCommercialOrderLinesComplete(
        [
          product("1000000000000000000000", [
            "400000000000000000000",
            "600000000000000000000",
          ]),
        ],
        scope,
        completedAt,
      ),
    ).toBe(true)
    expect(
      areCommercialOrderLinesComplete(
        [product("1000000000000000000000", ["999999999999999999999.999999"])],
        scope,
        completedAt,
      ),
    ).toBe(false)
  })

  test("all Decimal(38,6) digits survive product and tracked service comparisons", () => {
    const maximum = "99999999999999999999999999999999.999999"
    const short = "99999999999999999999999999999999.999998"
    for (const makeLine of [product, service]) {
      expect(
        areCommercialOrderLinesComplete([makeLine(maximum, [maximum])], scope),
      ).toBe(true)
      expect(
        areCommercialOrderLinesComplete([makeLine(maximum, [short])], scope),
      ).toBe(false)
    }
    expect(
      areCommercialOrderLinesComplete(
        [product("0.000001", ["0.000001"])],
        scope,
      ),
    ).toBe(true)
  })

  test("charge-only manual authorization and performance compare the same exact large value", () => {
    const quantity = decimal("99999999999999999999999999999999.999999")
    const line: CommercialCompletionLine = {
      id: "line",
      kind: "SERVICE",
      quantity,
      productFulfillments: [],
      serviceJobLines: [],
      snapshot: {
        serviceAuthorizationPolicy: "MANUAL_RELEASE",
        serviceWorkPolicy: "CHARGE_ONLY",
      },
      serviceAuthorization: {
        authorizedAt: completedAt,
        orderId: scope.orderId,
        orderLineId: "line",
        quantity,
        tenantId: scope.tenantId,
      },
      serviceFulfillment: {
        performedAt: completedAt,
        orderId: scope.orderId,
        quantity,
        tenantId: scope.tenantId,
      },
    }
    expect(areCommercialOrderLinesComplete([line], scope, completedAt)).toBe(
      true,
    )
    if (!line.serviceAuthorization) throw Error("Missing test authorization")
    line.serviceAuthorization.quantity = decimal(
      "99999999999999999999999999999999.999998",
    )
    expect(areCommercialOrderLinesComplete([line], scope, completedAt)).toBe(
      false,
    )
  })

  test("large allocations retain cancellation, rework, authority and timestamp rules", () => {
    const line = service("1000000000000000000000", ["1000000000000000000000"])
    const allocation = line.serviceJobLines[0]
    if (!allocation) throw Error("Missing test allocation")
    allocation.status = "CANCELLED"
    expect(areCommercialOrderLinesComplete([line], scope)).toBe(false)
    allocation.status = "COMPLETED"
    allocation.authorizationStatus = "UNAUTHORIZED"
    expect(areCommercialOrderLinesComplete([line], scope)).toBe(false)
    allocation.authorizationStatus = "AUTHORIZED"
    allocation.serviceJob.tenantId = "other"
    expect(areCommercialOrderLinesComplete([line], scope)).toBe(false)
    allocation.serviceJob.tenantId = scope.tenantId
    expect(
      areCommercialOrderLinesComplete(
        [line],
        scope,
        new Date(completedAt.getTime() - 1),
      ),
    ).toBe(false)
    allocation.reworkOfLineId = "original"
    expect(areCommercialOrderLinesComplete([line], scope)).toBe(false)
  })

  test("unsupported stored numbers refuse before expansion and never round or alter global Decimal configuration", () => {
    const precision = Prisma.Decimal.precision
    const toExpPos = Prisma.Decimal.toExpPos
    for (const value of [
      "NaN",
      "Infinity",
      "-Infinity",
      "1e+1000000000",
      "1e-1000000000",
      "1e32",
      "0.0000001",
      "1.0000001",
      "0",
      "-1",
    ]) {
      expect(() =>
        areCommercialOrderLinesComplete([product(value, [value])], scope),
      ).toThrow()
    }
    expect(Prisma.Decimal.precision).toBe(precision)
    expect(Prisma.Decimal.toExpPos).toBe(toExpPos)
  })

  test("plain user quantity grammar remains unchanged", () => {
    expect(() => parseExactDecimal("1e+21", { maxScale: 6 })).toThrow(
      "plain decimal",
    )
    const line = product("1", ["1"])
    line.quantity = "1e+21"
    expect(() => areCommercialOrderLinesComplete([line], scope)).toThrow(
      "plain decimal",
    )
  })
})
