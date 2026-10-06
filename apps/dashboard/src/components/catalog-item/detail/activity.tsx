"use client"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useTRPC } from "@/trpc/client"
import { Badge, Button, ToggleGroup, ToggleGroupItem } from "@ewatrade/ui"
import {
  Add01Icon,
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  Money03Icon,
  Package01Icon,
  PackageDeliveredIcon,
  Settings02Icon,
  ShoppingCart01Icon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useInfiniteQuery } from "@tanstack/react-query"
import Link from "next/link"
import { dateTime, money, orderHref } from "./display"
import { DetailEmpty, DetailError, DetailLoading } from "./states"
export function CatalogDetailActivity({
  itemId,
  storeId,
  inventoryAllowed,
  preview = false,
}: {
  itemId: string
  storeId: string
  inventoryAllowed: boolean
  preview?: boolean
}) {
  const trpc = useTRPC()
  const { catalogActivity, setParams } = useCatalogDetailParams()
  const category = preview ? "all" : catalogActivity
  const query = useInfiniteQuery(
    trpc.catalog.detail.activity.infiniteQueryOptions(
      { itemId, storeId, category, limit: preview ? 2 : 30 },
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
  const events = query.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <div className="grid gap-4">
      {!preview ? (
        <>
          <ToggleGroup
            value={[category]}
            onValueChange={(values) => {
              const value = values[0]
              if (
                value === "all" ||
                value === "catalog" ||
                value === "orders" ||
                value === "stock"
              )
                void setParams({ catalogActivity: value })
            }}
            variant="outline"
            className="w-fit flex-wrap"
          >
            {[
              "all",
              "catalog",
              "orders",
              ...(inventoryAllowed ? ["stock"] : []),
            ].map((value) => (
              <ToggleGroupItem key={value} value={value} className="capitalize">
                {value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            Retained creation, price, recorded order and stock events. This is
            not a complete edit or fulfillment log. Catalog prices apply across
            stores.
          </p>
        </>
      ) : null}
      {events.length ? (
        <ul className="divide-y">
          {events.map((event) => (
            <li key={event.key} className="flex items-start gap-3 py-3">
              <ActivityIcon
                eventKey={event.key}
                category={event.category}
                direction={event.changeDirection}
              />
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium capitalize">{event.title}</p>
                    <Badge variant="outline" className="capitalize">
                      {event.category}
                    </Badge>
                  </div>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={event.at}
                  >
                    {dateTime(event.at)}
                  </time>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  {event.description}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </p>
                {event.categories?.length ? (
                  <div
                    className="flex flex-wrap items-center gap-1"
                    aria-label="Saved operation categories"
                  >
                    {event.categories.map((category) => (
                      <Badge variant="secondary" key={category}>
                        {category}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {event.amountMinor !== null && event.currencyCode ? (
                  <p className="text-sm">
                    {event.previousAmountMinor !== null
                      ? `${money(event.previousAmountMinor, event.currencyCode)} → `
                      : ""}
                    {money(event.amountMinor, event.currencyCode)}
                  </p>
                ) : null}
                {event.orderNumber ? (
                  <Link
                    href={orderHref(event.orderNumber)}
                    className="text-sm underline underline-offset-4"
                  >
                    {event.orderNumber}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <DetailEmpty
          title="No activity recorded"
          description="Retained events for this category will appear here."
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
      {!preview && query.hasNextPage ? (
        <Button
          variant="outline"
          className="w-fit"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more activity"}
        </Button>
      ) : null}
    </div>
  )
}

function ActivityIcon({
  eventKey,
  category,
  direction,
}: {
  eventKey: string
  category: string
  direction: "increase" | "decrease" | "mixed" | null
}) {
  if (direction)
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 pt-0.5"
        role="img"
        aria-label={
          direction === "mixed"
            ? "Displayed changes include increases and decreases"
            : `${category === "stock" ? "Stock" : "Price"} ${direction === "increase" ? "increased" : "decreased"}`
        }
      >
        {direction !== "decrease" ? (
          <HugeiconsIcon
            icon={ArrowUpRight01Icon}
            className="size-5"
            aria-hidden="true"
          />
        ) : null}
        {direction !== "increase" ? (
          <HugeiconsIcon
            icon={ArrowDownRight01Icon}
            className="size-5"
            aria-hidden="true"
          />
        ) : null}
      </span>
    )
  const source = eventKey.split(":")[0]
  const icon =
    source === "created"
      ? Add01Icon
      : source === "price"
        ? Money03Icon
        : source === "orders"
          ? ShoppingCart01Icon
          : source === "product_fulfilled"
            ? PackageDeliveredIcon
            : source === "service_performed"
              ? TaskDone01Icon
              : source === "stock"
                ? Settings02Icon
                : Package01Icon
  return (
    <HugeiconsIcon
      icon={icon}
      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
      aria-hidden="true"
    />
  )
}
