export function DomainTableSkeleton() {
  return (
    <div
      className="overflow-x-auto border border-border"
      aria-label="Loading domains"
    >
      <Table className="w-full min-w-[760px] text-sm">
        <TableHeader>
          <TableRow className="border-b border-border text-left text-muted-foreground">
            {[
              "Select",
              "Domain",
              "Store",
              "Registrar",
              "Connection",
              "Renewal / expiry",
              "Actions",
            ].map((label) => (
              <TableHead
                key={label}
                scope="col"
                className="px-4 py-3 font-normal"
              >
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[0, 1, 2, 3].map((row) => (
            <TableRow
              key={row}
              className="border-b border-border last:border-0"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((cell) => (
                <TableCell key={cell} className="px-4 py-4">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
