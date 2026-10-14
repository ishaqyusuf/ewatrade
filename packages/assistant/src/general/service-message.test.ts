import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import { serviceMessageShareAction } from "./service-message"

const draft = {
  action: "service_message_share" as const,
  jobId: "job-1",
  channel: "whatsapp" as const,
  message: "Your shoes are ready for pickup.",
  reason: "Sent from the shop phone",
  alreadyShared: true as const,
}

test("a manual share names only the Job, channel, exact message and reason", () => {
  expect(serviceMessageShareAction.parse(draft)).toEqual(draft)
  expect(generalActionSchema.parse(draft)).toEqual(draft)
  const { reason: _reason, ...withoutReason } = draft
  expect(serviceMessageShareAction.parse(withoutReason)).toEqual(withoutReason)
  for (const invalid of [
    { ...draft, alreadyShared: false },
    { ...draft, channel: "email" },
    { ...draft, message: " " },
    { ...draft, message: "x".repeat(1001) },
    { ...draft, reason: "x".repeat(501) },
    { ...draft, customerPhone: "+2348030000000" },
    { ...draft, recipient: { phone: "+2348030000000" } },
    { ...draft, storeId: "other-store" },
    { ...draft, tenantId: "other-tenant" },
    { ...draft, jobId: "" },
  ])
    expect(serviceMessageShareAction.safeParse(invalid).success).toBe(false)
  const { alreadyShared: _shared, ...unacknowledged } = draft
  expect(serviceMessageShareAction.safeParse(unacknowledged).success).toBe(
    false,
  )
})
