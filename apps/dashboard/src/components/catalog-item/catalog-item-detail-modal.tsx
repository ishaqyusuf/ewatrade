"use client"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import {
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogSavedPhotosView } from "./catalog-saved-photos"
import { CatalogUnitsView } from "./catalog-units-view"
import { CatalogDetailContent } from "./detail/content"
import { dateTime } from "./detail/display"
import { CatalogDetailClose, CatalogDetailHeader } from "./detail/header"
import {
  catalogDetailAffordances,
  catalogDetailQueryKey,
  catalogDetailReadIsFresh,
  catalogDetailReadScope,
} from "./detail/read-access"
import { DetailError, DetailLoading } from "./detail/states"
export function CatalogItemDetailModal({
  actorUserId,
  tenantId,
  store,
  readOnly,
  accessKey,
}: {
  actorUserId: string
  tenantId: string
  store: { id: string; name: string }
  readOnly: boolean
  accessKey: string
}) {
  const { catalogDetail, catalogDetailView, close, setView } =
    useCatalogDetailParams()
  // Closing is blocked while an Images save is in flight.
  const [photosBusy, setPhotosBusy] = useState(false)
  const lastItemId = useRef(catalogDetail)
  useEffect(() => {
    if (catalogDetail) lastItemId.current = catalogDetail
  }, [catalogDetail])
  const client = useTRPCClient()
  const trpc = useTRPC()
  const generation = useRef(getDataCacheGeneration())
  const [visit] = useState(() => crypto.randomUUID())
  const readScope = catalogDetailReadScope({
    actorUserId,
    tenantId,
    storeId: store.id,
    readOnly,
    accessKey,
    generation: generation.current,
    visit,
  })
  const theme = useCatalogThemeClass()
  const query = useQuery({
    queryKey: catalogDetailQueryKey(
      trpc.catalog.detail.overview.queryKey({
        itemId: catalogDetail ?? "",
        storeId: store.id,
      }),
      readScope,
    ),
    queryFn: ({ signal }) =>
      client.catalog.detail.overview.query(
        { itemId: catalogDetail ?? "", storeId: store.id },
        { signal },
      ),
    enabled:
      Boolean(catalogDetail) && generation.current === getDataCacheGeneration(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    retry: false,
  })
  const detail =
    catalogDetailReadIsFresh(query, readScope, getDataCacheGeneration()) &&
    query.data?.item.id === catalogDetail
      ? query.data
      : undefined
  const affordances = detail
    ? catalogDetailAffordances({
        readOnly,
        inventoryAllowed: detail.inventoryAllowed,
        canManageUsage: detail.canManageUsage,
      })
    : null
  const productId = detail?.item.product?.id
  // A view the reader may not use falls back to the details.
  const view =
    catalogDetailView === "images" && affordances?.privatePhotos
      ? "images"
      : catalogDetailView === "units" && affordances?.configureUnits
        ? "units"
        : null
  const finalFocus = () =>
    document.querySelector<HTMLButtonElement>(
      `[data-catalog-open="${CSS.escape(lastItemId.current ?? "")}"]`,
    )
  const back = () => void setView(null)
  return (
    <Sheet
      open={Boolean(catalogDetail)}
      onOpenChange={(open) => {
        if (!open && !photosBusy) void close()
      }}
    >
      {!catalogDetail ? null : detail && view === "images" ? (
        <CatalogSavedPhotosView
          item={detail.item}
          storeId={store.id}
          storeName={store.name}
          back={back}
          onBusy={setPhotosBusy}
          finalFocus={finalFocus}
        />
      ) : detail && view === "units" && productId ? (
        <CatalogUnitsView
          productId={productId}
          itemName={detail.item.name}
          storeName={store.name}
          back={back}
          finalFocus={finalFocus}
        />
      ) : (
        <SheetContent
          className="flex flex-col p-0"
          popupClassName={theme}
          finalFocus={finalFocus}
        >
          {detail ? (
            <>
              <CatalogDetailHeader
                detail={detail}
                store={store}
                readOnly={readOnly}
              />
              <CatalogDetailContent
                key={`${readScope.key}:${catalogDetail}`}
                detail={detail}
                storeId={store.id}
                readOnly={readOnly}
                readScope={readScope}
                error={
                  query.isError
                    ? {
                        message: query.error.message,
                        retry: () => void query.refetch(),
                      }
                    : undefined
                }
              />
              <Separator className="shrink-0" />
              <div className="flex shrink-0 flex-wrap justify-between gap-2 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
                <span>Created {dateTime(detail.item.createdAt)}</span>
                <span>Item updated {dateTime(detail.item.updatedAt)}</span>
              </div>
            </>
          ) : (
            <>
              <SheetHeader className="shrink-0 flex-row items-start justify-between gap-4 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
                <div className="min-w-0 space-y-2">
                  <SheetTitle className="text-xl font-medium">
                    Catalog item
                  </SheetTitle>
                  <SheetDescription>
                    Overview, orders and retained activity.
                  </SheetDescription>
                </div>
                <CatalogDetailClose />
              </SheetHeader>
              <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
                {generation.current !== getDataCacheGeneration() ? (
                  <DetailError
                    message="Your business or access changed. Refresh to read this item under your current access."
                    retry={() => window.location.reload()}
                  />
                ) : query.isError ? (
                  <DetailError
                    message={query.error.message}
                    retry={() => void query.refetch()}
                  />
                ) : (
                  <DetailLoading />
                )}
              </div>
            </>
          )}
        </SheetContent>
      )}
    </Sheet>
  )
}
