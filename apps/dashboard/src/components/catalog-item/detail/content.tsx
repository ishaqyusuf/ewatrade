"use client"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ewatrade/ui"
import { CatalogDetailActivity } from "./activity"
import type { CatalogDetail } from "./display"
import { CatalogDetailOrders } from "./orders"
import { CatalogDetailOverview } from "./overview"
import { DetailError } from "./states"
export function CatalogDetailContent({
  detail,
  storeId,
  error,
}: {
  detail: CatalogDetail
  storeId: string
  error?: { message: string; retry: () => void }
}) {
  const { catalogDetailTab, setParams } = useCatalogDetailParams()
  return (
    <Tabs
      value={catalogDetailTab}
      onValueChange={(value) => {
        if (value === "overview" || value === "orders" || value === "activity")
          void setParams({ catalogDetailTab: value })
      }}
      className="min-h-0 flex-1 gap-0 overflow-hidden"
    >
      <TabsList
        variant="line"
        className="mx-6 mb-5 shrink-0"
        aria-label="Item details"
      >
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <section
        aria-label="Catalog item content"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6"
      >
        {error ? (
          <div className="mb-4">
            <DetailError message={error.message} retry={error.retry} />
          </div>
        ) : null}
        <TabsContent value="overview">
          <CatalogDetailOverview detail={detail} storeId={storeId} />
        </TabsContent>
        <TabsContent value="orders">
          <CatalogDetailOrders itemId={detail.item.id} storeId={storeId} />
        </TabsContent>
        <TabsContent value="activity">
          <CatalogDetailActivity
            itemId={detail.item.id}
            storeId={storeId}
            inventoryAllowed={
              detail.inventoryAllowed && Boolean(detail.item.product)
            }
          />
        </TabsContent>
      </section>
    </Tabs>
  )
}
