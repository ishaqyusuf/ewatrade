import { createHash } from "node:crypto"
import {
  type GeneralAction,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import {
  adjustFinanceShipmentLineCostInTransaction,
  createExpectedFinanceShipmentInTransaction,
  financePurchaseRecordingReviewDigest,
  prepareFinanceShipmentArrivalInTransaction,
  readFinanceShipmentInTransaction,
  receiveFinanceShipmentInTransaction,
  reviewFinanceShipmentDraftInTransaction,
  shipmentLandedUnitMinor,
} from "@ewatrade/db/queries"
import {
  compareExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"

type Create = Extract<GeneralAction, { action: "shipment_create" }>
type Receive = Extract<GeneralAction, { action: "shipment_receive" }>
type Adjust = Extract<GeneralAction, { action: "shipment_cost_adjust" }>
type DraftReview = Awaited<
  ReturnType<typeof reviewFinanceShipmentDraftInTransaction>
>
type Arrival = Awaited<
  ReturnType<typeof prepareFinanceShipmentArrivalInTransaction>
>
type Shipment = Awaited<ReturnType<typeof readFinanceShipmentInTransaction>>

export const SHIPMENT_RATE_SOURCE = "Stated by the owner in the assistant"

function actor(ctx: GeneralTransactionContext) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return { scope, tenantId: scope.tenantId, actorUserId: scope.userId }
}
/** Whole minor units of a six-place landed unit cost; floored, never rounded up. */
function unitMoney(unitMinor: string, currencyCode: string) {
  return generalMoney(unitMinor.split(".")[0] ?? "0", currencyCode)
}
function itemName(line: Shipment["lines"][number]) {
  return line.stockItem
    ? `${line.stockItem.name} · ${line.stockItem.variantName}`
    : (line.proposedName ?? line.description)
}
function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function draftInput(ctx: GeneralTransactionContext, p: Create) {
  const { scope, ...owner } = actor(ctx)
  const ratesAt = new Date(p.ratesAt ?? Date.now())
  return {
    ...owner,
    bookId: p.bookId,
    supplierId: p.supplierId,
    storeId: scope.storeId,
    name: p.name,
    reference: p.reference,
    freightAmount: p.freightAmount,
    freightCurrencyCode: p.freightCurrencyCode,
    rates: p.rates.map((rate) => ({
      ...rate,
      rateDate: ratesAt,
      source: SHIPMENT_RATE_SOURCE,
    })),
    lines: p.lines,
  }
}
export function shipmentCreateReviewLines(r: DraftReview) {
  const money = (minor: string) => generalMoney(minor, r.bookCurrencyCode)
  return [
    `${r.name} · from ${r.supplierName}`,
    ...r.lines.map(
      (line) =>
        `${line.itemName} · ${line.expectedQuantity} at ${line.sourceCurrencyCode} ${line.sourceUnitPrice} · ${money(line.goodsMinor)} + ${money(line.freightMinor)} freight = ${money(line.landedMinor)} · ${unitMoney(line.landedUnitMinor, r.bookCurrencyCode)} each${line.mapped ? "" : " · new item, choose its stock item in the app before it arrives"}`,
    ),
    `Rates: ${r.rates.length ? r.rates.map((rate) => `1 ${rate.currencyCode} = ${rate.rate} ${r.bookCurrencyCode}`).join(", ") : "none"}.`,
    `Freight ${r.freightCurrencyCode} ${r.freightAmount} = ${money(r.freightMinor)}, split by value.`,
    `Landed total ${money(r.landedMinor)}.`,
    "Confirming expects the shipment. Nothing is added to stock and no bill or payment is recorded until it arrives.",
  ]
}
export const shipmentCreate = {
  stale: "The supplier, rates, stock items or Book changed. Review again.",
  unavailable: "This shipment can't be prepared now.",
  async prepare(_ctx, p) {
    return { ...p, ratesAt: p.ratesAt ?? new Date().toISOString() }
  },
  async validate(ctx, p) {
    const r = await reviewFinanceShipmentDraftInTransaction(
      ctx.db,
      draftInput(ctx, p),
    )
    return { id: p.supplierId, revision: digest(r) }
  },
  async review(ctx, p) {
    const r = await reviewFinanceShipmentDraftInTransaction(
      ctx.db,
      draftInput(ctx, p),
    )
    return {
      target: { id: p.supplierId, revision: digest(r) },
      lines: shipmentCreateReviewLines(r),
    }
  },
  async prepareExecution(ctx, p) {
    const input = draftInput(ctx, p)
    const r = await reviewFinanceShipmentDraftInTransaction(ctx.db, input)
    return {
      target: { id: p.supplierId, revision: digest(r) },
      execute: async (key) => {
        const created = await createExpectedFinanceShipmentInTransaction(
          ctx.db,
          { ...input, clientCommandId: key },
        )
        return {
          kind: "finance_shipment" as const,
          recordId: created.id,
          bookId: p.bookId,
          title: "Shipment expected",
          detail: `${r.name} · ${r.supplierName} · ${r.lines.length} line(s) · ${generalMoney(r.landedMinor, r.bookCurrencyCode)} landed. Nothing is in stock until it arrives.`,
        }
      },
    }
  },
  async execute() {
    throw Error("A shipment needs its locked review preparation.")
  },
} satisfies GeneralActionAdapter<Create>

function arrivalInput(ctx: GeneralTransactionContext, p: Receive) {
  const { scope: _scope, ...owner } = actor(ctx)
  return {
    ...owner,
    bookId: p.bookId,
    shipmentId: p.shipmentId,
    receivedAt: new Date(p.receivedAt ?? Date.now()),
    lines: p.lines,
  }
}
function stillExpected(arrival: Arrival) {
  return arrival.shipment.lines.flatMap((line) => {
    const now = arrival.lines.find((entry) => entry.line.id === line.id)
    const left = now
      ? subtractExactDecimals(line.outstandingQuantity, now.quantity)
      : line.outstandingQuantity
    return compareExactDecimals(left, "0") > 0
      ? [`${left} ${itemName(line)}`]
      : []
  })
}
export function shipmentReceiveReviewLines(a: Arrival) {
  const money = (minor: string) => generalMoney(minor, a.review.currencyCode)
  const left = stillExpected(a)
  return [
    `${a.shipment.name} · from ${a.shipment.supplierName}`,
    ...a.lines.flatMap(({ line, quantity, costMinor }, index) => {
      const stock = a.review.goods[index]?.stock
      return [
        `${itemName(line)} · ${quantity} of ${line.outstandingQuantity} still expected · ${money(costMinor)} at ${unitMoney(line.landedUnitMinor, a.review.currencyCode)} each`,
        stock
          ? `Stock ${stock.before} → ${stock.after} ${stock.balanceUnitName}`
          : "Stock change unavailable",
      ]
    }),
    `Bill to ${a.shipment.supplierName}: ${money(a.review.totalMinor)} · unpaid.`,
    left.length ? `Still expected: ${left.join(", ")}.` : "Nothing else is expected.",
    "Adds the stock and posts one unpaid supplier bill at landed cost. No payment is recorded.",
  ]
}
function arrivalTarget(a: Arrival) {
  return {
    id: a.shipment.id,
    revision: `${a.shipment.revision}:${financePurchaseRecordingReviewDigest(a.review)}`,
  }
}
export const shipmentReceive = {
  stale:
    "The shipment, its costs or the stock changed since this review. Review again.",
  unavailable: "This shipment can't be received now.",
  async prepare(_ctx, p) {
    return { ...p, receivedAt: p.receivedAt ?? new Date().toISOString() }
  },
  async validate(ctx, p) {
    return arrivalTarget(
      await prepareFinanceShipmentArrivalInTransaction(
        ctx.db,
        arrivalInput(ctx, p),
      ),
    )
  },
  async review(ctx, p) {
    const a = await prepareFinanceShipmentArrivalInTransaction(
      ctx.db,
      arrivalInput(ctx, p),
    )
    return { target: arrivalTarget(a), lines: shipmentReceiveReviewLines(a) }
  },
  async prepareExecution(ctx, p) {
    const a = await prepareFinanceShipmentArrivalInTransaction(
      ctx.db,
      arrivalInput(ctx, p),
    )
    return {
      target: arrivalTarget(a),
      execute: async (key) => {
        await receiveFinanceShipmentInTransaction(ctx.db, {
          ...a.command,
          clientCommandId: key,
        })
        const left = stillExpected(a)
        return {
          kind: "finance_shipment" as const,
          recordId: a.shipment.id,
          bookId: p.bookId,
          title: left.length ? "Shipment partly received" : "Shipment received",
          detail: `${a.shipment.name} · bill ${generalMoney(a.review.totalMinor, a.review.currencyCode)} unpaid.${left.length ? ` Still expected: ${left.join(", ")}.` : ""}`,
        }
      },
    }
  },
  async execute() {
    throw Error("A shipment arrival needs its locked review preparation.")
  },
} satisfies GeneralActionAdapter<Receive>

async function adjustment(ctx: GeneralTransactionContext, p: Adjust) {
  const owner = actor(ctx)
  const shipment = await readFinanceShipmentInTransaction(ctx.db, {
    tenantId: owner.tenantId,
    actorUserId: owner.actorUserId,
    bookId: p.bookId,
    shipmentId: p.shipmentId,
  })
  const line = shipment.lines.find((entry) => entry.id === p.lineId)
  if (
    !line ||
    !["EXPECTED", "PARTIALLY_RECEIVED"].includes(shipment.status) ||
    compareExactDecimals(line.outstandingQuantity, "0") <= 0
  )
    throw Error("Only a line still expected on an open shipment takes a cost.")
  const unreceived = BigInt(line.unreceivedCostMinor)
  const after = unreceived + BigInt(p.amountMinor)
  if (after <= BigInt(0))
    throw Error("The cost still to come must stay above zero.")
  return { owner, shipment, line, unreceived, after }
}
export function shipmentCostReviewLines(
  p: Adjust,
  a: Awaited<ReturnType<typeof adjustment>>,
) {
  const currency = a.shipment.bookCurrencyCode
  const outstanding = a.line.outstandingQuantity
  const amount = BigInt(p.amountMinor)
  const absolute = amount < BigInt(0) ? -amount : amount
  const each = (minor: bigint) =>
    unitMoney(shipmentLandedUnitMinor(minor, outstanding), currency)
  return [
    `${a.shipment.name} · from ${a.shipment.supplierName}`,
    `${itemName(a.line)} · ${outstanding} still expected`,
    `${amount < BigInt(0) ? "−" : "+"}${generalMoney(absolute.toString(), currency)} ${p.reason} · ${each(absolute)} each`,
    `Landed ${each(a.unreceived)} → ${each(a.after)} each for what is still expected.`,
    compareExactDecimals(a.line.receivedQuantity, "0") > 0
      ? `The ${a.line.receivedQuantity} already received keep their cost. Past sales don't change.`
      : "Past sales don't change.",
  ]
}
export const shipmentCostAdjust = {
  stale: "The shipment changed since this review. Review again.",
  unavailable: "This shipment line can't take a cost now.",
  async validate(ctx, p) {
    const a = await adjustment(ctx, p)
    return { id: a.shipment.id, revision: String(a.shipment.revision) }
  },
  async review(ctx, p) {
    const a = await adjustment(ctx, p)
    return {
      target: { id: a.shipment.id, revision: String(a.shipment.revision) },
      lines: shipmentCostReviewLines(p, a),
    }
  },
  async prepareExecution(ctx, p) {
    const a = await adjustment(ctx, p)
    return {
      target: { id: a.shipment.id, revision: String(a.shipment.revision) },
      execute: async (key) => {
        await adjustFinanceShipmentLineCostInTransaction(ctx.db, {
          tenantId: a.owner.tenantId,
          actorUserId: a.owner.actorUserId,
          bookId: p.bookId,
          clientCommandId: key,
          shipmentId: p.shipmentId,
          expectedRevision: a.shipment.revision,
          lineId: p.lineId,
          amountMinor: p.amountMinor,
          reason: p.reason,
        })
        return {
          kind: "finance_shipment" as const,
          recordId: a.shipment.id,
          bookId: p.bookId,
          title: "Shipment cost recorded",
          detail: `${a.shipment.name} · ${generalMoney(p.amountMinor, a.shipment.bookCurrencyCode)} ${p.reason} on ${a.line.outstandingQuantity} ${itemName(a.line)}.`,
        }
      },
    }
  },
  async execute() {
    throw Error("A shipment cost needs its locked review preparation.")
  },
} satisfies GeneralActionAdapter<Adjust>
