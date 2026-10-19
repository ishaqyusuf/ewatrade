import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { Prisma } from "@ewatrade/db"
import {
  getInventoryBalanceSource,
  getStockOperationAudit,
  listInventoryCompatibleTotalsPage,
  listInventoryOperationHistory,
} from "@ewatrade/db/queries"
import { generalInventoryBalanceAnswers } from "./general-inventory-balances"
import { generalInventoryTotalsAnswers } from "./general-inventory-totals"
import {
  stockOperationReadAnswers,
  stockOperationsReadAnswers,
} from "./whatsapp-reads/inventory-operation-answers"

const tiny = "0.000000000000000001"
const factor = "0.000000000001"
const scope = { tenantId: "business", storeId: "store" }
function balance(onHand: string, conversion: string) {
  return {
    id: "source",
    ...scope,
    productId: "product",
    variantId: "variant",
    inventoryUnitId: "unit",
    revision: 1,
    custodyType: "STORE",
    custodyReferenceId: "",
    kind: "SHARED_POOL",
    onHandQuantity: new Prisma.Decimal(onHand),
    reservedQuantity: new Prisma.Decimal(0),
    product: { catalogItem: { id: "catalog-item", name: "Exact product" } },
    variant: { name: "Original variant" },
    store: { name: "Original Store" },
    inventoryUnit: {
      name: "Original unit",
      factor: new Prisma.Decimal(conversion),
      transactionScale: 6,
      configurationVersionId: "configuration",
    },
  }
}

test("actual scoped source and compatible-total producers retain supported tiny Decimal quantities into existing answers", async () => {
  expect(new Prisma.Decimal(tiny).toString()).toBe("1e-18")
  // Inert query ports only. Actual canonical functions perform arithmetic and DTO projection.
  const source: Awaited<ReturnType<typeof getInventoryBalanceSource>> =
    await Reflect.apply(getInventoryBalanceSource, undefined, [
      {
        stockBalanceSource: {
          findFirst: async ({ where }: { where: unknown }) => {
            expect(where).toEqual({ id: "source", ...scope })
            return balance(tiny, "1")
          },
        },
      },
      { ...scope, balanceSourceId: "source" },
    ])
  if (!source) throw Error("Expected exact canonical source")
  expect(source).toMatchObject({
    onHandQuantity: tiny,
    availableQuantity: tiny,
    reservedQuantity: "0",
    inventoryUnitFactor: "1",
  })
  const sourceAnswers = generalInventoryBalanceAnswers(
    { rows: [source], nextCursor: null },
    { storeName: "Original Store" },
  )
  expect(sourceAnswers[1]?.value).toStartWith(`${tiny} `)
  const totals: Awaited<ReturnType<typeof listInventoryCompatibleTotalsPage>> =
    await Reflect.apply(listInventoryCompatibleTotalsPage, undefined, [
      {
        stockBalanceSource: {
          findMany: async () => [balance("0.000001", factor)],
        },
        inventoryUnit: {
          findMany: async () => [
            {
              id: "canonical-unit",
              name: "Canonical unit",
              configurationVersionId: "configuration",
            },
          ],
        },
      },
      { ...scope, limit: 10 },
    ])
  expect(totals.items[0]).toMatchObject({
    availableCanonicalQuantity: tiny,
    onHandCanonicalQuantity: tiny,
    reservedCanonicalQuantity: "0",
    sourceCount: 1,
  })
  const answers = generalInventoryTotalsAnswers(totals, {
    storeName: "Original Store",
  })
  expect(answers[1]?.value).toStartWith(`${tiny} `)
  for (const answer of [...sourceAnswers, ...answers])
    expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
})

test("actual audit/history producers preserve fractional quantities and large fractional Decimal minor-unit costs", async () => {
  const at = new Date("2026-10-15T10:00:00.000Z")
  const cost = "9007199254740993000000.125"
  expect(new Prisma.Decimal(cost).toString()).toContain("e+")
  const operation = {
    id: "original-operation",
    ...scope,
    categories: [],
    actorUserId: "actor",
    clientOperationId: "original-command",
    corrections: [],
    correctionOfOperationId: null,
    createdAt: at,
    effectiveAt: at,
    linkedOperation: null,
    linkedOperations: [],
    payloadHash: "original-hash",
    reason: "Retained adjustment",
    source: "manual",
    type: "ADJUSTMENT",
    store: { name: "Original Store" },
    movements: [
      {
        id: "original-movement",
        balanceSourceId: "source",
        configurationVersionId: "configuration",
        currencyCodeSnapshot: "NGN",
        enteredInventoryUnitId: "unit",
        enteredInventoryUnit: { name: "Entered unit" },
        enteredQuantity: new Prisma.Decimal("0.000001"),
        previousOnHandQuantity: new Prisma.Decimal(0),
        resultingOnHandQuantity: new Prisma.Decimal(tiny),
        signedCanonicalEffect: new Prisma.Decimal(tiny),
        unitFactorSnapshot: new Prisma.Decimal(factor),
        transactionScaleSnapshot: 6,
        unitCostMinorSnapshot: 25,
        totalCostMinorSnapshot: new Prisma.Decimal(cost),
        reversals: [],
        reversalOfMovement: null,
        balanceSource: balance(tiny, factor),
      },
    ],
  }
  const database = {
    stockOperation: {
      findFirst: async ({ where }: { where: unknown }) => {
        expect(where).toEqual({ id: operation.id, ...scope })
        return operation
      },
      findMany: async ({ where }: { where: unknown }) => {
        expect(where).toMatchObject(scope)
        return [operation]
      },
    },
  }
  const audit: Awaited<ReturnType<typeof getStockOperationAudit>> =
    await Reflect.apply(getStockOperationAudit, undefined, [
      database,
      { ...scope, operationId: operation.id },
    ])
  if (!audit) throw Error("Expected original canonical audit")
  expect(audit.canonicalNetEffect).toBe(tiny)
  expect(audit.movements[0]).toMatchObject({
    signedCanonicalEffect: tiny,
    resultingOnHandQuantity: tiny,
    unitFactorSnapshot: factor,
    totalCostMinorSnapshot: cost,
  })
  const history: Awaited<ReturnType<typeof listInventoryOperationHistory>> =
    await Reflect.apply(listInventoryOperationHistory, undefined, [
      database,
      scope,
    ])
  expect(history[0]?.canonicalNetEffect).toBe(tiny)
  const answers = [
    ...stockOperationReadAnswers(audit, "Original Store"),
    ...stockOperationsReadAnswers(history, "Original Store"),
  ]
  const text = answers.map((row) => `${row.value}\n${row.detail}`).join("\n")
  expect(text).toContain(`Signed canonical effect ${tiny}`)
  expect(text).toContain(`conversion factor ${factor}`)
  expect(text).not.toContain("1e-18")
  expect(text).toContain(`${cost} minor units`)
  for (const answer of answers)
    expect(generalAnswerSchema.safeParse(answer).success).toBe(true)
})
