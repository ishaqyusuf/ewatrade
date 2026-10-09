import {
  DirectoryCollectionSkeleton,
  TABLE_ROW_RULE_CLASS,
} from "@/components/tables/core"
import { cn } from "@/utils"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"

const COLUMNS = [
  { label: "Select", width: "size-4", className: "w-12" },
  { label: "Staff", width: "w-40" },
  { label: "Role", width: "w-16" },
  { label: "Status", width: "w-16" },
  { label: "Invited", width: "w-20" },
  { label: "Accepted", width: "w-20" },
  { label: "Actions", width: "ml-auto w-36", className: "text-right" },
]

/** Mirrors the quiet Staff table in Table view; list and cards keep blocks. */
export function StaffSkeleton({ view = "table" }: { view?: DirectoryView }) {
  if (view !== "table") return <DirectoryCollectionSkeleton label="staff" />
  return (
    <div className="overflow-x-auto" aria-label="Loading staff">
      <Table className="min-w-[760px]">
        <TableHeader className="border-0">
          <TableRow className="border-b border-border hover:bg-transparent">
            {COLUMNS.map((column) => (
              <TableHead
                key={column.label}
                scope="col"
                className={cn(
                  "h-9 border-r-0 text-xs font-normal",
                  column.className,
                )}
              >
                {column.label === "Select" ? (
                  <span className="sr-only">Select</span>
                ) : (
                  column.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="border-0">
          {[0, 1, 2].map((row) => (
            <TableRow key={row} className={TABLE_ROW_RULE_CLASS}>
              {COLUMNS.map((column) => (
                <TableCell key={column.label} className="border-r-0 py-4">
                  <Skeleton className={cn("h-4", column.width)} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
