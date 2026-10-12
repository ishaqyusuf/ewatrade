import { serviceIntakeRollbackTimings } from "./service-intake-rollback-timing"

export const serviceIntakeRollbackCaseNames = [
  "creation-replay-receipt",
  "immutable-snapshot",
  "stale-review",
  "revoked-authority",
] as const
type CaseName = (typeof serviceIntakeRollbackCaseNames)[number]
type Timings = ReturnType<typeof serviceIntakeRollbackTimings>
type CaseEvidence = {
  case: CaseName
  rolledBack: boolean
  savedStatePreserved: boolean
  beforeHash?: string
  afterHash?: string
  timings: ReturnType<Timings["evidence"]>
}
type CaseResult<Result> = CaseEvidence & { report: Result }

export class ServiceIntakeRollbackFailure extends Error {
  constructor(
    public readonly evidence: CaseEvidence & {
      completedCases: CaseEvidence[]
      errorCode: string | null
    },
    cause: unknown,
  ) {
    super("D04 canonical rollback verification failed", { cause })
  }
}

/** Each case must finish, deliberately roll back, and preserve the full saved state. */
export async function runServiceIntakeRollbackCases<Tx, Result>(input: {
  facts: () => Promise<string | undefined>
  transaction: (
    run: (tx: Tx) => Promise<never>,
    limits: {
      isolationLevel: "Serializable"
      maxWait: 10000
      timeout: 30000
    },
  ) => Promise<unknown>
  cases: Record<CaseName, (tx: Tx, timings: Timings) => Promise<Result>>
}) {
  const completedCases: CaseResult<Result>[] = []
  for (const name of serviceIntakeRollbackCaseNames) {
    const timings = serviceIntakeRollbackTimings()
    // Identity-based marker: an unrelated error can never satisfy this boundary.
    const rollback = Error(`D04_OWNED_ROLLBACK:${name}`)
    let before: string | undefined
    let after: string | undefined
    let report: Result | undefined
    let rolledBack = false
    let failure: unknown
    let failed = false
    try {
      before = await timings.phase("saved-state-before", input.facts)
      if (!before) throw Error("D04 saved-state baseline unavailable")
      await timings.phase("transaction", () =>
        input.transaction(
          async (tx) => {
            report = await input.cases[name](tx, timings)
            throw rollback
          },
          { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 },
        ),
      )
      throw Error(
        "D04 transaction did not reach its deliberate rollback boundary",
      )
    } catch (error) {
      if (error === rollback) rolledBack = true
      else {
        failed = true
        failure = error
      }
    }
    // Always inspect state after a transaction error, including a timeout.
    try {
      after = await timings.phase("saved-state-after", input.facts)
      if (!before || before !== after)
        throw Error("D04 did not preserve original saved state", {
          cause: failure,
        })
    } catch (error) {
      failed = true
      failure = error
    }
    const evidence: CaseEvidence = {
      case: name,
      rolledBack,
      savedStatePreserved: Boolean(before) && before === after,
      beforeHash: before,
      afterHash: after,
      timings: timings.evidence(),
    }
    if (failed || !rolledBack || report === undefined)
      throw new ServiceIntakeRollbackFailure(
        {
          ...evidence,
          completedCases: completedCases.map(
            ({ report: _report, ...row }) => row,
          ),
          errorCode:
            failure &&
            typeof failure === "object" &&
            "code" in failure &&
            typeof failure.code === "string"
              ? failure.code
              : null,
        },
        failure,
      )
    completedCases.push({ ...evidence, report })
  }
  return completedCases
}
