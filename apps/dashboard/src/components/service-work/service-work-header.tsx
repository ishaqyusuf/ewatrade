"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ServiceWorkSearchFilter } from "./service-work-search-filter"

export function ServiceWorkHeader({
  canManage,
  storeName,
}: {
  canManage: boolean
  storeName: string
}) {
  const { setParams } = useServiceWorkParams()
  return (
    <PageHeader
      eyebrow={storeName}
      title="Service work"
      description="Create an order, then track only the work that needs tracking."
    >
      <PageToolbar
        actions={
          <>
            {canManage ? (
              <>
                <Button
                  className="h-9 rounded-none"
                  variant="outline"
                  onClick={() => setParams({ serviceSheet: "settings" })}
                >
                  Settings
                </Button>
                <Button
                  className="h-9 rounded-none"
                  variant="outline"
                  onClick={() => setParams({ serviceSheet: "request" })}
                >
                  Request link
                </Button>
              </>
            ) : null}
            <Button
              aria-label="New service"
              variant="outline"
              className="size-9 rounded-none"
              onClick={() => setParams({ serviceSheet: "intake" })}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
          </>
        }
      >
        <ServiceWorkSearchFilter canManage={canManage} />
      </PageToolbar>
    </PageHeader>
  )
}
