import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"

type Member = RouterOutputs["retailOps"]["staffDirectoryMember"]

function originalDate(value: Date | null) {
  return value ? new Date(value).toISOString() : "Not recorded"
}

export function StaffMemberContent({
  member,
  onOpenHistory,
}: { member: Member; onOpenHistory?: () => void }) {
  return (
    <div className="grid gap-6">
      <div>
        <h3 className="break-words text-lg font-semibold">{member.name}</h3>
        <p className="break-all text-sm text-muted-foreground">
          {member.email}
        </p>
      </div>
      <dl className="grid gap-4 text-sm">
        {[
          ["Current role", member.role],
          ["Current status", member.status],
          ["Membership reference", member.membershipId],
          ["Invited at (UTC)", originalDate(member.invitedAt)],
          ["Accepted at (UTC)", originalDate(member.acceptedAt)],
          ["Membership created (UTC)", originalDate(member.createdAt)],
          ["Membership updated (UTC)", originalDate(member.updatedAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-2 border-t pt-4 text-xs text-muted-foreground">
        <p>
          {member.profileCoverage === "available"
            ? "Durable profile identity available. Role and status come from the current membership."
            : "Durable profile unavailable; membership identity is shown."}
        </p>
        <p>
          Current status does not establish invitation delivery or past access.
          Lifecycle, actor and Store access history have not been read.
        </p>
      </div>
      {onOpenHistory ? (
        <div>
          <Button variant="outline" onClick={onOpenHistory}>
            Open history
          </Button>
        </div>
      ) : null}
    </div>
  )
}
