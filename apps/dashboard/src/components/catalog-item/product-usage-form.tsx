"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  type ProductUsage,
  productUsageLabels,
} from "@ewatrade/utils/product-usage"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { ProductUsageField } from "./product-usage-field"

export function ProductUsageForm({
  itemId,
  usage,
  updatedAt,
  canManage,
}: {
  itemId: string
  usage: ProductUsage
  updatedAt: string
  canManage: boolean
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(usage)
  const mutation = useMutation(
    trpc.catalog.setProductUsage.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
          queryClient.invalidateQueries(
            trpc.catalog.listItemsPage.infiniteQueryFilter(),
          ),
          queryClient.invalidateQueries(trpc.catalog.getItem.queryFilter()),
          queryClient.invalidateQueries(
            trpc.catalog.detail.overview.queryFilter(),
          ),
        ])
      },
    }),
  )
  if (!canManage)
    return <p className="text-sm">Product usage: {productUsageLabels[usage]}</p>
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!mutation.isPending && draft !== usage)
          mutation.mutate({
            itemId,
            usage: draft,
            expectedUpdatedAt: new Date(updatedAt),
          })
      }}
    >
      <ProductUsageField
        value={draft}
        onChange={setDraft}
        disabled={mutation.isPending}
      />
      {mutation.error ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
      {draft !== usage ? (
        <Button className="w-fit" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save usage"}
        </Button>
      ) : null}
    </form>
  )
}
