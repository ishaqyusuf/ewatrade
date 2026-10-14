import { expect, test } from "bun:test"
import {
  businessActivityListInput,
  businessActivityMoneySchema,
  businessActivityTargetSchema,
  businessActivityViewSchema,
} from "./contracts"
import {
  businessNotificationListInput,
  businessNotificationPolicyInput,
  businessNotificationPreferenceInput,
  businessNotificationReceiptInput,
  businessNotificationScopeSchema,
  businessNotificationSubscriptionsInput,
} from "./inputs"
import {
  type BusinessDeliveryEligibility,
  resolveBusinessDelivery,
} from "./policy"

test("infinite reads accept forward transport metadata without relaxing input authority", () => {
  const activity = {
    from: "2026-10-13T23:00:00Z",
    to: "2026-10-14T23:00:00Z",
  }
  for (const [schema, base] of [
    [businessActivityListInput, activity],
    [businessNotificationListInput, {}],
    [businessNotificationSubscriptionsInput, {}],
  ] as const) {
    for (const cursor of [undefined, "opaque-next-page"])
      expect(
        schema.safeParse({ ...base, direction: "forward", cursor }).success,
      ).toBe(true)
    for (const extra of [
      { direction: "backward" },
      { direction: "sideways" },
      { direction: "forward", tenantId: "other" },
      { direction: "forward", viewerUserId: "owner" },
    ])
      expect(schema.safeParse({ ...base, ...extra }).success).toBe(false)
  }
})

test("exact money survives the number precision boundary and rejects malformed or out-of-range values", () => {
  const money = { minor: "9007199254740993", currencyCode: "NGN" as const }
  expect(businessActivityMoneySchema.parse(money)).toEqual(money)
  for (const minor of [
    "1.5",
    "01",
    "-0",
    "NaN",
    "9223372036854775808",
    "-9223372036854775809",
  ])
    expect(
      businessActivityMoneySchema.safeParse({ ...money, minor }).success,
    ).toBe(false)
  expect(
    businessActivityMoneySchema.safeParse({ ...money, minor: 900 }).success,
  ).toBe(false)
})

test("public read inputs cannot claim a Tenant, viewer or recipient and require a bounded positive window", () => {
  const input = { from: "2026-10-13T23:00:00Z", to: "2026-10-14T23:00:00Z" }
  expect(businessActivityListInput.parse(input).limit).toBe(25)
  for (const extra of [
    { tenantId: "other" },
    { viewerUserId: "owner" },
    { email: "owner@example.com" },
  ])
    expect(
      businessActivityListInput.safeParse({ ...input, ...extra }).success,
    ).toBe(false)
  for (const extra of [
    { to: input.from },
    { to: "2027-10-14T23:00:00Z" },
    { limit: 101 },
    { actorMembershipId: "cashier", actorKind: "system" },
  ])
    expect(
      businessActivityListInput.safeParse({ ...input, ...extra }).success,
    ).toBe(false)
})

test("target identity carries its actual order or Book rather than accepting an invented finance object", () => {
  expect(
    businessActivityTargetSchema.safeParse({ kind: "payment", id: "p" })
      .success,
  ).toBe(false)
  expect(
    businessActivityTargetSchema.safeParse({
      kind: "finance_movement",
      id: "m",
    }).success,
  ).toBe(false)
  expect(
    businessActivityTargetSchema.parse({
      kind: "finance_entry",
      id: "j",
      bookId: "b",
    }).kind,
  ).toBe("finance_entry")
  expect(
    businessActivityTargetSchema.safeParse({
      kind: "financeTransaction",
      id: "m",
    }).success,
  ).toBe(false)
})

test("unavailable actor output cannot retain private identity and output never accepts arbitrary private payload", () => {
  const event = {
    key: "event",
    type: "staff.invited",
    category: "staff",
    occurredAt: "2026-10-14T08:00:00Z",
    recordedAt: "2026-10-14T08:00:00Z",
    actor: {
      kind: "staff",
      membershipId: null,
      name: null,
      coverage: "unavailable",
    },
    subject: null,
    store: null,
    summary: "Staff invited",
    detail: null,
    amount: null,
    statusAtEvent: null,
    currentStatus: null,
    target: null,
    canOpen: false,
    coverage: "snapshot",
  }
  expect(businessActivityViewSchema.safeParse(event).success).toBe(true)
  expect(businessActivityViewSchema.parse(event).origin).toBeNull()
  expect(
    businessActivityViewSchema.parse({
      ...event,
      origin: { channel: "assistant" },
    }).origin,
  ).toEqual({ channel: "assistant" })
  expect(
    businessActivityViewSchema.safeParse({
      ...event,
      actor: { ...event.actor, name: "Erased name" },
    }).success,
  ).toBe(false)
  expect(
    businessActivityViewSchema.safeParse({ ...event, inviteToken: "secret" })
      .success,
  ).toBe(false)
  expect(
    businessActivityViewSchema.safeParse({ ...event, canOpen: true }).success,
  ).toBe(false)
})

test("notification inputs separate personal preference from grants and disallow empty Store scope", () => {
  expect(
    businessNotificationPreferenceInput.safeParse({
      type: "order.recorded",
      preference: { inApp: "on", email: "off" },
      membershipId: "someone-else",
    }).success,
  ).toBe(false)
  expect(
    businessNotificationScopeSchema.safeParse({ kind: "stores", storeIds: [] })
      .success,
  ).toBe(false)
  expect(
    businessNotificationReceiptInput.safeParse({
      receiptIds: ["r"],
      membershipId: "someone-else",
    }).success,
  ).toBe(false)
  expect(
    businessNotificationPolicyInput.safeParse({
      type: "order.recorded",
      allowed: { inApp: true, email: false },
      defaults: { inApp: true, email: true },
      recipientRoles: [],
      expectedRevision: 0,
    }).success,
  ).toBe(false)
})

const eligible: BusinessDeliveryEligibility = {
  method: "in_app",
  supported: true,
  policyAllowed: true,
  subscriptionAllowed: true,
  defaultEnabled: true,
  preference: "inherit",
  activeMembership: true,
  sameTenant: true,
  domainAuthorized: true,
  relationshipMatches: true,
  channelReady: true,
}

test("a personal opt-in or admin subscription cannot bypass any fresh delivery authority cap", () => {
  expect(resolveBusinessDelivery(eligible)).toEqual({ allowed: true })
  for (const key of [
    "supported",
    "policyAllowed",
    "subscriptionAllowed",
    "activeMembership",
    "sameTenant",
    "domainAuthorized",
    "relationshipMatches",
    "channelReady",
  ] as const)
    expect(
      resolveBusinessDelivery({ ...eligible, preference: "on", [key]: false })
        .allowed,
    ).toBe(false)
  expect(resolveBusinessDelivery({ ...eligible, preference: "off" })).toEqual({
    allowed: false,
    reason: "preference_disabled",
  })
  expect(
    resolveBusinessDelivery({
      ...eligible,
      preference: "inherit",
      defaultEnabled: false,
    }).allowed,
  ).toBe(false)
  expect(
    resolveBusinessDelivery({
      ...eligible,
      preference: "on",
      defaultEnabled: false,
    }).allowed,
  ).toBe(true)
  expect(
    resolveBusinessDelivery({
      ...eligible,
      method: "email",
      preference: "on",
      supported: false,
    }),
  ).toEqual({ allowed: false, reason: "unsupported" })
})
