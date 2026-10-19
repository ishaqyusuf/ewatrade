import { expect, test } from "bun:test"
import { offlineReplaySchema } from "../../../../apps/api/src/schemas/offline"
import { CatalogError } from "./catalog-errors"
import { offlineCommandEnvelopeHash } from "./offline-commands"
import {
  type BlankQuickSaleCorrection,
  deriveBlankQuickSaleReplacement,
} from "./offline-quick-sale-correction-input"

function original() {
  return {
    clientCommandId: "original-command",
    createdAtClient: new Date("2026-10-17T08:00:00.000Z"),
    dependencyClientIds: ["dependency-command"],
    eventVersion: 1,
    payload: {
      kind: "commercial_order" as const,
      customerMode: "contact_only" as const,
      customerId: "customer-original",
      customerName: "Original customer",
      customerPhone: "+2348000000000",
      customerEmail: "original@example.test",
      deliveryDueAt: new Date("2026-10-18T08:00:00.000Z"),
      discountMinor: 10,
      taxMinor: 20,
      fulfillNow: true,
      notes: "Original notes",
      lines: [
        { custom: "quick_sale" as const, amountMinor: 501 },
        {
          custom: "quick_sale" as const,
          amountMinor: 502,
          description: " \t\n ",
        },
        {
          custom: "quick_sale" as const,
          amountMinor: 503,
          description: " Already described ",
        },
        { custom: "additional_cost" as const, amountMinor: 504 },
        {
          offeringId: "offering-original",
          quantity: "1.25",
          expectedBalanceRevision: 7,
          expectedConfigurationVersionId: "configuration-original",
          expectedFixedPriceMinor: 505,
          enteredTotalMinor: 506,
          approvedQuotePriceMinor: 507,
          note: "Original catalog note",
        },
      ],
      initialPayment: {
        amountMinor: 900,
        clientPaymentId: "original-payment",
        moneyAccountId: "original-account",
        method: "bank_transfer" as const,
        note: "Original payment note",
        reference: "Original payment reference",
      },
    },
  }
}

function correction(): BlankQuickSaleCorrection {
  return {
    replacementClientCommandId: "replacement-command",
    replacementClientPaymentId: "replacement-payment",
    descriptions: [
      { lineIndex: 1, description: "  Second sale  " },
      { lineIndex: 0, description: "  First sale  " },
    ],
  }
}

test("only exact blank Quick sale descriptions and fresh identities change; all other sale facts survive", () => {
  const saved = original()
  // customerMode and catalog/payment notes are public-schema-supported facts
  // beyond the helper's narrower internal payload type.
  expect(
    offlineReplaySchema.safeParse({
      deviceId: "original-device",
      commands: [saved],
    }).success,
  ).toBe(true)
  const before = structuredClone(saved)
  const hash = offlineCommandEnvelopeHash(saved)
  const result = deriveBlankQuickSaleReplacement(saved, correction())
  const expected = structuredClone(saved)
  expected.clientCommandId = "replacement-command"
  expected.payload.initialPayment.clientPaymentId = "replacement-payment"
  expected.payload.lines[0] = {
    custom: "quick_sale",
    amountMinor: 501,
    description: "First sale",
  }
  expected.payload.lines[1] = {
    custom: "quick_sale",
    amountMinor: 502,
    description: "Second sale",
  }
  expect(result).toEqual(expected)
  expect(saved).toEqual(before)
  expect(offlineCommandEnvelopeHash(saved)).toBe(hash)
  expect(offlineCommandEnvelopeHash(result)).not.toBe(hash)
  expect(result.createdAtClient).toBeInstanceOf(Date)
  expect(Reflect.get(result.payload, "deliveryDueAt")).toBeInstanceOf(Date)
})

test("replacement owns detached dates, dependencies, lines and payment; caller inputs stay immutable", () => {
  const saved = original()
  const patch = correction()
  const before = structuredClone(saved)
  const beforePatch = structuredClone(patch)
  const result = deriveBlankQuickSaleReplacement(saved, patch)
  result.createdAtClient.setUTCFullYear(2030)
  const due = Reflect.get(result.payload, "deliveryDueAt")
  if (!(due instanceof Date)) throw Error("Expected preserved delivery date")
  due.setUTCFullYear(2030)
  result.dependencyClientIds.push("other-dependency")
  Reflect.set(result.payload.lines[4] ?? {}, "note", "Changed result")
  if (!result.payload.initialPayment) throw Error("Expected payment")
  result.payload.initialPayment.moneyAccountId = "changed-result-account"
  expect(saved).toEqual(before)
  expect(patch).toEqual(beforePatch)
})

test("one through 200 trimmed characters are accepted, preserving deliberate internal whitespace", () => {
  for (const description of [" x ", "x".repeat(200), " Rice  and\nbeans "]) {
    const patch = correction()
    patch.descriptions[0] = { lineIndex: 1, description }
    const result = deriveBlankQuickSaleReplacement(original(), patch)
    expect(result.payload.lines[1]).toMatchObject({
      description: description.trim(),
    })
  }
})

test("empty, whitespace, overlong and runtime non-string descriptions refuse without mutation", () => {
  for (const description of ["", " \n\t", "x".repeat(201), null, 42]) {
    const saved = original()
    const before = structuredClone(saved)
    const patch = {
      ...correction(),
      descriptions: [
        { lineIndex: 0, description },
        { lineIndex: 1, description: "Second" },
      ],
    }
    expect(() =>
      Reflect.apply(deriveBlankQuickSaleReplacement, undefined, [saved, patch]),
    ).toThrow(CatalogError)
    expect(saved).toEqual(before)
  }
})

test("every blank line must be corrected exactly once", () => {
  for (const descriptions of [
    [],
    [{ lineIndex: 0, description: "First" }],
    [
      { lineIndex: 0, description: "First" },
      { lineIndex: 0, description: "Duplicate" },
    ],
    [...correction().descriptions, { lineIndex: 1, description: "Extra" }],
  ])
    expect(() =>
      deriveBlankQuickSaleReplacement(original(), {
        ...correction(),
        descriptions,
      }),
    ).toThrow(CatalogError)
})

test("nonblank Quick sale, Additional cost and catalog lines cannot be correction targets", () => {
  for (const lineIndex of [
    2,
    3,
    4,
    -1,
    5,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])
    expect(() =>
      deriveBlankQuickSaleReplacement(original(), {
        ...correction(),
        descriptions: [
          { lineIndex: 0, description: "First" },
          { lineIndex, description: "Forbidden edit" },
        ],
      }),
    ).toThrow(CatalogError)
})

test("no missing Quick sale description means no replacement, including catalog or Additional cost only", () => {
  for (const lines of [
    [{ custom: "quick_sale" as const, amountMinor: 50, description: "Rice" }],
    [{ custom: "additional_cost" as const, amountMinor: 50 }],
    [{ offeringId: "product-a", quantity: "1" }],
  ])
    expect(() =>
      deriveBlankQuickSaleReplacement(
        { ...original(), payload: { ...original().payload, lines } },
        { ...correction(), descriptions: [] },
      ),
    ).toThrow(CatalogError)
})

test("unsupported event versions and malformed legacy descriptions are refused", () => {
  for (const eventVersion of [0, 2, -1, 1.5])
    expect(() =>
      deriveBlankQuickSaleReplacement(
        { ...original(), eventVersion },
        correction(),
      ),
    ).toThrow(CatalogError)
  for (const description of [null, 42, {}]) {
    const saved = original()
    Reflect.set(saved.payload.lines[0] ?? {}, "description", description)
    expect(() => deriveBlankQuickSaleReplacement(saved, correction())).toThrow(
      CatalogError,
    )
  }
})

test("replacement command identity must be new, exact and bounded", () => {
  for (const replacementClientCommandId of [
    "original-command",
    "short",
    " xxxxxxx",
    "xxxxxxxx ",
    "x".repeat(161),
  ])
    expect(() =>
      deriveBlankQuickSaleReplacement(original(), {
        ...correction(),
        replacementClientCommandId,
      }),
    ).toThrow(CatalogError)
  for (const length of [8, 160])
    expect(
      deriveBlankQuickSaleReplacement(original(), {
        ...correction(),
        replacementClientCommandId: "x".repeat(length),
      }).clientCommandId,
    ).toHaveLength(length)
})

test("dependencies cannot refer to either original or replacement command identity", () => {
  for (const dependency of ["original-command", "replacement-command"])
    expect(() =>
      deriveBlankQuickSaleReplacement(
        { ...original(), dependencyClientIds: [dependency] },
        correction(),
      ),
    ).toThrow(CatalogError)
})

test("existing payment requires a fresh exact bounded payment identity", () => {
  for (const replacementClientPaymentId of [
    undefined,
    "original-payment",
    "short",
    " payment-new",
    "payment-new ",
    "x".repeat(161),
  ])
    expect(() =>
      deriveBlankQuickSaleReplacement(original(), {
        ...correction(),
        replacementClientPaymentId,
      }),
    ).toThrow(CatalogError)
  for (const length of [8, 160])
    expect(
      deriveBlankQuickSaleReplacement(original(), {
        ...correction(),
        replacementClientPaymentId: "p".repeat(length),
      }).payload.initialPayment?.clientPaymentId,
    ).toHaveLength(length)
})

test("unpaid original stays unpaid and cannot introduce a payment identity", () => {
  const { initialPayment: _payment, ...payload } = original().payload
  const saved = { ...original(), payload }
  const { replacementClientPaymentId: _identity, ...patch } = correction()
  const result = deriveBlankQuickSaleReplacement(saved, patch)
  expect(result.payload).not.toHaveProperty("initialPayment")
  expect(() => deriveBlankQuickSaleReplacement(saved, correction())).toThrow(
    CatalogError,
  )
})

test("caller-supplied replacement payload facts cannot alter the immutable original", () => {
  const saved = original()
  const result = deriveBlankQuickSaleReplacement(saved, {
    ...correction(),
    // Structural callers may carry extra data; the helper never reads it.
    ...{
      payload: {
        initialPayment: { moneyAccountId: "foreign", amountMinor: 1 },
      },
    },
  })
  expect(result.payload.initialPayment).toEqual({
    ...saved.payload.initialPayment,
    clientPaymentId: "replacement-payment",
  })
  expect(result.payload.lines[4]).toEqual(saved.payload.lines[4])
})
