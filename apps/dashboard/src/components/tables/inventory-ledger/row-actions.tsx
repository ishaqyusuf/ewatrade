"use client"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { MoreVerticalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
export function LedgerRowActions({
  label,
  onOpen,
}: { label: string; onOpen: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${label}`}
            data-row-interactive="true"
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent appearance="dashboard" align="end">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          View details
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
