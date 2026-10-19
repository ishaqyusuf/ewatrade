import { expect, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalAnswerSchema,
} from "@ewatrade/assistant/general/contracts"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  inventoryCloseoutReadAnswers,
  inventoryCloseoutsReadAnswers,
  stockCountReadAnswers,
  stockOperationReadAnswers,
  stockOperationsReadAnswers,
  stockTransferReadAnswers,
  stockTransfersReadAnswers,
} from "./inventory-operation-answers"

const asOf = "2026-10-15T12:00:00.000Z"
const at = new Date(asOf)
const long = "👨‍👩‍👧‍👦".repeat(100)
const exact = "9007199254740993.000001"
function rendered(answers: GeneralAnswer[]) {
  for (const answer of answers)
    expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
  const output = renderWhatsAppFinalReply(
    answers.map((data) => ({ type: "data-general-answer", data })),
  )
  expect(output.kind).toBe("reply")
  return output.chunks.join("\n")
}

const count: Parameters<typeof stockCountReadAnswers>[0] = {
  id: "count",
  storeId: "store",
  status: "DRAFT",
  reason: long,
  createdAt: asOf,
  finalizedAt: null,
  finalizedOperationId: null,
  canFinalize: false,
  lines: [
    {
      id: "line",
      balanceSourceId: "source",
      catalogItemId: "item",
      productName: long,
      variantName: long,
      unitName: "piece",
      custodyType: "STAFF",
      custodyReferenceId: "staff",
      configurationVersionId: "version",
      configurationCurrent: false,
      expectedRevision: 1,
      currentRevision: 2,
      stockCurrent: false,
      expectedQuantity: exact,
      observedQuantity: "0",
      varianceQuantity: `-${exact}`,
      currentQuantity: "7.25",
      reservedQuantity: "1.5",
      availableAfter: parseExactDecimal("-1.5", { allowNegative: true }),
      entries: [
        {
          enteredInventoryUnitId: "unit",
          unitName: "box",
          enteredQuantity: "0",
          factor: "12.123456789012",
          canonicalQuantity: "0",
        },
      ],
    },
  ],
}
const operation: NonNullable<Parameters<typeof stockOperationReadAnswers>[0]> =
  {
    id: "operation",
    actorUserId: "user",
    categories: [],
    canonicalNetEffect: exact,
    clientOperationId: "operation-request",
    correctionIds: ["correction"],
    correctionOfOperationId: null,
    createdAt: at,
    effectiveAt: at,
    linkedOperation: null,
    linkedOperations: [],
    payloadHash: "hash",
    reason: long,
    source: "manual",
    storeId: "store",
    transformationConserved: null,
    type: "ADJUSTMENT",
    movements: [
      {
        id: "movement",
        balanceSourceId: "source",
        barcode: null,
        configurationVersionId: "version",
        currencyCodeSnapshot: "NGN",
        custodyReferenceId: null,
        custodyType: "STORE",
        enteredInventoryUnitId: "unit",
        enteredInventoryUnitName: "box",
        enteredQuantity: exact,
        previousOnHandQuantity: "1",
        productName: long,
        resultingOnHandQuantity: "2",
        reversalIds: ["reversal"],
        reversalOfMovementId: null,
        signedCanonicalEffect: "0.000000000000000001",
        storeName: "Store",
        totalCostMinorSnapshot: "900719925474099300",
        transactionScaleSnapshot: 6,
        unitCostMinorSnapshot: 25,
        unitFactorSnapshot: "12.123456789012",
        variantName: long,
      },
    ],
  }
const closeout: Parameters<typeof inventoryCloseoutReadAnswers>[0] = {
  id: "closeout",
  storeId: "store",
  custodyType: "STAFF",
  custodyReferenceId: "staff",
  status: "DRAFT",
  reason: long,
  createdAt: asOf,
  finalizedAt: null,
  finalizedOperationId: null,
  canFinalize: false,
  lines: [
    {
      id: "closeout-line",
      balanceSourceId: "source",
      catalogItemId: "item",
      productName: long,
      variantName: long,
      unitName: "piece",
      inventoryUnitId: "unit",
      configurationVersionId: "version",
      unitFactor: "1",
      transactionScale: 6,
      expectedRevision: 1,
      currentRevision: 2,
      expectedQuantity: "10",
      declaredQuantity: "8",
      varianceQuantity: "-2",
      currentQuantity: "11",
      reservedQuantity: "9",
      stockCurrent: false,
      preservesReservations: false,
    },
  ],
}
const transfer: Parameters<typeof stockTransferReadAnswers>[0] = {
  id: "transfer",
  createdAt: at,
  status: "IN_TRANSIT",
  catalogItemId: "item",
  productName: long,
  variantName: long,
  sourceStore: {
    id: "source-store",
    tenantId: "tenant",
    name: "Source",
    currencyCode: "NGN",
  },
  targetStore: {
    id: "target-store",
    tenantId: "tenant",
    name: "Destination",
    currencyCode: "NGN",
  },
  inventoryUnitId: "unit",
  unitName: "box",
  factor: "12",
  transactionScale: 6,
  configurationVersionId: "version",
  dispatchedQuantity: exact,
  source: { id: "source", revision: 1, quantity: "5", reserved: "1" },
  transit: { id: "transit", revision: 2, quantity: "4.25", reserved: "0" },
  destination: null,
  acknowledgmentHistoryLimited: true,
  acknowledgments: [
    {
      id: "ack",
      operationId: "receipt-operation",
      kind: "RECEIVE",
      actorUserId: "user",
      quantity: "0.25",
      remainingBefore: "4.5",
      remainingAfter: "4.25",
      reason: long,
      effectiveAt: asOf,
    },
  ],
}

test("physical count preserves original exact observation and variance separately from changed current stock", () => {
  const text = rendered(stockCountReadAnswers(count, "Store", asOf))
  expect(text).toContain(`Saved expected ${exact}; signed variance -${exact}`)
  expect(text).toContain("Current source stock 7.25; reserved 1.5")
  expect(text).toContain("0 piece observed")
  expect(text).toContain("configuration changed")
  expect(text).toContain("Saved conversion factor 12.123456789012")
  expect(text).toContain("Original entry, not newly received stock")
})

test("operation movement facts preserve conversion and historical effect, without presenting current totals or payment", () => {
  const text = rendered(stockOperationReadAnswers(operation, "Store", asOf))
  expect(text).toContain(`${exact} box entered`)
  expect(text).toContain("before 1, after 2")
  expect(text).toContain("Signed canonical effect 0.000000000000000001")
  expect(text).toContain(
    "Original total cost snapshot 900719925474099300 minor units (NGN)",
  )
  expect(text).toContain("linked reversals reversal")
  expect(text).toContain("separate correction requires current ownership")
  expect(rendered(stockOperationReadAnswers(null, "Store", asOf))).toContain(
    "Missing evidence is not a zero",
  )
})

test("recent stock operation arrays are bounded and do not sum incompatible canonical quantities", () => {
  const rows: Parameters<typeof stockOperationsReadAnswers>[0] = Array.from(
    { length: 7 },
    (_, index) => ({
      id: `operation-${index}`,
      actorUserId: "user",
      categories: [],
      canonicalNetEffect: exact,
      createdAt: at,
      effectiveAt: at,
      storeId: "store",
      storeName: "Store",
      movementCount: 2,
      reason: long,
      source: "manual",
      type: "ADJUSTMENT",
    }),
  )
  const answers = stockOperationsReadAnswers(rows, "Store", asOf)
  expect(answers).toHaveLength(6)
  const text = rendered(answers)
  expect(text).toContain("5 of 7 returned records")
  expect(text).toContain("no older-page cursor")
  expect(text).not.toContain(exact)
  expect(rendered(stockOperationsReadAnswers([], "Store", asOf))).toContain(
    "not complete history or a total",
  )
})

test("custody closeout declarations preserve original variance and reservation conflicts, never financial close", () => {
  const text = rendered(inventoryCloseoutReadAnswers(closeout, "Store", asOf))
  expect(text).toContain("Original expected 10; signed variance -2")
  expect(text).toContain("Current stock 11; reserved 9")
  expect(text).toContain("conflicts with current reservations")
  expect(text).toContain("not financial period close")
  const list = rendered(
    inventoryCloseoutsReadAnswers(
      [
        {
          id: closeout.id,
          status: closeout.status,
          custodyType: closeout.custodyType,
          custodyReferenceId: closeout.custodyReferenceId,
          reason: closeout.reason,
          createdAt: asOf,
          finalizedAt: null,
          lineCount: 50,
        },
      ],
      "Store",
      asOf,
    ),
  )
  expect(list).toContain("50 original declarations")
  expect(list).toContain("no older-page cursor")
})

test("transfer original dispatch, current transit and retained acknowledgments stay distinct; missing sources are not zero", () => {
  const text = rendered(stockTransferReadAnswers(transfer, "Store", asOf))
  expect(text).toContain(`Original dispatch ${exact} box`)
  expect(text).toContain("4.25 in transit")
  expect(text).toContain("missing is not zero")
  expect(text).toContain("Original transit before 4.5, after 4.25")
  expect(text).toContain("canonical history is limited")
  const originalAcknowledgment = transfer.acknowledgments[0]
  if (!originalAcknowledgment) throw Error("Expected original acknowledgment")
  const missing = rendered(
    stockTransferReadAnswers(
      {
        ...transfer,
        transit: null,
        status: "CANCELLED",
        acknowledgments: [{ ...originalAcknowledgment, kind: "CANCEL" }],
      },
      "Store",
      asOf,
    ),
  )
  expect(missing).toContain("No transit source returned")
  expect(missing).toContain("cancellation is not destination receipt")
  expect(missing).not.toContain("0 in transit")
  const list = rendered(
    stockTransfersReadAnswers(
      [
        {
          id: transfer.id,
          createdAt: at,
          inventoryUnitName: "box",
          productName: long,
          quantity: exact,
          remainingQuantity: "4.25",
          sourceStore: transfer.sourceStore,
          targetStore: transfer.targetStore,
          status: transfer.status,
          transitRevision: 2,
          variantName: long,
        },
      ],
      "Store",
      asOf,
    ),
  )
  expect(list).toContain("recorded remaining transit 4.25")
  expect(list).toContain("Only transfers between accessible Stores")
})
