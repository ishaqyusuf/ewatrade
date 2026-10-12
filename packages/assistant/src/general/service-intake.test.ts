import { expect, test } from "bun:test"
import {
  serviceIntakeAction,
  serviceIntakeReceiptSchema,
} from "./service-intake"
const action = {
  action: "service_intake",
  lines: [{ offeringId: "original-service", quantity: "2.125" }],
}
test("Service intake intention preserves exact quantity and rejects injected authority/prices", () => {
  expect(serviceIntakeAction.parse(action).lines[0]?.quantity).toBe("2.125")
  for (const field of [
    "storeId",
    "tenantId",
    "actorUserId",
    "clientIntakeId",
    "approvalToken",
    "notificationChannel",
    "moneyAccountId",
  ])
    expect(
      serviceIntakeAction.safeParse({ ...action, [field]: "injected" }).success,
    ).toBe(false)
  expect(
    serviceIntakeAction.safeParse({
      ...action,
      lines: [{ ...action.lines[0], expectedFixedPriceMinor: 1 }],
    }).success,
  ).toBe(false)
  expect(
    serviceIntakeAction.safeParse({
      ...action,
      lines: [{ ...action.lines[0], quantity: "0" }],
    }).success,
  ).toBe(false)
  expect(
    serviceIntakeAction.safeParse({
      ...action,
      lines: [{ ...action.lines[0], quantity: "1e3" }],
    }).success,
  ).toBe(false)
})
test("owning receipt requires original Intake and Order identity", () => {
  const receipt = {
    kind: "service_intake",
    recordId: "intake-original",
    orderId: "order-original",
    title: "Intake confirmed",
    detail: "Recorded payment; work stays queued.",
  }
  expect<unknown>(serviceIntakeReceiptSchema.parse(receipt)).toEqual(receipt)
  expect(
    serviceIntakeReceiptSchema.safeParse({ ...receipt, orderId: "" }).success,
  ).toBe(false)
})
