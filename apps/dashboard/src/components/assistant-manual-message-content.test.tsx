import { expect, test } from "bun:test"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AssistantManualMessageContent } from "./assistant-manual-message-content"

type ManualMessage =
  RouterOutputs["serviceCommunications"]["manualMessageOriginal"]
function record(): ManualMessage {
  return {
    actorUserId: "private-actor",
    tenantId: "private-business",
    storeId: "private-store",
    job: { id: "private-job", revision: 7 },
    order: { id: "private-order", number: "ORD-3001" },
    intent: {
      id: "private-intent",
      channel: "MANUAL",
      status: "COMPLETED",
      purpose: "assistant_manual_share",
      message: "Your gown is ready.\nCollect after 2pm with your ticket.",
      recipient: { phone: "+2348000000001", email: "saved@example.test" },
      createdAt: "2026-10-14T09:00:00.000Z",
      completedAt: "2026-10-14T09:00:01.250Z",
    },
    share: {
      id: "private-share",
      channel: "SMS",
      note: "From the shop phone",
      sharedAt: "2026-10-14T08:55:00.000Z",
      sharedByUserId: "staff-user-42",
    },
    currentOrderRecipientName: "Current Label Name",
    asOf: "2026-10-15T14:50:00.000Z",
    kind: "staff_reported_share",
    sending: "none",
    delivery: "unverified",
  } as ManualMessage
}
const render = (value: ManualMessage) =>
  renderToStaticMarkup(
    createElement(AssistantManualMessageContent, {
      record: value,
      checkedAt: Date.parse("2026-10-15T14:50:02.000Z"),
    }),
  )

test("saved message, recording facts and saved recipient are shown as saved; the current Order label separately", () => {
  const html = render(record())
  for (const text of [
    "Nothing sent",
    "Delivery not verified",
    "ẸwáTrade sent nothing",
    "Your gown is ready.\nCollect after 2pm with your ticket.",
    "SMS from the staff member’s own phone",
    "2026-10-14T08:55:00.000Z",
    "staff-user-42",
    "From the shop phone",
    "Saved recipient at the time",
    "+2348000000001",
    "saved@example.test",
    "Related Order (current)",
    "ORD-3001",
    "Current Label Name",
    "2026-10-15T14:50:02.000Z",
  ])
    expect(html).toContain(text)
  for (const text of [
    "private-actor",
    "private-business",
    "private-store",
    "private-job",
    "private-order",
    "private-intent",
    "private-share",
    "<button",
    "<a ",
  ])
    expect(html).not.toContain(text)
})

test("a full 1000-character message renders untruncated; unsupported records render nothing private", () => {
  const long = record()
  long.intent.message = "m".repeat(1000)
  expect(render(long)).toContain("m".repeat(1000))
  for (const change of [
    (v: ManualMessage) => Object.assign(v.share, { channel: "EMAIL" }),
    (v: ManualMessage) => Object.assign(v.intent, { message: "  " }),
    (v: ManualMessage) =>
      Object.assign(v.intent, { message: "x".repeat(1001) }),
    (v: ManualMessage) => Object.assign(v.share, { note: "n".repeat(501) }),
  ]) {
    const value = record()
    change(value)
    const html = render(value)
    expect(html).toContain("unsupported state")
    expect(html).not.toContain("Your gown is ready")
    expect(html).not.toContain("+2348000000001")
  }
})
