"use client"
import { useTRPC } from "@/trpc/client"
import { Badge, Button } from "@ewatrade/ui"
import { useInfiniteQuery } from "@tanstack/react-query"
import Link from "next/link"
import { dateTime, money, orderHref } from "./display"
import { DetailEmpty, DetailError, DetailLoading } from "./states"
export function CatalogDetailOrders({
  itemId,
  storeId,
}: { itemId: string; storeId: string }) {
  const trpc = useTRPC()
  const query = useInfiniteQuery(
    trpc.catalog.detail.orders.infiniteQueryOptions(
      { itemId, storeId, limit: 30 },
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
        staleTime: 0,
      },
    ),
  )
  if (query.isPending) return <DetailLoading />
  if (query.isError && !query.data)
    return (
      <DetailError
        message={query.error.message}
        retry={() => void query.refetch()}
      />
    )
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
      {query.isError ? (
        <DetailError
          message={query.error.message}
          retry={() =>
            void (query.isFetchNextPageError
              ? query.fetchNextPage()
              : query.refetch())
          }
        />
      ) : null}
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
