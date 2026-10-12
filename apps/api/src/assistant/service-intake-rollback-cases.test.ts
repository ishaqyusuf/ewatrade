import { expect, test } from "bun:test"
import {
  ServiceIntakeRollbackFailure,
  runServiceIntakeRollbackCases,
  serviceIntakeRollbackCaseNames,
} from "./service-intake-rollback-cases"

const setup = () => {
  const events: string[] = []
  const transactionIds: number[] = []
  const limitsSeen: unknown[] = []
  let txId = 0
  const input = {
    facts: async (): Promise<string | undefined> => {
      events.push("facts")
      return "unchanged"
    },
    transaction: async (
      run: (tx: { id: number }) => Promise<never>,
      limits: {
        isolationLevel: "Serializable"
        maxWait: 10000
        timeout: 30000
      },
    ): Promise<unknown> => {
      limitsSeen.push(limits)
      return run({ id: ++txId })
    },
    cases: {
      "creation-replay-receipt": async (tx: { id: number }) => {
        transactionIds.push(tx.id)
        events.push("creation-replay-receipt")
        return { checked: true }
      },
      "immutable-snapshot": async (tx: { id: number }) => {
        transactionIds.push(tx.id)
        events.push("immutable-snapshot")
        return { checked: true }
      },
      "stale-review": async (tx: { id: number }) => {
        transactionIds.push(tx.id)
        events.push("stale-review")
        return { checked: true }
      },
      "revoked-authority": async (tx: { id: number }) => {
        transactionIds.push(tx.id)
        events.push("revoked-authority")
        return { checked: true }
      },
    },
  }
  return { input, events, transactionIds, limitsSeen }
}

test("all four cases require distinct sequential transactions, rollback and full state checks", async () => {
  const { input, events, transactionIds, limitsSeen } = setup()
  const result = await runServiceIntakeRollbackCases(input)
  expect(result.map((row) => row.case)).toEqual([
    ...serviceIntakeRollbackCaseNames,
  ])
  expect(transactionIds).toEqual([1, 2, 3, 4])
  expect(events).toEqual(
    serviceIntakeRollbackCaseNames.flatMap((name) => ["facts", name, "facts"]),
  )
  expect(limitsSeen).toEqual(
    Array.from({ length: 4 }, () => ({
      isolationLevel: "Serializable",
      maxWait: 10000,
      timeout: 30000,
    })),
  )
  expect(result.every((row) => row.rolledBack && row.savedStatePreserved)).toBe(
    true,
  )
  expect(
    result.every((row) =>
      row.timings.phases.some((phase) => phase.phase === "saved-state-after"),
    ),
  ).toBe(true)
})

test("timeout checks saved state, retains its cause/code and completed case evidence, then stops", async () => {
  const { input, events } = setup()
  const timeout = Object.assign(Error("expired"), { code: "P2028" })
  input.cases["immutable-snapshot"] = async () => {
    throw timeout
  }
  try {
    await runServiceIntakeRollbackCases(input)
    throw Error("Expected failure")
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceIntakeRollbackFailure)
    if (!(error instanceof ServiceIntakeRollbackFailure)) throw error
    expect(error.cause).toBe(timeout)
    expect(error.evidence.case).toBe("immutable-snapshot")
    expect(error.evidence.errorCode).toBe("P2028")
    expect(error.evidence.rolledBack).toBe(false)
    expect(error.evidence.savedStatePreserved).toBe(true)
    expect(error.evidence.completedCases.map((row) => row.case)).toEqual([
      "creation-replay-receipt",
    ])
    expect(events).toEqual([
      "facts",
      "creation-replay-receipt",
      "facts",
      "facts",
      "facts",
    ])
  }
})

test("an unrelated matching rollback message cannot satisfy the boundary", async () => {
  const { input } = setup()
  const impostor = Error("D04_OWNED_ROLLBACK:creation-replay-receipt")
  input.cases["creation-replay-receipt"] = async () => {
    throw impostor
  }
  await expect(runServiceIntakeRollbackCases(input)).rejects.toMatchObject({
    cause: impostor,
    evidence: { rolledBack: false, savedStatePreserved: true },
  })
})

test("three successful cases cannot conceal failure of the required fourth case", async () => {
  const { input } = setup()
  const failure = Error("revocation assertion failed")
  input.cases["revoked-authority"] = async () => {
    throw failure
  }
  try {
    await runServiceIntakeRollbackCases(input)
    throw Error("Expected fourth-case failure")
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceIntakeRollbackFailure)
    if (!(error instanceof ServiceIntakeRollbackFailure)) throw error
    expect(error.cause).toBe(failure)
    expect(error.evidence.case).toBe("revoked-authority")
    expect(error.evidence.completedCases.map((row) => row.case)).toEqual([
      "creation-replay-receipt",
      "immutable-snapshot",
      "stale-review",
    ])
  }
})

test("a completed body without a transaction rollback fails", async () => {
  const { input } = setup()
  input.transaction = async (run) => {
    try {
      await run({ id: 1 })
    } catch {}
  }
  await expect(runServiceIntakeRollbackCases(input)).rejects.toMatchObject({
    evidence: { rolledBack: false, savedStatePreserved: true },
  })
})

test("saved-state mismatch fails even after deliberate rollback", async () => {
  const { input } = setup()
  let reads = 0
  input.facts = async () => (++reads === 1 ? "before" : "changed")
  await expect(runServiceIntakeRollbackCases(input)).rejects.toMatchObject({
    evidence: {
      rolledBack: true,
      savedStatePreserved: false,
      beforeHash: "before",
      afterHash: "changed",
    },
  })
})

test("unavailable baseline refuses before opening a transaction", async () => {
  const { input, limitsSeen } = setup()
  input.facts = async () => undefined
  await expect(runServiceIntakeRollbackCases(input)).rejects.toBeInstanceOf(
    ServiceIntakeRollbackFailure,
  )
  expect(limitsSeen).toHaveLength(0)
})

test("post-rollback fact read errors cannot produce success", async () => {
  const { input } = setup()
  let reads = 0
  const unavailable = Error("state read unavailable")
  input.facts = async () => {
    if (++reads === 2) throw unavailable
    return "before"
  }
  await expect(runServiceIntakeRollbackCases(input)).rejects.toMatchObject({
    cause: unavailable,
    evidence: { rolledBack: true, savedStatePreserved: false },
  })
})
