import { expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import {
  type ServiceIntakeSignedCase,
  ServiceIntakeSignedRollbackFailure,
  runServiceIntakeSignedCases,
  selectedServiceIntakeSignedCases,
  serviceIntakeSignedCases,
} from "./service-intake-signed-rollback-cases"
import {
  assertServiceIntakeSignedNativeCreation,
  serviceIntakeSignedFactTables,
} from "./service-intake-signed-rollback-facts"
import {
  assertServiceIntakeSignedBounds,
  assertServiceIntakeSignedEnvironment,
  assertServiceIntakeSignedScope,
  serviceIntakeSignedScope,
  serviceIntakeSignedTransactionBridge,
} from "./service-intake-signed-rollback-guards"

const env = {
  RUN_D04_QA_ROLLBACK: "1",
  RUN_D04_QA_SIGNED_ROLLBACK: "1",
  APP_ENV: "local",
  NODE_ENV: "development",
  ASSISTANT_APPROVAL_SIGNING_KEY: "x".repeat(32),
  D04_QA_CONVERSATION_ID: serviceIntakeSignedScope.conversationId,
  D04_QA_SESSION_ID: "reviewed-session",
}
const limits = {
  maxWait: 10000,
  timeout: 30000,
  isolationLevel: "Serializable",
} as const

test("signed launch cannot reuse only the canonical flag or omit the exact saved session", () => {
  expect(() => assertServiceIntakeSignedEnvironment(env)).not.toThrow()
  for (const key of Object.keys(env))
    expect(() =>
      assertServiceIntakeSignedEnvironment({ ...env, [key]: "" }),
    ).toThrow()
  const scope = { ...serviceIntakeSignedScope, sessionId: "reviewed-session" }
  expect(() => assertServiceIntakeSignedScope(scope, env)).not.toThrow()
  for (const key of [
    "database",
    "tenantId",
    "storeId",
    "userId",
    "conversationId",
    "sessionId",
  ] as const)
    expect(() =>
      assertServiceIntakeSignedScope({ ...scope, [key]: "foreign" }, env),
    ).toThrow()
  expect(() =>
    assertServiceIntakeSignedScope(
      { ...scope, conversationId: "other" },
      { ...env, D04_QA_CONVERSATION_ID: "other" },
    ),
  ).toThrow()
})

test("fresh dispatcher callbacks join the owned transaction with exact arguments/results and no nested call", async () => {
  let nested = 0
  const fault = Error("native failure")
  const tx = {
    value: "original",
    read() {
      return this.value
    },
    fail() {
      throw fault
    },
    async $transaction(
      _run: (owner: { value: string }) => Promise<string>,
      _options: typeof limits,
    ): Promise<string> {
      nested++
      throw Error("Nested transaction forbidden")
    },
  }
  const bridge = serviceIntakeSignedTransactionBridge(tx)
  const result = await bridge.$transaction(async (owner) => {
    expect(Object.is(owner, tx)).toBe(true)
    return owner.value
  }, limits)
  expect(result).toBe("original")
  expect(bridge.read()).toBe("original")
  expect(() => bridge.fail()).toThrow(fault)
  expect(nested).toBe(0)
  for (const changed of [
    { timeout: 60000 },
    { maxWait: 20000 },
    { isolationLevel: "ReadCommitted" },
  ])
    expect(() =>
      assertServiceIntakeSignedBounds({ ...limits, ...changed }),
    ).toThrow()
})

function setup() {
  let next = 0
  let factReads = 0
  const opened: number[] = []
  const options: unknown[] = []
  const facts = [{ table: "AssistantBudget", rows: "2", hash: "saved" }]
  const cases = Object.fromEntries(
    serviceIntakeSignedCases.map((name) => [
      name,
      async (tx: { id: number }, checks: string[]) => {
        opened.push(tx.id)
        checks.push(`proved:${name}`)
        return { name }
      },
    ]),
  ) as Record<
    ServiceIntakeSignedCase,
    (tx: { id: number }, checks: string[]) => Promise<{ name: string }>
  >
  const input = {
    facts: async () => {
      factReads++
      return structuredClone(facts)
    },
    transaction: async (
      run: (tx: { id: number }) => Promise<never>,
      bounds: typeof limits,
    ): Promise<unknown> => {
      options.push(bounds)
      return run({ id: ++next })
    },
    cases,
  }
  return { input, opened, options, factReads: () => factReads }
}

test("every required signed case is sequential, bounded, identity-rolled-back and independently fingerprinted", async () => {
  const state = setup()
  const result = await runServiceIntakeSignedCases(state.input)
  expect(result.map((row) => row.case)).toEqual([
    "edit-confirm",
    "completion-replay",
    "completed-replay-revoked",
    "cancel-replay",
    "changed-token",
    "stale-price",
    "stale-revision",
    "revoked",
    "expired-session",
    "cross-tenant",
    "cross-store",
    "receipt-failure",
    "receipt-recovery-replay",
  ])
  expect(state.opened).toEqual(Array.from({ length: 13 }, (_, i) => i + 1))
  expect(state.options).toEqual(Array.from({ length: 13 }, () => limits))
  expect(state.factReads()).toBe(26)
  expect(
    result.every(
      (row) =>
        row.rolledBack &&
        row.savedStatePreserved &&
        row.changedTables.length === 0,
    ),
  ).toBe(true)
})

test("remaining selection reuses only edit-confirm and keeps every other ordered case and bound", async () => {
  const state = setup()
  const result = await runServiceIntakeSignedCases({
    ...state.input,
    selection: "remaining",
  })
  expect(result.map((row) => row.case)).toEqual(
    serviceIntakeSignedCases.slice(1),
  )
  expect(state.opened).toHaveLength(12)
  expect(state.options).toEqual(Array.from({ length: 12 }, () => limits))
  expect(state.factReads()).toBe(24)
  expect(() =>
    Reflect.apply(selectedServiceIntakeSignedCases, null, ["cancel-replay"]),
  ).toThrow()
})

test("authorization timestamp diagnostics survive failure without weakening the full-row hash assertion", async () => {
  const state = setup()
  let reads = 0
  state.input.facts = async () => {
    const after = ++reads === 2
    return [
      {
        table: "D04:QaClientAuthorization",
        rows: "1",
        hash: after ? "changed" : "original",
        authorizationRows: [
          {
            id: "safe-row-id",
            hash: after ? "changed" : "original",
            stableFieldsHash: "all-other-columns-unchanged",
            status: "ACTIVE",
            lastValidatedAt: after
              ? "2026-10-12T10:00:01Z"
              : "2026-10-12T10:00:00Z",
            updatedAt: after ? "2026-10-12T10:00:01Z" : "2026-10-12T10:00:00Z",
            revokedAt: null,
            expiresAt: "2026-10-19T00:00:00Z",
          },
        ],
      },
    ]
  }
  await expect(runServiceIntakeSignedCases(state.input)).rejects.toMatchObject({
    evidence: {
      rolledBack: true,
      savedStatePreserved: false,
      changedTables: ["D04:QaClientAuthorization"],
      before: [
        {
          authorizationRows: [
            { id: "safe-row-id", lastValidatedAt: "2026-10-12T10:00:00Z" },
          ],
        },
      ],
      after: [
        {
          authorizationRows: [
            { id: "safe-row-id", lastValidatedAt: "2026-10-12T10:00:01Z" },
          ],
        },
      ],
    },
  })
})

test("timeout preserves partial checks and completed-case evidence and always rereads state", async () => {
  const state = setup()
  const fault = Object.assign(Error("timed out"), { code: "P2028" })
  state.input.cases["completion-replay"] = async (_tx, checks) => {
    checks.push("native-created")
    throw fault
  }
  try {
    await runServiceIntakeSignedCases(state.input)
    throw Error("Expected timeout")
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceIntakeSignedRollbackFailure)
    if (!(error instanceof ServiceIntakeSignedRollbackFailure)) throw error
    expect(Object.is(error.cause, fault)).toBe(true)
    expect(error.evidence.checks).toEqual(["native-created"])
    expect(error.evidence.rolledBack).toBe(false)
    expect(error.evidence.savedStatePreserved).toBe(true)
    expect(error.evidence.completedCases.map((row) => row.case)).toEqual([
      "edit-confirm",
    ])
    expect(state.factReads()).toBe(4)
  }
})

test("rollback-message impersonation, swallowed rollback and unproved bodies cannot pass", async () => {
  let state = setup()
  state.input.cases["edit-confirm"] = async () => {
    throw Error("D04_SIGNED_ROLLBACK:edit-confirm")
  }
  await expect(runServiceIntakeSignedCases(state.input)).rejects.toMatchObject({
    evidence: { rolledBack: false, savedStatePreserved: true },
  })
  state = setup()
  state.input.transaction = async (run) => {
    try {
      await run({ id: 1 })
    } catch {}
  }
  await expect(runServiceIntakeSignedCases(state.input)).rejects.toMatchObject({
    evidence: { rolledBack: false, savedStatePreserved: true },
  })
  state = setup()
  state.input.cases["edit-confirm"] = async () => ({ name: "unproved" })
  await expect(runServiceIntakeSignedCases(state.input)).rejects.toMatchObject({
    evidence: { rolledBack: false },
  })
})

test("budget row mutation or missing state fails even after a deliberate rollback", async () => {
  let state = setup()
  let reads = 0
  state.input.facts = async () => [
    {
      table: "AssistantBudget",
      rows: "2",
      hash: ++reads === 1 ? "saved" : "changed",
    },
  ]
  await expect(runServiceIntakeSignedCases(state.input)).rejects.toMatchObject({
    evidence: {
      rolledBack: true,
      savedStatePreserved: false,
      changedTables: ["AssistantBudget"],
    },
  })
  state = setup()
  state.input.facts = async () => []
  await expect(runServiceIntakeSignedCases(state.input)).rejects.toBeInstanceOf(
    ServiceIntakeSignedRollbackFailure,
  )
  expect(state.opened).toEqual([])
  state = setup()
  reads = 0
  state.input.facts = async () => {
    if (++reads === 2) throw Error("state unavailable")
    return [{ table: "AssistantBudget", rows: "2", hash: "saved" }]
  }
  await expect(runServiceIntakeSignedCases(state.input)).rejects.toMatchObject({
    evidence: { rolledBack: true, savedStatePreserved: false },
  })
})

test("extra native rows cannot hide behind allowed effect-table changes", () => {
  const counts = {
    CommercialOrder: 1,
    CommercialOrderLine: 2,
    OfferingSnapshot: 2,
    ServiceIntake: 1,
    ServiceIntakeLine: 2,
    ServiceJob: 1,
    ServiceJobLine: 1,
  }
  const before = Object.keys(counts).map((table) => ({
    table: `D04:${table}`,
    rows: "0",
    hash: "before",
  }))
  const after = Object.entries(counts).map(([table, rows]) => ({
    table: `D04:${table}`,
    rows: String(rows),
    hash: "after",
  }))
  expect(() =>
    assertServiceIntakeSignedNativeCreation(before, after),
  ).not.toThrow()
  for (const index of [0, 3, 5, 6])
    expect(() =>
      assertServiceIntakeSignedNativeCreation(
        before,
        after.map((row, i) =>
          i === index ? { ...row, rows: String(Number(row.rows) + 1) } : row,
        ),
      ),
    ).toThrow()
  expect(() =>
    assertServiceIntakeSignedNativeCreation(before, after.slice(1)),
  ).toThrow()
})

test("new fact inventory covers ledger, original graph, privacy/legal, QA grants and cross-scope chat rows with real schema names", () => {
  const directory = new URL(
    "../../../../packages/db/prisma/models/",
    import.meta.url,
  )
  const models = readdirSync(directory)
    .filter((name) => name.endsWith(".prisma"))
    .flatMap((name) =>
      [
        ...readFileSync(new URL(name, directory), "utf8").matchAll(
          /^model (\w+) \{/gm,
        ),
      ].map((match) => match[1]),
    )
  expect(
    serviceIntakeSignedFactTables.every((table) => models.includes(table)),
  ).toBe(true)
  expect(new Set(serviceIntakeSignedFactTables).size).toBe(
    serviceIntakeSignedFactTables.length,
  )
  for (const model of models.filter((name) =>
    name?.startsWith("CustomerLedger"),
  ))
    expect(
      serviceIntakeSignedFactTables.includes(
        model as (typeof serviceIntakeSignedFactTables)[number],
      ),
    ).toBe(true)
  for (const required of [
    "Session",
    "Account",
    "User",
    "AssistantBudget",
    "AssistantRun",
    "AssistantUsageEvent",
  ]) {
    const shared = readFileSync(
      new URL("./general-cash-count-signed-rollback-facts.ts", import.meta.url),
      "utf8",
    )
    expect(shared).toContain(`"${required}"`)
  }
})
