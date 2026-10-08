"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { ViewSwitcher, directoryViewOptions } from "@/components/view-switcher"
import { useOrderParams } from "@/hooks/use-order-params"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { Button } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { OrdersSearchFilter } from "./orders-search-filter"

export function OrdersHeader({
  storeName,
  salesRep = false,
  view,
  onViewChange,
}: {
  storeName: string
  salesRep?: boolean
  view: DirectoryView
  onViewChange: (view: DirectoryView) => void
}) {
  const { setParams } = useOrderParams()
  return (
    <PageHeader
      eyebrow={storeName}
      title={salesRep ? "Your sales" : "Orders"}
      description="Products and Services share one immutable order record."
    >
      <PageToolbar
        actions={
          <>
            <ViewSwitcher
              label="Order view"
              value={view}
              options={directoryViewOptions}
              onValueChange={onViewChange}
            />
            <Button
              aria-label="New order"
              variant="outline"
              onClick={() => void setParams({ orderSheet: "create" })}
              className="size-9 rounded-none"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
          </>
        }
      >
        <OrdersSearchFilter />
      </PageToolbar>
    </PageHeader>
  )
}
