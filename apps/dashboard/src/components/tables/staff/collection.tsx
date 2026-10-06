"use client"

import {
  type StaffMemberRow,
  getStaffDisplayName,
  getStaffRoleLabel,
  getStaffStatusLabel,
} from "@/lib/staff-management"
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@ewatrade/ui"
import type { Row } from "@tanstack/react-table"
import { StaffActions, type StaffActionsProps } from "./actions"
import { formatStaffDate } from "./format"

function StaffBadges({ member }: { member: StaffMemberRow }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">{getStaffRoleLabel(member.role)}</Badge>
      <Badge
        variant={member.status === "SUSPENDED" ? "destructive" : "outline"}
      >
        {getStaffStatusLabel(member.status)}
      </Badge>
    </div>
  )
}

function StaffDates({ member }: { member: StaffMemberRow }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <div>
        <dt className="text-muted-foreground">Invited</dt>
        <dd>{formatStaffDate(member.invitedAt)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Accepted</dt>
        <dd>{formatStaffDate(member.acceptedAt)}</dd>
      </div>
    </dl>
  )
}

export function StaffCollection({
  rows,
  view,
  ...actions
}: Omit<StaffActionsProps, "member"> & {
  rows: Row<StaffMemberRow>[]
  view: "list" | "cards"
}) {
  const items = rows.map((row) => {
    const member = row.original
    const name = getStaffDisplayName(member)
    const checkbox = (
      <Checkbox
        aria-label={`Select ${name}`}
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(checked) => row.toggleSelected(checked)}
      />
    )
    if (view === "cards")
      return (
        <li key={row.id} className="min-w-0">
          <Card
            data-state={row.getIsSelected() ? "selected" : undefined}
            size="sm"
            className="h-full min-w-0"
          >
            <CardHeader>
              <CardTitle className="min-w-0 break-words">{name}</CardTitle>
              <CardDescription className="min-w-0 break-all">
                {member.user.email}
              </CardDescription>
              <CardAction>{checkbox}</CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StaffBadges member={member} />
              <StaffDates member={member} />
            </CardContent>
            <CardFooter className="mt-auto flex-wrap">
              <StaffActions member={member} {...actions} />
            </CardFooter>
          </Card>
        </li>
      )
    return (
      <Item
        key={row.id}
        render={<li />}
        variant="outline"
        data-state={row.getIsSelected() ? "selected" : undefined}
      >
        <ItemMedia>{checkbox}</ItemMedia>
        <ItemContent className="min-w-0 basis-48">
          <ItemTitle className="max-w-full break-words">{name}</ItemTitle>
          <ItemDescription className="break-all">
            {member.user.email}
          </ItemDescription>
          <StaffBadges member={member} />
        </ItemContent>
        <StaffDates member={member} />
        <ItemActions className="flex-wrap">
          <StaffActions member={member} {...actions} />
        </ItemActions>
      </Item>
    )
  })
  return view === "cards" ? (
    <ul
      aria-label="Staff cards"
      className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {items}
    </ul>
  ) : (
    <ItemGroup aria-label="Staff list">{items}</ItemGroup>
  )
}
