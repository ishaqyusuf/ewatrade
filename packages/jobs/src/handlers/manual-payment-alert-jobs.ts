/** Policy notices are in-app work; the provider switch gates external delivery only. */
export async function runManualPaymentAlertJobs(input: {
  externalDeliveryEnabled: boolean
  queuePolicyChange(): Promise<boolean>
  queueExternalAlerts(): Promise<number>
}) {
  const policyPending = await input.queuePolicyChange()
  if (!input.externalDeliveryEnabled)
    return { enabled: false, policyPending, queued: 0 }
  return { policyPending, queued: await input.queueExternalAlerts() }
}

type PolicyClaim = { revision: number; claimId: string }
export async function runManualPaymentPolicyChange<
  Result extends { completed: boolean },
>(
  input: { revision?: number; claimId?: string },
  dependencies: {
    claim(): Promise<{ revision: number; claimId: string | null } | null>
    process(input: PolicyClaim & { limit: number }): Promise<Result>
    continue(input: PolicyClaim): Promise<unknown>
  },
) {
  const change =
    input.revision && input.claimId
      ? { revision: input.revision, claimId: input.claimId }
      : await dependencies.claim()
  if (!change?.claimId) return { skipped: true }
  const claim = { revision: change.revision, claimId: change.claimId }
  for (let page = 0; page < 3; page++) {
    const result = await dependencies.process({ ...claim, limit: 5 })
    if (result.completed) return result
  }
  await dependencies.continue(claim)
  return { continued: true, revision: change.revision }
}
