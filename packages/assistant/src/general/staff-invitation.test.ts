import { expect, test } from "bun:test"
import {
  generalActionSchema,
  generalAnswerTargetSchema,
  generalReceiptSchema,
} from "./contracts"

const invite = {
  email: " PERSON@EXAMPLE.TEST ",
  name: " Person ",
  assignments: [{ storeId: "store", role: "MANAGER" }],
  defaultStoreId: "store",
  catalogEditor: true,
}
test("staff drafts normalize recipients and require exact explicit grants without accepting execution authority", () => {
  const action = {
    action: "staff_invitation",
    intent: { kind: "INVITE", invite },
  }
  expect(generalActionSchema.parse(action)).toMatchObject({
    intent: { invite: { email: "person@example.test", name: "Person" } },
  })
  for (const patch of [
    { catalogEditor: undefined },
    { assignments: [] },
    { assignments: [invite.assignments[0], invite.assignments[0]] },
    { defaultStoreId: "foreign" },
    { assignments: [{ storeId: "store", role: "OWNER" }] },
    { assignments: [{ storeId: "store", role: "CASHIER" }] },
    { tenantId: "foreign" },
    { acceptanceToken: "private" },
    { clientCommandId: "forged" },
  ])
    expect(
      generalActionSchema.safeParse({
        ...action,
        intent: { kind: "INVITE", invite: { ...invite, ...patch } },
      }).success,
    ).toBe(false)
  for (const kind of ["RESEND", "REVOKE"]) {
    expect(
      generalActionSchema.safeParse({
        action: "staff_invitation",
        intent: {
          kind,
          invitationId: "exact-invitation",
          reason: "Reviewed recipient request",
        },
      }).success,
    ).toBe(true)
    for (const patch of [
      { reason: " " },
      { invitationId: " " },
      { invite },
      { delivered: true },
    ])
      expect(
        generalActionSchema.safeParse({
          action: "staff_invitation",
          intent: {
            kind,
            invitationId: "exact-invitation",
            reason: "Reviewed request",
            ...patch,
          },
        }).success,
      ).toBe(false)
  }
})
test("invitation Open target and safe receipt carry exact command identity without authority or tokens", () => {
  const target = { kind: "staff_invitation", commandId: " command " }
  expect(generalAnswerTargetSchema.parse(target)).toEqual({
    kind: "staff_invitation",
    commandId: "command",
  })
  for (const patch of [
    { commandId: "" },
    { commandId: "x".repeat(161) },
    { tenantId: "foreign" },
    { actorUserId: "forged" },
    { url: "https://example.test" },
    { acceptanceToken: "private" },
  ])
    expect(
      generalAnswerTargetSchema.safeParse({ ...target, ...patch }).success,
    ).toBe(false)
  expect(
    generalReceiptSchema.safeParse({
      kind: "staff_invitation",
      recordId: "command",
      title: "Invitation saved",
      detail: "Email requested; delivery is separate.",
    }).success,
  ).toBe(true)
})
