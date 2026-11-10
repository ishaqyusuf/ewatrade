import {
  EXACT_QUANTITY_MAX_SCALE,
  addExactDecimals,
  compareExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { StockCategorySelector } from "@ewatrade/utils/inventory-categories"
import { SHIPMENT_RECEIPT_CATEGORY } from "@ewatrade/utils/shipments"
import type {
  FinanceBook,
  FinanceShipmentStatus,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "./access"
import { financeDocumentCommand, financePostingCommandId } from "./commands"
import { getFinancePurchaseRecordingReview } from "./purchase-recording-review"
import { recordFinancePurchaseInTransaction } from "./purchases"
import { FinanceError } from "./rules"
import {
  computeShipmentCosting,
  shipmentLandedUnitMinor,
  shipmentReceiptCostMinor,
} from "./shipment-costing"

const ZERO = BigInt(0)
const CURRENCY = /^[A-Z]{3}$/
const MAX_LINES = 50
const MAX_RECEIPT_LINES = 10
const OPEN: FinanceShipmentStatus[] = ["EXPECTED", "PARTIALLY_RECEIVED"]
const TRANSACTION = { maxWait: 10_000, timeout: 30_000 }

type Command = FinanceActor & { bookId: string; clientCommandId: string }
type ShipmentCommand = Command & {
  shipmentId: string
  expectedRevision: number
}

export type FinanceShipmentLineDraft = {
  description: string
  proposedName?: string
  balanceSourceId?: string
  enteredInventoryUnitId?: string
  expectedQuantity: string
  sourceCurrencyCode: string
  sourceUnitPrice: string
  freightOverrideMinor?: string
}

export type FinanceShipmentDraft = {
  supplierId: string
  storeId: string
  name: string
  reference?: string
  expectedAt?: Date
  freightAmount: string
  freightCurrencyCode: string
  rates: Array<{
    currencyCode: string
    rate: string
    rateDate: Date
    source: string
  }>
  lines: FinanceShipmentLineDraft[]
}

export type FinanceShipmentReceiveInput = Command & {
  shipmentId: string
  receivedAt: Date
  reference?: string
  dueAt?: Date
  lines: Array<{
    lineId: string
    quantity: string
    expectedBalanceRevision: number
    expectedConfigurationVersionId: string
    categories: StockCategorySelector[]
  }>
}

function invalid(message: string): never {
  throw new FinanceError("INVALID_JOURNAL", message)
}

function text(value: string | undefined, label: string, max: number) {
  const trimmed = value?.trim() ?? ""
  if (!trimmed || trimmed.length > max) invalid(`Enter a valid ${label}.`)
  return trimmed
}

function decimal(value: string, label: string, allowZero: boolean) {
  try {
    return parseExactDecimal(value, {
      allowZero,
      maxScale: EXACT_QUANTITY_MAX_SCALE,
    })
  } catch {
    return invalid(`Enter a valid ${label}.`)
  }
}

function minor(value: string, label: string, allowNegative = false) {
  if (!(allowNegative ? /^-?\d{1,15}$/ : /^\d{1,15}$/).test(value))
    invalid(`Enter a valid ${label}.`)
  return BigInt(value)
}

/** Normalizes and fully validates a draft; costing must succeed before anything is saved. */
function normalizeDraft(draft: FinanceShipmentDraft, book: FinanceBook) {
  if (!draft.lines.length || draft.lines.length > MAX_LINES)
    invalid(`Add 1 to ${MAX_LINES} expected lines.`)
  if (!CURRENCY.test(draft.freightCurrencyCode))
    invalid("Enter a valid freight currency.")
  const rates = draft.rates.map((rate) => {
    if (!CURRENCY.test(rate.currencyCode)) invalid("Enter a valid currency.")
    if (Number.isNaN(new Date(rate.rateDate).getTime()))
      invalid("Enter the rate date.")
    return {
      currencyCode: rate.currencyCode,
      rate: rate.rate.trim(),
      rateDate: new Date(rate.rateDate),
      source: text(rate.source, "rate source", 160),
    }
  })
  const lines = draft.lines.map((line, index) => {
    if (!CURRENCY.test(line.sourceCurrencyCode))
      invalid("Enter a valid purchase currency.")
    const mapped = line.balanceSourceId !== undefined
    if (mapped !== (line.enteredInventoryUnitId !== undefined))
      invalid("Choose both the stock item and its unit.")
    if (!mapped && !line.proposedName?.trim())
      invalid("Name each new item or choose an existing one.")
    return {
      position: index + 1,
      description: text(line.description, "line description", 200),
      proposedName: line.proposedName?.trim()
        ? text(line.proposedName, "item name", 160)
        : null,
      balanceSourceId: line.balanceSourceId ?? null,
      enteredInventoryUnitId: line.enteredInventoryUnitId ?? null,
      expectedQuantity: decimal(
        line.expectedQuantity,
        "expected quantity",
        false,
      ),
      sourceCurrencyCode: line.sourceCurrencyCode,
      sourceUnitPrice: decimal(line.sourceUnitPrice, "purchase price", true),
      freightOverrideMinor:
        line.freightOverrideMinor === undefined
          ? null
          : minor(line.freightOverrideMinor, "freight override"),
    }
  })
  const freightAmount = decimal(draft.freightAmount, "freight", true)
  const costing = computeShipmentCosting({
    bookCurrencyCode: book.currencyCode,
    rates,
    freightAmount,
    freightCurrencyCode: draft.freightCurrencyCode,
    lines,
  })
  return {
    name: text(draft.name, "shipment name", 160),
    reference: draft.reference?.trim() || null,
    expectedAt: draft.expectedAt ? new Date(draft.expectedAt) : null,
    freightAmount,
    freightCurrencyCode: draft.freightCurrencyCode,
    rates,
    lines,
    costing,
  }
}

async function assertMapping(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { storeId: string },
  balanceSourceId: string,
  enteredInventoryUnitId: string,
) {
  const source = await tx.stockBalanceSource.findFirst({
    where: {
      id: balanceSourceId,
      tenantId: input.tenantId,
      storeId: input.storeId,
      custodyType: "STORE",
    },
    select: { productId: true },
  })
  const unit = await tx.inventoryUnit.findFirst({
    where: { id: enteredInventoryUnitId },
    select: { configurationVersion: { select: { productId: true } } },
  })
  if (!source || unit?.configurationVersion.productId !== source.productId)
    throw new FinanceError(
      "NOT_FOUND",
      "Choose a stock item and unit from this Store.",
    )
}

async function assertDraftScope(
  tx: Prisma.TransactionClient,
  input: FinanceActor,
  book: FinanceBook,
  draft: FinanceShipmentDraft,
  lines: ReturnType<typeof normalizeDraft>["lines"],
) {
  const [supplier, store] = await Promise.all([
    tx.financeSupplierAccount.findFirst({
      where: { id: draft.supplierId, bookId: book.id },
      select: { id: true },
    }),
    tx.store.findFirst({
      where: { id: draft.storeId, tenantId: input.tenantId },
      select: { id: true },
    }),
  ])
  if (!supplier) throw new FinanceError("NOT_FOUND", "Supplier not found.")
  if (!store) throw new FinanceError("NOT_FOUND", "Store not found.")
  for (const line of lines)
    if (line.balanceSourceId && line.enteredInventoryUnitId)
      await assertMapping(
        tx,
        { ...input, storeId: store.id },
        line.balanceSourceId,
        line.enteredInventoryUnitId,
      )
}

function draftData(
  input: FinanceActor & { bookId: string },
  shipmentId: string,
  normalized: ReturnType<typeof normalizeDraft>,
) {
  return {
    rates: normalized.rates.map((rate) => ({
      bookId: input.bookId,
      shipmentId,
      ...rate,
    })),
    lines: normalized.lines.map(({ freightOverrideMinor, ...line }) => ({
      ...line,
      tenantId: input.tenantId,
      bookId: input.bookId,
      shipmentId,
      freightOverrideMinor,
    })),
  }
}

function draftPayload(draft: FinanceShipmentDraft) {
  return {
    ...draft,
    expectedAt: draft.expectedAt ? new Date(draft.expectedAt) : null,
    rates: draft.rates.map((r) => ({ ...r, rateDate: new Date(r.rateDate) })),
  }
}

/** Locks the shipment row under the already-locked Book and checks its revision. */
async function lockShipment(
  tx: Prisma.TransactionClient,
  book: FinanceBook,
  shipmentId: string,
  expectedRevision?: number,
) {
  await tx.$queryRaw`SELECT id FROM "FinanceShipment" WHERE id = ${shipmentId} AND "bookId" = ${book.id} FOR UPDATE`
  const shipment = await tx.financeShipment.findFirst({
    where: { id: shipmentId, bookId: book.id },
    include: {
      lines: { orderBy: { position: "asc" } },
      rates: true,
      _count: { select: { receipts: true, adjustments: true } },
    },
  })
  if (!shipment) throw new FinanceError("NOT_FOUND", "Shipment not found.")
  if (expectedRevision !== undefined && shipment.revision !== expectedRevision)
    throw new FinanceError("CONFLICT", "The shipment changed. Review it again.")
  return shipment
}

export async function createFinanceShipmentInTransaction(
  tx: Prisma.TransactionClient,
  input: Command & FinanceShipmentDraft,
) {
  const { tenantId, actorUserId, bookId, clientCommandId, ...draft } = input
  return financeDocumentCommand(
    tx,
    input,
    "CREATE_SHIPMENT",
    draftPayload(draft),
    async (book) => {
      const normalized = normalizeDraft(draft, book)
      await assertDraftScope(tx, input, book, draft, normalized.lines)
      const shipment = await tx.financeShipment.create({
        data: {
          tenantId,
          bookId: book.id,
          supplierId: draft.supplierId,
          storeId: draft.storeId,
          name: normalized.name,
          reference: normalized.reference,
          expectedAt: normalized.expectedAt,
          freightAmount: normalized.freightAmount,
          freightCurrencyCode: normalized.freightCurrencyCode,
          actorUserId,
        },
      })
      const data = draftData(input, shipment.id, normalized)
      await tx.financeShipmentRate.createMany({ data: data.rates })
      await tx.financeShipmentLine.createMany({ data: data.lines })
      return { id: shipment.id }
    },
  )
}

export async function createFinanceShipment(
  db: PrismaClient,
  input: Command & FinanceShipmentDraft,
) {
  return db.$transaction(
    (tx) => createFinanceShipmentInTransaction(tx, input),
    TRANSACTION,
  )
}

/** Replaces a draft's header, rates and lines in full. */
export async function updateFinanceShipmentDraft(
  db: PrismaClient,
  input: ShipmentCommand & FinanceShipmentDraft,
) {
  const {
    tenantId: _t,
    actorUserId: _a,
    bookId: _b,
    clientCommandId: _c,
    shipmentId,
    expectedRevision,
    ...draft
  } = input
  return db.$transaction(
    (tx) =>
      financeDocumentCommand(
        tx,
        input,
        "UPDATE_SHIPMENT",
        { shipmentId, expectedRevision, ...draftPayload(draft) },
        async (book) => {
          const shipment = await lockShipment(
            tx,
            book,
            shipmentId,
            expectedRevision,
          )
          if (shipment.status !== "DRAFT")
            throw new FinanceError(
              "CONFLICT",
              "Only a draft shipment can be edited.",
            )
          const normalized = normalizeDraft(draft, book)
          await assertDraftScope(tx, input, book, draft, normalized.lines)
          await tx.financeShipmentRate.deleteMany({ where: { shipmentId } })
          await tx.financeShipmentLine.deleteMany({ where: { shipmentId } })
          const data = draftData(input, shipmentId, normalized)
          await tx.financeShipmentRate.createMany({ data: data.rates })
          await tx.financeShipmentLine.createMany({ data: data.lines })
          await tx.financeShipment.update({
            where: { id: shipmentId },
            data: {
              supplierId: draft.supplierId,
              storeId: draft.storeId,
              name: normalized.name,
              reference: normalized.reference,
              expectedAt: normalized.expectedAt,
              freightAmount: normalized.freightAmount,
              freightCurrencyCode: normalized.freightCurrencyCode,
              revision: { increment: 1 },
            },
          })
          return { id: shipmentId }
        },
      ),
    TRANSACTION,
  )
}

/** Pinned landed cost of a confirmed line: goods + freight + reviewed adjustments. */
function landedMinorOf(line: {
  goodsMinor: bigint | null
  freightMinor: bigint | null
  adjustmentMinor: bigint
}) {
  if (line.goodsMinor === null || line.freightMinor === null)
    throw new FinanceError("CONFLICT", "Confirm the shipment first.")
  return line.goodsMinor + line.freightMinor + line.adjustmentMinor
}

function costingFor(
  shipment: Awaited<ReturnType<typeof lockShipment>>,
  book: FinanceBook,
) {
  return computeShipmentCosting({
    bookCurrencyCode: book.currencyCode,
    rates: shipment.rates.map((r) => ({
      currencyCode: r.currencyCode,
      rate: r.rate.toFixed(),
    })),
    freightAmount: shipment.freightAmount.toFixed(),
    freightCurrencyCode: shipment.freightCurrencyCode,
    lines: shipment.lines.map((line) => ({
      position: line.position,
      expectedQuantity: line.expectedQuantity.toFixed(),
      sourceCurrencyCode: line.sourceCurrencyCode,
      sourceUnitPrice: line.sourceUnitPrice.toFixed(),
      freightOverrideMinor: line.freightOverrideMinor,
      adjustmentMinor: line.adjustmentMinor,
    })),
  })
}

/** Pins converted goods and freight per line; expected goods still add no stock. */
export async function confirmFinanceShipmentInTransaction(
  tx: Prisma.TransactionClient,
  input: ShipmentCommand,
) {
  return financeDocumentCommand(
    tx,
    input,
    "CONFIRM_SHIPMENT",
    {
      shipmentId: input.shipmentId,
      expectedRevision: input.expectedRevision,
    },
    async (book) => {
      const shipment = await lockShipment(
        tx,
        book,
        input.shipmentId,
        input.expectedRevision,
      )
      if (shipment.status !== "DRAFT")
        throw new FinanceError(
          "CONFLICT",
          "This shipment is already confirmed.",
        )
      const costing = costingFor(shipment, book)
      for (const line of shipment.lines) {
        const cost = costing.lines.find((c) => c.position === line.position)
        if (!cost)
          throw new FinanceError("CONFLICT", "Review the shipment again.")
        await tx.financeShipmentLine.update({
          where: { id: line.id },
          data: {
            goodsMinor: cost.goodsMinor,
            freightMinor: cost.freightMinor,
          },
        })
      }
      await tx.financeShipment.update({
        where: { id: shipment.id },
        data: {
          status: "EXPECTED",
          freightMinor: costing.freightMinor,
          confirmedAt: new Date(),
          revision: { increment: 1 },
        },
      })
      return { id: shipment.id }
    },
  )
}

export async function confirmFinanceShipment(
  db: PrismaClient,
  input: ShipmentCommand,
) {
  return db.$transaction(
    (tx) => confirmFinanceShipmentInTransaction(tx, input),
    TRANSACTION,
  )
}

export async function reopenFinanceShipment(
  db: PrismaClient,
  input: ShipmentCommand,
) {
  return db.$transaction(
    (tx) =>
      financeDocumentCommand(
        tx,
        input,
        "REOPEN_SHIPMENT",
        {
          shipmentId: input.shipmentId,
          expectedRevision: input.expectedRevision,
        },
        async (book) => {
          const shipment = await lockShipment(
            tx,
            book,
            input.shipmentId,
            input.expectedRevision,
          )
          if (
            shipment.status !== "EXPECTED" ||
            shipment._count.receipts ||
            shipment._count.adjustments
          )
            throw new FinanceError(
              "CONFLICT",
              "Only an unreceived, unadjusted shipment can return to draft.",
            )
          await tx.financeShipmentLine.updateMany({
            where: { shipmentId: shipment.id },
            data: { goodsMinor: null, freightMinor: null },
          })
          await tx.financeShipment.update({
            where: { id: shipment.id },
            data: {
              status: "DRAFT",
              freightMinor: null,
              confirmedAt: null,
              revision: { increment: 1 },
            },
          })
          return { id: shipment.id }
        },
      ),
    TRANSACTION,
  )
}

/** Links a new or existing item line to the Store stock it will be received into. */
export async function mapFinanceShipmentLine(
  db: PrismaClient,
  input: ShipmentCommand & {
    lineId: string
    balanceSourceId: string
    enteredInventoryUnitId: string
  },
) {
  const {
    tenantId: _t,
    actorUserId: _a,
    bookId: _b,
    clientCommandId: _c,
    ...payload
  } = input
  return db.$transaction(
    (tx) =>
      financeDocumentCommand(
        tx,
        input,
        "MAP_SHIPMENT_LINE",
        payload,
        async (book) => {
          const shipment = await lockShipment(
            tx,
            book,
            input.shipmentId,
            input.expectedRevision,
          )
          const line = shipment.lines.find((l) => l.id === input.lineId)
          if (!line)
            throw new FinanceError("NOT_FOUND", "Shipment line not found.")
          if (
            ![...OPEN, "DRAFT"].includes(shipment.status) ||
            !line.receivedQuantity.isZero()
          )
            throw new FinanceError(
              "CONFLICT",
              "Received or closed lines keep their stock item.",
            )
          await assertMapping(
            tx,
            { ...input, storeId: shipment.storeId },
            input.balanceSourceId,
            input.enteredInventoryUnitId,
          )
          await tx.financeShipmentLine.update({
            where: { id: line.id },
            data: {
              balanceSourceId: input.balanceSourceId,
              enteredInventoryUnitId: input.enteredInventoryUnitId,
            },
          })
          await tx.financeShipment.update({
            where: { id: shipment.id },
            data: { revision: { increment: 1 } },
          })
          return { id: shipment.id }
        },
      ),
    TRANSACTION,
  )
}

/** Reviewed landed-cost change; it applies only to the line's unreceived quantity. */
export async function adjustFinanceShipmentLineCostInTransaction(
  tx: Prisma.TransactionClient,
  input: ShipmentCommand & {
    lineId: string
    amountMinor: string
    reason: string
  },
) {
  const {
    tenantId: _t,
    actorUserId,
    bookId: _b,
    clientCommandId: _c,
    ...payload
  } = input
  return financeDocumentCommand(
    tx,
    input,
    "ADJUST_SHIPMENT_COST",
    payload,
    async (book) => {
      const amount = minor(input.amountMinor, "adjustment", true)
      if (amount === ZERO) invalid("Enter a non-zero adjustment.")
      const reason = text(input.reason, "adjustment reason", 400)
      const shipment = await lockShipment(
        tx,
        book,
        input.shipmentId,
        input.expectedRevision,
      )
      const line = shipment.lines.find((l) => l.id === input.lineId)
      if (!line)
        throw new FinanceError("NOT_FOUND", "Shipment line not found.")
      if (!OPEN.includes(shipment.status))
        throw new FinanceError(
          "CONFLICT",
          "Confirm the shipment before adjusting landed cost.",
        )
      if (line.receivedQuantity.gte(line.expectedQuantity))
        throw new FinanceError(
          "CONFLICT",
          "This line is fully received; its cost is final.",
        )
      const landed = landedMinorOf(line) + amount
      if (landed - line.receivedCostMinor <= ZERO)
        invalid("The unreceived landed cost must stay above zero.")
      const adjustment = await tx.financeShipmentCostAdjustment.create({
        data: {
          bookId: book.id,
          shipmentId: shipment.id,
          lineId: line.id,
          amountMinor: amount,
          reason,
          actorUserId,
        },
      })
      await tx.financeShipmentLine.update({
        where: { id: line.id },
        data: { adjustmentMinor: { increment: amount } },
      })
      await tx.financeShipment.update({
        where: { id: shipment.id },
        data: { revision: { increment: 1 } },
      })
      return { id: adjustment.id }
    },
  )
}

export async function adjustFinanceShipmentLineCost(
  db: PrismaClient,
  input: ShipmentCommand & {
    lineId: string
    amountMinor: string
    reason: string
  },
) {
  return db.$transaction(
    (tx) => adjustFinanceShipmentLineCostInTransaction(tx, input),
    TRANSACTION,
  )
}

/**
 * Receives actual quantities through one canonical received purchase (bill,
 * Inventory receipt, valuation and journal). Replays return the same receipt.
 */
export async function receiveFinanceShipmentInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceShipmentReceiveInput,
) {
  const {
    tenantId,
    actorUserId,
    bookId: _b,
    clientCommandId,
    ...payload
  } = input
  return financeDocumentCommand(
    tx,
    input,
    "RECEIVE_SHIPMENT",
    {
      ...payload,
      receivedAt: new Date(input.receivedAt),
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    },
    async (book) => {
      if (!input.lines.length || input.lines.length > MAX_RECEIPT_LINES)
        invalid(`Receive 1 to ${MAX_RECEIPT_LINES} lines at a time.`)
      const shipment = await lockShipment(tx, book, input.shipmentId)
      if (!OPEN.includes(shipment.status))
        throw new FinanceError(
          "CONFLICT",
          "Only a confirmed, open shipment can be received.",
        )
      const seenLines = new Set<string>()
      const seenSources = new Set<string>()
      const received = input.lines.map((entry) => {
        const line = shipment.lines.find((l) => l.id === entry.lineId)
        if (!line)
          throw new FinanceError("NOT_FOUND", "Shipment line not found.")
        if (seenLines.has(line.id))
          invalid("Receive each line once per arrival.")
        seenLines.add(line.id)
        if (!line.balanceSourceId || !line.enteredInventoryUnitId)
          throw new FinanceError(
            "CONFLICT",
            `Choose the stock item for “${line.description}” before receiving it.`,
          )
        if (seenSources.has(line.balanceSourceId))
          invalid(
            "Receive lines for the same stock item in separate arrivals.",
          )
        seenSources.add(line.balanceSourceId)
        const quantity = decimal(entry.quantity, "received quantity", false)
        const costMinor = shipmentReceiptCostMinor({
          landedMinor: landedMinorOf(line),
          receivedCostMinor: line.receivedCostMinor,
          expectedQuantity: line.expectedQuantity.toFixed(),
          receivedQuantity: line.receivedQuantity.toFixed(),
          quantity,
        })
        if (costMinor <= ZERO)
          invalid(`“${line.description}” has no landed cost to receive.`)
        return {
          entry,
          line,
          quantity,
          costMinor,
          balanceSourceId: line.balanceSourceId,
          enteredInventoryUnitId: line.enteredInventoryUnitId,
        }
      })
      const bill = await recordFinancePurchaseInTransaction(tx, {
        tenantId,
        actorUserId,
        bookId: book.id,
        clientCommandId: financePostingCommandId(
          clientCommandId,
          "shipment-receipt",
        ),
        supplierId: shipment.supplierId,
        storeId: shipment.storeId,
        description: `${shipment.name} arrival`,
        reference:
          input.reference?.trim() || shipment.reference || undefined,
        incurredAt: input.receivedAt,
        dueAt: input.dueAt,
        lines: received.map((r) => ({
          balanceSourceId: r.balanceSourceId,
          description: r.line.description,
          amountMinor: r.costMinor.toString(),
          enteredQuantity: r.quantity,
          enteredInventoryUnitId: r.enteredInventoryUnitId,
          expectedBalanceRevision: r.entry.expectedBalanceRevision,
          expectedConfigurationVersionId:
            r.entry.expectedConfigurationVersionId,
          categories: r.entry.categories,
        })),
      })
      const receipt = await tx.financeShipmentReceipt.create({
        data: {
          bookId: book.id,
          shipmentId: shipment.id,
          billId: bill.id,
          receivedAt: input.receivedAt,
          actorUserId,
        },
      })
      await tx.financeShipmentReceiptLine.createMany({
        data: received.map(({ line, quantity, costMinor }) => ({
          shipmentId: shipment.id,
          receiptId: receipt.id,
          lineId: line.id,
          quantity,
          costMinor,
        })),
      })
      for (const { line, quantity, costMinor } of received)
        await tx.financeShipmentLine.update({
          where: { id: line.id },
          data: {
            receivedQuantity: addExactDecimals(
              line.receivedQuantity.toFixed(),
              quantity,
            ),
            receivedCostMinor: { increment: costMinor },
          },
        })
      const after = new Map(
        received.map(({ line, quantity }) => [
          line.id,
          addExactDecimals(line.receivedQuantity.toFixed(), quantity),
        ]),
      )
      const complete = shipment.lines.every(
        (line) =>
          compareExactDecimals(
            after.get(line.id) ?? line.receivedQuantity.toFixed(),
            line.expectedQuantity.toFixed(),
          ) >= 0,
      )
      await tx.financeShipment.update({
        where: { id: shipment.id },
        data: {
          status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED",
          closedAt: complete ? input.receivedAt : undefined,
          revision: { increment: 1 },
        },
      })
      return { id: receipt.id }
    },
  )
}

export async function receiveFinanceShipment(
  db: PrismaClient,
  input: FinanceShipmentReceiveInput,
) {
  return db.$transaction(
    (tx) => receiveFinanceShipmentInTransaction(tx, input),
    TRANSACTION,
  )
}

/** Cancels an unreceived shipment, or closes a partial one with the rest not coming. */
export async function closeFinanceShipment(
  db: PrismaClient,
  input: ShipmentCommand & { reason: string },
) {
  return db.$transaction(
    (tx) =>
      financeDocumentCommand(
        tx,
        input,
        "CLOSE_SHIPMENT",
        {
          shipmentId: input.shipmentId,
          expectedRevision: input.expectedRevision,
          reason: input.reason,
        },
        async (book) => {
          const reason = text(input.reason, "reason", 400)
          const shipment = await lockShipment(
            tx,
            book,
            input.shipmentId,
            input.expectedRevision,
          )
          if (![...OPEN, "DRAFT"].includes(shipment.status))
            throw new FinanceError(
              "CONFLICT",
              "This shipment is already closed.",
            )
          await tx.financeShipment.update({
            where: { id: shipment.id },
            data: {
              status: shipment._count.receipts ? "CLOSED_SHORT" : "CANCELLED",
              closedAt: new Date(),
              closeReason: reason,
              revision: { increment: 1 },
            },
          })
          return { id: shipment.id }
        },
      ),
    TRANSACTION,
  )
}

/** One shipment with live costing; callers own the transaction. */
export async function readFinanceShipmentInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; shipmentId: string },
) {
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const shipment = await tx.financeShipment.findFirst({
    where: { id: input.shipmentId, bookId: book.id },
    include: {
      supplier: { select: { name: true } },
      rates: { orderBy: { currencyCode: "asc" } },
      lines: {
        orderBy: { position: "asc" },
        include: {
          balanceSource: {
            select: {
              id: true,
              onHandQuantity: true,
              variant: { select: { name: true } },
              product: {
                select: { catalogItem: { select: { name: true } } },
              },
            },
          },
        },
      },
      adjustments: { orderBy: { createdAt: "asc" } },
      receipts: {
        orderBy: { receivedAt: "asc" },
        include: {
          lines: true,
          bill: { select: { totalMinor: true, reference: true } },
        },
      },
      _count: { select: { receipts: true, adjustments: true } },
    },
  })
  if (!shipment) throw new FinanceError("NOT_FOUND", "Shipment not found.")
  const draft =
    shipment.status === "DRAFT" ? costingFor(shipment, book) : null
  const lines = shipment.lines.map((line) => {
    const live = draft?.lines.find((c) => c.position === line.position)
    const goodsMinor = live?.goodsMinor ?? line.goodsMinor ?? ZERO
    const freightMinor = live?.freightMinor ?? line.freightMinor ?? ZERO
    const landedMinor = goodsMinor + freightMinor + line.adjustmentMinor
    const expected = line.expectedQuantity.toFixed()
    const receivedQuantity = line.receivedQuantity.toFixed()
    const outstanding = subtractExactDecimals(expected, receivedQuantity)
    return {
      id: line.id,
      position: line.position,
      description: line.description,
      proposedName: line.proposedName,
      balanceSourceId: line.balanceSourceId,
      enteredInventoryUnitId: line.enteredInventoryUnitId,
      stockItem: line.balanceSource
        ? {
            name: line.balanceSource.product.catalogItem.name,
            variantName: line.balanceSource.variant.name,
          }
        : null,
      expectedQuantity: expected,
      receivedQuantity,
      outstandingQuantity:
        compareExactDecimals(outstanding, "0") > 0 ? outstanding : "0",
      sourceCurrencyCode: line.sourceCurrencyCode,
      sourceUnitPrice: line.sourceUnitPrice.toFixed(),
      freightOverrideMinor: line.freightOverrideMinor?.toString() ?? null,
      goodsMinor: goodsMinor.toString(),
      freightMinor: freightMinor.toString(),
      adjustmentMinor: line.adjustmentMinor.toString(),
      landedMinor: landedMinor.toString(),
      landedUnitMinor: shipmentLandedUnitMinor(landedMinor, expected),
      receivedCostMinor: line.receivedCostMinor.toString(),
      unreceivedCostMinor: (landedMinor - line.receivedCostMinor).toString(),
    }
  })
  const sum = (
    key:
      | "goodsMinor"
      | "freightMinor"
      | "adjustmentMinor"
      | "landedMinor"
      | "receivedCostMinor",
  ) => lines.reduce((total, l) => total + BigInt(l[key]), ZERO).toString()
  return {
    id: shipment.id,
    bookId: book.id,
    bookCurrencyCode: book.currencyCode,
    supplierId: shipment.supplierId,
    supplierName: shipment.supplier.name,
    storeId: shipment.storeId,
    name: shipment.name,
    reference: shipment.reference,
    expectedAt: shipment.expectedAt,
    status: shipment.status,
    revision: shipment.revision,
    freightAmount: shipment.freightAmount.toFixed(),
    freightCurrencyCode: shipment.freightCurrencyCode,
    rates: shipment.rates.map((r) => ({
      currencyCode: r.currencyCode,
      rate: r.rate.toFixed(),
      rateDate: r.rateDate,
      source: r.source,
    })),
    totals: {
      goodsMinor: sum("goodsMinor"),
      freightMinor: (
        draft?.freightMinor ??
        shipment.freightMinor ??
        ZERO
      ).toString(),
      adjustmentMinor: sum("adjustmentMinor"),
      landedMinor: sum("landedMinor"),
      receivedCostMinor: sum("receivedCostMinor"),
    },
    lines,
    adjustments: shipment.adjustments.map((a) => ({
      id: a.id,
      lineId: a.lineId,
      amountMinor: a.amountMinor.toString(),
      reason: a.reason,
      actorUserId: a.actorUserId,
      createdAt: a.createdAt,
    })),
    receipts: shipment.receipts.map((r) => ({
      id: r.id,
      billId: r.billId,
      receivedAt: r.receivedAt,
      totalMinor: r.bill.totalMinor.toString(),
      reference: r.bill.reference,
      lines: r.lines.map((l) => ({
        lineId: l.lineId,
        quantity: l.quantity.toFixed(),
        costMinor: l.costMinor.toString(),
      })),
    })),
    confirmedAt: shipment.confirmedAt,
    closedAt: shipment.closedAt,
    closeReason: shipment.closeReason,
    createdAt: shipment.createdAt,
  }
}

export async function getFinanceShipment(
  db: PrismaClient,
  input: FinanceActor & { bookId: string; shipmentId: string },
) {
  return db.$transaction((tx) => readFinanceShipmentInTransaction(tx, input))
}

export async function listFinanceShipments(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    status?: FinanceShipmentStatus
    supplierId?: string
    cursor?: string
    limit: number
  },
) {
  return db.$transaction(async (tx) => {
    await assertFinanceManager(tx, input)
    const book = await tx.financeBook.findFirst({
      where: { id: input.bookId, tenantId: input.tenantId },
      select: { id: true },
    })
    if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
    const rows = await tx.financeShipment.findMany({
      where: {
        bookId: book.id,
        status: input.status,
        supplierId: input.supplierId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      include: {
        supplier: { select: { name: true } },
        lines: {
          select: { expectedQuantity: true, receivedQuantity: true },
        },
      },
    })
    const page = rows.slice(0, input.limit)
    return {
      items: page.map((s) => ({
        id: s.id,
        name: s.name,
        reference: s.reference,
        status: s.status,
        supplierId: s.supplierId,
        supplierName: s.supplier.name,
        storeId: s.storeId,
        expectedAt: s.expectedAt,
        lineCount: s.lines.length,
        outstandingLineCount: s.lines.filter((l) =>
          l.receivedQuantity.lt(l.expectedQuantity),
        ).length,
        createdAt: s.createdAt,
      })),
      nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
    }
  })
}

/** Pure review of a new shipment's costing, supplier and Store; nothing is saved. */
export async function reviewFinanceShipmentDraftInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string } & FinanceShipmentDraft,
) {
  await assertFinanceManager(tx, input)
  const book = await tx.financeBook.findFirst({
    where: { id: input.bookId, tenantId: input.tenantId },
  })
  if (!book) throw new FinanceError("NOT_FOUND", "Financial book not found.")
  const { tenantId: _t, actorUserId: _a, bookId: _b, ...draft } = input
  const normalized = normalizeDraft(draft, book)
  await assertDraftScope(tx, input, book, draft, normalized.lines)
  const supplier = await tx.financeSupplierAccount.findFirstOrThrow({
    where: { id: draft.supplierId, bookId: book.id },
    select: { name: true },
  })
  const mapped = normalized.lines.flatMap((line) =>
    line.balanceSourceId ? [line.balanceSourceId] : [],
  )
  const sources = await tx.stockBalanceSource.findMany({
    where: { id: { in: mapped }, tenantId: input.tenantId },
    select: {
      id: true,
      variant: { select: { name: true } },
      product: { select: { catalogItem: { select: { name: true } } } },
    },
  })
  return {
    bookCurrencyCode: book.currencyCode,
    supplierName: supplier.name,
    name: normalized.name,
    freightAmount: normalized.freightAmount,
    freightCurrencyCode: normalized.freightCurrencyCode,
    freightMinor: normalized.costing.freightMinor.toString(),
    landedMinor: normalized.costing.landedMinor.toString(),
    rates: normalized.rates.map((rate) => ({
      currencyCode: rate.currencyCode,
      rate: rate.rate,
    })),
    lines: normalized.lines.map((line) => {
      const cost = normalized.costing.lines.find(
        (entry) => entry.position === line.position,
      )
      if (!cost) throw new FinanceError("CONFLICT", "Review the shipment again.")
      const source = sources.find((entry) => entry.id === line.balanceSourceId)
      return {
        position: line.position,
        description: line.description,
        itemName: source
          ? `${source.product.catalogItem.name} · ${source.variant.name}`
          : (line.proposedName ?? line.description),
        mapped: Boolean(source),
        expectedQuantity: line.expectedQuantity,
        sourceCurrencyCode: line.sourceCurrencyCode,
        sourceUnitPrice: line.sourceUnitPrice,
        goodsMinor: cost.goodsMinor.toString(),
        freightMinor: cost.freightMinor.toString(),
        landedMinor: cost.landedMinor.toString(),
        landedUnitMinor: shipmentLandedUnitMinor(
          cost.landedMinor,
          line.expectedQuantity,
        ),
      }
    }),
  }
}

/** Creates and confirms together, so a reviewed shipment is expected at once. */
export async function createExpectedFinanceShipmentInTransaction(
  tx: Prisma.TransactionClient,
  input: Command & FinanceShipmentDraft,
) {
  const created = await createFinanceShipmentInTransaction(tx, input)
  const shipment = await tx.financeShipment.findUniqueOrThrow({
    where: { id: created.id },
    select: { status: true, revision: true },
  })
  // A replayed create is already confirmed.
  if (shipment.status === "DRAFT")
    await confirmFinanceShipmentInTransaction(tx, {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      bookId: input.bookId,
      clientCommandId: financePostingCommandId(
        input.clientCommandId,
        "shipment-confirm",
      ),
      shipmentId: created.id,
      expectedRevision: shipment.revision,
    })
  return created
}

export type FinanceShipmentArrivalInput = FinanceActor & {
  bookId: string
  shipmentId: string
  receivedAt: Date
  lines: Array<{ lineId: string; quantity: string }>
}

/**
 * The exact receive command for what arrived, with the canonical bill and stock
 * review it will post. Balance and unit versions are read fresh, never supplied.
 */
export async function prepareFinanceShipmentArrivalInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceShipmentArrivalInput,
) {
  if (!input.lines.length || input.lines.length > MAX_RECEIPT_LINES)
    invalid(`Receive 1 to ${MAX_RECEIPT_LINES} lines at a time.`)
  const shipment = await readFinanceShipmentInTransaction(tx, input)
  if (!OPEN.includes(shipment.status))
    throw new FinanceError(
      "CONFLICT",
      "Only a confirmed, open shipment can be received.",
    )
  const lines: Array<{
    line: (typeof shipment.lines)[number]
    quantity: string
    costMinor: bigint
    command: FinanceShipmentReceiveInput["lines"][number]
  }> = []
  for (const entry of input.lines) {
    const line = shipment.lines.find((l) => l.id === entry.lineId)
    if (!line) throw new FinanceError("NOT_FOUND", "Shipment line not found.")
    if (lines.some((r) => r.line.id === line.id))
      invalid("Receive each line once per arrival.")
    if (!line.balanceSourceId || !line.enteredInventoryUnitId)
      throw new FinanceError(
        "CONFLICT",
        `Choose the stock item for “${line.description}” before receiving it.`,
      )
    const quantity = decimal(entry.quantity, "received quantity", false)
    const costMinor = shipmentReceiptCostMinor({
      landedMinor: BigInt(line.landedMinor),
      receivedCostMinor: BigInt(line.receivedCostMinor),
      expectedQuantity: line.expectedQuantity,
      receivedQuantity: line.receivedQuantity,
      quantity,
    })
    const [source, unit] = await Promise.all([
      tx.stockBalanceSource.findFirst({
        where: { id: line.balanceSourceId, tenantId: input.tenantId },
        select: { revision: true },
      }),
      tx.inventoryUnit.findFirst({
        where: { id: line.enteredInventoryUnitId },
        select: { configurationVersionId: true },
      }),
    ])
    if (!source || !unit)
      throw new FinanceError("NOT_FOUND", "Stock item not found.")
    lines.push({
      line,
      quantity,
      costMinor,
      command: {
        lineId: line.id,
        quantity,
        expectedBalanceRevision: source.revision,
        expectedConfigurationVersionId: unit.configurationVersionId,
        categories: [{ name: SHIPMENT_RECEIPT_CATEGORY }],
      },
    })
  }
  const review = await getFinancePurchaseRecordingReview(tx, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    bookId: input.bookId,
    supplierId: shipment.supplierId,
    storeId: shipment.storeId,
    description: `${shipment.name} arrival`,
    reference: shipment.reference ?? undefined,
    incurredAt: input.receivedAt,
    lines: lines.map((r) => ({
      balanceSourceId: r.line.balanceSourceId as string,
      description: r.line.description,
      amountMinor: r.costMinor.toString(),
      enteredQuantity: r.quantity,
      enteredInventoryUnitId: r.line.enteredInventoryUnitId as string,
      expectedBalanceRevision: r.command.expectedBalanceRevision,
      expectedConfigurationVersionId: r.command.expectedConfigurationVersionId,
      categories: r.command.categories,
    })),
  })
  return {
    shipment,
    review,
    lines: lines.map(({ line, quantity, costMinor }) => ({
      line,
      quantity,
      costMinor: costMinor.toString(),
    })),
    command: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      bookId: input.bookId,
      shipmentId: shipment.id,
      receivedAt: input.receivedAt,
      lines: lines.map((r) => r.command),
    },
  }
}
