"use client"
import { getStaffRoleLabel, getStaffStatusLabel } from "@/lib/staff-management"
import type { StaffStatusReceiptRecord } from "@ewatrade/db/staff-status-receipt"
import { Button } from "@ewatrade/ui"

const status = (value: string | null) =>
  value ? getStaffStatusLabel(value) : "Unknown"

export function StaffStatusContent({
  record: r,
  onOpenMember,
  onOpenHistory,
}: {
  record: StaffStatusReceiptRecord
  timeZone: string
  onOpenMember: () => void
  onOpenHistory: () => void
}) {
  const name = r.subject.name?.trim()
  const role = r.after.role ?? r.before.role
  return (
    <div className="grid gap-5 text-sm">
      <section className="grid gap-3">
        <h3 className="font-medium">What changed</h3>
        <dl className="grid grid-cols-2 gap-2">
          <dt>Status</dt>
          <dd>
            {status(r.before.status)} → {status(r.after.status)}
          </dd>
          {role ? (
            <>
              <dt>Role</dt>
              <dd>{getStaffRoleLabel(role)}</dd>
            </>
          ) : null}
        </dl>
        <div>
          <p className="font-medium">Reason</p>
          <p className="whitespace-pre-wrap break-words">
            {r.reason ?? "No reason given"}
          </p>
        </div>
        <p>
          {r.eventType === "SUSPENDED"
            ? "Suspended staff can’t sign in to any store."
            : r.eventType === "REMOVED"
              ? "They never joined. Their invite stopped working and their seat was freed."
              : "They can sign in again."}
        </p>
      </section>
      <section className="grid gap-2 border-t pt-4">
        <h3 className="font-medium">Today</h3>
        <p>
          {r.currentMembership
            ? `${status(r.currentMembership.status)} · ${getStaffRoleLabel(r.currentMembership.role)}`
            : "No longer in your business."}
        </p>
        <p className="text-xs text-muted-foreground">
          Reactivating them won’t bring back stores that were removed.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onOpenMember}>
            {name ? `Open ${name}` : "Open person"}
          </Button>
          <Button variant="outline" onClick={onOpenHistory}>
            See history
          </Button>
        </div>
      </section>
    </div>
  )
}
