import { expect, test } from "bun:test"
import { generalAnswerTargetSchema } from "./answer-target"
import { generalReceiptSchema } from "./contracts"
import {
  serviceManualMessageContextInput,
  serviceManualMessageOriginalInput,
  serviceManualMessageReceiptSchema,
  serviceManualMessageReceiptTarget,
  serviceManualMessageTargetSchema,
} from "./service-message-read"
const target = {
  kind: "service_manual_message" as const,
  jobId: "job",
  intentId: "intent",
  shareId: "share",
}
const receipt = {
  kind: "service_manual_message" as const,
  jobId: "job",
  recordId: "intent",
  shareId: "share",
  orderId: "order",
  title: "Manual share recorded",
  detail: "Staff reported; no send or delivery verification.",
}
test("exact original targets and receipts roundtrip owning Job/intent/share identities", () => {
  expect(serviceManualMessageTargetSchema.parse(target)).toEqual(target)
  expect(generalAnswerTargetSchema.parse(target)).toEqual(target)
  expect(generalReceiptSchema.parse(receipt)).toEqual(receipt)
  expect(serviceManualMessageReceiptTarget(receipt)).toEqual(target)
  expect(serviceManualMessageContextInput.parse({ jobId: "job" })).toEqual({
    jobId: "job",
  })
})
test("strict links and API reads admit no caller scope, contacts or arbitrary destination", () => {
  for (const extra of [
    { tenantId: "tenant" },
    { storeId: "store" },
    { actorUserId: "actor" },
    { recipientPhone: "555" },
    { url: "https://other.invalid" },
  ]) {
    expect(
      serviceManualMessageTargetSchema.safeParse({ ...target, ...extra })
        .success,
    ).toBe(false)
    expect(
      serviceManualMessageOriginalInput.safeParse({
        jobId: "job",
        intentId: "intent",
        shareId: "share",
        ...extra,
      }).success,
    ).toBe(false)
    expect(
      serviceManualMessageContextInput.safeParse({ jobId: "job", ...extra })
        .success,
    ).toBe(false)
  }
  for (const key of ["jobId", "intentId", "shareId"] as const) {
    expect(
      serviceManualMessageTargetSchema.safeParse({
        ...target,
        [key]: "x".repeat(128),
      }).success,
    ).toBe(true)
    expect(
      serviceManualMessageTargetSchema.safeParse({
        ...target,
        [key]: "x".repeat(129),
      }).success,
    ).toBe(false)
    expect(
      serviceManualMessageTargetSchema.safeParse({ ...target, [key]: " " })
        .success,
    ).toBe(false)
  }
})
test("missing exact share identity never becomes a receipt or a manufactured original", () => {
  const { shareId: _share, ...without } = receipt
  expect(serviceManualMessageReceiptSchema.safeParse(without).success).toBe(
    false,
  )
  expect(serviceManualMessageReceiptTarget(without)).toBeNull()
  expect(
    serviceManualMessageReceiptTarget({
      kind: "order",
      recordId: "intent",
      orderId: "order",
      title: "Old receipt",
      detail: "Related Order",
    }),
  ).toBeNull()
  expect(
    serviceManualMessageReceiptTarget({ ...receipt, shareId: "x".repeat(129) }),
  ).toBeNull()
  expect(
    serviceManualMessageReceiptSchema.safeParse({
      ...receipt,
      recipient: "other",
    }).success,
  ).toBe(false)
})
