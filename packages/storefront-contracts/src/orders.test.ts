import { expect, test } from "bun:test"
import {
  orderingFulfilmentMethods,
  publicLowStockCountsEnabled,
  storefrontOrderRequestSchema,
  storefrontRequestReferenceSchema,
} from "./orders"
import { publicCatalogOptionSchema } from "./resources"

test("delivery can start without a destination but preorder intent needs a date", () => {
  const request = {
    clientRequestId: "323ca9ec-5b2c-48c5-979a-b2bf883dab74",
    lines: [
      {
        itemId: "eggs",
        offeringId: "crate",
        quantity: "4",
        observedUnitPriceMinor: 450000,
      },
    ],
    customerName: "QA Customer",
    customerPhone: "08031234567",
    fulfilment: "delivery",
  }
  const parsed = storefrontOrderRequestSchema.parse(request)
  expect(parsed.deliveryAddress).toBeUndefined()
  // Old requests must retain their omission semantics for stable retry hashes.
  expect(parsed.lines[0]).not.toHaveProperty("preorder")
  const ahead = { ...request, lines: [{ ...request.lines[0], preorder: true }] }
  expect(storefrontOrderRequestSchema.safeParse(ahead).success).toBe(false)
  expect(
    storefrontOrderRequestSchema.safeParse({
      ...ahead,
      preferredDate: "2026-11-05",
    }).success,
  ).toBe(true)
  expect(
    storefrontOrderRequestSchema.safeParse({
      ...request,
      preferredDate: "2026-11-05",
    }).success,
  ).toBe(false)
  expect(
    storefrontOrderRequestSchema.safeParse({
      ...request,
      deliveryAddress: "<script>bad</script>",
    }).success,
  ).toBe(false)
})

test("a merchant can disable all fulfilment rather than silently enabling pickup", () => {
  expect(
    orderingFulfilmentMethods(
      design("1.2.0", {
        version: 2,
        settings: { "offer-pickup": false, "offer-delivery": false },
      }),
    ),
  ).toEqual([])
  expect(
    orderingFulfilmentMethods(
      design("1.2.0", {
        version: 2,
        settings: { "offer-pickup": false, "offer-delivery": true },
      }),
    ),
  ).toEqual(["delivery"])
})

const design = (
  version: string,
  header: { version: number; settings: Record<string, unknown> } | null,
) => ({
  template: { key: "commerce-studio", version },
  pages: [
    {
      key: "home",
      sections: header
        ? [{ type: "commerce-studio-header", ...header }]
        : [{ type: "commerce-studio-hero", version: 2, settings: {} }],
    },
  ],
})

test("low-stock counts need an explicit opt-in on an exact 1.2.0 header", () => {
  const on = { "show-low-stock-count": true }
  expect(
    publicLowStockCountsEnabled(design("1.2.0", { version: 2, settings: on })),
  ).toBe(true)
  // Default off, absent or truthy-but-not-true values.
  for (const settings of [
    { "show-low-stock-count": false },
    {},
    { "show-low-stock-count": "true" },
    { "show-low-stock-count": 1 },
  ])
    expect(
      publicLowStockCountsEnabled(design("1.2.0", { version: 2, settings })),
    ).toBe(false)
  // Older pins, a v1 header or another template can't opt in, even if forged.
  expect(
    publicLowStockCountsEnabled(design("1.1.0", { version: 2, settings: on })),
  ).toBe(false)
  expect(
    publicLowStockCountsEnabled(design("1.0.0", { version: 1, settings: on })),
  ).toBe(false)
  expect(
    publicLowStockCountsEnabled(design("1.2.0", { version: 1, settings: on })),
  ).toBe(false)
  expect(
    publicLowStockCountsEnabled({
      ...design("1.2.0", { version: 2, settings: on }),
      template: { key: "market-hall", version: "1.2.0" },
    }),
  ).toBe(false)
  for (const malformed of [
    null,
    undefined,
    "x",
    {},
    { template: {} },
    design("1.2.0", null),
  ])
    expect(publicLowStockCountsEnabled(malformed)).toBe(false)
})

test("public low-stock counts are bounded exact decimals", () => {
  const option = {
    id: "o",
    name: "Pair",
    priceMinor: 100,
    currencyCode: "NGN",
    availability: null,
    stock: "low_stock",
  }
  for (const value of ["1", "2.5", "999999", "0.000001"])
    expect(
      publicCatalogOptionSchema.safeParse({
        ...option,
        lowStockQuantity: value,
      }).success,
    ).toBe(true)
  for (const value of ["1000000", "-1", "1e3", "01", "1.0000001", "", 3])
    expect(
      publicCatalogOptionSchema.safeParse({
        ...option,
        lowStockQuantity: value,
      }).success,
    ).toBe(false)
})

test("request references normalize the receipt format and refuse anything else", () => {
  for (const [input, output] of [
    ["R-7KQ2MX", "R-7KQ2MX"],
    ["r-7kq2mx", "R-7KQ2MX"],
    [" s 7kq 2mx ", "S-7KQ2MX"],
    ["R7KQ2MX", "R-7KQ2MX"],
  ] as const)
    expect(storefrontRequestReferenceSchema.parse(input)).toBe(output)
  for (const input of [
    "",
    "R-7KQ2M",
    "R-7KQ2MXX",
    "X-7KQ2MX",
    // 0, 1, I, L and O are never issued.
    "R-0KQ2MX",
    "R-IKQ2MX",
    "R-7KQ2M%",
    "https://shop.test/R-7KQ2MX",
    "R-7KQ2MX' OR 1=1",
    123456,
    null,
  ])
    expect(storefrontRequestReferenceSchema.safeParse(input).success).toBe(
      false,
    )
})
