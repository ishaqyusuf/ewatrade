import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
type Event = RouterOutputs["retailOps"]["staffHistoryPage"]["data"][number]
type Snapshot = Extract<Event, { stream: "STORE_ACCESS" }>["before"]

export function StaffHistorySnapshot({ value }: { value: Snapshot }) {
  if (!("mode" in value))
    return (
      <p className="text-muted-foreground">
        {value.coverage === "not_recorded"
          ? "Not recorded"
          : "Original snapshot unavailable"}
      </p>
    )
  return (
    <div className="grid gap-2">
      <dl className="grid gap-1">
        {[
          ["Access mode", value.mode],
          ["Business role", value.businessRole],
          ["Membership status", value.membershipStatus],
          [
            "Catalog editor",
            value.catalogEditor == null
              ? null
              : value.catalogEditor
                ? "Yes"
                : "No",
          ],
          ["Default Store", value.defaultStore?.name],
        ].map(([label, text]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{text ?? "Not recorded"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">Saved Store assignments</p>
      {value.assignments == null ? (
        <p>Not recorded</p>
      ) : value.assignments.length === 0 ? (
        <p>No assignments in this snapshot</p>
      ) : (
        <ul className="grid gap-2">
          {value.assignments.map((a, index) => (
            <li key={`${a.storeId}:${index}`}>
              <p>{a.storeName}</p>
              <p className="text-xs text-muted-foreground">
                {a.role} · {a.status ?? "Status not recorded"}
              </p>
            </li>
          ))}
        </ul>
      )}
      {value.hiddenStoreReferences ? (
        <p className="text-muted-foreground">
          Some Store references are unavailable.
        </p>
      ) : null}
    </div>
  )
}
