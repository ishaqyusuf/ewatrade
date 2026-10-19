"use client"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button } from "@ewatrade/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import Link from "next/link"
import { dateTime, money, orderHref } from "./display"
import {
  type CatalogDetailReadScope,
  catalogDetailQueryKey,
  catalogDetailReadIsFresh,
} from "./read-access"
import { DetailEmpty, DetailError, DetailLoading } from "./states"
export function CatalogDetailOrders({
  itemId,
  storeId,
  readScope,
}: { itemId: string; storeId: string; readScope: CatalogDetailReadScope }) {
  const client = useTRPCClient()
  const trpc = useTRPC()
  const query = useInfiniteQuery({
    queryKey: catalogDetailQueryKey(
      trpc.catalog.detail.orders.infiniteQueryKey({
        itemId,
        storeId,
        limit: 30,
      }),
      readScope,
    ),
    queryFn: ({ pageParam, signal }) =>
      client.catalog.detail.orders.query(
        { itemId, storeId, limit: 30, cursor: pageParam },
        { signal },
      ),
    initialPageParam:
      undefined as RouterInputs["catalog"]["detail"]["orders"]["cursor"],
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: readScope.generation === getDataCacheGeneration(),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  })
  if (query.isPending) return <DetailLoading />
  if (query.isError)
    return (
      <DetailError
        message={query.error.message}
        retry={() => void query.refetch()}
      />
    )
  if (!catalogDetailReadIsFresh(query, readScope, getDataCacheGeneration()))
    return <DetailLoading />
  const rows = query.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Recorded order lines for this store. Amounts cover this item only and
        retain their original prices.
      </p>
      {rows.length ? (
        <ul className="divide-y">
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]"
            >
              <div className="grid gap-1">
                <Link
                  className="font-medium underline underline-offset-4"
                  href={orderHref(row.orderNumber)}
                >
                  {row.orderNumber}
                </Link>
                <p className="text-sm">
                  {row.customer} · {row.quantity} × {row.variantName}{" "}
                  {row.unitName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dateTime(row.at)} ·{" "}
                  {row.unitPriceMinor === null
                    ? "Price entered during order"
                    : `${money(row.unitPriceMinor, row.currencyCode)} per unit`}
                </p>
                {row.note ? (
                  <p className="text-sm text-muted-foreground">{row.note}</p>
                ) : null}
              </div>
              <div className="flex items-start gap-3 sm:flex-col sm:items-end">
                <span className="font-medium">
                  {money(row.totalMinor, row.currencyCode)}
                </span>
                <Badge variant="outline" className="capitalize">
                  {row.status.toLowerCase().replaceAll("_", " ")}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <DetailEmpty
          title="No orders yet"
          description="Orders containing this item will appear here."
        />
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          className="w-fit"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more orders"}
        </Button>
      ) : null}
    </div>
  )
}
