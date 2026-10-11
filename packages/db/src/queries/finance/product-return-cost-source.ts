import { addExactDecimals, compareExactDecimals, multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma, FinanceBook } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import type { ProductReturnValuationEvidence } from "./product-return-evidence"
import { FinanceError, assertFinancePostingDate } from "./rules"
import { planProductReturnCost, type CostState } from "./product-return-cost-plan"
import { normalizeQuantity, subtractQuantities, calculateWeightedAverageIssue } from "./valuation-math"

const MAX_DATABASE_MINOR = BigInt("9223372036854775807")
const ZERO = BigInt(0)

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

function canonicalQuantity(
  quantity: Prisma.Decimal,
  kind: "SHARED_POOL" | "PACKAGED_STOCK",
  factor: Prisma.Decimal,
) {
  return normalizeQuantity(
    kind === "PACKAGED_STOCK"
      ? multiplyExactDecimals(quantity.toFixed(), factor.toFixed(), 18)
      : quantity.toFixed(),
  )
}

function signedQuantity(value: Prisma.Decimal) {
  const text = value.toFixed()
  return text.startsWith("-")
    ? `-${normalizeQuantity(text.slice(1))}`
    : normalizeQuantity(text)
}

/** Read-only source validation shared by preview and canonical new-return execution. */
export function reviewOriginalProductReturnCost(input: {
  tenantId: string
  book: FinanceBook
  order: ProductReturnValuationEvidence["order"]
  line: ProductReturnValuationEvidence["orderLine"]
  productReturn: Pick<ProductReturnValuationEvidence, "id" | "quantity" | "orderId" | "orderLineId" | "storeId">
  physicalReturnAt: Date
}) {
  const { book, order, line, productReturn, physicalReturnAt } = input
  const { snapshot } = line
  if (
    book.tenantId !== input.tenantId ||
    book.currencyCode !== order.currencyCode ||
    order.tenantId !== input.tenantId ||
    order.store.tenantId !== input.tenantId ||
    order.store.currencyCode !== order.currencyCode ||
    productReturn.orderId !== order.id ||
    productReturn.orderLineId !== line.id ||
    line.orderId !== order.id ||
    productReturn.storeId !== order.storeId ||
    line.kind !== "PRODUCT_UNIT" ||
    !snapshot ||
    snapshot.currencyCode !== order.currencyCode ||
    snapshot.offeringId !== line.offeringId ||
    snapshot.offeringKind !== "PRODUCT_UNIT" ||
    !snapshot.balanceSourceId ||
    !snapshot.inventoryUnitId ||
    !snapshot.configurationVersionId ||
    !snapshot.unitFactor ||
    compareExactDecimals(snapshot.unitFactor.toFixed(), "0") <= 0 ||
    !["CANONICAL_SHARED", "ALTERNATE_TRANSACTION", "PACKAGED_STOCK"].includes(
      snapshot.stockBehavior ?? "",
    )
  ) {
    conflict("Product return Order, Store or sold-unit scope changed.")
  }

  const canonicalReturned = normalizeQuantity(
    multiplyExactDecimals(
      productReturn.quantity.toFixed(),
      snapshot.unitFactor.toFixed(),
      18,
    ),
  )
  if (canonicalReturned === "0") {
    conflict("Product return quantity must be positive.")
  }

  const fulfillments = line.productFulfillments
  if (fulfillments.length === 0) {
    conflict("Product return has no fulfilled Product source.")
  }
  assertFinancePostingDate({
    effectiveAt: physicalReturnAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })

  const issueByFulfillment = new Map<
    string,
    {
      issue: (typeof fulfillments)[number]["stockOperation"]["movements"][number]["valuationEvent"]
      quantity: string
      sourceCost: bigint | null
      unknownReason: FinanceInventoryUnknownReason | null
    }
  >()
  for (const fulfillment of fulfillments) {
    const reservation = fulfillment.reservation
    const operation = fulfillment.stockOperation
    const movements = operation.movements
    const movement = movements[0]
    if (
      movements.length !== 1 ||
      !movement ||
      operation.id !== fulfillment.stockOperationId ||
      operation.tenantId !== input.tenantId ||
      operation.storeId !== order.storeId ||
      operation.type !== "SALE_FULFILLMENT" ||
      operation.source !== "commercial_order" ||
      fulfillment.orderLineId !== line.id ||
      reservation.id !== fulfillment.reservationId ||
      reservation.tenantId !== input.tenantId ||
      reservation.storeId !== order.storeId ||
      reservation.commercialOrderLineId !== line.id ||
      reservation.status !== "COMMITTED" ||
      reservation.offeringId !== line.offeringId ||
      reservation.balanceSourceId !== snapshot.balanceSourceId ||
      reservation.configurationVersionId !== snapshot.configurationVersionId ||
      reservation.enteredInventoryUnitId !== snapshot.inventoryUnitId ||
      reservation.unitFactorSnapshot.toFixed() !==
        snapshot.unitFactor.toFixed() ||
      movement.balanceSourceId !== reservation.balanceSourceId ||
      movement.configurationVersionId !== reservation.configurationVersionId ||
      movement.enteredInventoryUnitId !== reservation.enteredInventoryUnitId ||
      movement.reversalOfMovementId !== null ||
      movement.unitFactorSnapshot.toFixed() !==
        reservation.unitFactorSnapshot.toFixed() ||
      normalizeQuantity(movement.enteredQuantity.toFixed()) !==
        normalizeQuantity(fulfillment.quantity.toFixed()) ||
      movement.balanceSource.tenantId !== input.tenantId ||
      movement.balanceSource.storeId !== order.storeId ||
      movement.balanceSource.variantId !== snapshot.variantId ||
      movement.balanceSource.store.tenantId !== input.tenantId ||
      movement.balanceSource.store.currencyCode !== order.currencyCode ||
      operation.effectiveAt > physicalReturnAt ||
      (snapshot.stockBehavior === "PACKAGED_STOCK"
        ? movement.balanceSource.kind !== "PACKAGED_STOCK" ||
          movement.balanceSource.inventoryUnitId !== snapshot.inventoryUnitId
        : movement.balanceSource.kind !== "SHARED_POOL")
    ) {
      conflict(
        "Product fulfillment provenance does not match its sold snapshot.",
      )
    }
    const issued = normalizeQuantity(reservation.canonicalQuantity.toFixed())
    const fulfilled = normalizeQuantity(fulfillment.quantity.toFixed())
    if (
      issued === "0" ||
      normalizeQuantity(reservation.enteredQuantity.toFixed()) !== fulfilled ||
      normalizeQuantity(
        multiplyExactDecimals(
          reservation.enteredQuantity.toFixed(),
          reservation.unitFactorSnapshot.toFixed(),
          18,
        ),
      ) !== issued
    ) {
      conflict("Product fulfillment quantity snapshot is inconsistent.")
    }
    const before = canonicalQuantity(
      movement.previousOnHandQuantity,
      movement.balanceSource.kind,
      movement.unitFactorSnapshot,
    )
    const after = canonicalQuantity(
      movement.resultingOnHandQuantity,
      movement.balanceSource.kind,
      movement.unitFactorSnapshot,
    )
    const effect = signedQuantity(movement.signedCanonicalEffect)
    if (
      effect !== `-${issued}` ||
      subtractQuantities(before, issued) !== after
    ) {
      conflict("Product fulfillment issue quantity or valuation is missing.")
    }
    const issue = movement.valuationEvent
    if (
      issue &&
      (issue.tenantId !== input.tenantId ||
        issue.bookId !== book.id ||
        issue.balanceSourceId !== movement.balanceSourceId ||
        issue.kind !== "ISSUE" ||
        issue.sourceKind !== "PRODUCT_FULFILLMENT" ||
        issue.sourceId !== fulfillment.id ||
        issue.stockOperationId !== operation.id ||
        issue.stockMovementId !== movement.id ||
        issue.effectiveAt.getTime() !== operation.effectiveAt.getTime() ||
        issue.actorUserId !== operation.actorUserId ||
        signedQuantity(issue.canonicalEffect) !== effect ||
        normalizeQuantity(issue.quantityBefore.toFixed()) !== before ||
        normalizeQuantity(issue.quantityAfter.toFixed()) !== after)
    ) {
      conflict("Original Product issue valuation does not match fulfillment.")
    }
    let sourceCost: bigint | null = null
    const unknownReason: FinanceInventoryUnknownReason | null =
      issue?.unknownReason ?? "MISSING_ISSUE_COST"
    if (issue) {
      const allNull =
        issue.valueBeforeMinor === null &&
        issue.valueDeltaMinor === null &&
        issue.valueAfterMinor === null &&
        issue.sourceCostMinor === null
      if (!allNull) {
        if (
          issue.valueBeforeMinor === null ||
          issue.valueDeltaMinor === null ||
          issue.valueAfterMinor === null ||
          issue.sourceCostMinor === null ||
          issue.unknownReason !== null ||
          issue.valueBeforeMinor < ZERO ||
          issue.valueAfterMinor < ZERO ||
          issue.valueDeltaMinor > ZERO ||
          issue.sourceCostMinor !== -issue.valueDeltaMinor ||
          issue.valueBeforeMinor + issue.valueDeltaMinor !==
            issue.valueAfterMinor ||
          issue.sourceCostMinor > MAX_DATABASE_MINOR
        ) {
          conflict("Original Product issue cost conservation is inconsistent.")
        }
        sourceCost = issue.sourceCostMinor
      } else if (issue.unknownReason === null) {
        conflict("An unknown Product issue must retain its reason.")
      }
    }

    issueByFulfillment.set(fulfillment.id, {
      issue,
      quantity: issued,
      sourceCost,
      unknownReason: sourceCost === null ? unknownReason : null,
    })
  }

  const priorReturns = line.productReturns.filter(
    (candidate) => candidate.id !== productReturn.id,
  )
  let previouslyReturned = "0"
  for (const previous of priorReturns) {
    previouslyReturned = addExactDecimals(
      previouslyReturned,
      previous.quantity.toFixed(),
    )
  }
  for (const previous of priorReturns) {
    if (!previous.financeCost) continue
    if (
      previous.financeCost.tenantId !== input.tenantId ||
      previous.financeCost.bookId !== book.id ||
      previous.financeCost.orderLineId !== line.id ||
      previous.financeCost.productReturnId !== previous.id ||
      previous.financeCost.productReturn.tenantId !== input.tenantId ||
      previous.financeCost.productReturn.orderLineId !== line.id
    ) {
      conflict(
        "Saved Product return cost scope differs from its physical return.",
      )
    }
    const expectedQuantity = normalizeQuantity(
      multiplyExactDecimals(
        previous.quantity.toFixed(),
        snapshot.unitFactor.toFixed(),
        18,
      ),
    )
    if (
      normalizeQuantity(
        previous.financeCost?.canonicalQuantity.toFixed() ?? "0",
      ) !== expectedQuantity
    ) {
      conflict(
        "Saved Product return cost quantity differs from its physical return.",
      )
    }
    let sum = ZERO
    let allKnown = true
    for (const allocation of previous.financeCost.allocations) {
      if (allocation.sourceCostMinor === null) allKnown = false
      else sum += allocation.sourceCostMinor
    }
    const uncaptured =
      previous.financeCost.unknownReason === "UNCAPTURED_RETURNS" &&
      previous.financeCost.allocations.length === 0
    if (
      previous.financeCost.unknownReason === "UNCAPTURED_RETURNS" &&
      !uncaptured
    ) {
      conflict("Untracked Product return cost cannot contain allocations.")
    }
    if (
      (!uncaptured &&
        allKnown &&
        previous.financeCost.sourceCostMinor !== sum) ||
      (!uncaptured &&
        !allKnown &&
        previous.financeCost.sourceCostMinor !== null) ||
      (uncaptured && previous.financeCost.sourceCostMinor !== null)
    ) {
      conflict(
        "Saved Product return cost does not reconcile to its allocations.",
      )
    }
  }
  const fulfilledQuantity = fulfillments.reduce(
    (total, fulfillment) =>
      addExactDecimals(total, fulfillment.quantity.toFixed()),
    "0",
  )
  if (
    compareExactDecimals(
      addExactDecimals(previouslyReturned, productReturn.quantity.toFixed()),
      fulfilledQuantity,
    ) > 0
  ) {
    conflict(
      "Product return quantity exceeds fulfilled quantity not already returned.",
    )
  }
  const hasUncapturedPriorReturn = priorReturns.some(
    (previous) =>
      !previous.financeCost ||
      previous.financeCost.unknownReason === "UNCAPTURED_RETURNS",
  )

  const priorAllocationByFulfillment = new Map<string, CostState>()
  const priorAllocationRecords = fulfillments
    .flatMap((fulfillment) =>
      fulfillment.returnCostAllocations
        .filter(
          (allocation) =>
            allocation.returnCost.productReturnId !== productReturn.id,
        )
        .map((allocation) => ({ allocation, fulfillmentId: fulfillment.id })),
    )
    .sort((left, right) => {
      const fulfillmentOrder = left.fulfillmentId.localeCompare(
        right.fulfillmentId,
      )
      if (fulfillmentOrder !== 0) return fulfillmentOrder
      return compareExactDecimals(
        right.allocation.remainingQuantityBefore.toFixed(),
        left.allocation.remainingQuantityBefore.toFixed(),
      )
    })
  for (const { allocation, fulfillmentId } of priorAllocationRecords) {
    const issueInfo = issueByFulfillment.get(fulfillmentId)
    if (!issueInfo)
      conflict("Saved return allocation has no original fulfillment.")
    const state = priorAllocationByFulfillment.get(fulfillmentId) ?? {
      quantity: issueInfo.quantity,
      cost: issueInfo.sourceCost,
      unknownReason: issueInfo.unknownReason,
    }
    const priorHeader = allocation.returnCost
    const allocationQuantity = normalizeQuantity(
      allocation.canonicalQuantity.toFixed(),
    )
    if (
      allocation.tenantId !== input.tenantId ||
      allocation.bookId !== book.id ||
      allocation.orderLineId !== line.id ||
      priorHeader.tenantId !== input.tenantId ||
      priorHeader.bookId !== book.id ||
      priorHeader.orderLineId !== line.id ||
      priorHeader.productReturnId !== priorHeader.productReturn.id ||
      priorHeader.productReturn.tenantId !== input.tenantId ||
      priorHeader.productReturn.orderLineId !== line.id ||
      allocation.fulfillmentId !== fulfillmentId ||
      allocation.originalIssueId !== (issueInfo.issue?.id ?? null) ||
      normalizeQuantity(allocation.remainingQuantityBefore.toFixed()) !==
        state.quantity ||
      allocationQuantity === "0" ||
      normalizeQuantity(priorHeader.canonicalQuantity.toFixed()) !==
        normalizeQuantity(
          multiplyExactDecimals(
            priorHeader.productReturn.quantity.toFixed(),
            snapshot.unitFactor.toFixed(),
            18,
          ),
        )
    ) {
      conflict(
        "Saved Product return allocation quantity history is inconsistent.",
      )
    }
    const quantityAfter = subtractQuantities(state.quantity, allocationQuantity)
    const knownAllocation =
      state.cost !== null && allocation.sourceCostMinor !== null
    let costAfter: bigint | null = null
    if (state.cost !== null) {
      if (
        !knownAllocation ||
        allocation.remainingCostBeforeMinor !== state.cost
      ) {
        conflict(
          "Saved Product return allocation cost history is inconsistent.",
        )
      }
      const expected = calculateWeightedAverageIssue({
        quantityBefore: state.quantity,
        valueBeforeMinor: state.cost,
        quantityIssued: normalizeQuantity(
          allocation.canonicalQuantity.toFixed(),
        ),
      })
      if (expected.valueIssuedMinor !== allocation.sourceCostMinor) {
        conflict(
          "Saved Product return allocation cost does not match its original issue.",
        )
      }
      costAfter = state.cost - allocation.sourceCostMinor
      if (
        costAfter < ZERO ||
        allocation.remainingCostAfterMinor !== costAfter
      ) {
        conflict(
          "Saved Product return allocation exceeds its original issue cost.",
        )
      }
    } else if (
      allocation.sourceCostMinor !== null ||
      allocation.remainingCostBeforeMinor !== null ||
      allocation.remainingCostAfterMinor !== null ||
      allocation.unknownReason !== (state.unknownReason ?? "PRIOR_UNKNOWN_COST")
    ) {
      conflict("Unknown original issue cost was replaced with a value.")
    }
    if (
      normalizeQuantity(allocation.remainingQuantityAfter.toFixed()) !==
      quantityAfter
    ) {
      conflict("Saved Product return allocation quantity residual differs.")
    }
    priorAllocationByFulfillment.set(fulfillmentId, {
      quantity: quantityAfter,
      cost: costAfter,
      unknownReason: state.cost === null ? state.unknownReason : null,
    })
  }

  const allocatedReturnQuantityByHeader = new Map<
    string,
    { quantity: string; cost: bigint; allKnown: boolean }
  >()
  for (const { allocation } of priorAllocationRecords) {
    const previous = allocatedReturnQuantityByHeader.get(
      allocation.returnCostId,
    ) ?? {
      quantity: "0",
      cost: ZERO,
      allKnown: true,
    }
    previous.quantity = addExactDecimals(
      previous.quantity,
      allocation.canonicalQuantity.toFixed(),
    )
    if (allocation.sourceCostMinor === null) previous.allKnown = false
    else previous.cost += allocation.sourceCostMinor
    allocatedReturnQuantityByHeader.set(allocation.returnCostId, previous)
  }
  for (const previous of priorReturns) {
    if (!previous.financeCost) continue
    const aggregate = allocatedReturnQuantityByHeader.get(
      previous.financeCost.id,
    ) ?? {
      quantity: "0",
      cost: ZERO,
      allKnown: true,
    }
    if (
      previous.financeCost.unknownReason === "UNCAPTURED_RETURNS" &&
      previous.financeCost.allocations.length === 0
    ) {
      continue
    }
    if (
      normalizeQuantity(aggregate.quantity) !==
        normalizeQuantity(previous.financeCost.canonicalQuantity.toFixed()) ||
      (aggregate.allKnown &&
        previous.financeCost.sourceCostMinor !== aggregate.cost) ||
      (!aggregate.allKnown && previous.financeCost.sourceCostMinor !== null)
    ) {
      conflict(
        "Saved Product return allocations do not cover their header quantity.",
      )
    }
  }

  if (compareExactDecimals(previouslyReturned, line.quantity.toFixed()) > 0) {
    conflict("Saved Product return quantities exceed the Order line quantity.")
  }
  const costPlan = planProductReturnCost({
    tenantId: input.tenantId, bookId: book.id, orderLineId: line.id,
    canonicalReturned, hasUncapturedPriorReturn,
    fulfillmentIds: fulfillments.map(value => value.id),
    issues: new Map([...issueByFulfillment].map(([id, info]) => [id, {
      quantity: info.quantity, sourceCost: info.sourceCost,
      unknownReason: info.unknownReason, originalIssueId: info.issue?.id ?? null,
    }])),
    priorAllocations: priorAllocationByFulfillment,
  })

  return { canonicalReturned, ...costPlan }
}
