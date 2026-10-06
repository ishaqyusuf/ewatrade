import { TableSkeleton } from "@/components/tables/core"
import { customerLedgerColumns } from "./columns"
export function CustomerLedgerSkeleton() {
  return (
    <TableSkeleton
      columns={customerLedgerColumns("NGN", () => {})}
      rowCount={8}
      rowHeight={57}
      stickyColumnIds={["select", "date"]}
    />
  )
}
