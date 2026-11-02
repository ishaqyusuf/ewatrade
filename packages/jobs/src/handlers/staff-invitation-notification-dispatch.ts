import { createHash } from "node:crypto"
import {
  STAFF_INVITATION_NOTIFICATION_MAX_ATTEMPTS,
  type StaffInvitationNotificationIdentifier,
  type claimStaffInvitationNotification,
  type finishStaffInvitationNotification,
  staffInvitationNotificationRetryAt,
  type startStaffInvitationNotification,
} from "@ewatrade/db/queries"
import { openStaffInvitationPayload } from "@ewatrade/db/staff-invitation-custody"
import {
  type EmailMessage,
  createRetailOpsStaffInviteEmail,
  defaultRetailOpsStaffInviteSubject,
} from "@ewatrade/email"

type Claim = NonNullable<
  Awaited<ReturnType<typeof claimStaffInvitationNotification>>
>
export type StaffInvitationDispatchDependencies = {
  claim(input: StaffInvitationNotificationIdentifier): Promise<Claim | null>
  start(
    input: Parameters<typeof startStaffInvitationNotification>[1],
  ): Promise<boolean>
  finish(
    input: Parameters<typeof finishStaffInvitationNotification>[1],
  ): Promise<boolean>
  assertProviderAllowed(input: {
    tenantId: string
    recipient: string
  }): Promise<void>
  send(
    message: EmailMessage,
  ): Promise<{ providerKey: string; providerMessageId: string }>
  /** One delayed, idempotent dispatch run for the next attempt. */
  scheduleRetry(
    input: StaffInvitationNotificationIdentifier & {
      attempt: number
      runAt: Date
    },
  ): Promise<unknown>
  config: NodeJS.ProcessEnv
}

// Keeps the delayed run after the stored nextAttemptAt despite worker clock skew.
const RETRY_CLOCK_MARGIN_MS = 5_000

/** Only an adapter with a definitive non-acceptance receipt may throw this. */
export class StaffInvitationProviderRejected extends Error {
  constructor() {
    super("Staff invitation provider rejected the request.")
  }
}

type RetryableFailure =
  | "PROVIDER_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "CUSTODY_UNAVAILABLE"

/** ID-only dispatch seam. A retryable failure schedules its own next attempt. */
export async function runStaffInvitationNotificationDispatch(
  input: StaffInvitationNotificationIdentifier,
  dependencies: StaffInvitationDispatchDependencies,
) {
  const claim = await dependencies.claim(input)
  if (!claim) return null
  const completion = {
    ...input,
    claimId: claim.claimId,
    payloadHash: claim.payloadHash,
  }
  const failed = async (failureCode: RetryableFailure) => {
    if (
      !(await dependencies.finish({
        ...completion,
        outcome: "FAILED",
        failureCode,
      }))
    )
      return null
    if (claim.attemptNumber >= STAFF_INVITATION_NOTIFICATION_MAX_ATTEMPTS)
      return { status: "failed" as const, attempt: claim.attemptNumber }
    const attempt = claim.attemptNumber + 1
    const runAt = new Date(
      staffInvitationNotificationRetryAt(claim.attemptNumber).getTime() +
        RETRY_CLOCK_MARGIN_MS,
    )
    try {
      await dependencies.scheduleRetry({ ...input, attempt, runAt })
      return {
        status: "retry_scheduled" as const,
        attempt,
        runAt: runAt.toISOString(),
      }
    } catch {
      // The outbox row stays PENDING; the safety-net sweeper recovers it.
      return { status: "retry_deferred" as const, attempt }
    }
  }
  let payload: ReturnType<typeof openStaffInvitationPayload>
  try {
    if (
      claim.tenantId !== input.tenantId ||
      claim.notificationId !== input.notificationId
    )
      throw Error("Claim scope changed.")
    payload = openStaffInvitationPayload(
      claim.payloadCiphertext,
      claim.encryptionKeyId,
      {
        tenantId: claim.tenantId,
        membershipId: claim.membershipId,
        invitationId: claim.invitationId,
        notificationId: claim.notificationId,
        payloadHash: claim.payloadHash,
      },
      dependencies.config,
    )
  } catch {
    return failed("CUSTODY_UNAVAILABLE")
  }
  const token = new URL(payload.inviteUrl).searchParams.get("inviteToken")
  if (
    !token ||
    createHash("sha256").update(token).digest("hex") !== claim.tokenHash ||
    payload.inviteeEmail !== claim.currentEmail ||
    payload.staffAccessRevision !== claim.currentAccessRevision
  ) {
    await dependencies.finish({
      ...completion,
      outcome: "FAILED",
      failureCode: "PAYLOAD_CHANGED",
    })
    return null
  }
  const message = createRetailOpsStaffInviteEmail({
    from: dependencies.config.EMAIL_FROM ?? "noreply@ewatrade.local",
    input: payload,
    to: payload.inviteeEmail,
    subject: defaultRetailOpsStaffInviteSubject({
      businessName: payload.businessName,
    }),
  })
  message.idempotencyKey = claim.providerIdempotencyKey
  message.tags = [
    { name: "category", value: "staff_invitation" },
    { name: "tenant_id", value: claim.tenantId },
    { name: "notification_id", value: claim.notificationId },
    { name: "payload_hash", value: claim.payloadHash },
  ]
  try {
    await dependencies.assertProviderAllowed({
      tenantId: input.tenantId,
      recipient: payload.inviteeEmail,
    })
  } catch {
    return failed("PROVIDER_UNAVAILABLE")
  }
  if (
    !(await dependencies.start({
      ...input,
      claimId: claim.claimId,
      expectedAccessRevision: payload.staffAccessRevision,
    }))
  )
    return null
  let receipt: { providerKey: string; providerMessageId: string }
  try {
    receipt = await dependencies.send(message)
    if (
      !receipt.providerKey ||
      receipt.providerKey.length > 80 ||
      !receipt.providerMessageId ||
      receipt.providerMessageId.length > 512
    )
      throw Error("Provider acceptance receipt is unavailable.")
  } catch (error) {
    if (error instanceof StaffInvitationProviderRejected)
      return failed("PROVIDER_REJECTED")
    // Unknown provider outcome is never retried: a retry could send twice.
    await dependencies.finish({
      ...completion,
      outcome: "OUTCOME_UNKNOWN",
      failureCode: "PROVIDER_OUTCOME_UNKNOWN",
    })
    return null
  }
  // A persistence error here must propagate; never relabel known acceptance as rejection.
  const recorded = await dependencies.finish({
    ...completion,
    outcome: "SENT",
    ...receipt,
  })
  return recorded ? { status: "sent" as const } : null
}
