import { describe, expect, test } from "bun:test"
import {
  deriveSetupEntityState,
  setupEntityKind,
  setupEntityPayloadSchema,
  setupMoneyAccountPayloadSchema,
} from "./contracts"
import { summarizeSetupFollowUp } from "./follow-up"
import { parseSetupRehearsalLines } from "./rehearsal"
import { type SetupDraftEntityWrite, createSetupAssistantTools } from "./tools"

function tools() {
  const writes: SetupDraftEntityWrite[] = []
  const set = createSetupAssistantTools({
    context: {
      businessName: "B",
      storeName: "S",
      businessProfile: null,
      operatingModel: null,
      currencyCode: "NGN",
      countryCode: "NG",
      existing: { catalogItems: 0, customers: 0 },
    },
    sourceMessageId: "msg_1",
    readDraft: async () => [],
    writeEntities: async (entities) => {
      writes.push(...entities)
      return { revision: 1, changed: entities.map((e) => e.key), rejected: [] }
    },
    removeEntities: async () => ({ revision: 1 }),
  })
  return { set, writes }
}

const call = { toolCallId: "t", messages: [] }

describe("items used but not sold", () => {
  test("need stock, never a selling price", () => {
    const derived = deriveSetupEntityState(
      {
        kind: "product",
        name: "Layer feed",
        unitName: "Bag",
        usage: "INTERNAL_USE",
        openingStock: "30",
      },
      [],
    )
    expect(derived).toEqual({ state: "PROPOSED", questions: [] })
    expect(
      deriveSetupEntityState(
        { kind: "product", name: "Eggs", unitName: "Crate" },
        [],
      ).state,
    ).toBe("NEEDS_INPUT")
  })

  test("the draft tool stages usage 'use' without a price", async () => {
    const { set, writes } = tools()
    await set.setup_draft_upsert_items.execute?.(
      {
        items: [
          {
            kind: "product",
            name: "Packaging nylon",
            unitName: "Pack",
            usage: "use",
            openingStock: "12",
          },
        ],
      },
      call,
    )
    expect(writes[0]).toMatchObject({
      kind: "PRODUCT",
      state: "PROPOSED",
      payload: { usage: "INTERNAL_USE", openingStock: "12" },
    })
  })

  test("follow-ups ask their stock but never their price", () => {
    const followUp = summarizeSetupFollowUp([
      {
        kind: "PRODUCT",
        state: "PROPOSED",
        payload: {
          kind: "product",
          name: "Layer feed",
          unitName: "Bag",
          usage: "INTERNAL_USE",
        },
        openQuestions: [],
      },
    ])
    expect(followUp.questions).toEqual([
      "How many Layer feed do you have right now?",
    ])
  })
})

describe("money accounts", () => {
  test("payload is strict: whole minor units as a number, no date", () => {
    expect(
      setupMoneyAccountPayloadSchema.safeParse({
        kind: "money_account",
        name: "GTBank",
        purpose: "BANK",
        bankName: "GTBank",
        openingBalanceMinor: 12_000_000,
      }).success,
    ).toBe(true)
    for (const invalid of [
      { openingBalanceMinor: "12000000" },
      { openingBalanceMinor: -1 },
      { openingBalanceMinor: 10_000_000_001 },
      { asOf: "2026-10-07" },
      { purpose: "WALLET" },
      { name: "x".repeat(101) },
    ])
      expect(
        setupMoneyAccountPayloadSchema.safeParse({
          kind: "money_account",
          name: "Cash",
          purpose: "CASH",
          ...invalid,
        }).success,
      ).toBe(false)
  })

  test("is part of the shared union and maps to MONEY_ACCOUNT", () => {
    const parsed = setupEntityPayloadSchema.parse({
      kind: "money_account",
      name: "Shop cash",
      purpose: "CASH",
    })
    expect(setupEntityKind(parsed)).toBe("MONEY_ACCOUNT")
    expect(deriveSetupEntityState(parsed, []).state).toBe("PROPOSED")
  })

  test("the draft tool stages cash and bank with major-unit balances", async () => {
    const { set, writes } = tools()
    await set.setup_draft_upsert_money_accounts.execute?.(
      {
        accounts: [
          { name: "Shop cash", purpose: "cash", balance: "25,000" },
          { name: "Opay", purpose: "bank", bankName: "Opay" },
        ],
      },
      call,
    )
    expect(
      writes.map((write) => [write.key, write.kind, write.payload]),
    ).toEqual([
      [
        "money_account:shop-cash",
        "MONEY_ACCOUNT",
        {
          kind: "money_account",
          name: "Shop cash",
          purpose: "CASH",
          openingBalanceMinor: 2_500_000,
        },
      ],
      [
        "money_account:opay",
        "MONEY_ACCOUNT",
        {
          kind: "money_account",
          name: "Opay",
          purpose: "BANK",
          bankName: "Opay",
        },
      ],
    ])
  })

  test("follow-ups group the missing balances", () => {
    const followUp = summarizeSetupFollowUp(
      ["Shop cash", "GTBank"].map((name) => ({
        kind: "MONEY_ACCOUNT" as const,
        state: "PROPOSED",
        payload: { kind: "money_account", name, purpose: "CASH" },
        openQuestions: [],
      })),
    )
    expect(followUp.questions).toEqual([
      "How much money is in Shop cash and GTBank right now?",
    ])
  })
})

describe("rehearsal reads all four areas", () => {
  test("items, internal-use items, customers and money accounts", () => {
    const parsed = parseSetupRehearsalLines(
      [
        "Crate of eggs, 4500, 20 crates",
        "Layer feed (use), 0, 30 bags",
        "Mama Ade owes me 15,000",
        "Cash at hand, 25000",
        "GTBank 120000",
      ].join("\n"),
    )
    expect(parsed.items.map((item) => [item.name, item.usage])).toEqual([
      ["Crate of eggs", undefined],
      ["Layer feed", "use"],
    ])
    expect(parsed.customers.map((customer) => customer.name)).toEqual([
      "Mama Ade",
    ])
    expect(parsed.accounts).toEqual([
      expect.objectContaining({
        name: "Cash at hand",
        purpose: "cash",
        balance: "25000",
      }),
      expect.objectContaining({
        name: "GTBank",
        purpose: "bank",
        balance: "120000",
      }),
    ])
  })
})
