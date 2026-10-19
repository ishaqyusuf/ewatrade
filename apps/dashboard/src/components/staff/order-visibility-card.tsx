"use client"

import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button, Select, Skeleton } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useId } from "react"

type Visibility = "OWN_SALES" | "ALL_STORE_ORDERS"

const OPTIONS: Array<{ value: Visibility; label: string }> = [
  { value: "OWN_SALES", label: "Only orders they made" },
  { value: "ALL_STORE_ORDERS", label: "All orders in this store" },
]

export function useOrderVisibility(storeId: string, review = false) {
  const trpc = useTRPC()
  return useQuery(
    trpc.stores.orderVisibility.queryOptions(
      { storeId },
      {
        refetchOnWindowFocus: "always",
        refetchInterval: review ? 30_000 : false,
      },
    ),
  )
}

/** Saving without a visibility only marks the setting as reviewed. */
function useUpdateOrderVisibility(storeId: string) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const router = useRouter()
  return useMutation(
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
}

/** Overview: the one-time question inside the Needs you card. */
export function OrderVisibilityQuestion({
  storeId,
  storeName,
  data,
}: {
  storeId: string
  storeName: string
  data: RouterOutputs["stores"]["orderVisibility"]
}) {
  const id = useId()
  const update = useUpdateOrderVisibility(storeId)
  return (
    <div className="grid gap-x-5 gap-y-2.5 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start">
      <div className="min-w-0">
        <p className="font-semibold">Which orders can cashiers see?</p>
        <p className="text-muted-foreground">
          {storeName} · Applies to cashiers and operators.
        </p>
      </div>
      <div className="grid gap-2">
        <div className="flex gap-2">
          <label htmlFor={id} className="sr-only">
            Cashiers and operators see
          </label>
          <Select
            id={id}
            className="min-w-0 flex-1 rounded-none"
            value={data.salesRepOrderVisibility}
            disabled={update.isPending}
            onChange={(event) =>
              update.mutate({
                storeId,
                visibility: event.target.value as Visibility,
              })
            }
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            disabled={update.isPending}
            onClick={() => update.mutate({ storeId })}
          >
            Keep this
          </Button>
        </div>
        {update.isPending ? (
          <output className="text-muted-foreground">Saving…</output>
        ) : null}
        {update.isError ? (
          <p role="alert" className="text-destructive">
            {update.error.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function OrderVisibilityCard({
  storeId,
  storeName,
}: {
  storeId: string
  storeName?: string
}) {
  const id = useId()
  const query = useOrderVisibility(storeId)
  const update = useUpdateOrderVisibility(storeId)
  if (query.isPending) return <Skeleton className="h-32 w-full" />
  return (
    <section
      className="grid gap-4 border border-border bg-card p-5"
      aria-label="Staff rules"
    >
      <div>
        <h2 className="font-semibold">Staff rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {storeName ?? query.data?.name} · Choose which orders cashiers and
          operators see in this store.
        </p>
      </div>
      {query.isError ? (
        <div role="alert" className="text-sm">
          Couldn’t load this setting.{" "}
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
            Cashiers and operators see
          </label>
          <Select
            id={id}
            className="rounded-none"
            value={query.data.salesRepOrderVisibility}
            disabled={update.isPending}
            onChange={(event) =>
              update.mutate({
                storeId,
                visibility: event.target.value as Visibility,
              })
            }
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      {update.isPending ? (
        <output className="text-sm text-muted-foreground">Saving…</output>
      ) : null}
      {update.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {update.error.message}
        </p>
      ) : null}
    </section>
  )
}
