import {
  type ServiceIntakeSignedFacts,
  assertServiceIntakeSignedFactsUnchanged,
  changedServiceIntakeSignedFacts,
} from "./service-intake-signed-rollback-facts"
import {
  assertServiceIntakeSignedBounds,
  signedIntakeCheck as check,
} from "./service-intake-signed-rollback-guards"

export const serviceIntakeSignedCases = [
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
] as const
export type ServiceIntakeSignedCase = (typeof serviceIntakeSignedCases)[number]
export type ServiceIntakeSignedCaseSelection = "full" | "remaining"
export function selectedServiceIntakeSignedCases(
  selection: ServiceIntakeSignedCaseSelection = "full",
) {
  check(
    selection === "full" || selection === "remaining",
    "Explicit full or remaining signed case selection required",
  )
  return selection === "remaining"
    ? serviceIntakeSignedCases.slice(1)
    : serviceIntakeSignedCases
}
type Evidence = {
  case: ServiceIntakeSignedCase
  before: ServiceIntakeSignedFacts
  after: ServiceIntakeSignedFacts
  changedTables: string[]
  rolledBack: boolean
  savedStatePreserved: boolean
  checks: string[]
  elapsedMs: number
}
export class ServiceIntakeSignedRollbackFailure extends Error {
  constructor(
    public readonly evidence: Evidence & { completedCases: Evidence[] },
    cause: unknown,
  ) {
    super("D04 signed rollback verification failed", { cause })
  }
}

export async function runServiceIntakeSignedCases<Tx, Report>(input: {
  selection?: ServiceIntakeSignedCaseSelection
  facts: () => Promise<ServiceIntakeSignedFacts>
  transaction: (
    run: (tx: Tx) => Promise<never>,
    options: { maxWait: 10000; timeout: 30000; isolationLevel: "Serializable" },
  ) => Promise<unknown>
  cases: Record<
    ServiceIntakeSignedCase,
    (tx: Tx, checks: string[]) => Promise<Report>
  >
}) {
  const completed: Array<Evidence & { report: Report }> = []
  for (const name of selectedServiceIntakeSignedCases(input.selection)) {
    const started = performance.now()
    const rollback = Error(`D04_SIGNED_ROLLBACK:${name}`)
    const checks: string[] = []
    let before: ServiceIntakeSignedFacts = []
    let after: ServiceIntakeSignedFacts = []
    let report: Report | undefined
    let failure: unknown
    let rolledBack = false
    let failed = false
    try {
      before = await input.facts()
      assertServiceIntakeSignedFactsUnchanged(before, before)
      const options = {
        maxWait: 10000,
        timeout: 30000,
        isolationLevel: "Serializable",
      } as const
      assertServiceIntakeSignedBounds(options)
      await input.transaction(async (tx) => {
        report = await input.cases[name](tx, checks)
        check(checks.length > 0, "Signed case recorded no assertions")
        throw rollback
      }, options)
      throw Error("Signed transaction did not roll back")
    } catch (error) {
      if (error === rollback) rolledBack = true
      else {
        failure = error
        failed = true
      }
    }
    let savedStatePreserved = false
    try {
      after = await input.facts()
      assertServiceIntakeSignedFactsUnchanged(before, after)
      savedStatePreserved = true
    } catch (error) {
      failure = error
      failed = true
    }
    const evidence: Evidence = {
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
      throw new ServiceIntakeSignedRollbackFailure(
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
