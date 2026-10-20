"use client"
import {
  type StaffAction,
  type StaffMemberRow,
  getStaffActions,
  getStaffDisplayName,
} from "@/lib/staff-management"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import {
  Cancel01Icon,
  Clock01Icon,
  Key01Icon,
  Mail01Icon,
  MoreVerticalIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export type StaffRowActions = {
  /** Person whose action is saving, so their menu is disabled. */
  busyId: string | null
  canSeeHistory: boolean
  onOpen?: (member: StaffMemberRow) => void
  onHistory: (member: StaffMemberRow) => void
  onAction: (action: StaffAction, member: StaffMemberRow) => void
}

const ACTION_LABEL: Record<StaffAction, string> = {
  access: "Change access",
  cancel: "Cancel invite",
  reactivate: "Reactivate",
  resend: "Resend invite",
  suspend: "Suspend",
}

const ACTION_ICON = {
  access: Key01Icon,
  cancel: Cancel01Icon,
  reactivate: PlayCircleIcon,
  resend: Mail01Icon,
  suspend: PauseCircleIcon,
} as const

const DESTRUCTIVE: StaffAction[] = ["suspend", "cancel"]

export function StaffActionsMenu({
  member,
  actions,
}: {
  member: StaffMemberRow
  actions: StaffRowActions
}) {
  const available = getStaffActions(member)
  const safe = available.filter((action) => !DESTRUCTIVE.includes(action))
  const destructive = available.filter((action) => DESTRUCTIVE.includes(action))
  if (!actions.onOpen && !actions.canSeeHistory && !available.length)
    return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${getStaffDisplayName(member)}`}
            disabled={actions.busyId === member.id}
          >
            <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent
        appearance="dashboard"
        align="end"
        className="min-w-44"
      >
        <DropdownMenuGroup>
          {actions.onOpen ? (
            <DropdownMenuItem onClick={() => actions.onOpen?.(member)}>
              <HugeiconsIcon icon={UserIcon} aria-hidden="true" />
              Open
            </DropdownMenuItem>
          ) : null}
          {safe.map((action) => (
            <DropdownMenuItem
              key={action}
              onClick={() => actions.onAction(action, member)}
            >
              <HugeiconsIcon icon={ACTION_ICON[action]} aria-hidden="true" />
              {ACTION_LABEL[action]}
            </DropdownMenuItem>
          ))}
          {actions.canSeeHistory ? (
            <DropdownMenuItem onClick={() => actions.onHistory(member)}>
              <HugeiconsIcon icon={Clock01Icon} aria-hidden="true" />
              See history
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        {destructive.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {destructive.map((action) => (
                <DropdownMenuItem
                  key={action}
                  variant="destructive"
                  onClick={() => actions.onAction(action, member)}
                >
                  <HugeiconsIcon
                    icon={ACTION_ICON[action]}
                    aria-hidden="true"
                  />
                  {ACTION_LABEL[action]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
