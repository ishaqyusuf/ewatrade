import { expect, test } from "bun:test"
import { cashCountReceiptFault } from "./general-cash-count-receipt-fault"
import {
  completionSignedCases,
  CompletionSignedRollbackFailure,
  runCompletionSignedCases,
} from "./service-work-completion-signed-rollback-cases"
import {
  assertCompletionSignedAvailability,
  assertCompletionSignedEnvironment,
  assertCompletionSignedScope,
} from "./service-work-completion-signed-rollback-guards"
import { serviceIntakeSignedScope } from "./service-intake-signed-rollback-guards"

const environment = {
  RUN_D05_QA_SIGNED_ROLLBACK: "1",
  D05_QA_SIGNED_CASE_SELECTION: "full",
  APP_ENV: "local",
  NODE_ENV: "development",
  ASSISTANT_APPROVAL_SIGNING_KEY: "source-only-key-32-characters-long",
  D05_QA_SESSION_ID: "already-existing-session",
  D05_QA_RECEIVING_ACCOUNT_ID: "already-existing-account",
  D05_QA_CONVERSATION_ID: serviceIntakeSignedScope.conversationId,
}
const scope = {
  database: serviceIntakeSignedScope.database,
  tenantId: serviceIntakeSignedScope.tenantId,
  storeId: serviceIntakeSignedScope.storeId,
  userId: serviceIntakeSignedScope.userId,
  conversationId: serviceIntakeSignedScope.conversationId,
  sessionId: environment.D05_QA_SESSION_ID,
}
const capabilities = [
  {
    id: "services.work.rework",
    mode: "write",
    action: "service_work_rework",
    rollout: "source",
    clients: ["dashboard"],
  },
  {
    id: "services.work.handoff",
    mode: "write",
    action: "service_work_handoff",
    rollout: "source",
    clients: ["dashboard"],
  },
]

test("D05 requires its own full scheduled opt-in, local scope, existing session/account and process key without D04 flags", () => {
  expect(() => assertCompletionSignedEnvironment(environment)).not.toThrow()
  for (const patch of [
    { RUN_D05_QA_SIGNED_ROLLBACK: undefined, RUN_D04_QA_ROLLBACK: "1" },
    { D05_QA_SIGNED_CASE_SELECTION: "remaining" },
    { APP_ENV: "production" },
    { NODE_ENV: "test" },
    { D05_QA_SESSION_ID: "" },
    { D05_QA_RECEIVING_ACCOUNT_ID: "" },
    { D05_QA_CONVERSATION_ID: "other-chat" },
    { ASSISTANT_APPROVAL_SIGNING_KEY: "short" },
  ])
    expect(() =>
      assertCompletionSignedEnvironment({ ...environment, ...patch }),
    ).toThrow()
  expect(() => assertCompletionSignedScope(scope, environment)).not.toThrow()
  for (const field of Object.keys(scope) as Array<keyof typeof scope>)
    expect(() =>
      assertCompletionSignedScope(
        { ...scope, [field]: "foreign" },
        environment,
      ),
    ).toThrow()
})

test("planned, absent, duplicate, wrong action or client prerequisites fail closed without mutating capabilities", () => {
  const before = JSON.stringify(capabilities)
  expect(() => assertCompletionSignedAvailability(capabilities)).not.toThrow()
  for (const rows of [
    capabilities.slice(1),
    [...capabilities, capabilities[0]!],
    capabilities.map((row) => ({ ...row, rollout: "planned" })),
    capabilities.map((row) => ({ ...row, action: "another_action" })),
    capabilities.map((row) => ({ ...row, clients: ["mobile"] })),
    capabilities.map((row) => ({ ...row, mode: "read" })),
  ])
    expect(() => assertCompletionSignedAvailability(rows)).toThrow()
  expect(JSON.stringify(capabilities)).toBe(before)
})

// Deterministic orchestration fixtures are NOT a database or signed-command acceptance claim.
const fingerprints = () =>
  Array.from({ length: 134 }, (_, index) => ({
    table: index === 133 ? "D04:QaClientAuthorization" : `source-fact-${index}`,
    rows: "64",
    hash: "all-column-hash-including-auth-timestamps",
  }))
test("finite full suite uses fresh exact 10s/30s Serializable options and proves rollback by sentinel identity", async () => {
  const seen: string[] = [],
    optionsSeen: object[] = []
  const evidence = await runCompletionSignedCases({
    facts: async () => fingerprints(),
    transaction: async (run, options) => {
      optionsSeen.push(options)
      return run({})
    },
    runCase: async (name, _tx, checks) => {
      seen.push(name)
      checks.push("source-orchestration-assertion")
      return { name }
    },
  })
  expect(seen).toEqual([...completionSignedCases])
  expect(evidence).toHaveLength(13)
  expect(
    evidence.every(
      (row) =>
        row.rolledBack && row.savedStatePreserved && row.before.length === 134,
    ),
  ).toBe(true)
  expect(new Set(optionsSeen).size).toBe(13)
  expect(optionsSeen).toEqual(
    completionSignedCases.map(() => ({
      maxWait: 10000,
      timeout: 30000,
      isolationLevel: "Serializable",
    })),
  )
})

test("global QA authorization drift retains failure evidence and prevents any recovery or later case", async () => {
  let reads = 0
  const seen: string[] = []
  try {
    await runCompletionSignedCases({
      facts: async () => {
        const rows = fingerprints()
        reads++
        if (reads === 6)
          rows[133]!.hash = "changed-global-auth-full-column-hash"
        return rows
      },
      transaction: async (run) => run({}),
      runCase: async (name, _tx, checks) => {
        seen.push(name)
        checks.push("source-orchestration")
        return { name }
      },
    })
    throw Error("Expected auth preservation failure")
  } catch (error) {
    expect(error).toBeInstanceOf(CompletionSignedRollbackFailure)
    if (!(error instanceof CompletionSignedRollbackFailure)) throw error
    expect(error.evidence.case).toBe("rework-receipt-failure")
    expect(error.evidence.rolledBack).toBe(true)
    expect(error.evidence.savedStatePreserved).toBe(false)
    expect(error.evidence.changedTables).toEqual(["D04:QaClientAuthorization"])
    expect(error.evidence.before[133]?.rows).toBe(
      error.evidence.after[133]?.rows,
    )
    expect(error.evidence.before[133]?.hash).not.toBe(
      error.evidence.after[133]?.hash,
    )
    expect(error.evidence.completedCases.map((row) => row.case)).toEqual(
      completionSignedCases.slice(0, 2),
    )
    expect(seen).toEqual(completionSignedCases.slice(0, 3))
  }
})

test("lookalike rollback message is a failure even when all fingerprints are unchanged", async () => {
  try {
    await runCompletionSignedCases({
      facts: async () => fingerprints(),
      transaction: async () => {
        throw Error("D05_COMPLETION_ROLLBACK:rework-confirm-replay")
      },
      runCase: async (_name, _tx, checks) => {
        checks.push("unused")
        return {}
      },
    })
    throw Error("Expected identity refusal")
  } catch (error) {
    expect(error).toBeInstanceOf(CompletionSignedRollbackFailure)
    if (!(error instanceof CompletionSignedRollbackFailure)) throw error
    expect(error.evidence.rolledBack).toBe(false)
    expect(error.evidence.savedStatePreserved).toBe(true)
    expect(error.evidence.completedCases).toEqual([])
  }
})

test("unproved receipt fault stops the suite before paired recovery even after rollback restores facts", async () => {
  const seen: string[] = []
  await expect(
    runCompletionSignedCases({
      facts: async () => fingerprints(),
      transaction: async (run) => run({}),
      runCase: async (name, _tx, checks) => {
        seen.push(name)
        if (name === "rework-receipt-failure")
          throw Error("Native command failed before receipt fault")
        checks.push("source-orchestration")
        return { name }
      },
    }),
  ).rejects.toBeInstanceOf(CompletionSignedRollbackFailure)
  expect(seen).toEqual(completionSignedCases.slice(0, 3))
})

test("missing checks, undefined report or a transaction returning normally cannot establish rollback evidence", async () => {
  await expect(
    runCompletionSignedCases({
      facts: async () => fingerprints(),
      transaction: async (run) => run({}),
      runCase: async () => ({}),
    }),
  ).rejects.toBeInstanceOf(CompletionSignedRollbackFailure)
  await expect(
    runCompletionSignedCases({
      facts: async () => fingerprints(),
      transaction: async (run) => run({}),
      runCase: async (_name, _tx, checks) => {
        checks.push("source")
        return undefined
      },
    }),
  ).rejects.toBeInstanceOf(CompletionSignedRollbackFailure)
  await expect(
    runCompletionSignedCases({
      facts: async () => fingerprints(),
      transaction: async () => ({}),
      runCase: async (_name, _tx, checks) => {
        checks.push("unused")
        return {}
      },
    }),
  ).rejects.toBeInstanceOf(CompletionSignedRollbackFailure)
})

test("receipt fault intercepts only exact proposal COMPLETED update and throws original identity after observing actual receipt", async () => {
  const writes: unknown[] = [],
    observed: unknown[] = []
  const fault = Error("original D05 receipt persistence fault")
  const tx = {
    assistantActionProposal: {
      update: async (input: unknown) => {
        writes.push(input)
        return input
      },
    },
  }
  const proxy = cashCountReceiptFault(
    tx as unknown as Parameters<typeof cashCountReceiptFault>[0],
    "exact-proposal",
    fault,
    (receipt) => observed.push(receipt),
  )
  await proxy.assistantActionProposal.update({
    where: { id: "other" },
    data: { status: "COMPLETED", executedResult: { kind: "service_work" } },
  })
  await proxy.assistantActionProposal.update({
    where: { id: "exact-proposal" },
    data: { status: "EXECUTING" },
  })
  const receipt = { kind: "service_work", eventId: "actual-observed-event" }
  let caught: unknown
  try {
    await proxy.assistantActionProposal.update({
      where: { id: "exact-proposal" },
      data: { status: "COMPLETED", executedResult: receipt },
    })
  } catch (error) {
    caught = error
  }
  expect(caught).toBe(fault)
  expect(writes).toHaveLength(2)
  expect(observed).toEqual([receipt])
})
