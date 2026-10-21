import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { GeneralStaffRemovalEditorView } from "./general-staff-removal-editor"

// Source/unit evidence only: the planned capability cannot be drafted live yet.
const draft = {
  action: "staff_removal" as const,
  membershipId: "member-1",
  expectedRevision: 3,
  reason: "Invited by mistake",
}
const review = {
  membershipId: "member-1",
  name: "Bola Ahmed",
  email: "bola@example.test",
  role: "OPERATOR" as const,
  status: "INVITED" as const,
  invitedAt: "2026-10-18T08:12:00.000Z",
  expectedRevision: 3,
  liveInviteLinks: 1,
  reason: "Invited by mistake",
  impact:
    "They never joined. Their invite links stop working, unsent invite emails are cancelled and their staff seat is freed.",
  reviewHash: "a".repeat(64),
}
const render = (
  props: Partial<Parameters<typeof GeneralStaffRemovalEditorView>[0]>,
) =>
  renderToStaticMarkup(
    <GeneralStaffRemovalEditorView
      initial={draft}
      disabled={false}
      review={review}
      onCancel={() => {}}
      onReviewSave={() => {}}
      onRetry={() => {}}
      {...props}
    />,
  )

test("the removal editor shows who in plain words and asks only for a reason", () => {
  const html = render({})
  expect(html).toContain("Bola Ahmed · bola@example.test")
  expect(html).toContain("Sales rep · Invited · never joined.")
  expect(html).toContain("Their invite link stops working.")
  expect(html).toContain("staff seat is freed")
  expect(html).toContain('name="reason"')
  expect(html).toContain("Save and review")
  expect(html).not.toContain("member-1")
  expect(html).not.toContain("revision")
})

test("an unavailable review explains why and offers Try again", () => {
  const html = render({
    review: null,
    unavailable: true,
    unavailableMessage: "Only people who never joined can be removed.",
  })
  expect(html).toContain("Only people who never joined can be removed.")
  expect(html).toContain("Try again")
})
