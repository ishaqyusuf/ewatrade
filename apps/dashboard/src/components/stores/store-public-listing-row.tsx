"use client"

import { SettingsRow } from "@/components/settings/settings-page"
import { useTRPC } from "@/trpc/client"
import { Button, Skeleton, Switch } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useId } from "react"

const marketingOrigin = new URL(
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://ewatrade.com",
).origin

/**
 * Owner opt-in to the ẸwáTrade business page. Listing shows only products the
 * owner switched on in each product's storefront settings; it publishes nothing.
 */
export function StorePublicListingRow({
  storeId,
  storeName,
}: { storeId: string; storeName: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const id = useId()
  const listing = useQuery(
    trpc.stores.publicListing.queryOptions({ storeId }, { retry: false }),
  )
  const update = useMutation(
    trpc.stores.updatePublicListing.mutationOptions({
      onSuccess: (data) =>
        queryClient.setQueryData(
          trpc.stores.publicListing.queryKey({ storeId }),
          data,
        ),
    }),
  )
  const url = listing.data ? `${marketingOrigin}${listing.data.path}` : null
  return (
    <SettingsRow
      label={storeName}
      htmlFor={id}
      description={
        update.isError ? (
          <span role="alert" className="text-destructive">
            {update.error.message}
          </span>
        ) : listing.isError ? (
          <span role="alert">Couldn't load this setting.</span>
        ) : listing.isPending ? (
          <Skeleton className="h-4 w-40" />
        ) : listing.data.listed && url ? (
          <a
            className="underline underline-offset-4"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {url.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          "Not listed"
        )
      }
    >
      {listing.isError ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void listing.refetch()}
        >
          Try again
        </Button>
      ) : (
        <Switch
          id={id}
          aria-label={`List ${storeName} on ẸwáTrade`}
          checked={listing.data?.listed ?? false}
          disabled={!listing.isSuccess || update.isPending}
          onCheckedChange={(checked) =>
            update.mutate({ storeId, listed: checked === true })
          }
        />
      )}
    </SettingsRow>
  )
}
