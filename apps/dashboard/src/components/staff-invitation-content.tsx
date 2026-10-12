import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"

type Command = RouterOutputs["retailOps"]["staffInvitationCommand"]
const notificationLabels = {
  PENDING: "Queued",
  CLAIMED: "Preparing to send",
  SENDING: "Sending",
  SENT: "Provider accepted",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  OUTCOME_UNKNOWN: "Sending outcome unknown",
  CANCELLED: "Cancelled",
}
function utc(value: Date | null) {
  return value ? new Date(value).toISOString() : "Not recorded"
}

export function StaffInvitationContent({
  command,
  onOpenMember,
}: { command: Command; onOpenMember?: () => void }) {
  const { receipt, invitation, notification, membership } = command
  const details = receipt.details
  return (
    <div className="grid gap-6">
      <div>
        <h3 className="break-words text-lg font-semibold">
          {details?.recipient.name ?? "Staff invitation"}
        </h3>
        {details ? (
          <p className="break-all text-sm text-muted-foreground">
            {details.recipient.email}
          </p>
        ) : null}
        <p className="mt-2 text-sm">
          {receipt.kind === "REVOKE"
            ? "Revocation saved"
            : receipt.kind === "RESEND"
              ? "Replacement invitation saved"
              : "Invitation saved"}{" "}
          · {command.savedAt}
        </p>
      </div>
      {details ? (
        <section
          className="grid gap-3"
          aria-label="Original reviewed invitation"
        >
          <h4 className="font-medium">Original reviewed invitation</h4>
          <p className="text-sm">
            {details.grants.role} · {details.grants.status} · catalog editing{" "}
            {details.grants.catalogEditor ? "allowed" : "not allowed"}
          </p>
          {details.membershipBefore ? (
            <p className="text-sm text-muted-foreground">
              Before: {details.membershipBefore.role} ·{" "}
              {details.membershipBefore.status} · access revision{" "}
              {details.membershipBefore.accessRevision}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No previous membership in this business.
            </p>
          )}
          {details.grants.assignments.length ? (
            <ul className="grid gap-2 text-sm">
              {details.grants.assignments.map((a) => (
                <li key={a.storeId} className="rounded-lg border p-3">
                  <p>
                    {a.storeName} · {a.role}
                    {a.storeId === details.grants.defaultStoreId
                      ? " · starting Store"
                      : ""}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {a.storeId}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">
              No Store assignments recorded in this review.
            </p>
          )}
          {details.seats ? (
            <p className="text-sm">
              Staff seats at review: {details.seats.used} of{" "}
              {details.seats.limit ?? "unlimited"}; {details.seats.additional}{" "}
              additional seat(s).
            </p>
          ) : null}
          {details.reason ? (
            <p className="break-words text-sm">Reason: {details.reason}</p>
          ) : null}
          <p className="text-sm">
            {details.emailEffect === "REQUEST_INVITATION_EMAIL"
              ? "Invitation email requested. Saved or queued does not establish sending, delivery or acceptance."
              : "Link revoked and unsent work cancelled. An email already sending may arrive with an invalid link. Membership stays invited and its seat stays counted."}
          </p>
          <p className="text-xs text-muted-foreground">
            Reviewed at (UTC): {details.reviewedAt}. These are the original
            reviewed facts.
          </p>
        </section>
      ) : (
        <output className="text-sm">
          Original review details were not recorded for this command. Current
          facts below do not reconstruct the original grants.
        </output>
      )}
      <section
        className="grid gap-3 border-t pt-4"
        aria-label="Current invitation state"
      >
        <h4 className="font-medium">Current state</h4>
        <dl className="grid gap-3 text-sm">
          {[
            ["Membership", `${membership.role} · ${membership.status}`],
            ["Invitation", invitation.status],
            [
              "Email",
              notification
                ? notificationLabels[notification.status]
                : "No notification recorded",
            ],
            ["Send attempts", String(notification?.attemptCount ?? 0)],
            ["Expires at (UTC)", utc(invitation.expiresAt)],
            ["Accepted at (UTC)", utc(invitation.acceptedAt)],
            ["Revoked at (UTC)", utc(invitation.revokedAt)],
            ["Provider accepted at (UTC)", utc(notification?.sentAt ?? null)],
            ["Delivered at (UTC)", utc(notification?.deliveredAt ?? null)],
            ["Command reference", receipt.commandId],
            ["Invitation reference", receipt.invitationId],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-all">{value}</dd>
            </div>
          ))}
        </dl>
        {notification?.status === "OUTCOME_UNKNOWN" ? (
          <output className="text-sm">
            The sending result is uncertain. Automatic retries are stopped;
            reconcile the original send before requesting another email.
          </output>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Provider acceptance, delivery, invitation acceptance and membership
          activation are separate states. Refresh to read the latest saved
          facts.
        </p>
      </section>
      {onOpenMember ? (
        <div>
          <Button variant="outline" onClick={onOpenMember}>
            Open staff
          </Button>
        </div>
      ) : null}
    </div>
  )
}
