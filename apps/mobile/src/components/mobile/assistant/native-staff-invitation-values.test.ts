import { expect, test } from "bun:test"
import {
  type NativeInvitationValues,
  type NativeStaffInvitationAction,
  nativeStaffInvitationCandidate,
} from "./native-staff-invitation-values"

const stores = [
  { id: "store-a", name: "Main" },
  { id: "store-b", name: "Annex" },
]
const invite: NativeInvitationValues = {
  email: "staff@example.test",
  name: "Staff",
  assignments: [
    { storeId: "store-a", role: "MANAGER" },
    { storeId: "store-b", role: "CASHIER" },
  ],
  defaultStoreId: "store-a",
  catalogEditor: true,
}
const initial: NativeStaffInvitationAction = {
  action: "staff_invitation",
  intent: { kind: "INVITE", invite },
}
function edit(values: NativeInvitationValues, choices = stores) {
  return nativeStaffInvitationCandidate(
    initial,
    { kind: "INVITE", invite: values },
    choices,
  )
}

test("native invite edits normalize recipient and keep complete explicit Store grants", () => {
  const result = edit({ ...invite, email: " NEXT@example.test ", name: " " })
  expect(result.ok).toBe(true)
  if (!result.ok || result.payload.intent.kind !== "INVITE") return
  expect(result.payload.intent.invite).toEqual({
    ...invite,
    email: "next@example.test",
    name: undefined,
  })
  expect(initial.intent).toEqual({ kind: "INVITE", invite })
})
test("unknown or ambiguous current Store identities fail closed without dropping assignments", () => {
  expect(edit(invite, []).ok).toBe(false)
  expect(edit(invite, [stores[0]]).ok).toBe(false)
  expect(edit(invite, [...stores, stores[0]]).ok).toBe(false)
  expect(invite.assignments.length).toBe(2)
  expect(
    edit({ ...invite, assignments: [invite.assignments[0]] }, [stores[0]]).ok,
  ).toBe(true)
})
test("duplicates, unassigned starting Store and Manager-less catalog grant refuse", () => {
  expect(
    edit({
      ...invite,
      assignments: [invite.assignments[0], invite.assignments[0]],
    }).ok,
  ).toBe(false)
  expect(edit({ ...invite, defaultStoreId: "other" }).ok).toBe(false)
  const cashier = {
    ...invite,
    assignments: [{ storeId: "store-a", role: "CASHIER" as const }],
  }
  expect(edit(cashier).ok).toBe(false)
  expect(edit({ ...cashier, catalogEditor: false }).ok).toBe(true)
})
test("all 100 saved assignments survive and 101 refuse", () => {
  const choices = Array.from({ length: 101 }, (_, index) => ({
    id: `s-${index}`,
    name: `Store ${index}`,
  }))
  const assignments = choices.map(({ id: storeId }) => ({
    storeId,
    role: "OPERATOR" as const,
  }))
  const full = {
    ...invite,
    assignments: assignments.slice(0, 100),
    defaultStoreId: "s-99",
    catalogEditor: false,
  }
  const result = edit(full, choices)
  expect(result.ok).toBe(true)
  if (result.ok && result.payload.intent.kind === "INVITE") {
    expect(result.payload.intent.invite.assignments).toEqual(
      assignments.slice(0, 100),
    )
    expect(result.payload.intent.invite.defaultStoreId).toBe("s-99")
  }
  expect(edit({ ...full, assignments }, choices).ok).toBe(false)
  expect(edit({ ...full, assignments: [] }, choices).ok).toBe(false)
})
test("strict shared schema rejects extra fields, privileged roles and invalid recipients", () => {
  expect(edit({ ...invite, email: "bad" }).ok).toBe(false)
  expect(edit({ ...invite, name: "x".repeat(121) }).ok).toBe(false)
  expect(
    edit({
      ...invite,
      assignments: [{ storeId: "store-a", role: "OWNER" as never }],
    }).ok,
  ).toBe(false)
  expect(
    edit({ ...invite, credentials: "injected" } as NativeInvitationValues).ok,
  ).toBe(false)
  expect(
    nativeStaffInvitationCandidate(
      { ...initial, bypass: true } as NativeStaffInvitationAction,
      { kind: "INVITE", invite },
      stores,
    ).ok,
  ).toBe(false)
})
test("resend and revoke edit only reason while retaining exact operation and original invitation ID", () => {
  for (const kind of ["RESEND", "REVOKE"] as const) {
    const action: NativeStaffInvitationAction = {
      action: "staff_invitation",
      intent: {
        kind,
        invitationId: "original-private-id",
        reason: "Old reason",
      },
    }
    const result = nativeStaffInvitationCandidate(
      action,
      { kind, reason: " New reason " },
      [],
    )
    expect(result).toEqual({
      ok: true,
      payload: {
        action: "staff_invitation",
        intent: {
          kind,
          invitationId: "original-private-id",
          reason: "New reason",
        },
      },
    })
    expect(
      nativeStaffInvitationCandidate(action, { kind, reason: " " }, []).ok,
    ).toBe(false)
    expect(
      nativeStaffInvitationCandidate(
        action,
        { kind, reason: "x".repeat(501) },
        [],
      ).ok,
    ).toBe(false)
    expect(
      nativeStaffInvitationCandidate(
        action,
        { kind: kind === "RESEND" ? "REVOKE" : "RESEND", reason: "Switch" },
        [],
      ).ok,
    ).toBe(false)
    expect(
      nativeStaffInvitationCandidate(action, { kind: "INVITE", invite }, stores)
        .ok,
    ).toBe(false)
  }
  expect(
    nativeStaffInvitationCandidate(
      initial,
      { kind: "RESEND", reason: "Switch" },
      stores,
    ).ok,
  ).toBe(false)
})
