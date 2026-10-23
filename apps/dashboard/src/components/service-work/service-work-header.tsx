"use client"

import { PageFab } from "@/components/page-fab/page-fab"
import { PageHeader, PageToolbar } from "@/components/page-header"
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

export function ServiceWorkHeader({
  canManage,
  storeName,
  view,
  onViewChange,
}: {
  canManage: boolean
  storeName: string
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  const { tab, setParams } = useServiceWorkParams()
  const requests = canManage && tab === "requests"
  const startIntake = () => setParams({ serviceSheet: "intake" })
  return (
    <PageHeader
      eyebrow={storeName}
      title="Services"
      description="Orders, work and customer requests."
    >
      <PageToolbar
        actions={
          <>
            {!requests ? (
              <ViewDropdown
                label="Service jobs view"
                value={view}
                options={directoryViewOptions}
                onValueChange={onViewChange}
              />
            ) : null}
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="More service options"
                    />
                  }
                >
                  <HugeiconsIcon icon={MoreVerticalIcon} aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent appearance="dashboard" align="end">
                  <DropdownMenuItem
                    onClick={() => setParams({ serviceSheet: "request" })}
                  >
                    <HugeiconsIcon icon={Link01Icon} aria-hidden="true" />
                    Request links
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setParams({ serviceSheet: "settings" })}
                  >
                    <HugeiconsIcon icon={Settings01Icon} aria-hidden="true" />
                    Service settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button className="max-sm:hidden" onClick={startIntake}>
              <HugeiconsIcon
                icon={Add01Icon}
                data-icon="inline-start"
                aria-hidden="true"
              />
              New job
            </Button>
            <PageFab label="New job" onClick={startIntake} />
          </>
        }
      >
        {requests ? (
          <ServiceRequestSearchFilter />
        ) : (
          <ServiceWorkSearchFilter canManage={canManage} />
        )}
      </PageToolbar>
      {canManage ? <ServiceTabs /> : null}
    </PageHeader>
  )
}
