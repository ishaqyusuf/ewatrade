"use client"

import type { StaffAccessReceiptRecord } from "@ewatrade/db/staff-access-receipt"
import { Button } from "@ewatrade/ui"

type Snapshot = StaffAccessReceiptRecord["before"]
const label = (value: string | null | undefined) =>
  value ? value.toLowerCase().replaceAll("_", " ") : "Not recorded"

function AccessSnapshot({
  title,
  snapshot,
}: { title: string; snapshot: Snapshot }) {
  return (
    <section className="grid gap-2 rounded-lg border p-4">
      <h3 className="font-medium">{title}</h3>
      {"mode" in snapshot ? (
        <>
          <p>
            Access: {label(snapshot.mode)} · catalog editing{" "}
            {typeof snapshot.catalogEditor !== "boolean"
              ? "not recorded"
              : snapshot.catalogEditor
                ? "allowed"
                : "not allowed"}
            .
          </p>
          {snapshot.businessRole || snapshot.membershipStatus ? (
            <p>
              Membership: {label(snapshot.businessRole)} ·{" "}
              {label(snapshot.membershipStatus)}.
            </p>
          ) : null}
          {!snapshot.assignments ? (
            <p>Store assignments were not recorded.</p>
          ) : snapshot.assignments.length ? (
            snapshot.assignments.map((row) => (
              <p key={row.storeId}>
                {row.storeName} · {label(row.role)}
                {row.status ? ` · ${label(row.status)}` : ""}
                {snapshot.defaultStore?.id === row.storeId
                  ? " · starting Store"
                  : ""}
              </p>
            ))
          ) : (
            <p>No Store assignments in this snapshot.</p>
          )}
          <p>
            Starting Store:{" "}
            {snapshot.defaultStore?.name ?? "Not recorded or unavailable"}.
          </p>
          {snapshot.coverage === "partial" ? (
            <p className="text-muted-foreground">
              Some original Store references are unavailable in the current
              business.
            </p>
          ) : null}
        </>
      ) : (
        <p>
          This original snapshot is{" "}
          {snapshot.coverage === "not_recorded"
            ? "not recorded"
            : "unavailable"}
          .
        </p>
      )}
    </section>
  )
}

export function StaffAccessContent({
  record: r,
  timeZone,
  onOpenMember,
  onOpenHistory,
}: {
  record: StaffAccessReceiptRecord
  timeZone: string
  onOpenMember: () => void
  onOpenHistory: () => void
}) {
  return (
    <div className="grid gap-5 text-sm">
      <section className="grid gap-2">
        <h3 className="font-medium">Original saved Store access</h3>
        <p>
          {r.operation === "scoped_access_confirmed"
            ? "Business-wide access replaced with selected Store roles"
            : "Store access changed"}{" "}
          · revision {r.revision}.
        </p>
        <time dateTime={r.happenedAt}>
          {new Date(r.happenedAt).toLocaleString("en-NG", { timeZone })}
        </time>
        <p>
          Store names below are current directory labels. Roles and grants come
          from the original saved snapshots.
        </p>
      </section>
      <AccessSnapshot title="Before" snapshot={r.before} />
      <AccessSnapshot title="After" snapshot={r.after} />
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
        <p className="break-all text-xs text-muted-foreground">
          Original actor reference: {r.originalActorUserId}
        </p>
        <p className="text-muted-foreground">
          Original names, reason and service handover are not recorded by this
          access command.
        </p>
      </section>
      <section className="grid gap-2 border-t pt-4">
        <h3 className="font-medium">Current membership</h3>
        <p>
          {r.currentMembership
            ? `${label(r.currentMembership.role)} · ${label(r.currentMembership.status)} · ${label(r.currentMembership.accessMode)} · access revision ${r.currentMembership.accessRevision}`
            : "Unavailable in the current business directory."}
        </p>
        <p>
          Current membership is separate from this original outcome. Service
          reassignment is a separate action.
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
