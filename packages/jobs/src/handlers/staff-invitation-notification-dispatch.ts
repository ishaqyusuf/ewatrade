import { createHash } from "node:crypto"
import type {
  claimStaffInvitationNotification,
  finishStaffInvitationNotification,
  startStaffInvitationNotification,
  StaffInvitationNotificationIdentifier,
} from "@ewatrade/db/queries"
import { openStaffInvitationPayload } from "@ewatrade/db/staff-invitation-custody"
import {
  createRetailOpsStaffInviteEmail,
  defaultRetailOpsStaffInviteSubject,
  type EmailMessage,
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
  config: NodeJS.ProcessEnv
}

/** Only an adapter with a definitive non-acceptance receipt may throw this. */
export class StaffInvitationProviderRejected extends Error {
  constructor() {
    super("Staff invitation provider rejected the request.")
  }
}

/** ID-only dispatch seam. No scheduler or live provider is registered by this source. */
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
    await dependencies.finish({
      ...completion,
      outcome: "FAILED",
      failureCode: "CUSTODY_UNAVAILABLE",
    })
    return null
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
  try {
    await dependencies.assertProviderAllowed({
      tenantId: input.tenantId,
      recipient: payload.inviteeEmail,
    })
  } catch {
    await dependencies.finish({
      ...completion,
      outcome: "FAILED",
      failureCode: "PROVIDER_UNAVAILABLE",
    })
    return null
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
    await dependencies.finish(
      error instanceof StaffInvitationProviderRejected
        ? { ...completion, outcome: "FAILED", failureCode: "PROVIDER_REJECTED" }
        : {
            ...completion,
            outcome: "OUTCOME_UNKNOWN",
            failureCode: "PROVIDER_OUTCOME_UNKNOWN",
          },
    )
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
