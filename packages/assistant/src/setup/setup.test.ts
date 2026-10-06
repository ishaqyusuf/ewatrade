import { describe, expect, test } from "bun:test"
import {
  deriveSetupEntityState,
  majorAmountToMinor,
  normalizeQuantity,
  sanitizeVocabulary,
  setupEntityKey,
} from "./contracts"
import { parseSetupRehearsalLines, respondSetupRehearsal } from "./rehearsal"
import {
  type SetupDraftEntityView,
  type SetupDraftEntityWrite,
  createSetupAssistantTools,
} from "./tools"

const context = {
  businessName: "Jawdah Poultry",
  storeName: "Main store",
  businessProfile: null,
  operatingModel: "products",
  currencyCode: "NGN",
  countryCode: "NG",
  existing: { catalogItems: 0, customers: 0 },
}

function harness() {
  const rows = new Map<
    string,
    Omit<SetupDraftEntityWrite, "state"> & { state: string }
  >()
  let revision = 0
  const changes: Array<{ revision: number; keys: string[] }> = []
  const tools = createSetupAssistantTools({
    context,
    sourceMessageId: "msg_1",
    readDraft: async () =>
      [...rows.values()].map(
        (row): SetupDraftEntityView => ({
          key: row.key,
          kind: row.kind,
          state: row.state,
          payload: row.payload,
          openQuestions: row.openQuestions,
        }),
      ),
    writeEntities: async (entities) => {
      revision += 1
      const rejected: string[] = []
      const changed: string[] = []
      for (const entity of entities) {
        if (rows.get(entity.key)?.state === "COMMITTED")
          rejected.push(entity.key)
        else {
          rows.set(entity.key, entity)
          changed.push(entity.key)
        }
      }
      return { revision, changed, rejected }
    },
    removeEntities: async (keys) => {
      for (const key of keys) rows.delete(key)
      revision += 1
      return { revision }
    },
    onDraftChanged: (change) => changes.push(change),
  })
  const run = <T>(name: keyof typeof tools, input: unknown) =>
    (tools[name].execute as (input: unknown, options: unknown) => Promise<T>)(
      input,
      { toolCallId: "t", messages: [] },
    )
  return { rows, changes, run }
}

describe("setup contracts", () => {
  test("converts major amounts exactly and rejects invalid text", () => {
    expect(majorAmountToMinor("2,500")).toBe(250_000)
    expect(majorAmountToMinor("₦4500.5")).toBe(450_050)
    expect(majorAmountToMinor("0.07")).toBe(7)
    expect(majorAmountToMinor("ten")).toBeNull()
    expect(majorAmountToMinor("1.234")).toBeNull()
    expect(normalizeQuantity("20")).toBe("20")
    expect(normalizeQuantity("-2")).toBeNull()
  })

  test("keys are stable per kind and name", () => {
    expect(setupEntityKey("product", "Crate of Eggs")).toBe(
      "product:crate-of-eggs",
    )
    expect(setupEntityKey("customer", "Mama Adé")).toBe("customer:mama-ade")
  })

  test("missing price blocks confirmation; optional follow-ups do not", () => {
    const missing = deriveSetupEntityState(
      { kind: "product", name: "Eggs", unitName: "Crate" },
      [{ field: "photo", question: "Do you have a photo?", required: false }],
    )
    expect(missing.state).toBe("NEEDS_INPUT")
    expect(missing.questions.map((question) => question.field)).toEqual([
      "price",
      "photo",
    ])
    const ready = deriveSetupEntityState(
      {
        kind: "product",
        name: "Eggs",
        unitName: "Crate",
        priceMinor: 450_000,
        openingStock: "20",
      },
      [{ field: "stock", question: "How many?", required: false }],
    )
    expect(ready.state).toBe("PROPOSED")
    expect(ready.questions).toEqual([])
  })

  test("unknown vocabulary is dropped, not invented", () => {
    const result = sanitizeVocabulary({
      kind: "product" as const,
      name: "Eggs",
      categoryKey: "made-up:thing",
      quickSetupKey: "nope",
    })
    expect(result.payload.categoryKey).toBeUndefined()
    expect(result.payload.quickSetupKey).toBeUndefined()
    expect(result.warnings).toHaveLength(2)
  })
})

describe("setup tools", () => {
  test("stages items with converted money, provenance and draft events", async () => {
    const { rows, changes, run } = harness()
    const result = await run<{ status: string }>("setup_draft_upsert_items", {
      items: [
        {
          kind: "product",
          name: "Crate of eggs",
          unitName: "Crate",
          price: "4,500",
          openingStock: "20",
          quote: "eggs 4500",
        },
        { kind: "product", name: "Broiler", price: "9000" },
        { kind: "service", name: "Delivery" },
      ],
    })
    expect(result.status).toBe("success")
    const eggs = rows.get("product:crate-of-eggs")
    expect(eggs?.payload).toMatchObject({
      priceMinor: 450_000,
      openingStock: "20",
      unitName: "Crate",
    })
    expect(eggs?.source).toEqual({ messageId: "msg_1", quote: "eggs 4500" })
    expect(eggs?.state).toBe("PROPOSED")
    expect(rows.get("product:broiler")?.payload).toMatchObject({
      unitName: "Piece",
    })
    expect(rows.get("service:delivery")?.state).toBe("NEEDS_INPUT")
    expect(changes).toEqual([
      {
        revision: 1,
        keys: ["product:crate-of-eggs", "product:broiler", "service:delivery"],
      },
    ])
  })

  test("updating by name reuses the same record and committed rows are protected", async () => {
    const { rows, run } = harness()
    await run("setup_draft_upsert_items", {
      items: [{ kind: "product", name: "Eggs" }],
    })
    expect(rows.get("product:eggs")?.state).toBe("NEEDS_INPUT")
    await run("setup_draft_upsert_items", {
      items: [{ kind: "product", name: "Eggs", price: "150" }],
    })
    expect(rows.size).toBe(1)
    expect(rows.get("product:eggs")?.state).toBe("PROPOSED")
    const committed = rows.get("product:eggs")
    if (committed)
      rows.set("product:eggs", { ...committed, state: "COMMITTED" })
    const result = await run<{ status: string; warnings: string[] }>(
      "setup_draft_upsert_items",
      { items: [{ kind: "product", name: "Eggs", price: "1" }] },
    )
    expect(result.warnings.join(" ")).toContain("Already created")
  })

  test("customer balances and invalid amounts are reported, never guessed", async () => {
    const { rows, run } = harness()
    const result = await run<{ status: string; warnings: string[] }>(
      "setup_draft_upsert_customers",
      {
        customers: [
          { name: "Mama Ade", owesBusiness: "15,000", phone: "08030000000" },
          { name: "Bad Email", email: "not-an-email" },
        ],
      },
    )
    expect(result.status).toBe("partial")
    expect(rows.get("customer:mama-ade")?.payload).toMatchObject({
      opening: { direction: "owes_business", amountMinor: 1_500_000 },
    })
    expect(rows.has("customer:bad-email")).toBe(false)
  })

  test("quick setups and categories only return real vocabulary", async () => {
    const { run } = harness()
    const helpers = await run<{ data: Array<{ quickSetupKey: string }> }>(
      "setup_search_quick_setups",
      { kind: "product", query: "egg" },
    )
    expect(helpers.data.length).toBeGreaterThan(0)
    const categories = await run<{
      data: Array<{ categoryKey: string; emoji: string }>
    }>("setup_search_categories", { kind: "product", query: "poultry" })
    expect(categories.data.length).toBeGreaterThan(0)
    for (const entry of categories.data)
      expect(
        sanitizeVocabulary({ categoryKey: entry.categoryKey }).warnings,
      ).toEqual([])
  })
})

describe("setup rehearsal script", () => {
  test("parses item lines and debts", () => {
    const parsed = parseSetupRehearsalLines(
      "- Crate of eggs, 4500, 20 crates\n- Broiler chicken, 9k\nMama Ade owes me 15,000",
    )
    expect(parsed.items).toMatchObject([
      {
        name: "Crate of eggs",
        price: "4500",
        openingStock: "20",
        unitName: "Crate",
      },
      { name: "Broiler chicken", price: "9000" },
    ])
    expect(parsed.customers).toMatchObject([
      { name: "Mama Ade", owesBusiness: "15000" },
    ])
  })

  test("stages items, then customers, then replies with text", () => {
    const user = {
      role: "user",
      content: [{ type: "text", text: "Eggs, 4500\nAde owes 200" }],
    }
    expect(respondSetupRehearsal([user])).toMatchObject({
      kind: "tool",
      toolName: "setup_draft_upsert_items",
    })
    const afterItems = [
      user,
      { role: "assistant", content: [] },
      { role: "tool", content: [] },
    ]
    expect(respondSetupRehearsal(afterItems)).toMatchObject({
      kind: "tool",
      toolName: "setup_draft_upsert_customers",
    })
    const afterCustomers = [
      ...afterItems,
      { role: "assistant", content: [] },
      { role: "tool", content: [] },
    ]
    expect(respondSetupRehearsal(afterCustomers)).toMatchObject({
      kind: "text",
    })
  })
})
