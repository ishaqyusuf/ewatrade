import { TableHead, TableHeader, TableRow } from "@ewatrade/ui"

export function StaffDirectoryReadTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead scope="col">Name</TableHead>
        <TableHead scope="col" className="w-[110px]">
          Role and status
        </TableHead>
        <TableHead scope="col" className="w-[90px]">
          <span className="sr-only">Open</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}
