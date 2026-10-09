"use client"

import { useTRPC } from "@/trpc/client"
import { Button, Select, Skeleton } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useId } from "react"

export function OrderVisibilityCard({
  storeId,
  storeName,
  review = false,
}: {
  storeId: string
  storeName?: string
  review?: boolean
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const router = useRouter()
  const id = useId()
  const query = useQuery(
    trpc.stores.orderVisibility.queryOptions(
      { storeId },
      {
        refetchOnWindowFocus: "always",
        refetchInterval: review ? 30_000 : false,
      },
    ),
  )
  const update = useMutation(
    trpc.stores.updateOrderVisibility.mutationOptions({
      onSuccess: async (data) => {
        client.setQueryData(
          trpc.stores.orderVisibility.queryKey({ storeId }),
          data,
        )
        await Promise.all(
          ["orders", "search", "customers", "catalog"].map((domain) =>
            client.cancelQueries({
              predicate: (query) =>
                Array.isArray(query.queryKey[0]) &&
                query.queryKey[0][0] === domain,
            }),
          ),
        )
        await Promise.all(
          ["orders", "search", "customers", "catalog"].map((domain) =>
            client.resetQueries({
              predicate: (query) =>
                Array.isArray(query.queryKey[0]) &&
                query.queryKey[0][0] === domain,
            }),
          ),
        )
        router.refresh()
      },
    }),
  )
  if (query.isPending)
    return review ? null : <Skeleton className="h-32 w-full" />
  if (review && query.data?.salesRepOrderVisibilityReviewedAt) return null
  return (
    <section
      className="grid gap-4 border border-border bg-card p-5"
      aria-label={review ? "Review sales rep visibility" : "Staff rules"}
    >
      <div>
        <h2 className="font-semibold">
          {review ? "Choose what your sales reps can see" : "Staff rules"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {storeName ?? query.data?.name} · Choose whether reps see their own
          sales or all orders in this store.
        </p>
      </div>
      {query.isError ? (
        <div role="alert" className="text-sm">
          Could not load Staff rules.{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 sm:max-w-sm">
          <label htmlFor={id} className="text-sm font-medium">
            What sales reps can see
          </label>
          <Select
            id={id}
            className="rounded-none"
            value={query.data.salesRepOrderVisibility}
            disabled={update.isPending}
            onChange={(event) =>
              update.mutate({
                storeId,
                visibility: event.target.value as
                  | "OWN_SALES"
                  | "ALL_STORE_ORDERS",
              })
            }
          >
            <option value="OWN_SALES">Only their own sales</option>
            <option value="ALL_STORE_ORDERS">All orders in this store</option>
          </Select>
          {review ? (
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ storeId })}
            >
              Keep as it is
            </Button>
          ) : null}
        </div>
      )}
      {update.isPending ? (
        <output className="text-sm text-muted-foreground">
          Saving Staff rules…
        </output>
      ) : null}
      {update.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {update.error.message}
        </p>
      ) : null}
    </section>
  )
}
