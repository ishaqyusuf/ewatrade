import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  GeneralServiceMessageEditor,
  editedServiceMessage,
} from "./general-service-message-editor"

// Source/unit evidence only: static render and the save path's validation.
const draft = {
  action: "service_message_share" as const,
  jobId: "job-1",
  channel: "whatsapp" as const,
  message: "Your shoes are ready for pickup.",
  reason: "Sent from the shop phone",
  alreadyShared: true as const,
}

test("the editor offers channel, message, note and an explicit acknowledgement only", () => {
  const html = renderToStaticMarkup(
    <GeneralServiceMessageEditor
      initial={draft}
      disabled={false}
      onSave={() => {}}
      onCancel={() => {}}
    />,
  )
  expect(html).toContain('id="service-message-text"')
  expect(html).toContain('id="service-message-reason"')
  expect(html).toContain("I already shared this message myself")
  expect(html).toContain("ewatrade sends nothing")
  expect(html).toContain("tracking history")
  expect(html).toContain('aria-pressed="true"')
  expect(html).not.toContain("job-1")
  expect(html).not.toMatch(/phone number|recipient/i)
})

test("saving keeps the drafted Job and needs a fresh acknowledgement", () => {
  const edits = {
    channel: "sms" as const,
    message: "Ready from 3pm.",
    reason: " ",
    alreadyShared: true,
  }
  const { reason: _reason, ...withoutReason } = draft
  expect(editedServiceMessage(draft, edits)).toEqual({
    ok: true,
    payload: { ...withoutReason, channel: "sms", message: "Ready from 3pm." },
  })
  expect(
    editedServiceMessage(draft, { ...edits, alreadyShared: false }),
  ).toEqual({
    ok: false,
    error: "Record a message only after you have shared it yourself.",
  })
  for (const message of [" ", "x".repeat(1001)])
    expect(editedServiceMessage(draft, { ...edits, message }).ok).toBe(false)
  expect(
    editedServiceMessage(draft, { ...edits, reason: "x".repeat(501) }).ok,
  ).toBe(false)
})
