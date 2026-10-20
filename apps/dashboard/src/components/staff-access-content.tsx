"use client"

import { getStaffRoleLabel, getStaffStatusLabel } from "@/lib/staff-management"
import type { StaffAccessReceiptRecord } from "@ewatrade/db/staff-access-receipt"
import { Button } from "@ewatrade/ui"

type Snapshot = StaffAccessReceiptRecord["before"]

function AccessSnapshot({
  title,
  snapshot,
}: { title: string; snapshot: Snapshot }) {
  return (
    <section className="grid gap-2 rounded-lg border p-4">
      <h3 className="font-medium">{title}</h3>
      {"mode" in snapshot ? (
        <>
          {!snapshot.assignments ? (
            <p>Stores weren’t saved.</p>
          ) : snapshot.assignments.length ? (
            snapshot.assignments.map((row) => (
              <p key={row.storeId}>
                {row.storeName} · {getStaffRoleLabel(row.role)}
                {row.status === "SUSPENDED"
                  ? " · Paused"
                  : row.status === "REVOKED"
                    ? " · Removed"
                    : ""}
                {snapshot.defaultStore?.id === row.storeId
                  ? " · Starts here"
                  : ""}
              </p>
            ))
          ) : (
            <p>No stores.</p>
          )}
          {typeof snapshot.catalogEditor === "boolean" ? (
            <p>
              Can edit Products and prices:{" "}
              {snapshot.catalogEditor ? "Yes" : "No"}
            </p>
          ) : null}
          {snapshot.coverage === "partial" ? (
            <p className="text-muted-foreground">
              Some stores no longer exist.
            </p>
          ) : null}
        </>
      ) : (
        <p>Not saved.</p>
      )}
    </section>
  )
}

export function StaffAccessContent({
  record: r,
  onOpenMember,
  onOpenHistory,
}: {
  record: StaffAccessReceiptRecord
  timeZone: string
  onOpenMember: () => void
  onOpenHistory: () => void
}) {
  const name = r.subject.name?.trim()
  return (
    <div className="grid gap-5 text-sm">
      {r.operation === "scoped_access_confirmed" ? (
        <p>Moved from every store to chosen stores</p>
      ) : null}
      <AccessSnapshot title="Before" snapshot={r.before} />
      <AccessSnapshot title="After" snapshot={r.after} />
      <section className="grid gap-2 border-t pt-4">
        <h3 className="font-medium">Today</h3>
        <p>
          {r.currentMembership
            ? `${getStaffRoleLabel(r.currentMembership.role)} · ${getStaffStatusLabel(r.currentMembership.status)}`
            : "No longer in your business."}
        </p>
        <p className="text-xs text-muted-foreground">
          Their access may have changed since.
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
