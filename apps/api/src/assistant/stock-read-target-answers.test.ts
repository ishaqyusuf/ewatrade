import { expect, test } from "bun:test"
import {
  type GeneralAnswer,
  generalAnswerSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalAnswers,
  generalSavedSnapshot,
  generalSnapshotSchema,
  readGeneralSnapshot,
} from "@ewatrade/assistant/general/snapshot"
import { stockReadTargetSchema } from "@ewatrade/assistant/general/stock-read-target"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  StockReadTargetAnswerError,
  inventoryCloseoutReadAnswersWithTargets,
  inventoryCloseoutsReadAnswersWithTargets,
  stockCountReadAnswersWithTargets,
  stockOperationReadAnswersWithTargets,
  stockOperationsReadAnswersWithTargets,
  stockTransferReadAnswersWithTargets,
  stockTransfersReadAnswersWithTargets,
} from "./stock-read-target-answers"
import {
  inventoryCloseoutReadAnswers,
  inventoryCloseoutsReadAnswers,
  stockCountReadAnswers,
  stockOperationReadAnswers,
  stockOperationsReadAnswers,
  stockTransferReadAnswers,
  stockTransfersReadAnswers,
} from "./whatsapp-reads/inventory-operation-answers"

const asOf = "2026-10-15T12:00:00.000Z"
const at = new Date(asOf)
const long = "👨‍👩‍👧‍👦".repeat(100)
const exact = "9007199254740993.000001"
const origin = { tenantId: "tenant", storeId: "store" }
const transferOrigin = { tenantId: "tenant", storeId: "source-store" }
const storeLabel = "Store"
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

function withoutTargets(answers: GeneralAnswer[]) {
  return answers.map(({ target: _target, ...answer }) => answer)
}
function valid(answers: GeneralAnswer[]) {
  for (const answer of answers) {
    expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
    if (answer.target)
      expect(stockReadTargetSchema.safeParse(answer.target).success).toBe(true)
  }
  return answers
}
function operations(): Parameters<typeof stockOperationsReadAnswers>[0] {
  return Array.from({ length: 7 }, (_, index) => ({
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
  }))
}
function closeouts(): Parameters<typeof inventoryCloseoutsReadAnswers>[0] {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `closeout-${index}`,
    status: closeout.status,
    custodyType: closeout.custodyType,
    custodyReferenceId: closeout.custodyReferenceId,
    reason: closeout.reason,
    createdAt: asOf,
    finalizedAt: null,
    lineCount: 50,
  }))
}
function transfers(): Parameters<typeof stockTransfersReadAnswers>[0] {
  return Array.from({ length: 7 }, (_, index) => ({
    id: `transfer-${index}`,
    createdAt: at,
    inventoryUnitName: "box",
    productName: long,
    quantity: exact,
    remainingQuantity: "4.25",
    sourceStore: {
      id: transfer.sourceStore.id,
      name: transfer.sourceStore.name,
    },
    targetStore: {
      id: transfer.targetStore.id,
      name: transfer.targetStore.name,
    },
    status: transfer.status,
    transitRevision: 2,
    variantName: long,
  }))
}

test("all seven actual stock projections retain every original text/decimal and exact display bound", () => {
  const pairs = [
    [
      stockOperationsReadAnswers(operations(), storeLabel, asOf),
      stockOperationsReadAnswersWithTargets(
        operations(),
        origin,
        storeLabel,
        asOf,
      ),
    ],
    [
      stockOperationReadAnswers(operation, storeLabel, asOf),
      stockOperationReadAnswersWithTargets(operation, origin, storeLabel, asOf),
    ],
    [
      stockCountReadAnswers(count, storeLabel, asOf),
      stockCountReadAnswersWithTargets(count, origin, storeLabel, asOf),
    ],
    [
      inventoryCloseoutsReadAnswers(closeouts(), storeLabel, asOf),
      inventoryCloseoutsReadAnswersWithTargets(
        closeouts(),
        origin,
        storeLabel,
        asOf,
      ),
    ],
    [
      inventoryCloseoutReadAnswers(closeout, storeLabel, asOf),
      inventoryCloseoutReadAnswersWithTargets(
        closeout,
        origin,
        storeLabel,
        asOf,
      ),
    ],
    [
      stockTransfersReadAnswers(transfers(), storeLabel, asOf),
      stockTransfersReadAnswersWithTargets(
        transfers(),
        transferOrigin,
        storeLabel,
        asOf,
      ),
    ],
    [
      stockTransferReadAnswers(transfer, storeLabel, asOf),
      stockTransferReadAnswersWithTargets(
        transfer,
        transferOrigin,
        storeLabel,
        asOf,
      ),
    ],
  ]
  for (const [original, wrapped] of pairs) {
    if (!original || !wrapped)
      throw Error("Expected original/wrapped projection pair")
    valid(wrapped)
    expect(withoutTargets(wrapped)).toEqual(original)
  }
})

test("exact operation, movement and evidence open only their DTO parent, never a parsed child ID", () => {
  const row = structuredClone(operation)
  const movement = row.movements[0]
  if (!movement) throw Error("Expected movement")
  movement.id = "stock_operation_wrong-parent"
  const answers = valid(
    stockOperationReadAnswersWithTargets(row, origin, storeLabel, asOf),
  )
  const expected = stockReadTargetSchema.parse({
    kind: "stock_operation",
    operationId: operation.id,
    origin,
  })
  expect(answers).toHaveLength(3)
  for (const answer of answers) expect(answer.target).toEqual(expected)
  expect(answers[1]?.value).toBe(`${exact} box entered`)
  expect(answers[2]?.detail).toContain(
    "Original total cost snapshot 900719925474099300",
  )
})

test("count lines/three retained entries and closeout lines keep their own exact parent original", () => {
  const row = structuredClone(count)
  const line = row.lines[0]
  if (!line) throw Error("Expected count line")
  line.id = "stock_count_wrong-parent"
  const entry = line.entries[0]
  if (!entry) throw Error("Expected original unit entry")
  line.entries = Array.from({ length: 5 }, () => ({ ...entry }))
  const answers = valid(
    stockCountReadAnswersWithTargets(row, origin, storeLabel, asOf),
  )
  expect(answers).toHaveLength(5)
  const expected = stockReadTargetSchema.parse({
    kind: "stock_count",
    stockCountId: count.id,
    origin,
  })
  for (const answer of answers) expect(answer.target).toEqual(expected)
  expect(answers[1]?.detail).toContain("3 of 5 original unit entries")
  const closeoutAnswers = valid(
    inventoryCloseoutReadAnswersWithTargets(closeout, origin, storeLabel, asOf),
  )
  for (const answer of closeoutAnswers)
    expect(answer.target).toEqual(
      stockReadTargetSchema.parse({
        kind: "inventory_closeout",
        closeoutId: closeout.id,
        origin,
      }),
    )
  expect(closeoutAnswers[1]?.detail).toContain(
    "conflicts with current reservations",
  )
})

test("existing five-child display bounds stay intact for operations/counts/closeouts without extra routed cards", () => {
  const operationRow = structuredClone(operation)
  const movement = operationRow.movements[0]
  const countRow = structuredClone(count)
  const countLine = countRow.lines[0]
  const closeoutRow = structuredClone(closeout)
  const closeoutLine = closeoutRow.lines[0]
  if (!movement || !countLine || !closeoutLine)
    throw Error("Expected saved child facts")
  const entry = countLine.entries[0]
  if (!entry) throw Error("Expected saved unit entry")
  operationRow.movements = Array.from({ length: 6 }, (_, index) => ({
    ...movement,
    id: `movement-${index}`,
  }))
  countRow.lines = Array.from({ length: 6 }, (_, index) => ({
    ...countLine,
    id: `line-${index}`,
    entries: Array.from({ length: 5 }, () => ({ ...entry })),
  }))
  closeoutRow.lines = Array.from({ length: 6 }, (_, index) => ({
    ...closeoutLine,
    id: `closeout-line-${index}`,
  }))
  const operationAnswers = stockOperationReadAnswersWithTargets(
    operationRow,
    origin,
    storeLabel,
    asOf,
  )
  const countAnswers = stockCountReadAnswersWithTargets(
    countRow,
    origin,
    storeLabel,
    asOf,
  )
  const closeoutAnswers = inventoryCloseoutReadAnswersWithTargets(
    closeoutRow,
    origin,
    storeLabel,
    asOf,
  )
  expect(operationAnswers).toHaveLength(11)
  expect(countAnswers).toHaveLength(21)
  expect(closeoutAnswers).toHaveLength(6)
  expect(withoutTargets(operationAnswers)).toEqual(
    stockOperationReadAnswers(operationRow, storeLabel, asOf),
  )
  expect(withoutTargets(countAnswers)).toEqual(
    stockCountReadAnswers(countRow, storeLabel, asOf),
  )
  expect(withoutTargets(closeoutAnswers)).toEqual(
    inventoryCloseoutReadAnswers(closeoutRow, storeLabel, asOf),
  )
})

test("list rows target exact parents; every list summary and empty list remain targetless", () => {
  const lists = [
    stockOperationsReadAnswersWithTargets(
      operations(),
      origin,
      storeLabel,
      asOf,
    ),
    inventoryCloseoutsReadAnswersWithTargets(
      closeouts(),
      origin,
      storeLabel,
      asOf,
    ),
    stockTransfersReadAnswersWithTargets(
      transfers(),
      transferOrigin,
      storeLabel,
      asOf,
    ),
  ]
  for (const list of lists) {
    expect(list).toHaveLength(6)
    expect(list[0]?.target).toBeUndefined()
    expect(list[0]?.detail).toContain("5 of 7 returned records")
    expect(list[0]?.detail).toContain("no older-page cursor")
    expect(list.slice(1).every((answer) => answer.target !== undefined)).toBe(
      true,
    )
  }
  expect(lists[0]?.[1]?.target).toEqual(
    stockReadTargetSchema.parse({
      kind: "stock_operation",
      operationId: "operation-0",
      origin,
    }),
  )
  expect(lists[1]?.[5]?.target).toEqual(
    stockReadTargetSchema.parse({
      kind: "inventory_closeout",
      closeoutId: "closeout-4",
      origin,
    }),
  )
  expect(lists[2]?.[2]?.target).toEqual(
    stockReadTargetSchema.parse({
      kind: "stock_transfer",
      transferId: "transfer-1",
      origin: transferOrigin,
    }),
  )
  for (const list of [
    stockOperationsReadAnswersWithTargets([], origin, storeLabel, asOf),
    inventoryCloseoutsReadAnswersWithTargets([], origin, storeLabel, asOf),
    stockTransfersReadAnswersWithTargets([], transferOrigin, storeLabel, asOf),
  ]) {
    expect(list).toHaveLength(1)
    expect(list[0]?.target).toBeUndefined()
  }
  const unavailable = stockOperationReadAnswersWithTargets(
    null,
    origin,
    storeLabel,
    asOf,
  )
  expect(unavailable).toEqual(stockOperationReadAnswers(null, storeLabel, asOf))
  expect(unavailable[0]?.target).toBeUndefined()
})

test("transfer header and five acknowledgments target only their parent while current/history summaries stay targetless", () => {
  const row = structuredClone(transfer)
  const ack = row.acknowledgments[0]
  if (!ack) throw Error("Expected retained acknowledgment")
  row.acknowledgments = Array.from({ length: 7 }, (_, index) => ({
    ...ack,
    id: `stock_transfer_wrong-parent-${index}`,
  }))
  for (const storeId of [row.sourceStore.id, row.targetStore.id]) {
    const selectedOrigin = { tenantId: "tenant", storeId }
    const answers = valid(
      stockTransferReadAnswersWithTargets(
        row,
        selectedOrigin,
        storeLabel,
        asOf,
      ),
    )
    const expected = stockReadTargetSchema.parse({
      kind: "stock_transfer",
      transferId: transfer.id,
      origin: selectedOrigin,
    })
    expect(answers).toHaveLength(8)
    expect(answers[0]?.target).toEqual(expected)
    expect(answers[1]?.target).toBeUndefined()
    expect(answers[2]?.target).toBeUndefined()
    expect(answers[2]?.detail).toContain("canonical history is limited")
    for (const answer of answers.slice(3))
      expect(answer.target).toEqual(expected)
  }
})

test("protected transfer list DTOs need exact endpoint origin but detail still requires both Tenant echoes", () => {
  const rows = transfers()
  const first = rows[0]
  if (!first) throw Error("Expected protected transfer list row")
  expect(first.sourceStore).not.toHaveProperty("tenantId")
  expect(first.targetStore).not.toHaveProperty("tenantId")
  for (const storeId of [first.sourceStore.id, first.targetStore.id]) {
    const selectedOrigin = { tenantId: transferOrigin.tenantId, storeId }
    const answers = valid(
      stockTransfersReadAnswersWithTargets(
        rows,
        selectedOrigin,
        storeLabel,
        asOf,
      ),
    )
    expect(withoutTargets(answers)).toEqual(
      stockTransfersReadAnswers(rows, storeLabel, asOf),
    )
    expect(answers[0]?.target).toBeUndefined()
    expect(answers[1]?.target).toEqual(
      stockReadTargetSchema.parse({
        kind: "stock_transfer",
        transferId: first.id,
        origin: selectedOrigin,
      }),
    )
  }
  expect(() =>
    stockTransfersReadAnswersWithTargets(
      rows,
      { ...transferOrigin, storeId: "unrelated-store" },
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  for (const endpoint of ["sourceStore", "targetStore"] as const) {
    const exposed = structuredClone(rows)
    const exposedFirst = exposed[0]
    if (!exposedFirst) throw Error("Expected exact list row")
    Reflect.set(exposedFirst[endpoint], "tenantId", "foreign")
    expect(() =>
      stockTransfersReadAnswersWithTargets(
        exposed,
        transferOrigin,
        storeLabel,
        asOf,
      ),
    ).toThrow(StockReadTargetAnswerError)
    const detail = structuredClone(transfer)
    Reflect.deleteProperty(detail[endpoint], "tenantId")
    expect(() =>
      stockTransferReadAnswersWithTargets(
        detail,
        transferOrigin,
        storeLabel,
        asOf,
      ),
    ).toThrow(StockReadTargetAnswerError)
  }
})

test("foreign/missing Store echoes and both transfer endpoint Tenants refuse without inferred scope", () => {
  expect(() =>
    stockOperationReadAnswersWithTargets(
      operation,
      { ...origin, storeId: "foreign" },
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  expect(() =>
    stockCountReadAnswersWithTargets(
      count,
      { ...origin, storeId: "foreign" },
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  expect(() =>
    inventoryCloseoutReadAnswersWithTargets(
      closeout,
      { ...origin, storeId: "foreign" },
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  const missingStore = structuredClone(count)
  Reflect.deleteProperty(missingStore, "storeId")
  expect(() =>
    stockCountReadAnswersWithTargets(missingStore, origin, storeLabel, asOf),
  ).toThrow(StockReadTargetAnswerError)
  const extraTenant = structuredClone(operation)
  Reflect.set(extraTenant, "tenantId", "foreign")
  expect(() =>
    stockOperationReadAnswersWithTargets(extraTenant, origin, storeLabel, asOf),
  ).toThrow(StockReadTargetAnswerError)
  for (const field of ["sourceStore", "targetStore"]) {
    const row = structuredClone(transfer)
    if (field === "sourceStore") row.sourceStore.tenantId = "foreign"
    else row.targetStore.tenantId = "foreign"
    expect(() =>
      stockTransferReadAnswersWithTargets(
        row,
        transferOrigin,
        storeLabel,
        asOf,
      ),
    ).toThrow(StockReadTargetAnswerError)
  }
  expect(() =>
    stockTransferReadAnswersWithTargets(
      transfer,
      { ...transferOrigin, storeId: "unrelated-store" },
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  const sameEndpoint = structuredClone(transfer)
  sameEndpoint.targetStore.id = sameEndpoint.sourceStore.id
  expect(() =>
    stockTransferReadAnswersWithTargets(
      sameEndpoint,
      transferOrigin,
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  const rows = operations()
  const first = rows[0]
  if (!first) throw Error("Expected operation list row")
  first.storeId = "foreign"
  expect(() =>
    stockOperationsReadAnswersWithTargets(rows, origin, storeLabel, asOf),
  ).toThrow(StockReadTargetAnswerError)
})

test("malformed/overlong/absent identities and invalid origin are refused before optional GENERAL target parsing can discard metadata", () => {
  for (const id of [
    "",
    " padded ",
    "x".repeat(129),
    "https://foreign.invalid/id",
    "../foreign",
    "bad\nidentity",
  ]) {
    const row = { ...operation, id }
    expect(() =>
      stockOperationReadAnswersWithTargets(row, origin, storeLabel, asOf),
    ).toThrow(StockReadTargetAnswerError)
  }
  const missingId = structuredClone(operation)
  Reflect.deleteProperty(missingId, "id")
  expect(() =>
    stockOperationReadAnswersWithTargets(missingId, origin, storeLabel, asOf),
  ).toThrow(StockReadTargetAnswerError)
  const missingMovementId = structuredClone(operation)
  const movement = missingMovementId.movements[0]
  if (!movement) throw Error("Expected original movement")
  Reflect.deleteProperty(movement, "id")
  expect(() =>
    stockOperationReadAnswersWithTargets(
      missingMovementId,
      origin,
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  for (const badOrigin of [
    { tenantId: "", storeId: "store" },
    { tenantId: "tenant", storeId: " store" },
    { tenantId: "x".repeat(129), storeId: "store" },
  ])
    expect(() =>
      stockOperationReadAnswersWithTargets(
        operation,
        badOrigin,
        storeLabel,
        asOf,
      ),
    ).toThrow(StockReadTargetAnswerError)
})

test("all four 128-character original/child identities retain exact targets and facts with stable bounded card keys", () => {
  const parentId = `parent_${"p".repeat(121)}`
  const childId = `child_${"c".repeat(122)}`
  expect(parentId.length).toBe(128)
  expect(childId.length).toBe(128)
  const operationRow = structuredClone(operation)
  operationRow.id = parentId
  const movement = operationRow.movements[0]
  const countRow = structuredClone(count)
  countRow.id = parentId
  const line = countRow.lines[0]
  const closeoutRow = structuredClone(closeout)
  closeoutRow.id = parentId
  const closeoutLine = closeoutRow.lines[0]
  const transferRow = structuredClone(transfer)
  transferRow.id = parentId
  const acknowledgment = transferRow.acknowledgments[0]
  if (!movement || !line || !closeoutLine || !acknowledgment)
    throw Error("Expected exact original children")
  movement.id = childId
  line.id = childId
  closeoutLine.id = childId
  acknowledgment.id = childId
  const cases = [
    {
      answers: stockOperationReadAnswersWithTargets(
        operationRow,
        origin,
        storeLabel,
        asOf,
      ),
      raw: stockOperationReadAnswers(operationRow, storeLabel, asOf),
      expected: stockReadTargetSchema.parse({
        kind: "stock_operation",
        operationId: parentId,
        origin,
      }),
    },
    {
      answers: stockCountReadAnswersWithTargets(
        countRow,
        origin,
        storeLabel,
        asOf,
      ),
      raw: stockCountReadAnswers(countRow, storeLabel, asOf),
      expected: stockReadTargetSchema.parse({
        kind: "stock_count",
        stockCountId: parentId,
        origin,
      }),
    },
    {
      answers: inventoryCloseoutReadAnswersWithTargets(
        closeoutRow,
        origin,
        storeLabel,
        asOf,
      ),
      raw: inventoryCloseoutReadAnswers(closeoutRow, storeLabel, asOf),
      expected: stockReadTargetSchema.parse({
        kind: "inventory_closeout",
        closeoutId: parentId,
        origin,
      }),
    },
    {
      answers: stockTransferReadAnswersWithTargets(
        transferRow,
        transferOrigin,
        storeLabel,
        asOf,
      ),
      raw: stockTransferReadAnswers(transferRow, storeLabel, asOf),
      expected: stockReadTargetSchema.parse({
        kind: "stock_transfer",
        transferId: parentId,
        origin: transferOrigin,
      }),
    },
  ]
  for (const entry of cases) {
    valid(entry.answers)
    expect(
      entry.answers.map(({ id: _id, target: _target, ...facts }) => facts),
    ).toEqual(entry.raw.map(({ id: _id, target: _target, ...facts }) => facts))
    expect(entry.answers[0]?.target).toEqual(entry.expected)
    expect(entry.answers.every((answer) => answer.id.length <= 128)).toBe(true)
    expect(new Set(entry.answers.map((answer) => answer.id)).size).toBe(
      entry.answers.length,
    )
    for (const answer of entry.answers) {
      expect(answer.id).toMatch(/^stock_answer_[a-f0-9]{64}$/)
      if (answer.target) expect(answer.target).toEqual(entry.expected)
    }
    expect(entry.answers[0]?.detail).toContain(parentId)
  }
  expect(cases[0]?.answers[1]?.detail).toContain(childId)
  expect(cases[1]?.answers[2]?.detail).toContain(childId)
  expect(cases[3]?.answers[3]?.detail).toContain(childId)
  const first = stockOperationReadAnswersWithTargets(
    operationRow,
    origin,
    storeLabel,
    asOf,
  )
  const reload = stockOperationReadAnswersWithTargets(
    operationRow,
    origin,
    storeLabel,
    "2026-10-16T12:00:00.000Z",
  )
  expect(reload.map((answer) => answer.id)).toEqual(
    first.map((answer) => answer.id),
  )
  const otherParent = { ...operationRow, id: `other_${"o".repeat(122)}` }
  expect(
    stockOperationReadAnswersWithTargets(
      otherParent,
      origin,
      storeLabel,
      asOf,
    )[1]?.id,
  ).not.toBe(first[1]?.id)
  const source = stockTransferReadAnswersWithTargets(
    transferRow,
    transferOrigin,
    storeLabel,
    asOf,
  )
  const destinationOrigin = {
    tenantId: transferOrigin.tenantId,
    storeId: transferRow.targetStore.id,
  }
  const destination = stockTransferReadAnswersWithTargets(
    transferRow,
    destinationOrigin,
    storeLabel,
    asOf,
  )
  expect(
    new Set([...source, ...destination].map((answer) => answer.id)).size,
  ).toBe(source.length + destination.length)
  expect(destination[0]?.target).toEqual(
    stockReadTargetSchema.parse({
      kind: "stock_transfer",
      transferId: parentId,
      origin: destinationOrigin,
    }),
  )
  const snapshot = generalSnapshotSchema.parse({
    conversation: { id: "general", title: null },
    messages: [
      {
        id: "message",
        role: "assistant",
        parts: cases
          .flatMap((entry) => entry.answers)
          .map((data) => ({ type: "data-general-answer", data })),
      },
    ],
    proposals: [],
    activeRunId: null,
    allowance: { remainingRequests: 1, remainingTokens: 1, resetsAt: asOf },
    businessName: "Business",
    storeName: storeLabel,
    currencyCode: "NGN",
  })
  const saved = readGeneralSnapshot(generalSavedSnapshot(snapshot))
  if (!saved) throw Error("Expected saved long-identity stock cards")
  expect(generalAnswers(saved.messages[0]?.parts)).toEqual(
    cases.flatMap((entry) => entry.answers),
  )
})

test("duplicate or colliding parent/child card identities never silently select a different original", () => {
  const rows = operations()
  const first = rows[0]
  if (!first) throw Error("Expected list row")
  expect(() =>
    stockOperationsReadAnswersWithTargets(
      [...rows, first],
      origin,
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  const operationRow = structuredClone(operation)
  const movement = operationRow.movements[0]
  if (!movement) throw Error("Expected movement")
  operationRow.movements = [
    { ...movement, id: "same" },
    { ...movement, id: "evidence_same" },
  ]
  expect(() =>
    stockOperationReadAnswersWithTargets(
      operationRow,
      origin,
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  const countRow = structuredClone(count)
  const line = countRow.lines[0]
  if (!line) throw Error("Expected count line")
  countRow.lines.push(line)
  expect(() =>
    stockCountReadAnswersWithTargets(countRow, origin, storeLabel, asOf),
  ).toThrow(StockReadTargetAnswerError)
  const transferRow = structuredClone(transfer)
  const ack = transferRow.acknowledgments[0]
  if (!ack) throw Error("Expected acknowledgment")
  transferRow.acknowledgments.push(ack)
  expect(() =>
    stockTransferReadAnswersWithTargets(
      transferRow,
      transferOrigin,
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
  const closeoutRows = closeouts()
  const closeoutFirst = closeoutRows[0]
  if (!closeoutFirst) throw Error("Expected closeout list row")
  expect(() =>
    inventoryCloseoutsReadAnswersWithTargets(
      [closeoutFirst, closeoutFirst],
      origin,
      storeLabel,
      asOf,
    ),
  ).toThrow(StockReadTargetAnswerError)
})

test("actual saved snapshot and GENERAL answer parsing preserve all four strict original targets", () => {
  const answers = [
    ...stockOperationReadAnswersWithTargets(
      operation,
      origin,
      storeLabel,
      asOf,
    ),
    ...stockCountReadAnswersWithTargets(count, origin, storeLabel, asOf),
    ...inventoryCloseoutReadAnswersWithTargets(
      closeout,
      origin,
      storeLabel,
      asOf,
    ),
    ...stockTransferReadAnswersWithTargets(
      transfer,
      transferOrigin,
      storeLabel,
      asOf,
    ),
  ]
  const snapshot = generalSnapshotSchema.parse({
    conversation: { id: "general", title: null },
    messages: [
      {
        id: "message",
        role: "assistant",
        parts: answers.map((data) => ({ type: "data-general-answer", data })),
      },
    ],
    proposals: [],
    unavailableProposals: [],
    activeRunId: "private-run",
    allowance: { remainingRequests: 1, remainingTokens: 100, resetsAt: asOf },
    businessName: "Business",
    storeName: storeLabel,
    currencyCode: "NGN",
  })
  const saved = readGeneralSnapshot(generalSavedSnapshot(snapshot))
  if (!saved) throw Error("Expected saved actual snapshot")
  expect(saved.activeRunId).toBeNull()
  expect(generalAnswers(saved.messages[0]?.parts)).toEqual(answers)
  expect(
    new Set(
      answers.flatMap((answer) => (answer.target ? [answer.target.kind] : [])),
    ),
  ).toEqual(
    new Set([
      "stock_operation",
      "stock_count",
      "inventory_closeout",
      "stock_transfer",
    ]),
  )
})
