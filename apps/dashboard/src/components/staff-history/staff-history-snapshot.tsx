import { getStaffRoleLabel } from "@/lib/staff-management"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
type Event = RouterOutputs["retailOps"]["staffHistoryPage"]["data"][number]
type Snapshot = Extract<Event, { stream: "STORE_ACCESS" }>["before"]

export function StaffHistorySnapshot({ value }: { value: Snapshot }) {
  if (!("mode" in value))
    return <p className="text-muted-foreground">Not saved</p>
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-xs text-muted-foreground">Stores</p>
        {value.assignments == null ? (
          <p>Not saved</p>
        ) : value.assignments.length === 0 ? (
          <p>No stores</p>
        ) : (
          <ul className="grid gap-1">
            {value.assignments.map((a, index) => (
              <li key={`${a.storeId}:${index}`}>
                {a.storeName} · {getStaffRoleLabel(a.role)}
                {a.status === "SUSPENDED"
                  ? " · Paused"
                  : a.status === "REVOKED"
                    ? " · Removed"
                    : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.defaultStore ? <p>Starts in {value.defaultStore.name}</p> : null}
      {value.catalogEditor == null ? null : (
        <p>
          Can edit Products and prices: {value.catalogEditor ? "Yes" : "No"}
        </p>
      )}
      {value.hiddenStoreReferences ? (
        <p className="text-muted-foreground">Some stores no longer exist.</p>
      ) : null}
    </div>
  )
}
