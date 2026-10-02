"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { useOrderParams } from "@/hooks/use-order-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { OrdersSearchFilter } from "./orders-search-filter"

export function OrdersHeader({ storeName }: { storeName: string }) {
  const { setParams } = useOrderParams()
  return (
    <PageHeader
      eyebrow={storeName}
      title="Orders"
      description="Products and Services share one immutable order record."
    >
      <PageToolbar
        actions={
          <Button
            aria-label="New order"
            variant="outline"
            onClick={() => void setParams({ orderSheet: "create" })}
            className="size-9 rounded-none"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
          </Button>
        }
      >
        <OrdersSearchFilter />
      </PageToolbar>
    </PageHeader>
  )
}
