import {
  type ServiceIntakeSignedFacts,
  assertServiceIntakeSignedFactsUnchanged,
  changedServiceIntakeSignedFacts,
} from "./service-intake-signed-rollback-facts"
import {
  assertServiceIntakeSignedBounds,
  signedIntakeCheck as check,
} from "./service-intake-signed-rollback-guards"

export const completionSignedCases = [
  "rework-confirm-replay",
  "handoff-confirm-replay",
  "rework-receipt-failure",
  "rework-recovery-replay",
  "handoff-receipt-failure",
  "handoff-recovery-replay",
  "rework-stale-source",
  "handoff-stale-paid",
  "handoff-stale-ready",
  "handoff-unpaid-refusal",
  "handoff-unready-refusal",
  "rework-incomplete-refusal",
  "rework-changed-token",
] as const
export type CompletionSignedCase = (typeof completionSignedCases)[number]
export type CompletionSignedEvidence = {
  case: CompletionSignedCase
  before: ServiceIntakeSignedFacts
  after: ServiceIntakeSignedFacts
  changedTables: string[]
  rolledBack: boolean
  savedStatePreserved: boolean
  checks: string[]
  elapsedMs: number
}
export class CompletionSignedRollbackFailure extends Error {
  constructor(
    public readonly evidence: CompletionSignedEvidence & {
      completedCases: CompletionSignedEvidence[]
    },
    cause: unknown,
  ) {
    super("D05 signed completion rollback failed", { cause })
  }
}

/** Finite full suite only. Recovery starts after the fault case's strict POST facts pass. */
export async function runCompletionSignedCases<Tx, Report>(input: {
  facts: () => Promise<ServiceIntakeSignedFacts>
  transaction: (
    run: (tx: Tx) => Promise<never>,
    options: {
      maxWait: 10000
      timeout: 30000
      isolationLevel: "Serializable"
    },
  ) => Promise<unknown>
  runCase: (
    name: CompletionSignedCase,
    tx: Tx,
    checks: string[],
  ) => Promise<Report>
}) {
  const completed: Array<CompletionSignedEvidence & { report: Report }> = []
  for (const name of completionSignedCases) {
    const started = performance.now()
    const rollback = Error(`D05_COMPLETION_ROLLBACK:${name}`)
    const checks: string[] = []
    let before: ServiceIntakeSignedFacts = [],
      after: ServiceIntakeSignedFacts = []
    let report: Report | undefined, failure: unknown
    let rolledBack = false,
      savedStatePreserved = false,
      failed = false
    try {
      if (name.endsWith("-recovery-replay")) {
        const required = name.replace("-recovery-replay", "-receipt-failure")
        check(
          completed.some(
            (row) =>
              row.case === required &&
              row.rolledBack &&
              row.savedStatePreserved,
          ),
          "Recovery requires confirmed preceding full-state receipt-fault rollback",
        )
      }
      before = await input.facts()
      assertServiceIntakeSignedFactsUnchanged(before, before)
      const options = {
        maxWait: 10000,
        timeout: 30000,
        isolationLevel: "Serializable",
      } as const
      assertServiceIntakeSignedBounds(options)
      await input.transaction(async (tx) => {
        report = await input.runCase(name, tx, checks)
        check(checks.length > 0, "D05 signed case recorded no assertions")
        throw rollback
      }, options)
      throw Error("D05 signed transaction returned without deliberate rollback")
    } catch (error) {
      if (error === rollback) rolledBack = true
      else {
        failed = true
        failure = error
      }
    }
    try {
      after = await input.facts()
      // Original full all-column/all-row scope, including global QA auth. No exclusions.
      assertServiceIntakeSignedFactsUnchanged(before, after)
      savedStatePreserved = true
    } catch (error) {
      failed = true
      failure = error
    }
    const evidence: CompletionSignedEvidence = {
      case: name,
      before,
      after,
      changedTables: changedServiceIntakeSignedFacts(before, after),
      rolledBack,
      savedStatePreserved,
      checks,
      elapsedMs: Math.round(performance.now() - started),
    }
    if (failed || !rolledBack || report === undefined)
      throw new CompletionSignedRollbackFailure(
        {
          ...evidence,
          completedCases: completed.map(({ report: _report, ...row }) => row),
        },
        failure,
      )
    completed.push({ ...evidence, report })
  }
  return completed
}
