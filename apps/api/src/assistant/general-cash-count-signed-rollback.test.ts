import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import {
  assertG02FactsUnchanged,
  assertG02FinanceInventory,
  changedG02FactTables,
  g02FinanceTables,
} from "./general-cash-count-signed-rollback-facts"
import {
  assertG02RollbackEnvironment,
  assertG02RollbackScope,
  assertG02RollbackTransactionOptions,
  g02RollbackScope,
} from "./general-cash-count-signed-rollback-guards"

describe("G02 scheduled rollback safety", () => {
  test("failure evidence identifies additions and mutations without row content", () => {
    const before = [
      { table: "AssistantBudget", rows: "1", hash: "old" },
      { table: "FinanceBook", rows: "1", hash: "same" },
    ]
    const after = [
      { table: "AssistantBudget", rows: "2", hash: "new" },
      before[1],
      { table: "AssistantBudgetRow:opaque", rows: "1", hash: "new-row" },
    ].filter((row): row is NonNullable<typeof row> => Boolean(row))
    expect(changedG02FactTables(before, after)).toEqual([
      "AssistantBudget",
      "AssistantBudgetRow:opaque",
    ])
    expect(changedG02FactTables(after, before)).toEqual([
      "AssistantBudget",
      "AssistantBudgetRow:opaque",
    ])
    expect(changedG02FactTables(before, structuredClone(before))).toEqual([])
    expect(() => assertG02FactsUnchanged(before, after)).toThrow()
  })
  test("requires exact explicit local run and ephemeral signing material", () => {
    const env = {
      RUN_G02_SIGNED_PROPOSAL_ROLLBACK: "1",
      APP_ENV: "local",
      NODE_ENV: "development",
      ASSISTANT_APPROVAL_SIGNING_KEY: "x".repeat(32),
    }
    expect(() => assertG02RollbackEnvironment(env)).not.toThrow()
    for (const key of Object.keys(env)) {
      expect(() =>
        assertG02RollbackEnvironment({ ...env, [key]: "" }),
      ).toThrow()
    }
    expect(() =>
      assertG02RollbackEnvironment({ ...env, APP_ENV: "production" }),
    ).toThrow()
  })
  test("refuses any database, Tenant, Store, actor or saved-chat substitution", () => {
    expect(() => assertG02RollbackScope(g02RollbackScope)).not.toThrow()
    for (const key of [
      "database",
      "tenantId",
      "storeId",
      "userId",
      "conversationId",
    ] as const)
      expect(() =>
        assertG02RollbackScope({ ...g02RollbackScope, [key]: "foreign" }),
      ).toThrow()
  })
  test("refuses widened timeout and weaker real confirmation isolation", () => {
    const options = {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: "Serializable",
    }
    expect(() => assertG02RollbackTransactionOptions(options)).not.toThrow()
    for (const changed of [
      { maxWait: 20_000 },
      { timeout: 60_000 },
      { isolationLevel: "RepeatableRead" },
      { isolationLevel: undefined },
    ])
      expect(() =>
        assertG02RollbackTransactionOptions({ ...options, ...changed }),
      ).toThrow()
  })
  test("inventory covers every current Finance model and rejects runtime drift", () => {
    const directory = new URL(
      "../../../../packages/db/prisma/models/",
      import.meta.url,
    )
    const models = readdirSync(directory)
      .filter((name) => name.endsWith(".prisma"))
      .flatMap((name) =>
        [
          ...readFileSync(new URL(name, directory), "utf8").matchAll(
            /^model (Finance\w+) \{/gm,
          ),
        ].map((match) => match[1] ?? ""),
      )
      .sort()
    expect(models).toEqual([...g02FinanceTables])
    expect(() => assertG02FinanceInventory(models)).not.toThrow()
    expect(() =>
      assertG02FinanceInventory([...models, "FinanceUnexpected"]),
    ).toThrow()
    expect(() => assertG02FinanceInventory(models.slice(1))).toThrow()
  })
  test("same row count with mutated content fails full-state comparison", () => {
    const facts = [
      { table: "FinanceBook", rows: "1", hash: "original" },
      { table: "FinanceCommand", rows: "3", hash: "commands" },
    ] as const
    expect(() =>
      assertG02FactsUnchanged(facts, structuredClone(facts)),
    ).not.toThrow()
    expect(() =>
      assertG02FactsUnchanged(facts, [
        { ...facts[0], hash: "mutated" },
        facts[1],
      ]),
    ).toThrow()
    expect(() =>
      assertG02FactsUnchanged(facts, [facts[0], { ...facts[1], rows: "4" }]),
    ).toThrow()
    expect(() => assertG02FactsUnchanged(facts, facts.slice(1))).toThrow()
    expect(() => assertG02FactsUnchanged([], [])).toThrow()
  })
})
