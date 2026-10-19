import { expect, test } from "bun:test"
import { generalAnswerTargetSchema } from "./answer-target"
import {
  type GeneralAnswer,
  generalAnswerSchema,
  generalStoredPartSchema,
} from "./contracts"
import {
  generalAnswers,
  generalSavedSnapshot,
  readGeneralSnapshot,
} from "./snapshot"
import {
  type StockReadTarget,
  inventoryCloseoutReadTargetSchema,
  stockCountReadTargetSchema,
  stockOperationReadTargetSchema,
  stockReadTargetSchema,
  stockTransferReadTargetSchema,
} from "./stock-read-target"

const origin = { tenantId: "tenant-original", storeId: "store-original" }
const targets = [
  { kind: "stock_operation", operationId: "operation-original", origin },
  { kind: "stock_count", stockCountId: "count-original", origin },
  { kind: "stock_transfer", transferId: "transfer-original", origin },
  { kind: "inventory_closeout", closeoutId: "closeout-original", origin },
] satisfies StockReadTarget[]
function answer(target?: unknown) {
  return {
    id: "answer-1",
    title: "Saved stock original",
    value: "Recorded facts",
    scope: "Original Store",
    asOf: "2026-10-15T10:20:30.123Z",
    detail: "Original evidence. Opening requires a fresh authorized read.",
    ...(target === undefined ? {} : { target }),
  }
}
const part = (target?: unknown) => ({
  type: "data-general-answer",
  data: answer(target),
})
function snapshot(parts: unknown[]) {
  return {
    conversation: { id: "chat-original", title: "Stock history" },
    messages: [
      {
        id: "message-1",
        role: "assistant",
        parts,
        createdAt: "2026-10-15T10:20:30.123Z",
      },
    ],
    proposals: [],
    activeRunId: null,
    allowance: {
      remainingRequests: 10,
      remainingTokens: 1000,
      resetsAt: "2026-11-01T00:00:00.000Z",
    },
    businessName: "Business",
    storeName: "Original Store",
    currencyCode: "NGN",
  }
}

test("the exact public package export resolves to the shared stock target schema", async () => {
  const exported = await import("@ewatrade/assistant/general/stock-read-target")
  expect(exported.stockReadTargetSchema).toBe(stockReadTargetSchema)
})

test("all four exact stock original targets survive actual answer and saved snapshot round trips", () => {
  for (const target of targets) {
    expect(stockReadTargetSchema.parse(target)).toEqual(target)
    expect(generalAnswerTargetSchema.parse(target)).toEqual(target)
    const parsed: GeneralAnswer = generalAnswerSchema.parse(answer(target))
    expect(parsed.target).toEqual(target)
    const expectedPart: { type: "data-general-answer"; data: GeneralAnswer } = {
      type: "data-general-answer",
      data: { ...answer(), target },
    }
    expect(
      generalStoredPartSchema.parse(JSON.parse(JSON.stringify(part(target)))),
    ).toEqual(expectedPart)
    const saved = readGeneralSnapshot(
      JSON.parse(JSON.stringify(snapshot([part(target)]))),
    )
    if (!saved) throw Error("Expected actual saved stock answer")
    const restored = generalAnswers(
      generalSavedSnapshot(saved).messages[0]?.parts,
    )
    expect(restored).toEqual([parsed])
    expect(restored[0]?.target).toEqual(target)
  }
})

test("exact variants use only their matching protected read identity fields", () => {
  for (const [schema, target] of [
    [stockOperationReadTargetSchema, targets[0]],
    [stockCountReadTargetSchema, targets[1]],
    [stockTransferReadTargetSchema, targets[2]],
    [inventoryCloseoutReadTargetSchema, targets[3]],
  ] as const)
    expect(schema.safeParse(target).success).toBe(true)
  for (const target of targets) {
    for (const extra of [
      { id: "guessed-generic-id" },
      { recordId: "guessed-receipt-id" },
      { catalogItemId: "other-product" },
      { canFinalize: true },
      { role: "OWNER" },
      { actorUserId: "other-actor" },
      { tenantId: origin.tenantId },
      { storeId: origin.storeId },
      { approvalToken: "secret" },
      { href: "https://untrusted.test" },
      { url: "/inventory" },
      { origin: { ...origin, accessRevision: 1 } },
    ])
      expect(
        stockReadTargetSchema.safeParse({ ...target, ...extra }).success,
      ).toBe(false)
    const { origin: _origin, ...missingOrigin } = target
    expect(stockReadTargetSchema.safeParse(missingOrigin).success).toBe(false)
    expect(
      stockReadTargetSchema.safeParse({ ...target, origin: null }).success,
    ).toBe(false)
    expect(
      stockReadTargetSchema.safeParse({ ...target, kind: "inventory" }).success,
    ).toBe(false)
  }
})

test("all record and origin identities reject whitespace, controls, URLs, paths and overlong values without normalization", () => {
  const invalid = [
    "",
    " ",
    " saved",
    "saved ",
    ".",
    "..",
    "a".repeat(129),
    "a\nb",
    "a\u0000b",
    "a\u007fb",
    "a\u0085b",
    "a\u2028b",
    "a\u2029b",
    "https://untrusted.test/record",
    "javascript:alert(1)",
    "file:///tmp/record",
    "//untrusted.test",
    "/inventory",
    "a\\b",
    "a?record=b",
    "a#record",
    "https%3A%2F%2Funtrusted.test",
    "www.untrusted.test",
  ]
  for (const target of targets) {
    const identityField =
      target.kind === "stock_operation"
        ? "operationId"
        : target.kind === "stock_count"
          ? "stockCountId"
          : target.kind === "stock_transfer"
            ? "transferId"
            : "closeoutId"
    for (const value of invalid) {
      expect(
        stockReadTargetSchema.safeParse({ ...target, [identityField]: value })
          .success,
      ).toBe(false)
      for (const key of ["tenantId", "storeId"])
        expect(
          stockReadTargetSchema.safeParse({
            ...target,
            origin: { ...origin, [key]: value },
          }).success,
        ).toBe(false)
    }
    const exact = {
      ...target,
      [identityField]: "a".repeat(128),
      origin: { tenantId: "t".repeat(128), storeId: "s".repeat(128) },
    }
    expect(stockReadTargetSchema.parse(exact)).toEqual(exact)
    const otherOrigin = {
      ...target,
      origin: { tenantId: "other-tenant", storeId: "other-store" },
    }
    // Origin is exact provenance, not a claim that either Store is authorized.
    expect(stockReadTargetSchema.parse(otherOrigin)).toEqual(otherOrigin)
    expect(
      stockReadTargetSchema.safeParse({
        ...target,
        origin: { tenantId: origin.tenantId },
      }).success,
    ).toBe(false)
    expect(
      stockReadTargetSchema.safeParse({
        ...target,
        origin: { storeId: origin.storeId },
      }).success,
    ).toBe(false)
  }
})

test("invalid stock targets fail closed in actual answer extraction and persisted chat hydration", () => {
  for (const target of targets)
    for (const broken of [
      { ...target, origin: { ...origin, storeId: "" } },
      { ...target, origin: { ...origin, tenantId: "other", role: "OWNER" } },
      { ...target, href: "https://untrusted.test" },
      { ...target, kind: "stock_operation_guessed" },
    ]) {
      expect(generalAnswerSchema.safeParse(answer(broken)).success).toBe(false)
      expect(generalStoredPartSchema.safeParse(part(broken)).success).toBe(
        false,
      )
      expect(generalAnswers([part(broken)])).toEqual([])
      expect(readGeneralSnapshot(snapshot([part(broken)]))).toBeNull()
    }
})

test("historical answers without targets remain compatible and every prior target kind is retained", () => {
  expect(generalAnswerSchema.parse(answer()).target).toBeUndefined()
  const saved = readGeneralSnapshot(
    snapshot([part(), ...targets.map((target) => part(target))]),
  )
  if (!saved) throw Error("Expected historical and current answer history")
  expect(
    generalAnswers(generalSavedSnapshot(saved).messages[0]?.parts),
  ).toHaveLength(5)
  expect(generalAnswers(saved.messages[0]?.parts)[0]?.target).toBeUndefined()
  const originalKinds: NonNullable<GeneralAnswer["target"]>["kind"][] = [
    "service_request",
    "service_request_page",
    "service_manual_message",
    "catalog_item",
    "customer_directory",
    "customer",
    "order",
    "commerce_quote_approval",
    "service_booking",
    "service_work",
    "service_work_note",
    "service_work_exception",
    "business_report",
    "finance_cash_count",
    "finance_day_close",
    "staff_invitation",
    "staff_status",
    "staff_access",
    "staff_history",
    "staff_member",
    "staff_directory",
    "staff_activity",
  ]
  expect(
    generalAnswerTargetSchema.options
      .map((option) => option.shape.kind.value)
      .sort(),
  ).toEqual([...originalKinds, ...targets.map((target) => target.kind)].sort())
  const originalTargets = [
    { kind: "catalog_item", catalogItemId: "item-1", origin },
    { kind: "order", orderId: "order-1", origin },
    { kind: "customer_directory", origin },
    { kind: "customer", customerId: "customer-1", origin },
    { kind: "staff_member", membershipId: "member-1" },
    {
      kind: "service_booking",
      bookingId: "booking-1",
      sourceId: "source-1",
      offeringId: "offering-1",
    },
    {
      kind: "commerce_quote_approval",
      approvalId: "approval-1",
      quoteId: "quote-1",
      quoteVersionId: "version-1",
    },
  ] satisfies NonNullable<GeneralAnswer["target"]>[]
  for (const target of originalTargets)
    expect(generalAnswerSchema.parse(answer(target)).target).toEqual(target)
})
