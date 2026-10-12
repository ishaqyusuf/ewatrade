import { TableHead, TableHeader, TableRow } from "@ewatrade/ui"

export function StaffDirectoryReadTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead scope="col">Membership identity</TableHead>
        <TableHead scope="col" className="w-[110px]">
          Current state
        </TableHead>
        <TableHead scope="col" className="w-[90px]">
          Details
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}
