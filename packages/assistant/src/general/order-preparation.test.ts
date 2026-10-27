import { expect, test } from "bun:test"
import {
  type OrderCandidate,
  isCatalogOrderPreparationIntent,
  orderPreparationRequestSchema,
  resolveOrderPreparation,
} from "./order-preparation"

test("explicit new catalog orders route to preparation while existing-record and simple-sale requests keep their owners", () => {
  expect(
    isCatalogOrderPreparationIntent(
      "New order, already paid and delivered: 10 crates of big eggs",
    ),
  ).toBe(true)
  expect(
    isCatalogOrderPreparationIntent("Prepare an order: 20 small blue shirts"),
  ).toBe(true)
  for (const text of [
    "Sales receipt",
    "Find order ORD-001",
    "Cancel order ORD-001",
    "Refund the order",
  ])
    expect(isCatalogOrderPreparationIntent(text)).toBe(false)
})
const candidate = (patch: Partial<OrderCandidate> = {}): OrderCandidate => ({
  catalogItemId: "eggs",
  itemName: "Eggs",
  variantId: "big",
  offeringId: "big-crate",
  unitName: "Crate",
  canonical: false,
  choices: [{ optionName: "Size", value: "Big" }],
  active: true,
  available: true,
  fixedPriceMinor: 600000,
  configurationVersionId: "version",
  stock: { key: "big-pool", available: "72300", factor: "30" },
  ...patch,
})
const request = (patch: Record<string, unknown> = {}) =>
  orderPreparationRequestSchema.parse({
    lines: [
      {
        name: "Eggs",
        quantity: "10",
        unitName: "Crate",
        choices: [{ optionName: "Size", value: "Big" }],
      },
    ],
    ...patch,
  })
function firstLine(input: ReturnType<typeof request>) {
  const line = input.lines[0]
  if (!line) throw Error("Order fixture needs its first line")
  return line
}
const search = (values: OrderCandidate[], complete = true) => [
  { name: "Eggs", complete, candidates: values },
]
test("exact option/unit resolves stored prices, stock and separate charges without guessing payment method", () => {
  const input = request({
    payment: { paid: true },
    delivered: true,
    extraCharges: [{ name: "Delivery", amount: "1000.15" }],
  })
  const draft = resolveOrderPreparation(input, search([candidate()]))
  expect(draft.lines[0]?.offeringId).toBe("big-crate")
  expect(draft.totalMinor).toBe(6100015)
  expect(input.payment?.method).toBeUndefined()
  expect(draft.issues).toEqual([])
})
test("two requested selling units share one stock allocation; shortages never become missing items", () => {
  const input = request({
    lines: [...request().lines, { ...firstLine(request()), quantity: "8" }],
  })
  const draft = resolveOrderPreparation(
    input,
    search([
      candidate({ stock: { key: "pool", available: "500", factor: "30" } }),
    ]),
  )
  expect(draft.lines.map((line) => line.status)).toEqual([
    "insufficient_stock",
    "insufficient_stock",
  ])
  expect(draft.totalMinor).toBeNull()
})
test("incomplete search, archived and unavailable choices refuse order-only substitution", () => {
  expect(
    resolveOrderPreparation(request(), search([], false)).lines[0]?.status,
  ).toBe("incomplete_search")
  const input = request()
  firstLine(input).disposition = "order_only"
  expect(
    resolveOrderPreparation(input, search([candidate({ active: false })]))
      .lines[0]?.status,
  ).toBe("archived")
  expect(
    resolveOrderPreparation(input, search([candidate({ available: false })]))
      .lines[0]?.status,
  ).toBe("unavailable")
  const unconfigured = resolveOrderPreparation(input, [
    {
      name: "Eggs",
      complete: true,
      candidates: [],
      catalogItems: [{ id: "eggs", name: "Eggs" }],
    },
  ])
  expect(unconfigured.lines[0]?.status).toBe("unavailable")
})
test("missing items remain in the same request; explicit order-only prices use exact money", () => {
  const input = request()
  expect(resolveOrderPreparation(input, search([])).lines[0]?.status).toBe(
    "missing_item",
  )
  firstLine(input).disposition = "order_only"
  firstLine(input).unitPrice = "100.15"
  const draft = resolveOrderPreparation(input, search([]))
  expect(draft.lines[0]?.status).toBe("order_only")
  expect(draft.totalMinor).toBe(100150)
  expect(draft.lines[0]?.offeringId).toBeUndefined()
})
test("sparse choices are not interchangeable and same-name candidates need resolution", () => {
  const input = request()
  firstLine(input).choices = [{ optionName: "Size", value: "Small" }]
  expect(
    resolveOrderPreparation(input, search([candidate()])).lines[0]?.status,
  ).toBe("missing_choice")
  expect(
    resolveOrderPreparation(
      request(),
      search([candidate(), candidate({ offeringId: "duplicate" })]),
    ).lines[0]?.status,
  ).toBe("ambiguous")
})
test("historical stock effects and unknown charges stay visible and block a misleading complete total", () => {
  const input = request({
    stockAlreadyRecorded: true,
    delivered: true,
    extraCharges: [{ name: "Delivery" }],
  })
  const draft = resolveOrderPreparation(input, search([candidate()]))
  expect(draft.issues.length).toBe(2)
  expect(draft.totalMinor).toBeNull()
  expect(
    orderPreparationRequestSchema.safeParse({ ...input, tenantId: "foreign" })
      .success,
  ).toBe(false)
})

test("partial delivery remains an explicit manual continuation, never a full stock deduction", () => {
  const input = request({
    partialDelivery: true,
    lines: [{ ...firstLine(request()), deliveredQuantity: "3" }],
  })
  const draft = resolveOrderPreparation(input, search([candidate()]))
  expect(firstLine(input).deliveredQuantity?.toString()).toBe("3")
  expect(draft.totalMinor).toBeNull()
  expect(draft.issues.some((issue) => issue.includes("Partial delivery"))).toBe(
    true,
  )
})

test("order-priced offerings accept an explicit agreed price without overriding fixed prices", () => {
  const input = request()
  firstLine(input).unitPrice = "100.15"
  const draft = resolveOrderPreparation(
    input,
    search([
      candidate({ fixedPriceMinor: null, pricingPolicy: "order_total" }),
    ]),
  )
  expect(draft.totalMinor).toBe(100150)
  expect(draft.lines[0]?.pricingPolicy).toBe("order_total")
  expect(
    resolveOrderPreparation(input, search([candidate()])).lines[0]?.status,
  ).toBe("price_needed")
})
