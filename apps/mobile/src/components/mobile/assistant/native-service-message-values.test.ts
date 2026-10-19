import { expect, test } from "bun:test"
import {
  nativeServiceMessageCandidate,
  nativeServiceMessageContextKey,
  nativeServiceMessageContextMatches,
  nativeServiceMessageContextSchema,
  nativeServiceMessageProfileKey,
} from "./native-service-message-values"
const initial = {
  action: "service_message_share" as const,
  jobId: "job",
  channel: "manual" as const,
  message: "Original",
  alreadyShared: true as const,
}
const profile = {
  id: "actor",
  businessId: "tenant",
  storeId: "store",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  status: "ACTIVE",
}
const context = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  job: { id: "job", revision: 4 },
  order: { id: "order", number: "ORD-1" },
  recipient: { name: "Current name", phone: "+2348030001234", email: null },
  asOf: "2026-10-15T14:00:00.000Z",
}
const edits = {
  channel: "whatsapp" as const,
  message: " Exact message ",
  reason: " Note ",
  alreadyShared: true,
  acknowledgedContext: nativeServiceMessageContextKey(context),
}
test("candidate emits exact fixed Job and reviewed fields only with renewed self-report", () => {
  const result = nativeServiceMessageCandidate(initial, edits, context)
  expect(result).toEqual({
    ok: true,
    payload: {
      action: initial.action,
      jobId: "job",
      channel: "whatsapp",
      message: "Exact message",
      reason: "Note",
      alreadyShared: true,
    },
  })
  expect(initial.message).toBe("Original")
  expect(
    nativeServiceMessageCandidate(
      initial,
      { ...edits, alreadyShared: false },
      context,
    ).ok,
  ).toBe(false)
  expect(nativeServiceMessageCandidate(initial, edits).ok).toBe(false)
  expect(
    nativeServiceMessageCandidate(initial, edits, {
      ...context,
      job: { ...context.job, id: "other" },
    }).ok,
  ).toBe(false)
  expect(
    nativeServiceMessageCandidate({ ...initial, jobId: "" }, edits, context).ok,
  ).toBe(false)
  expect(
    nativeServiceMessageCandidate(
      { ...initial, recipientPhone: "other" } as typeof initial,
      edits,
      context,
    ).ok,
  ).toBe(false)
})
test("all sharing methods preserve bounded full text and require an existing remote phone", () => {
  for (const channel of ["manual", "sms", "whatsapp"] as const) {
    expect(
      nativeServiceMessageCandidate(
        initial,
        {
          ...edits,
          channel,
          message: "x".repeat(1000),
          reason: "x".repeat(500),
        },
        context,
      ).ok,
    ).toBe(true)
    expect(
      nativeServiceMessageCandidate(
        initial,
        { ...edits, channel, message: "x".repeat(1001) },
        context,
      ).ok,
    ).toBe(false)
    expect(
      nativeServiceMessageCandidate(
        initial,
        { ...edits, channel, reason: "x".repeat(501) },
        context,
      ).ok,
    ).toBe(false)
    expect(
      nativeServiceMessageCandidate(
        initial,
        { ...edits, channel, message: " " },
        context,
      ).ok,
    ).toBe(false)
    expect(
      nativeServiceMessageCandidate(
        initial,
        {
          ...edits,
          channel,
          acknowledgedContext: nativeServiceMessageContextKey({
            ...context,
            recipient: { ...context.recipient, phone: null },
          }),
        },
        { ...context, recipient: { ...context.recipient, phone: null } },
      ).ok,
    ).toBe(channel === "manual")
  }
  expect(
    nativeServiceMessageCandidate(initial, { ...edits, reason: " " }, context),
  ).toEqual({
    ok: true,
    payload: {
      action: initial.action,
      jobId: "job",
      channel: "whatsapp",
      message: "Exact message",
      alreadyShared: true,
    },
  })
})
test("scope keys and context matching refuse stale/foreign/unsupported access without changing policy", () => {
  expect(nativeServiceMessageContextSchema.parse(context)).toEqual(context)
  expect(
    nativeServiceMessageContextSchema.safeParse({
      ...context,
      recipient: { ...context.recipient, token: "private" },
    }).success,
  ).toBe(false)
  expect(nativeServiceMessageContextMatches(context, profile, "job")).toBe(true)
  for (const changed of [
    { ...context, actorUserId: "other" },
    { ...context, tenantId: "other" },
    { ...context, storeId: "other" },
    { ...context, job: { ...context.job, id: "other" } },
    null,
    {},
  ])
    expect(nativeServiceMessageContextMatches(changed, profile, "job")).toBe(
      false,
    )
  for (const changed of [
    { ...profile, status: "SUSPENDED" },
    { ...profile, storeId: null },
    { ...profile, role: "CASHIER" },
    { ...profile, role: "MANAGER", staffAccessMode: "SCOPED" },
    { ...profile, role: "MANAGER", staffAccessMode: undefined },
  ])
    expect(nativeServiceMessageContextMatches(context, changed, "job")).toBe(
      false,
    )
  expect(
    nativeServiceMessageContextMatches(
      context,
      { ...profile, role: "MANAGER" },
      "job",
    ),
  ).toBe(true)
  expect(
    nativeServiceMessageProfileKey({ ...profile, status: "SUSPENDED" }),
  ).toBeNull()
  expect(
    nativeServiceMessageProfileKey({ ...profile, storeId: null }),
  ).toBeNull()
  expect(nativeServiceMessageProfileKey(profile)).not.toBe(
    nativeServiceMessageProfileKey({ ...profile, role: "ADMIN" }),
  )
})

test("renewed acknowledgement is bound to displayed exact Job and recipient, not checked-at time", () => {
  expect(
    nativeServiceMessageCandidate(initial, edits, {
      ...context,
      asOf: "2026-10-15T15:00:00.000Z",
    }).ok,
  ).toBe(true)
  for (const changed of [
    { ...context, job: { ...context.job, revision: 5 } },
    { ...context, order: { ...context.order, id: "new-order" } },
    {
      ...context,
      recipient: { ...context.recipient, phone: "+2348030005678" },
    },
    {
      ...context,
      recipient: { ...context.recipient, email: "other@example.test" },
    },
    {
      ...context,
      recipient: { ...context.recipient, name: "Changed current label" },
    },
  ]) {
    expect(nativeServiceMessageCandidate(initial, edits, changed).ok).toBe(
      false,
    )
    expect(
      nativeServiceMessageCandidate(
        initial,
        {
          ...edits,
          acknowledgedContext: nativeServiceMessageContextKey(changed),
        },
        changed,
      ).ok,
    ).toBe(true)
  }
  expect(
    nativeServiceMessageCandidate(
      initial,
      { ...edits, acknowledgedContext: null },
      context,
    ).ok,
  ).toBe(false)
})
