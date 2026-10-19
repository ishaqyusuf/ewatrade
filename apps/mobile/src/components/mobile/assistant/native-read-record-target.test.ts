import { expect, test } from "bun:test"
import { isAssistantSessionCurrent } from "./assistant-scope"
import { generalAnswerRoute } from "./general-model"

const origin = { tenantId: "original-business", storeId: "original-store" }

test("saved catalog/order navigation keeps exact identity and requires original business and Store", () => {
  const catalog = {
    kind: "catalog_item" as const,
    catalogItemId: "saved-item",
    origin,
  }
  const order = { kind: "order" as const, orderId: "saved-order", origin }
  expect(generalAnswerRoute(catalog, origin)).toEqual({
    pathname: "/catalog-item/[catalogItemId]",
    params: { catalogItemId: "saved-item" },
  })
  expect(generalAnswerRoute(order, origin)).toEqual({
    pathname: "/order/[orderId]",
    params: { orderId: "saved-order" },
  })
  for (const target of [catalog, order]) {
    expect(generalAnswerRoute(target)).toBeNull()
    expect(generalAnswerRoute(target, null)).toBeNull()
    expect(
      generalAnswerRoute(target, { ...origin, tenantId: "other-business" }),
    ).toBeNull()
    expect(
      generalAnswerRoute(target, { ...origin, storeId: "other-store" }),
    ).toBeNull()
  }
})

test("customer facts request the dashboard rather than substituting a ledger or another record", () => {
  expect(
    generalAnswerRoute(
      { kind: "customer", customerId: "saved-customer", origin },
      origin,
    ),
  ).toBeNull()
  expect(
    generalAnswerRoute({ kind: "customer_directory", origin }, origin),
  ).toBeNull()
  expect(generalAnswerRoute(undefined, origin)).toBeNull()
})

test("the press-time session fence refuses offline, actor, Store and token changes", () => {
  const session = {
    token: "ordinary-token",
    profile: {
      id: "actor",
      name: "Owner",
      email: "synthetic@example.test",
      businessId: origin.tenantId,
      storeId: origin.storeId,
      role: "OWNER",
      status: "ACTIVE",
    },
  }
  expect(isAssistantSessionCurrent(session, session, false, false)).toBe(true)
  expect(isAssistantSessionCurrent(session, session, true, false)).toBe(false)
  expect(
    isAssistantSessionCurrent(
      session,
      { ...session, token: "rotated-token" },
      false,
      false,
    ),
  ).toBe(false)
  expect(
    isAssistantSessionCurrent(
      session,
      { ...session, profile: { ...session.profile, id: "another-actor" } },
      false,
      false,
    ),
  ).toBe(false)
  expect(
    isAssistantSessionCurrent(
      session,
      { ...session, profile: { ...session.profile, storeId: "other-store" } },
      false,
      false,
    ),
  ).toBe(false)
})
