"use client"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogDetailContent } from "./detail/content"
import { dateTime } from "./detail/display"
import { CatalogDetailHeader } from "./detail/header"
import { DetailError, DetailLoading } from "./detail/states"
export function CatalogItemDetailModal({
  store,
}: { store: { id: string; name: string } }) {
  const { catalogDetail, close } = useCatalogDetailParams()
  const lastItemId = useRef(catalogDetail)
  useEffect(() => {
    if (catalogDetail) lastItemId.current = catalogDetail
  }, [catalogDetail])
  const trpc = useTRPC()
  const theme = useCatalogThemeClass()
  const query = useQuery({
    ...trpc.catalog.detail.overview.queryOptions({
      itemId: catalogDetail ?? "",
      storeId: store.id,
    }),
    enabled: Boolean(catalogDetail),
    staleTime: 0,
    retry: false,
  })
  return (
    <Dialog
      open={Boolean(catalogDetail)}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      <DialogContent
        className={cn(
          theme,
          "flex max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-[860px] flex-col overflow-hidden",
        )}
        finalFocus={() =>
          document.querySelector<HTMLButtonElement>(
            `[data-catalog-open="${CSS.escape(lastItemId.current ?? "")}"]`,
          )
        }
      >
        {query.data ? (
          <>
            <CatalogDetailHeader detail={query.data} store={store} />
            <CatalogDetailContent
              key={`${catalogDetail}:${store.id}`}
              detail={query.data}
              storeId={store.id}
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
            <DialogFooter className="shrink-0 justify-between p-4 text-xs text-muted-foreground sm:justify-between">
              <span>Created {dateTime(query.data.item.createdAt)}</span>
              <span>Item updated {dateTime(query.data.item.updatedAt)}</span>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="shrink-0 p-6 pr-12">
              <DialogTitle>Catalog item</DialogTitle>
              <DialogDescription>
                Overview, orders and retained activity.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-6 pt-0">
              {query.isError ? (
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
      </DialogContent>
    </Dialog>
  )
}
