import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type { Capability } from "@ewatrade/assistant/capabilities/types"
import type { Session } from "@ewatrade/auth"
import {
  isLinkedAssistantIdentity,
  requireBrowserIdentity,
} from "./channel-principal"
import { assertLinkedAssistantRead } from "./channel-read-policy"
import {
  type GeneralContext,
  supportsGeneralCapability,
} from "./general-context"

test("JSON and client headers cannot forge a linked or browser Session principal", () => {
  const attempted = {
    user: { id: "someone-else" },
    session: null,
    principal: {
      kind: "linked_whatsapp",
      grantId: "guessed",
      bindingId: "guessed",
    },
    "verified-assistant-channel-identity": true,
  }
  expect(isLinkedAssistantIdentity(attempted)).toBe(false)
  expect(() =>
    requireBrowserIdentity(attempted as unknown as Session),
  ).toThrow()
  expect(() => requireBrowserIdentity(null)).toThrow()
  const browser = {
    user: { id: "actor" },
    session: { id: "actual-session" },
  } as unknown as Session
  expect(requireBrowserIdentity(browser)).toBe(browser)
  const search = capabilityManifest.find(
    (entry) => entry.id === "search.records",
  )
  if (!search) throw Error("Search capability required")
  const whatsappOnly: Capability = { ...search, clients: ["whatsapp"] }
  const untrusted = {
    session: browser,
    requestHeaders: new Headers({ "x-assistant-client": "whatsapp" }),
  } as unknown as GeneralContext
  expect(supportsGeneralCapability(untrusted, whatsappOnly)).toBe(false)
})

test("channel domain callers cannot use a write, unrelated procedure, missing or closed capability", () => {
  expect(
    assertLinkedAssistantRead(
      {
        capabilityId: "search.records",
        path: "search.global",
        type: "query",
        role: "OWNER",
      },
      { APP_ENV: "local", ASSISTANT_WHATSAPP_READS_ENABLED: "true" },
    ).id,
  ).toBe("search.records")
  for (const input of [
    { path: "finance.book", type: "query", role: "OWNER" },
    {
      capabilityId: "search.records",
      path: "search.global",
      type: "mutation",
      role: "OWNER",
    },
    {
      capabilityId: "search.records",
      path: "orders.create",
      type: "mutation",
      role: "OWNER",
    },
    {
      capabilityId: "sales.order.create",
      path: "orders.create",
      type: "query",
      role: "OWNER",
    },
    {
      capabilityId: "services.work.original.read",
      path: "serviceAssistantWork.original",
      type: "query",
      role: "OWNER",
    },
  ])
    expect(() => assertLinkedAssistantRead(input)).toThrow()
})

test("WhatsApp read expansion preserves canonical paths, role ceilings, closed production gates and write refusal", () => {
  const local = { APP_ENV: "local", ASSISTANT_WHATSAPP_READS_ENABLED: "true" }
  const ids = [
    "catalog.item.read",
    "catalog.history.read",
    "catalog.page",
    "catalog.count",
    "customers.read",
    "customers.page",
    "customers.count",
    "sales.orders.read",
    "sales.order.read",
    "sales.summary.read",
    "sales.orders.summary",
    "sales.orders.lookup",
    "inventory.totals.read",
    "inventory.balances.read",
    "inventory.offering_stock.read",
    "inventory.low_stock.read",
    "finance.purchase_registrations.read",
    "finance.purchase_recognition.read",
    "finance.purchases.read",
    "finance.purchase.read",
    "finance.suppliers.read",
    "finance.supplier_statement.read",
    "finance.expense_categories.read",
    "finance.money_account_balances.read",
    "finance.money_accounts.read",
    "services.queue.read",
    "customers.receivables.read",
    "customers.accounts.read",
  ]
  for (const id of ids) {
    const capability = capabilityManifest.find((entry) => entry.id === id)
    if (!capability) throw Error(`Missing read ${id}`)
    const roles: readonly string[] = capability.policy.roles
    for (const path of capability.procedures) {
      const request = { capabilityId: id, path, type: "query", role: "OWNER" }
      expect(assertLinkedAssistantRead(request, local).id).toBe(id)
      expect(() =>
        assertLinkedAssistantRead({ ...request, type: "mutation" }, local),
      ).toThrow()
      expect(() =>
        assertLinkedAssistantRead(request, { ...local, APP_ENV: "production" }),
      ).toThrow()
      expect(() =>
        assertLinkedAssistantRead(
          { ...request, path: "finance.transfer" },
          local,
        ),
      ).toThrow()
      if (!roles.includes("CASHIER"))
        expect(() =>
          assertLinkedAssistantRead({ ...request, role: "CASHIER" }, local),
        ).toThrow()
    }
  }
  expect(() =>
    assertLinkedAssistantRead(
      {
        capabilityId: "catalog.item.read",
        path: "detail.overview",
        type: "query",
        role: "OWNER",
      },
      local,
    ),
  ).toThrow()
  expect(() =>
    assertLinkedAssistantRead(
      {
        capabilityId: "catalog.history.read",
        path: "detail.activity",
        type: "query",
        role: "OWNER",
      },
      local,
    ),
  ).toThrow()
})
