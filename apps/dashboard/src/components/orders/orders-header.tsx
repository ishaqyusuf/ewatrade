"use client"

import { PageFab } from "@/components/page-fab/page-fab"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { TableToolbarSlot } from "@/components/tables/core"
import { ViewDropdown, type ViewOption } from "@/components/view-switcher"
import { useOrderParams } from "@/hooks/use-order-params"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { Button } from "@ewatrade/ui"
import {
  Add01Icon,
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { OrdersSearchFilter } from "./orders-search-filter"

// The saved value stays "cards" so existing view cookies keep working.
const orderViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Grid", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

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
  const createOrder = () => void setParams({ orderSheet: "create" })
  return (
    <PageHeader
      eyebrow={storeName}
      title={salesRep ? "Your sales" : "Orders"}
      description="Products and Services share one immutable order record."
    >
      <PageToolbar
        actions={
          <>
            <TableToolbarSlot />
            <ViewDropdown
              label="Order view"
              value={view}
              options={orderViewOptions}
              onValueChange={onViewChange}
            />
            <Button
              aria-label="New order"
              variant="outline"
              onClick={createOrder}
              className="size-9 rounded-none max-sm:hidden"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
            <PageFab label="New order" onClick={createOrder} />
          </>
        }
      >
        <OrdersSearchFilter />
      </PageToolbar>
    </PageHeader>
  )
}
