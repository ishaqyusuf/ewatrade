import type { staffDirectoryTargetSchema } from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"

type Target = ReturnType<typeof staffDirectoryTargetSchema.parse>
export function StaffDirectoryPagination({
  target,
  nextCursor,
  disabled,
  onOpen,
  onRefresh,
}: {
  target: Target
  nextCursor: string | null
  disabled: boolean
  onOpen: (target: Target) => void
  onRefresh: () => void
}) {
  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={onRefresh}>
        Refresh
      </Button>
      {target.filters.cursor ? (
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onOpen({
              kind: "staff_directory",
              filters: { ...target.filters, cursor: undefined },
            })
          }
        >
          First page
        </Button>
      ) : null}
      {nextCursor ? (
        <Button
          disabled={disabled}
          onClick={() =>
            onOpen({
              kind: "staff_directory",
              filters: { ...target.filters, cursor: nextCursor },
            })
          }
        >
          Next page
        </Button>
      ) : null}
    </>
  )
}
