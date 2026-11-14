"use client"

import { PageFab } from "@/components/page-fab/page-fab"
import { TableToolbarSlot } from "@/components/tables/core"
import { ViewDropdown, directoryViewOptions } from "@/components/view-switcher"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import {
  Add01Icon,
  Link01Icon,
  MoreVerticalIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ServiceRequestSearchFilter } from "./service-request-search-filter"
import { ServiceTabs } from "./service-tabs"
import { ServiceWorkSearchFilter } from "./service-work-search-filter"

/**
 * Service jobs header: Jobs / Customer requests tabs (managers), then search
 * and the page's actions. The top bar names the page.
 */
export function ServiceWorkHeader({
  canManage,
  view,
  onViewChange,
}: {
  canManage: boolean
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  const { tab, setParams } = useServiceWorkParams()
  const requests = canManage && tab === "requests"
  const startIntake = () => setParams({ serviceSheet: "intake" })
  return (
    <header className="grid min-w-0 gap-4">
      {canManage ? <ServiceTabs /> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:basis-72">
          {requests ? (
            <ServiceRequestSearchFilter />
          ) : (
            <ServiceWorkSearchFilter canManage={canManage} />
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2 max-sm:hidden sm:ml-auto">
          {!requests ? (
            <div className="flex items-center gap-2 max-md:hidden">
              <TableToolbarSlot />
              <ViewDropdown
                label="Jobs view"
                value={view}
                options={directoryViewOptions}
                onValueChange={onViewChange}
              />
            </div>
          ) : null}
          {canManage ? <MoreMenu onPick={setParams} /> : null}
          <Button onClick={startIntake}>
            <HugeiconsIcon
              icon={Add01Icon}
              data-icon="inline-start"
              aria-hidden="true"
            />
            New job
          </Button>
        </div>
        {canManage ? (
          <div className="sm:hidden">
            <MoreMenu onPick={setParams} />
          </div>
        ) : null}
        <PageFab label="New job" onClick={startIntake} />
      </div>
    </header>
  )
}

function MoreMenu({
  onPick,
}: {
  onPick: (values: { serviceSheet: "request" | "settings" }) => unknown
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label="More options" />
        }
      >
        <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent appearance="dashboard" align="end">
        <DropdownMenuItem
          onClick={() => void onPick({ serviceSheet: "request" })}
        >
          <HugeiconsIcon icon={Link01Icon} aria-hidden="true" />
          Request links
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => void onPick({ serviceSheet: "settings" })}
        >
          <HugeiconsIcon icon={Settings01Icon} aria-hidden="true" />
          Service settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
