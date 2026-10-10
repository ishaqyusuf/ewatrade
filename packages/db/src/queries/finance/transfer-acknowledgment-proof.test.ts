import { expect, test } from "bun:test"
import { proveTransferAcknowledgment } from "./transfer-acknowledgment-proof"

const date = new Date("2026-10-10T10:00:00Z")
function fixture() {
  return {
    tenantId: "tenant",
    transferId: "transfer",
    operationId: "operation",
    actorUserId: "receiver",
    operationReason: "Three crates arrived",
    operationDate: date,
    dispatchedAt: new Date("2026-10-10T09:00:00Z"),
    dispatchedQuantity: "10",
    transactionScale: 2,
    sourceBefore: "10",
    sourceAfter: "7",
    movementQuantity: "3",
    acknowledgment: {
      tenantId: "tenant",
      transferId: "transfer",
      operationId: "operation",
      acknowledgedByUserId: "receiver",
      reason: "Three crates arrived",
      effectiveAt: date,
      kind: "RECEIVE" as const,
      quantity: "3",
      remainingBefore: "10",
      remainingAfter: "7",
    },
  }
}

test("partial receipt proves exact saved stage without depending on later transfer status", () => {
  const input = fixture()
  input.acknowledgment.quantity = "3.00"
  expect(proveTransferAcknowledgment(input)).toMatchObject({
    quantity: "3",
    remainingAfter: "7",
    status: "IN_TRANSIT",
  })
  expect(
    proveTransferAcknowledgment({
      ...input,
      sourceBefore: "7",
      sourceAfter: "0",
      movementQuantity: "7",
      acknowledgment: {
        ...input.acknowledgment,
        quantity: "7",
        remainingBefore: "7",
        remainingAfter: "0",
      },
    }),
  ).toMatchObject({ status: "RECEIVED", terminal: true })
})

test("cancellation proves return of only outstanding stock", () => {
  const input = fixture()
  expect(
    proveTransferAcknowledgment({
      ...input,
      sourceBefore: "7",
      sourceAfter: "0",
      movementQuantity: "7",
      acknowledgment: {
        ...input.acknowledgment,
        kind: "CANCEL",
        quantity: "7",
        remainingBefore: "7",
        remainingAfter: "0",
      },
    }),
  ).toMatchObject({ status: "CANCELLED", quantity: "7" })
  expect(() =>
    proveTransferAcknowledgment({
      ...input,
      acknowledgment: { ...input.acknowledgment, kind: "CANCEL" },
    }),
  ).toThrow("acknowledgment")
})

test("changed owner, actor, reason, date or transit evidence cannot prove a stage", () => {
  const input = fixture()
  for (const patch of [
    { tenantId: "foreign" },
    { transferId: "other" },
    { operationId: "other" },
    { acknowledgedByUserId: "other" },
    { reason: "changed" },
    { effectiveAt: new Date("invalid") },
    { effectiveAt: new Date("2026-10-10T08:00:00Z") },
    { quantity: "4" },
    { quantity: "0" },
    { quantity: "-1" },
    { remainingBefore: "11" },
    { remainingAfter: "6" },
    { quantity: "3.001" },
  ])
    expect(() =>
      proveTransferAcknowledgment({
        ...input,
        acknowledgment: { ...input.acknowledgment, ...patch },
      }),
    ).toThrow("acknowledgment")
  for (const patch of [
    { sourceBefore: "9" },
    { sourceAfter: "6" },
    { movementQuantity: "4" },
    { dispatchedAt: new Date("invalid") },
  ])
    expect(() => proveTransferAcknowledgment({ ...input, ...patch })).toThrow(
      "acknowledgment",
    )
})
