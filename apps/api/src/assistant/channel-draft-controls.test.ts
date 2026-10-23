import { expect, test } from "bun:test"
import type { Prisma } from "@ewatrade/db/types"
import {
  cancelAssistantWhatsAppCurrentDraft,
  defaultWhatsAppDraftControlDependencies,
} from "./channel-draft-controls"

function fixture(count: number, purpose: "GENERAL" | "SETUP" = "GENERAL") {
  const scope = {
    userId: "actor",
    tenantId: "business",
    storeId: "store",
    membershipId: "membership",
  }
  const selected = {
    principal: { kind: "linked_whatsapp" },
    binding: { id: "binding", selectionGeneration: 3 },
    conversation: { id: "current-chat", purpose },
  } as Parameters<typeof cancelAssistantWhatsAppCurrentDraft>[0]
  const queries: unknown[] = []
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `draft-${i}`,
    revision: 7,
  }))
  const db = {
    assistantActionProposal: {
      findMany: async (query: unknown) => {
        queries.push(query)
        return rows
      },
    },
  } as unknown as Prisma.TransactionClient
  const decisions: unknown[] = []
  const deps = defaultWhatsAppDraftControlDependencies()
  deps.cancelEdit = async () => false
  deps.resolve = async () =>
    ({
      ...selected,
      scope,
      identity: { user: { id: "actor" } },
      tenantContext: { tenant: { slug: "business" } },
    }) as unknown as Awaited<ReturnType<typeof deps.resolve>>
  deps.decide = async (fresh, input) => {
    expect(fresh.db).toBe(db)
    expect(fresh.assistantConversationId).toBe("current-chat")
    decisions.push(input)
    return { status: "CANCELLED" } as Awaited<ReturnType<typeof deps.decide>>
  }
  return { selected, db, deps, queries, decisions }
}

test("bare CANCEL with no draft keeps the connection and makes no canonical decision", async () => {
  const f = fixture(0)
  expect(
    await cancelAssistantWhatsAppCurrentDraft(
      f.selected,
      f.db,
      "request",
      f.deps,
    ),
  ).toContain("connection stays active")
  expect(f.decisions).toEqual([])
})

test("bare CANCEL chooses only the unique current actor/business/Store/chat draft", async () => {
  const f = fixture(1)
  expect(
    await cancelAssistantWhatsAppCurrentDraft(
      f.selected,
      f.db,
      "request",
      f.deps,
    ),
  ).toStartWith("Draft cancelled")
  expect(f.queries).toEqual([
    {
      where: {
        tenantId: "business",
        storeId: "store",
        actorUserId: "actor",
        conversationId: "current-chat",
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { id: true, revision: true },
    },
  ])
  expect(f.decisions).toEqual([
    { proposalId: "draft-0", revision: 7, decision: "cancel" },
  ])
})

test("multiple pending drafts require an exact Cancel option without selecting a latest row", async () => {
  const f = fixture(2)
  expect(
    await cancelAssistantWhatsAppCurrentDraft(
      f.selected,
      f.db,
      "request",
      f.deps,
    ),
  ).toContain("exact draft's Cancel button")
  expect(f.decisions).toEqual([])
})

test("a Setup workflow never cancels a General proposal by bare CANCEL", async () => {
  const f = fixture(1, "SETUP")
  expect(
    await cancelAssistantWhatsAppCurrentDraft(
      f.selected,
      f.db,
      "request",
      f.deps,
    ),
  ).toContain("workflow's exact Cancel option")
  expect(f.queries).toEqual([])
  expect(f.decisions).toEqual([])
})

test("an exact active Edit target takes priority over unrelated older pending drafts", async () => {
  const f = fixture(2)
  let editingCancelled = 0
  f.deps.cancelEdit = async (fresh) => {
    expect(fresh.db).toBe(f.db)
    expect(fresh.assistantConversationId).toBe("current-chat")
    editingCancelled++
    return true
  }
  expect(
    await cancelAssistantWhatsAppCurrentDraft(
      f.selected,
      f.db,
      "request",
      f.deps,
    ),
  ).toStartWith("Draft cancelled")
  expect(editingCancelled).toBe(1)
  expect(f.queries).toEqual([])
  expect(f.decisions).toEqual([])
})
