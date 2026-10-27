import {
  type ManualPaymentReportAlertContent,
  renderManualPaymentReportAlert,
} from "@ewatrade/email"

export type ManualPaymentAlertIdentifier = {
  tenantId: string
  intentId: string
}
export type ManualPaymentAlertDispatchClaim = ManualPaymentAlertIdentifier & {
  claimId: string
  channel: "email" | "whatsapp"
  destination: string
  providerIdempotencyKey: string
  content: ManualPaymentReportAlertContent
}
export type ManualPaymentAlertDispatchDependencies = {
  claim(
    input: ManualPaymentAlertIdentifier,
  ): Promise<ManualPaymentAlertDispatchClaim | null>
  assertProviderAllowed(claim: ManualPaymentAlertDispatchClaim): Promise<void>
  start(claim: ManualPaymentAlertDispatchClaim): Promise<boolean>
  finish(
    input: ManualPaymentAlertDispatchClaim & {
      outcome: "accepted" | "rejected" | "cancelled" | "unknown"
      providerMessageId?: string
    },
  ): Promise<unknown>
  send(
    input: ManualPaymentAlertDispatchClaim &
      ReturnType<typeof renderManualPaymentReportAlert>,
  ): Promise<{ providerMessageId: string }>
}

/** Only a provider adapter with proof of nonacceptance may use this error. */
export class ManualPaymentAlertProviderRejected extends Error {}

/** No transport retry: an uncertain provider result must be reconciled first. */
export async function runManualPaymentAlertDispatch(
  input: ManualPaymentAlertIdentifier,
  dependencies: ManualPaymentAlertDispatchDependencies,
) {
  if (
    Object.keys(input).length !== 2 ||
    !input.tenantId ||
    !input.intentId ||
    input.tenantId.length > 128 ||
    input.intentId.length > 128
  )
    throw new Error("Invalid payment alert identity.")
  const claim = await dependencies.claim(input)
  if (!claim) return { status: "skipped" as const }
  let message: ReturnType<typeof renderManualPaymentReportAlert>
  try {
    if (
      claim.tenantId !== input.tenantId ||
      claim.intentId !== input.intentId ||
      !claim.claimId ||
      !claim.providerIdempotencyKey
    )
      throw new Error("Payment alert claim changed.")
    message = renderManualPaymentReportAlert(claim.content)
    await dependencies.assertProviderAllowed(claim)
  } catch {
    await dependencies.finish({ ...claim, outcome: "cancelled" })
    return { status: "cancelled" as const }
  }
  // This durable fenced transition rechecks current membership, contact, settings
  // and policy; a claim/read or a queued task is never send authority.
  if (!(await dependencies.start(claim))) return { status: "skipped" as const }
  let receipt: { providerMessageId: string }
  try {
    receipt = await dependencies.send({ ...claim, ...message })
    if (
      !receipt.providerMessageId?.trim() ||
      receipt.providerMessageId.length > 512
    )
      throw new Error("Provider acceptance is unconfirmed.")
  } catch (error) {
    const outcome =
      error instanceof ManualPaymentAlertProviderRejected
        ? "rejected"
        : "unknown"
    await dependencies.finish({ ...claim, outcome })
    return { status: outcome }
  }
  // Settlement failures remain dispatching, never trigger a second network call.
  await dependencies.finish({
    ...claim,
    outcome: "accepted",
    providerMessageId: receipt.providerMessageId,
  })
  return { status: "accepted" as const }
}
