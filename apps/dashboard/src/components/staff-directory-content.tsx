import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { StaffDirectoryReadEmpty } from "./tables/staff-directory-read/empty-states"
import { StaffDirectoryReadTable } from "./tables/staff-directory-read/table"

export function StaffDirectoryContent({
  page,
  filtered,
  continued,
  onOpenMember,
}: {
  page: RouterOutputs["retailOps"]["staffDirectoryPage"]
  filtered: boolean
  continued: boolean
  onOpenMember: (membershipId: string) => void
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-sm">
        <p className="font-medium">
          {page.total} matching memberships · {page.data.length} on this page
        </p>
        <p className="text-xs text-muted-foreground">
          {page.scope === "active_store_assignments"
            ? "Business · explicit active Store assignments"
            : "Business · membership directory"}
        </p>
        <p className="text-xs text-muted-foreground">
          Request as of{" "}
          <time dateTime={page.asOf}>{new Date(page.asOf).toISOString()}</time>{" "}
          · pages are live request snapshots.
        </p>
      </div>
      {page.data.length ? (
        <StaffDirectoryReadTable
          members={page.data}
          onOpenMember={onOpenMember}
        />
      ) : (
        <StaffDirectoryReadEmpty filtered={filtered} continued={continued} />
      )}
      <div className="grid gap-2 border-t pt-4 text-xs text-muted-foreground">
        <p>
          {page.coverage.profile === "partial"
            ? "Some durable profiles are unavailable; membership identity is shown."
            : "Durable profiles available for this page."}
        </p>
        <p>
          Current membership role/status is shown. History has not been read.
          Store filters require saved active assignments; legacy access is not
          inferred.
        </p>
        <p>
          {page.nextCursor
            ? "More matching memberships are available."
            : "End of available matching results."}
        </p>
      </div>
    </div>
  )
}
