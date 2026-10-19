import { expect, test } from "bun:test"
import {
  serviceMessageModelContext,
  serviceMessageModelOriginal,
} from "./general-service-message-reads"
const base = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  job: { id: "job", revision: 4 },
  order: { id: "order", number: "ORD-1" },
  asOf: "2026-10-15T14:00:00.000Z",
}
const contact = {
  name: "Current name",
  phone: "+234 803 000 1234",
  email: "private@example.test",
}
test("model context retains current source identity and contact availability without phone/email values", () => {
  const value = { ...base, recipient: contact, providerToken: "PRIVATE_TOKEN" }
  const projection = serviceMessageModelContext(value)
  expect(projection.recipient).toEqual({
    name: "Current name",
    hasPhone: true,
    hasEmail: true,
  })
  expect(projection.job).toEqual(base.job)
  for (const privateValue of [contact.phone, contact.email, "PRIVATE_TOKEN"])
    expect(JSON.stringify(projection)).not.toContain(privateValue)
  expect(
    serviceMessageModelContext({
      ...base,
      recipient: { name: null, phone: null, email: null },
    }).recipient,
  ).toEqual({ name: null, hasPhone: false, hasEmail: false })
})
test("exact original model projection retains full saved message and share identity but excludes original contacts and future private fields", () => {
  const record = {
    ...base,
    intent: {
      id: "intent",
      channel: "MANUAL" as const,
      status: "COMPLETED" as const,
      purpose: "assistant_manual_share",
      message: "x".repeat(1000),
      recipient: { phone: contact.phone, email: contact.email },
      createdAt: base.asOf,
      completedAt: base.asOf,
      providerKey: "PRIVATE_PROVIDER",
    },
    share: {
      id: "share",
      channel: "SMS" as const,
      note: "Saved note",
      sharedAt: base.asOf,
      sharedByUserId: "staff",
    },
    currentOrderRecipientName: "Changed current name",
    kind: "staff_reported_share" as const,
    sending: "none" as const,
    delivery: "unverified" as const,
    providerToken: "PRIVATE_TOKEN",
  }
  const projection = serviceMessageModelOriginal(record)
  expect(projection.intent.message).toHaveLength(1000)
  expect(projection.intent.recipient).toEqual({
    phoneLast4: "1234",
    hasEmail: true,
  })
  expect(projection.share.id).toBe("share")
  expect(projection.currentOrderRecipientName).toBe("Changed current name")
  expect(projection.sending).toBe("none")
  expect(projection.delivery).toBe("unverified")
  for (const privateValue of [
    contact.phone,
    contact.email,
    "PRIVATE_TOKEN",
    "PRIVATE_PROVIDER",
  ])
    expect(JSON.stringify(projection)).not.toContain(privateValue)
})
