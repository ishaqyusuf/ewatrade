"use client"
import type { StaffStatusReceiptRecord } from "@ewatrade/db/staff-status-receipt"
import { Button } from "@ewatrade/ui"

const label = (value: string | null) =>
  value ? value.toLowerCase().replaceAll("_", " ") : "Unavailable"
export function StaffStatusContent({
  record: r,
  timeZone,
  onOpenMember,
  onOpenHistory,
}: {
  record: StaffStatusReceiptRecord
  timeZone: string
  onOpenMember: () => void
  onOpenHistory: () => void
}) {
  return (
    <div className="grid gap-5 text-sm">
      <section className="grid gap-3">
        <h3 className="font-medium">Original saved outcome</h3>
        <dl className="grid grid-cols-2 gap-2">
          <dt>Before</dt>
          <dd>
            {label(r.before.status)} · {label(r.before.role)}
          </dd>
          <dt>After</dt>
          <dd>
            {label(r.after.status)} · {label(r.after.role)}
          </dd>
          <dt>Recorded</dt>
          <dd>
            <time dateTime={r.happenedAt}>
              {new Date(r.happenedAt).toLocaleString("en-NG", { timeZone })}
            </time>
          </dd>
        </dl>
        <div>
          <p className="font-medium">Original reason</p>
          <p className="whitespace-pre-wrap break-words">
            {r.reason ?? "Not recorded"}
          </p>
        </div>
        <p>
          Whole-business membership. This saved event does not describe a change
          to one Store grant.
        </p>
      </section>
      <section className="grid gap-2 border-t pt-4">
        <h3 className="font-medium">Current directory identities</h3>
        <p>
          Staff: {r.subject.name ?? "Unavailable"}
          {r.subject.email ? ` · ${r.subject.email}` : ""}
        </p>
        <p>
          Recorded actor: {r.actor.name ?? "Unavailable"}
          {r.actor.email ? ` · ${r.actor.email}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Names and contacts come from the current same-business directory.
          Original identity snapshots and original Store grants are not recorded
          here.
        </p>
        <p className="break-all text-xs text-muted-foreground">
          Original actor reference: {r.originalActorUserId ?? "Not recorded"}
        </p>
      </section>
      <section className="grid gap-2 border-t pt-4">
        <h3 className="font-medium">Current membership</h3>
        <p>
          {r.currentMembership
            ? `${label(r.currentMembership.status)} · ${label(r.currentMembership.role)} · access revision ${r.currentMembership.accessRevision}`
            : "Unavailable in the current business directory."}
        </p>
        <p className="text-xs text-muted-foreground">
          Current access is separate from the original outcome. Open the member
          to review current Store assignments; removed grants are not restored.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onOpenMember}>
            Open current member
          </Button>
          <Button variant="outline" onClick={onOpenHistory}>
            Open recorded history
          </Button>
        </div>
      </section>
    </div>
  )
}
