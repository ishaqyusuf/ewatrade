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
          {page.total} {page.total === 1 ? "person" : "people"} · showing{" "}
          {page.data.length}
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
      {page.data.length && !page.nextCursor ? (
        <p className="text-xs text-muted-foreground">That’s everyone.</p>
      ) : null}
    </div>
  )
}
