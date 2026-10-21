import { expect, test } from "bun:test"
import { writeCapabilities } from "../capabilities/manifest"
import type { Capability } from "../capabilities/types"
import { generalAnswerSchema } from "../general/contracts"
import {
  capabilityActionHandoffInstruction,
  capabilityActionHandoffLink,
  capabilityActionHandoffSchema,
  classifyCapabilityAction,
} from "./capability-action-handoff"
import { renderWhatsAppFinalReply } from "./render"

const environment = {
  APP_ENV: "local",
  NODE_ENV: "test",
  ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
}
const scope = { tenantId: "business-one", storeId: "store-one" }
const handoff = capabilityActionHandoffSchema.parse({
  kind: "action_app_handoff",
  version: 1,
  capabilityId: "inventory.stock.receive",
  action: "stock_receive",
  reason: "complete_app_review",
  conversation: {
    conversationId: "saved-chat-one",
    purpose: "GENERAL",
    origin: scope,
  },
})
const options = {
  trustedAppOrigin: "https://dash.ewatrade.com",
  currentScope: scope,
}

test("current native seven and all 37 other eligible writes receive explicit honest classifications", () => {
  const native = writeCapabilities.filter(
    (capability) =>
      classifyCapabilityAction(capability, environment).kind ===
      "native_review",
  )
  expect(native.map((capability) => capability.action).sort()).toEqual([
    "customer_create",
    "customer_update",
    "expense_record_simple",
    "money_in_record",
    "money_transfer_simple",
    "product_create",
    "sale_record",
  ])
  const app = writeCapabilities.filter(
    (capability) =>
      classifyCapabilityAction(capability, environment).kind === "app_review",
  )
  expect(app.map((capability) => capability.id).sort()).toEqual(
    [
      "catalog.availability.update",
      "catalog.details.update",
      "catalog.identifiers.update",
      "catalog.price.update",
      "catalog.units.draft",
      "catalog.units.publish",
      "finance.expense.record",
      "finance.money_movement.record",
      "finance.purchase.fact.reverse",
      "finance.purchase.pay",
      "finance.purchase.payment.reverse",
      "finance.purchase.recognize",
      "finance.purchase.register",
      "finance.supplier.advance",
      "finance.supplier.advance.allocate",
      "finance.supplier.allocation.release",
      "finance.supplier.create",
      "inventory.closeout.create",
      "inventory.closeout.finalize",
      "inventory.count.create",
      "inventory.count.finalize",
      "inventory.stock.adjust",
      "inventory.stock.correct",
      "inventory.stock.receive",
      "inventory.transfer.cancel",
      "inventory.transfer.dispatch",
      "inventory.transfer.receive",
      "sales.order.attachment.add",
      "sales.order.cancel",
      "sales.order.create",
      "sales.order.metadata.update",
      "sales.order.replace",
      "sales.payment.record",
      "sales.product.fulfill",
      "sales.products.fulfill",
      "sales.service.authorize",
      "sales.service.fulfill",
    ].sort(),
  )
  expect(app.every((capability) => capability.rollout !== "planned")).toBe(true)
})

test("planned services, staff, settings, finance and inventory actions remain planned even with all channel flags", () => {
  const plannedIds = [
    "catalog.archive",
    "customers.allocation.release",
    "customers.credit.apply",
    "customers.credit.refund",
    "customers.receipt.record",
    "finance.bill.pay",
    "finance.bill_payment.reverse",
    "finance.cash_count.record",
    "finance.expense.void",
    "finance.purchase.record",
    "finance.supplier.entry.reverse",
    "finance.supplier.opening",
    "inventory.custody.move",
    "inventory.package.transform",
    "sales.product.return",
    "services.intake.create",
    "services.message.share",
    "services.quote.approve",
    "services.quote.reject",
    "services.work.assign",
    "services.work.exception",
    "services.work.handoff",
    "services.work.note",
    "services.work.reschedule",
    "services.work.rework",
    "services.work.transition",
    "settings.store.change",
    "staff.access.change",
    "staff.invitation.manage",
    "staff.removal.unaccepted",
    "staff.status.change",
  ]
  expect(
    writeCapabilities
      .filter((capability) => capability.rollout === "planned")
      .map((capability) => capability.id)
      .sort(),
  ).toEqual(plannedIds.sort())
  for (const capability of writeCapabilities.filter((entry) =>
    plannedIds.includes(entry.id),
  ))
    expect(classifyCapabilityAction(capability, environment)).toEqual({
      kind: "planned",
    })
})

test("source/disabled native confirmations hand off without granting execution and metadata cannot invent an adapter", () => {
  const customer = writeCapabilities.find(
    (capability) => capability.action === "customer_create",
  )
  const inventory = writeCapabilities.find(
    (capability) => capability.action === "stock_receive",
  )
  if (!customer || !inventory)
    throw Error("Expected fixed canonical capability")
  expect(
    classifyCapabilityAction(customer, {
      ...environment,
      APP_ENV: "production",
    }),
  ).toEqual({ kind: "app_review", reason: "channel_confirmation_unavailable" })
  expect(
    classifyCapabilityAction(customer, {
      ...environment,
      ASSISTANT_WHATSAPP_WRITES_ENABLED: "false",
    }),
  ).toEqual({ kind: "app_review", reason: "channel_confirmation_unavailable" })
  const promotedMetadata: Capability = {
    ...inventory,
    clients: ["dashboard", "whatsapp"],
    whatsapp: { mode: "native", rollout: "enabled" },
  }
  expect(classifyCapabilityAction(promotedMetadata, environment)).toEqual({
    kind: "app_review",
    reason: "complete_app_review",
  })
  const staff: Capability = {
    ...inventory,
    id: "staff.future-sensitive",
    domain: "staff",
    clients: ["dashboard", "whatsapp"],
    whatsapp: { mode: "native", rollout: "enabled" },
  }
  expect(classifyCapabilityAction(staff, environment)).toEqual({
    kind: "app_review",
    reason: "sensitive_app_review",
  })
})

test("handoff persists exact chat identity and renders only the configured app origin and matching scope", () => {
  expect(capabilityActionHandoffLink(handoff, options)).toEqual({
    href: "https://dash.ewatrade.com/assistant/c/saved-chat-one",
    label: "Open saved chat in EwaTrade",
  })
  const answer = generalAnswerSchema.parse({
    id: "handoff-one",
    title: "Receive stock",
    value: "Continue in EwaTrade",
    scope: "Store one",
    asOf: "2026-10-15T12:00:00.000Z",
    detail: capabilityActionHandoffInstruction,
    handoff,
  })
  const rendered = renderWhatsAppFinalReply(
    [{ type: "data-general-answer", data: answer }],
    options,
  )
  expect(rendered.kind).toBe("reply")
  expect(rendered.chunks.join("\n")).toContain(
    "No draft or business change was created",
  )
  expect(rendered.chunks.join("\n")).toContain(
    "https://dash.ewatrade.com/assistant/c/saved-chat-one",
  )
  for (const currentScope of [
    { ...scope, tenantId: "other-business" },
    { ...scope, storeId: "other-store" },
  ])
    expect(
      capabilityActionHandoffLink(handoff, { ...options, currentScope }),
    ).toBeUndefined()
  expect(
    capabilityActionHandoffLink(handoff, {
      ...options,
      trustedAppOrigin: "https://dash.ewatrade.com?token=secret",
    }),
  ).toBeUndefined()
})

test("malformed saved metadata drops without failing old answers and cannot carry proposal claims, URLs or credentials", () => {
  for (const invalid of [
    { ...handoff, proposalId: "invented" },
    { ...handoff, approvalToken: "secret" },
    { ...handoff, url: "https://evil.example" },
    { ...handoff, actorUserId: "someone" },
    { ...handoff, version: 2 },
    { ...handoff, conversation: { ...handoff.conversation, purpose: "SETUP" } },
  ]) {
    expect(capabilityActionHandoffSchema.safeParse(invalid).success).toBe(false)
    expect(capabilityActionHandoffLink(invalid, options)).toBeUndefined()
    expect(
      generalAnswerSchema.parse({
        id: "old-answer",
        title: "Saved",
        value: "Continue",
        scope: "Store",
        asOf: "2026-10-15T12:00:00.000Z",
        detail: "Saved reply remains readable.",
        handoff: invalid,
      }).handoff,
    ).toBeUndefined()
  }
})
