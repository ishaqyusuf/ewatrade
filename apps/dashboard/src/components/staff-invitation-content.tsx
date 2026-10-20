import { getStaffRoleLabel } from "@/lib/staff-management"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"

type Command = RouterOutputs["retailOps"]["staffInvitationCommand"]
const notificationLabels = {
  PENDING: "Waiting to send",
  CLAIMED: "Sending",
  SENDING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Couldn’t send",
  OUTCOME_UNKNOWN: "Not sure it was sent",
  CANCELLED: "Cancelled",
}
const deliveryFailureLabels: Record<string, string> = {
  PROVIDER_BOUNCED: "The email bounced. Check the address.",
  PROVIDER_FAILED: "Couldn’t deliver the email.",
  PROVIDER_SUPPRESSED: "Our emails are blocked for this address.",
  PROVIDER_COMPLAINED: "They marked our email as spam.",
}
const invitationStatusLabels: Record<string, string> = {
  ACTIVE: "Pending",
  ACCEPTED: "Accepted",
  REVOKED: "Cancelled",
  EXPIRED: "Expired",
}
const dateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
})
const dateOnly = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })

export function StaffInvitationContent({
  command,
  onOpenMember,
}: { command: Command; onOpenMember?: () => void }) {
  const { receipt, invitation, notification } = command
  const details = receipt.details
  const name = details?.recipient.name?.trim() || null
  const rows: Array<[string, string]> = [
    ["Status", invitationStatusLabels[invitation.status] ?? "Pending"],
  ]
  if (notification)
    rows.push(["Email", notificationLabels[notification.status]])
  if (notification?.failureCode)
    rows.push([
      "Problem",
      deliveryFailureLabels[notification.failureCode] ??
        "Couldn’t deliver the email.",
    ])
  if (invitation.expiresAt)
    rows.push(["Expires", dateOnly.format(new Date(invitation.expiresAt))])
  if (invitation.acceptedAt)
    rows.push(["Accepted", dateOnly.format(new Date(invitation.acceptedAt))])
  if (invitation.revokedAt)
    rows.push(["Cancelled", dateOnly.format(new Date(invitation.revokedAt))])
  return (
    <div className="grid gap-6">
      <div>
        <h3 className="break-words text-lg font-semibold">
          {name ?? "Invite"}
        </h3>
        {details ? (
          <p className="break-all text-sm text-muted-foreground">
            {details.recipient.email}
          </p>
        ) : null}
        <p className="mt-2 text-sm">
          {receipt.kind === "REVOKE"
            ? "Invite cancelled"
            : receipt.kind === "RESEND"
              ? "Invite sent again"
              : "Invite saved"}{" "}
          {dateTime.format(new Date(command.savedAt))}
        </p>
      </div>
      {details ? (
        <section className="grid gap-3" aria-label="They’ll join as">
          <h4 className="font-medium">They’ll join as</h4>
          {details.grants.assignments.length ? (
            <ul className="grid gap-2 text-sm">
              {details.grants.assignments.map((a) => (
                <li key={a.storeId} className="rounded-lg border p-3">
                  {a.storeName} · {getStaffRoleLabel(a.role)}
                  {a.storeId === details.grants.defaultStoreId
                    ? " · Starts here"
                    : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">{getStaffRoleLabel(details.grants.role)}</p>
          )}
          {details.grants.catalogEditor ? (
            <p className="text-sm">Can edit Products and prices</p>
          ) : null}
          {details.seats ? (
            <p className="text-sm">
              {details.seats.limit === null
                ? `${details.seats.used} staff seats used.`
                : `${details.seats.used} of ${details.seats.limit} staff seats used.`}
            </p>
          ) : null}
          {details.reason ? (
            <p className="break-words text-sm">Reason: {details.reason}</p>
          ) : null}
          {details.emailEffect === "CANCEL_UNSENT_WORK" ? (
            <p className="text-sm">
              Invite cancelled. The link no longer works. The seat stays in use
              until you remove them.
            </p>
          ) : null}
        </section>
      ) : (
        <output className="text-sm">The original details weren’t saved.</output>
      )}
      <section
        className="grid gap-3 border-t pt-4"
        aria-label="Where it is now"
      >
        <h4 className="font-medium">Where it is now</h4>
        <dl className="grid gap-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {notification?.status === "OUTCOME_UNKNOWN" ? (
          <output className="text-sm">
            We can’t confirm the email was sent. Ask them to check their inbox
            before you resend.
          </output>
        ) : null}
      </section>
      {onOpenMember ? (
        <div>
          <Button variant="outline" onClick={onOpenMember}>
            {name ? `Open ${name}` : "Open person"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
