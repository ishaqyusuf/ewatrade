import { expect, test } from "bun:test"
import { renderWhatsAppActionReviewBody } from "@ewatrade/assistant/channels/action-review"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import {
  type ChannelProposalSource,
  projectChannelProposalReview,
} from "./channel-proposal-review"
import {
  shipmentCostReviewLines,
  shipmentCreateReviewLines,
  shipmentReceiveReviewLines,
} from "./general-shipments"
import { proposalDigest } from "./proposal-security"

const now = Date.parse("2026-11-10T12:00:00.000Z")
const scope = {
  businessName: "Alhaq Gadgets",
  storeName: "Main shop",
  currencyCode: "NGN",
}
function projected(payload: GeneralAction, lines: string[]) {
  const row: ChannelProposalSource = {
    id: "proposal",
    revision: 1,
    payloadHash: proposalDigest(payload),
    status: "PENDING",
    action: payload.action,
    actionVersion: 1,
    expiresAt: new Date(now + 300000),
  }
  return projectChannelProposalReview(
    row,
    {
      id: row.id,
      revision: row.revision,
      payload,
      status: "PENDING",
      expiresAt: row.expiresAt.toISOString(),
      receipt: null,
      approvalToken: "server-only-approval",
      review: lines,
    },
    scope,
    now,
  )
}
function body(result: ReturnType<typeof projectChannelProposalReview>) {
  if (result.kind !== "review") throw Error("Expected a native review")
  const rendered = renderWhatsAppActionReviewBody(result.review, { now })
  if (rendered.kind !== "review") throw Error("Expected a rendered review")
  return rendered.body
}
const charger = {
  id: "line-charger",
  position: 1,
  description: "Oraimo chargers",
  proposedName: null,
  balanceSourceId: "source-charger",
  enteredInventoryUnitId: "unit-piece",
  stockItem: { name: "Oraimo 20W Charger", variantName: "Default" },
  expectedQuantity: "200",
  receivedQuantity: "0",
  outstandingQuantity: "200",
  landedMinor: "123716600",
  landedUnitMinor: "618583.000000",
  receivedCostMinor: "0",
  unreceivedCostMinor: "123716600",
}
const shipment = {
  id: "shipment",
  name: "SH-014",
  supplierName: "Shenzhen Hongda",
  bookCurrencyCode: "NGN",
  revision: 2,
  status: "EXPECTED",
  lines: [charger],
}

test("shipment_create shows each line's landed cost, the rate, freight and total", () => {
  const payload = generalActionSchema.parse({
    action: "shipment_create",
    bookId: "book",
    supplierId: "supplier",
    name: "SH-014",
    freightAmount: "400.00",
    freightCurrencyCode: "USD",
    rates: [{ currencyCode: "USD", rate: "1580" }],
    lines: [
      {
        description: "Oraimo chargers",
        balanceSourceId: "source-charger",
        enteredInventoryUnitId: "unit-piece",
        expectedQuantity: "200",
        sourceCurrencyCode: "USD",
        sourceUnitPrice: "3.20",
      },
    ],
  })
  const lines = shipmentCreateReviewLines({
    bookCurrencyCode: "NGN",
    supplierName: "Shenzhen Hongda",
    name: "SH-014",
    freightAmount: parseExactDecimal("400"),
    freightCurrencyCode: "USD",
    freightMinor: "63200000",
    landedMinor: "164320000",
    rates: [{ currencyCode: "USD", rate: "1580" }],
    lines: [
      {
        position: 1,
        description: "Oraimo chargers",
        itemName: "Oraimo 20W Charger · Default",
        mapped: true,
        expectedQuantity: parseExactDecimal("200"),
        sourceCurrencyCode: "USD",
        sourceUnitPrice: parseExactDecimal("3.2"),
        goodsMinor: "101120000",
        freightMinor: "63200000",
        landedMinor: "164320000",
        landedUnitMinor: "821600.000000",
      },
    ],
  })
  const text = body(projected(payload, lines))
  expect(text).toContain("🧾 Review shipment")
  expect(text).toContain("SH-014 · from Shenzhen Hongda")
  expect(text).toContain("200 at USD 3.2")
  expect(text).toContain("₦8,216.00 each")
  expect(text).toContain("1 USD = 1580 NGN")
  expect(text).toContain("Freight USD 400 = ₦632,000.00, split by value.")
  expect(text).toContain("Nothing is added to stock")
  for (const changed of [
    lines.map((line) => line.replace("200 at", "20 at")),
    lines.filter((line) => !line.startsWith("Rates")),
    lines.map((line) => line.replace("1 USD = 1580", "1 USD = 1500")),
    lines.slice(0, -1),
  ])
    expect(projected(payload, changed).kind).toBe("app_review")
})

test("shipment_receive shows what arrived, stock before → after and the unpaid bill", () => {
  const payload = generalActionSchema.parse({
    action: "shipment_receive",
    bookId: "book",
    shipmentId: "shipment",
    lines: [{ lineId: "line-charger", quantity: "180" }],
  })
  const lines = shipmentReceiveReviewLines({
    shipment,
    lines: [{ line: charger, quantity: "180", costMinor: "111344940" }],
    review: {
      currencyCode: "NGN",
      totalMinor: "111344940",
      goods: [
        {
          stock: { before: "12", after: "192", balanceUnitName: "Piece" },
        },
      ],
    },
  } as unknown as Parameters<typeof shipmentReceiveReviewLines>[0])
  const text = body(projected(payload, lines))
  expect(text).toContain("🧾 Receive shipment")
  expect(text).toContain("180 of 200 still expected")
  expect(text).toContain("Stock 12 → 192 Piece")
  expect(text).toContain("Bill to Shenzhen Hongda: ₦1,113,449.40 · unpaid.")
  expect(text).toContain("Still expected: 20 Oraimo 20W Charger · Default.")
  expect(text).toContain("No payment is recorded.")
  for (const changed of [
    lines.filter((line) => !line.startsWith("Stock")),
    lines.filter((line) => !line.startsWith("Bill to")),
    lines.map((line) => line.replace("180 of", "200 of")),
  ])
    expect(projected(payload, changed).kind).toBe("app_review")
})

test("shipment_cost_adjust shows the cost on what is still expected and what keeps its cost", () => {
  const payload = generalActionSchema.parse({
    action: "shipment_cost_adjust",
    bookId: "book",
    shipmentId: "shipment",
    lineId: "line-charger",
    amountMinor: "600000",
    reason: "customs",
  })
  if (payload.action !== "shipment_cost_adjust") throw Error("Adjust expected")
  const line = {
    ...charger,
    receivedQuantity: "180",
    outstandingQuantity: "20",
    unreceivedCostMinor: "12371660",
  }
  const lines = shipmentCostReviewLines(payload, {
    shipment: { ...shipment, lines: [line] },
    line,
    unreceived: BigInt(12371660),
    after: BigInt(12971660),
  } as unknown as Parameters<typeof shipmentCostReviewLines>[1])
  const text = body(projected(payload, lines))
  expect(text).toContain("🧾 Cost change")
  expect(text).toContain("20 still expected")
  expect(text).toContain("+₦6,000.00 customs · ₦300.00 each")
  expect(text).toContain("Landed ₦6,185.83 → ₦6,485.83 each")
  expect(text).toContain("The 180 already received keep their cost.")
  const refund = generalActionSchema.parse({
    ...payload,
    amountMinor: "-600000",
  })
  expect(projected(refund, lines).kind).toBe("app_review")
})
