"use client"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
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
import { useEffect, useRef, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogDetailContent } from "./detail/content"
import { dateTime } from "./detail/display"
import { CatalogDetailHeader } from "./detail/header"
import {
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
  const { catalogDetail, close } = useCatalogDetailParams()
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
          "flex h-dvh max-h-dvh w-screen max-w-none flex-col overflow-hidden max-md:inset-0 max-md:translate-x-0 max-md:translate-y-0 md:h-auto md:max-h-[calc(100svh-2rem)] md:w-[calc(100vw-2rem)] md:max-w-[860px]",
        )}
        finalFocus={() =>
          document.querySelector<HTMLButtonElement>(
            `[data-catalog-open="${CSS.escape(lastItemId.current ?? "")}"]`,
          )
        }
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
            <DialogFooter className="shrink-0 justify-between p-4 text-xs text-muted-foreground sm:justify-between">
              <span>Created {dateTime(detail.item.createdAt)}</span>
              <span>Item updated {dateTime(detail.item.updatedAt)}</span>
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
      </DialogContent>
    </Dialog>
  )
}
