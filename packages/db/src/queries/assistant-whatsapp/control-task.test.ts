import { expect, test } from "bun:test"
import { whatsAppControlTaskStarter } from "@ewatrade/assistant/channels/controls"
import type { Prisma } from "../../../generated/prisma/client"
import { enqueueAssistantWhatsAppControlTaskInTransaction } from "./control-task"

const now = new Date("2026-10-21T12:00:00Z")
const parent = {
  id: "control-source",
  phoneNumberId: "123456789",
  providerMessageId: "wamid.original-user-choice",
  contentDigest: "a".repeat(64),
  providerOccurredAt: new Date(now.getTime() - 1000),
  receivedAt: now,
  expiresAt: new Date(now.getTime() + 60_000),
}
const selected = {
  principal: { phoneNumberId: parent.phoneNumberId, senderId: "2348000000000" },
  conversation: { purpose: "GENERAL" },
  binding: { id: "exact-binding" },
  scope: { userId: "actor", tenantId: "business", storeId: "exact-store" },
} as Parameters<typeof enqueueAssistantWhatsAppControlTaskInTransaction>[1]
function fixture(limited = false) {
  const saved: Record<string, unknown>[] = []
  let sequences = 0
  let usage = 0
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () =>
      limited
        ? [{ windowKind: "MINUTE", userIngress: 20n, tenantIngress: 20n }]
        : [],
    assistantWhatsAppUsageBucket: {
      upsert: async () => {
        usage++
        return {}
      },
    },
    assistantWhatsAppBinding: {
      update: async () => {
        sequences++
        return { inboundSequence: 7 }
      },
    },
    assistantWhatsAppInbox: {
      findUnique: async () => saved[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        saved.push(data)
        return { id: String(data.id) }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, saved, counts: () => ({ sequences, usage }) }
}

test("five empty form starters are exact and do not autoplay arbitrary model examples", () => {
  for (const [id, starter] of [
    ["sales.order.record_simple", "Record sale"],
    ["customers.create", "Add customer"],
    ["catalog.product.create", "Add product"],
    ["finance.expense.record_simple", "Record expense"],
    ["inventory.stock.receive", "Receive stock"],
  ]) {
    expect(
      whatsAppControlTaskStarter({
        id: id ?? "",
        title: "Task",
        domain: "sales",
        example: "Sold 9 invented bags for 5000",
        availability: "native",
      }),
    ).toBe(starter)
  }
  expect(
    whatsAppControlTaskStarter({
      id: "sales.order.create",
      title: "Sale",
      domain: "sales",
      example: "Record sale",
      availability: "native",
    }),
  ).toBeUndefined()
  expect(
    whatsAppControlTaskStarter({
      id: "customers.create",
      title: "Customer",
      domain: "customers",
      example: "Add customer",
      availability: "app_review",
    }),
  ).toBeUndefined()
})

test("a quoted form task preserves source provenance and immutable binding and creates only one TURN", async () => {
  const f = fixture()
  const first = await enqueueAssistantWhatsAppControlTaskInTransaction(
    f.tx,
    selected,
    parent,
    "Record sale",
    now,
  )
  const duplicate = await enqueueAssistantWhatsAppControlTaskInTransaction(
    f.tx,
    selected,
    parent,
    "Record sale",
    now,
  )
  expect(first).toEqual(duplicate)
  expect(f.saved).toHaveLength(1)
  expect(f.saved[0]).toMatchObject({
    kind: "TURN",
    bindingId: "exact-binding",
    providerMessageId: "control-task:control-source",
    content: { type: "text", text: "Record sale" },
    providerOccurredAt: parent.providerOccurredAt,
    receivedAt: parent.receivedAt,
    expiresAt: parent.expiresAt,
    sequence: 7,
  })
  expect(f.counts()).toEqual({ sequences: 1, usage: 2 })
})

test("quota denial creates no form task or binding sequence", async () => {
  const f = fixture(true)
  expect(
    await enqueueAssistantWhatsAppControlTaskInTransaction(
      f.tx,
      selected,
      parent,
      "Add product",
      now,
    ),
  ).toEqual({ kind: "rate_limited" })
  expect(f.saved).toEqual([])
  expect(f.counts()).toEqual({ sequences: 0, usage: 0 })
})

test("expired selections and arbitrary starter text cannot create a TURN", async () => {
  const f = fixture()
  await expect(
    enqueueAssistantWhatsAppControlTaskInTransaction(
      f.tx,
      selected,
      { ...parent, expiresAt: now },
      "Record sale",
      now,
    ),
  ).rejects.toThrow()
  await expect(
    enqueueAssistantWhatsAppControlTaskInTransaction(
      f.tx,
      selected,
      parent,
      "Sold 3 bags",
      now,
    ),
  ).rejects.toThrow()
  expect(f.saved).toEqual([])
})
