import { getStaffRoleLabel, getStaffStatusLabel } from "@/lib/staff-management"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button, Table, TableBody, TableCell, TableRow } from "@ewatrade/ui"
import { StaffDirectoryReadTableHeader } from "./table-header"

export function StaffDirectoryReadTable({
  members,
  onOpenMember,
}: {
  members: RouterOutputs["retailOps"]["staffDirectoryPage"]["data"]
  onOpenMember: (membershipId: string) => void
}) {
  return (
    <Table className="table-fixed">
      <StaffDirectoryReadTableHeader />
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.membershipId}>
            <TableCell>
              <div className="grid gap-1 break-all">
                <p className="font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </div>
            </TableCell>
            <TableCell>
              <p className="break-all">{getStaffRoleLabel(member.role)}</p>
              <p className="break-all text-xs text-muted-foreground">
                {getStaffStatusLabel(member.status)}
              </p>
            </TableCell>
            <TableCell>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Open ${member.name || member.email}`}
                onClick={() => onOpenMember(member.membershipId)}
              >
                Open
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
