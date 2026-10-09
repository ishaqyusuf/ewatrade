import { TABLE_ROW_RULE_CLASS } from "@/components/tables/core"
import { cn } from "@/utils"
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
  { label: "Domain", width: "w-36" },
  { label: "Store", width: "w-24" },
  { label: "Registrar", width: "w-20" },
  { label: "Connection", width: "w-24" },
  { label: "Renewal / expiry", width: "w-20" },
  { label: "Actions", width: "ml-auto w-28", className: "text-right" },
]

/** Mirrors the quiet Domains table: no outer box, hairline row rules. */
export function DomainTableSkeleton() {
  return (
    <div className="overflow-x-auto" aria-label="Loading domains">
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
          {[0, 1, 2, 3].map((row) => (
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
