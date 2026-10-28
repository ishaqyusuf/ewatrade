import { expect, test } from "bun:test"
import { templateUpdateEmailAllowed } from "./template-updates"

test("only managers receive template notices, with personal and business opt-outs respected", () => {
  const input = { role: "OWNER", storeId: "store-1" }
  expect(templateUpdateEmailAllowed(input)).toBe(true)
  expect(templateUpdateEmailAllowed({ ...input, role: "ADMIN" })).toBe(true)
  for (const role of ["MANAGER", "CASHIER", "OPERATOR", "MEMBER", "SUPPORT"])
    expect(
      templateUpdateEmailAllowed({ ...input, role, preference: "on" }),
    ).toBe(false)
  expect(templateUpdateEmailAllowed({ ...input, preference: "off" })).toBe(
    false,
  )
  expect(
    templateUpdateEmailAllowed({
      ...input,
      policy: {
        emailAllowed: false,
        emailDefault: true,
        recipientRoles: ["OWNER"],
      },
      preference: "on",
    }),
  ).toBe(false)
  expect(
    templateUpdateEmailAllowed({
      ...input,
      policy: {
        emailAllowed: true,
        emailDefault: true,
        recipientRoles: ["ADMIN"],
      },
    }),
  ).toBe(false)
  expect(
    templateUpdateEmailAllowed({
      ...input,
      policy: {
        emailAllowed: true,
        emailDefault: false,
        recipientRoles: ["OWNER"],
      },
    }),
  ).toBe(false)
  expect(
    templateUpdateEmailAllowed({
      ...input,
      policy: {
        emailAllowed: true,
        emailDefault: false,
        recipientRoles: ["OWNER"],
      },
      preference: "on",
    }),
  ).toBe(true)
})
test("subscriptions cannot expand store access or override a business/personal denial", () => {
  const input = { role: "ADMIN", storeId: "store-1" }
  const subscription = {
    enabled: true,
    emailAllowed: true,
    scopeKind: "stores",
    stores: [{ storeId: "store-2" }],
  }
  expect(templateUpdateEmailAllowed({ ...input, subscription })).toBe(false)
  expect(
    templateUpdateEmailAllowed({
      ...input,
      subscription: { ...subscription, stores: [{ storeId: "store-1" }] },
    }),
  ).toBe(true)
  expect(
    templateUpdateEmailAllowed({
      ...input,
      subscription: { ...subscription, scopeKind: "business", enabled: false },
    }),
  ).toBe(false)
  expect(
    templateUpdateEmailAllowed({
      ...input,
      subscription: { ...subscription, scopeKind: "accessible_stores" },
    }),
  ).toBe(true)
  expect(
    templateUpdateEmailAllowed({
      ...input,
      subscription: { ...subscription, scopeKind: "unknown" },
    }),
  ).toBe(false)
})
