import { expect, test } from "bun:test"
import type { ServiceIntakeAction } from "@ewatrade/assistant/general/service-intake"
import {
  type NativeIntakeOffering,
  initialIntakePayment,
  intakeChoicePage,
  intakeUtcInput,
  nativeServiceIntakeCandidate,
} from "./native-service-intake-values"

const tracked: NativeIntakeOffering = {
  offeringId: "tracked",
  itemName: "Laundry",
  variantName: "Shirt",
  offeringName: "Wash",
  fixedPriceMinor: 2500,
  service: {
    workPolicy: "TRACKED",
    authorizationPolicy: "MANUAL_RELEASE",
  },
}
const charge: NativeIntakeOffering = {
  ...tracked,
  offeringId: "charge",
  itemName: "Handling",
  service: { workPolicy: "CHARGE_ONLY" },
}
const options = {
  offerings: [tracked, charge],
  assignees: [{ id: "staff", name: "Ada" }],
}
const initial: ServiceIntakeAction = {
  action: "service_intake",
  customerName: "Amina",
  customerPhone: "08012345678",
  customerEmail: "amina@example.test",
  lines: [
    { offeringId: "tracked", quantity: "0.123456" },
    { offeringId: "charge", quantity: "2" },
  ],
  instructions: "Handle carefully",
  conditionNote: "One stain",
  requestedAssigneeId: "staff",
  requestedAt: "2026-10-15T11:23:45.123456+01:00",
  dueCommitmentAt: "2026-10-16T18:00:00.789123Z",
  priority: "urgent",
  serviceLevel: "express",
  initialPaymentMinor: 120001,
  initialPaymentMethod: "bank_transfer",
  initialPaymentReference: "Original reference",
}
const edits = {
  payment: "1,200.01",
  requested: intakeUtcInput(initial.requestedAt),
  due: intakeUtcInput(initial.dueCommitmentAt),
}

test("all intake fields survive exact native re-review including fractional quantities, payment and original subsecond instants", () => {
  expect(
    nativeServiceIntakeCandidate(initial, initial, edits, options),
  ).toEqual({ ok: true, payload: initial })
  expect(edits.requested).toBe("2026-10-15T10:23:45.123456Z")
  expect(initialIntakePayment(initial)).toBe("1200.01")
  expect(initialIntakePayment({ ...initial, initialPaymentMinor: 0 })).toBe("0")
})
test("explicit UTC edits retain precision and reject local, invalid calendar and timezone guesses", () => {
  const result = nativeServiceIntakeCandidate(
    initial,
    initial,
    { ...edits, requested: "2026-10-17T09:00:00.000001Z", due: "" },
    options,
  )
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.payload.requestedAt).toBe("2026-10-17T09:00:00.000001Z")
    expect(result.payload.dueCommitmentAt).toBeUndefined()
  }
  for (const requested of [
    "2026-10-17T09:00",
    "2026-10-17T09:00:00+01:00",
    "2026-02-30T09:00:00Z",
    "not a date",
  ])
    expect(
      nativeServiceIntakeCandidate(
        initial,
        initial,
        { ...edits, requested },
        options,
      ).ok,
    ).toBe(false)
})
test("money precision and limits are exact, zero is retained and clearing removes payment method/reference", () => {
  const zero = nativeServiceIntakeCandidate(
    initial,
    initial,
    { ...edits, payment: "0" },
    options,
  )
  expect(zero.ok && zero.payload.initialPaymentMinor).toBe(0)
  const clear = nativeServiceIntakeCandidate(
    initial,
    initial,
    { ...edits, payment: "" },
    options,
  )
  expect(clear.ok).toBe(true)
  if (clear.ok) {
    expect(clear.payload.initialPaymentMinor).toBeUndefined()
    expect(clear.payload.initialPaymentMethod).toBeUndefined()
    expect(clear.payload.initialPaymentReference).toBeUndefined()
  }
  for (const payment of ["1.001", "-1", "1e3", "1,00", "1000000.01", "NaN"])
    expect(
      nativeServiceIntakeCandidate(
        initial,
        initial,
        { ...edits, payment },
        options,
      ).ok,
    ).toBe(false)
  for (const method of [
    "cash",
    "bank_transfer",
    "card",
    "pos",
    "other",
  ] as const) {
    const result = nativeServiceIntakeCandidate(
      initial,
      { ...initial, initialPaymentMethod: method },
      edits,
      options,
    )
    expect(result.ok && result.payload.initialPaymentMethod).toBe(method)
  }
})
test("fixed saved customer identity cannot be switched or overridden, while new contact snapshots remain editable", () => {
  const saved: ServiceIntakeAction = {
    ...initial,
    customerId: "saved-customer",
    customerName: undefined,
    customerPhone: undefined,
    customerEmail: undefined,
  }
  expect(nativeServiceIntakeCandidate(saved, saved, edits, options).ok).toBe(
    true,
  )
  for (const patch of [
    { customerId: "other" },
    { customerId: undefined },
    { customerName: "Override" },
    { customerPhone: "other" },
    { customerEmail: "other@example.test" },
  ])
    expect(
      nativeServiceIntakeCandidate(
        saved,
        { ...saved, ...patch },
        edits,
        options,
      ).ok,
    ).toBe(false)
  expect(
    nativeServiceIntakeCandidate(
      initial,
      { ...initial, customerId: "injected" },
      edits,
      options,
    ).ok,
  ).toBe(false)
  const changed = nativeServiceIntakeCandidate(
    initial,
    {
      ...initial,
      customerName: "Other",
      customerPhone: "08099999999",
      customerEmail: "new@example.test",
    },
    edits,
    options,
  )
  expect(changed.ok && changed.payload.customerName).toBe("Other")
})
test("unknown/ambiguous/unpriced offerings and unavailable assignees remain unresolved without dropping selected lines", () => {
  for (const offerings of [
    [],
    [tracked],
    [...options.offerings, tracked],
    [{ ...tracked, fixedPriceMinor: null }, charge],
    [{ ...tracked, service: null }, charge],
  ])
    expect(
      nativeServiceIntakeCandidate(initial, initial, edits, {
        ...options,
        offerings,
      }).ok,
    ).toBe(false)
  expect(
    nativeServiceIntakeCandidate(initial, initial, edits, {
      ...options,
      assignees: [],
    }).ok,
  ).toBe(false)
  expect(initial.lines.length).toBe(2)
  const onlyCharge: ServiceIntakeAction = {
    ...initial,
    lines: [{ offeringId: "charge", quantity: "2" }],
    requestedAssigneeId: undefined,
    dueCommitmentAt: undefined,
  }
  expect(
    nativeServiceIntakeCandidate(
      onlyCharge,
      onlyCharge,
      { ...edits, due: "" },
      options,
    ).ok,
  ).toBe(true)
  expect(
    nativeServiceIntakeCandidate(
      onlyCharge,
      { ...onlyCharge, requestedAssigneeId: "staff" },
      { ...edits, due: "" },
      options,
    ).ok,
  ).toBe(false)
  expect(
    nativeServiceIntakeCandidate(onlyCharge, onlyCharge, edits, options).ok,
  ).toBe(false)
})
test("multi-page retention keeps only selected historical facts, labels provenance and current reads override them", () => {
  const first = [tracked, charge, { ...tracked, offeringId: "not-selected" }]
  const next = [{ ...tracked, offeringId: "next-page", itemName: "Repair" }]
  const merged = intakeChoicePage(first, next, [
    "tracked",
    "next-page",
    "unknown",
  ])
  expect(merged.map((row) => row.offeringId)).toEqual(["tracked", "next-page"])
  expect(merged[0]?.previouslyRead).toBe(true)
  expect(merged[1]?.previouslyRead).toBe(false)
  expect(merged.some((row) => row.offeringId === "unknown")).toBe(false)
  const latest = intakeChoicePage(
    merged,
    [{ ...tracked, itemName: "Current name", fixedPriceMinor: 3000 }],
    ["tracked"],
  )
  expect(latest).toEqual([
    {
      ...tracked,
      itemName: "Current name",
      fixedPriceMinor: 3000,
      previouslyRead: false,
    },
  ])
  expect(intakeChoicePage(merged, [], [])).toEqual([])
})
test("all100 explicit selections survive,101/zero lines and invalid exact quantities refuse", () => {
  const lines = Array.from({ length: 100 }, (_, index) => ({
    offeringId: `offering-${index}`,
    quantity: "0.000001",
  }))
  const offerings = lines.map((line) => ({
    ...tracked,
    offeringId: line.offeringId,
  }))
  const full = { ...initial, lines }
  const result = nativeServiceIntakeCandidate(full, full, edits, {
    ...options,
    offerings,
  })
  expect(result.ok && result.payload.lines).toEqual(lines)
  expect(
    nativeServiceIntakeCandidate(
      full,
      { ...full, lines: [...lines, lines[0]] },
      edits,
      { ...options, offerings },
    ).ok,
  ).toBe(false)
  expect(
    nativeServiceIntakeCandidate(full, { ...full, lines: [] }, edits, options)
      .ok,
  ).toBe(false)
  for (const quantity of ["0", "-1", "0.0000001", "1e3", "1,000", "NaN"])
    expect(
      nativeServiceIntakeCandidate(
        initial,
        { ...initial, lines: [{ offeringId: "tracked", quantity }] },
        edits,
        options,
      ).ok,
    ).toBe(false)
})
test("strict intention rejects injected provider/Store/actor fields and invalid complete-field values", () => {
  const injected = { ...initial, storeId: "foreign", sendReminder: true }
  expect(
    nativeServiceIntakeCandidate(initial, injected, edits, options).ok,
  ).toBe(false)
  expect(
    nativeServiceIntakeCandidate(
      initial,
      { ...initial, instructions: "x".repeat(4001) },
      edits,
      options,
    ).ok,
  ).toBe(false)
  expect(
    nativeServiceIntakeCandidate(
      initial,
      { ...initial, conditionNote: "x".repeat(2001) },
      edits,
      options,
    ).ok,
  ).toBe(false)
  expect(
    nativeServiceIntakeCandidate(
      initial,
      { ...initial, customerEmail: "not email" },
      edits,
      options,
    ).ok,
  ).toBe(false)
})
