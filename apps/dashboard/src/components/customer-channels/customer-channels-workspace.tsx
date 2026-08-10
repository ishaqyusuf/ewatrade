"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { ChannelsHeader } from "./channels-header"
import { ConnectionsList } from "./connections-list"
import type { CustomerChannelStoreOption } from "./types"

export function CustomerChannelsWorkspace({
  initialStoreId,
  stores,
}: {
  initialStoreId: string
  stores: CustomerChannelStoreOption[]
}) {
  const trpc = useTRPC()
  const params = useServiceCommerceParams()
  const selectedStoreId = useMemo(
    () =>
      stores.some((store) => store.id === params.storeId)
        ? (params.storeId ?? initialStoreId)
        : initialStoreId,
    [initialStoreId, params.storeId, stores],
  )
  const workspace = useQuery(
    trpc.serviceCommerce.channelWorkspace.queryOptions(
      { storeId: selectedStoreId },
      { retry: false },
    ),
  )

  if (workspace.isLoading) return <CustomerChannelsSkeleton />
  if (workspace.error || !workspace.data) {
    return (
      <div className="grid gap-3 p-6 lg:p-8">
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {workspace.error?.message ?? "Customer channels are unavailable."}
        </p>
        <Button
          className="w-fit"
          onClick={() => void workspace.refetch()}
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  const data = workspace.data
  return (
    <div className="grid flex-1 gap-6 p-6 lg:p-8">
      <ChannelsHeader
        canManage={data.access.canManage}
        onConnect={() =>
          void params.setParams({
            connectionId: null,
            serviceCommerceSheet: "connection",
            storeId: selectedStoreId,
          })
        }
        onStoreChange={(storeId) =>
          void params.setParams({
            connectionId: null,
            serviceCommerceSheet: null,
            storeId,
          })
        }
        selectedStoreId={selectedStoreId}
        stores={stores}
      />

      <ConnectionsList
        connections={data.connections}
        onManage={(connectionId) =>
          void params.setParams({
            connectionId,
            serviceCommerceSheet: "connection",
            storeId: selectedStoreId,
          })
        }
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <ChannelTaskCard
          action="Assign attendants"
          description={`${data.team.filter((member) => member.status === "active").length} active attendants. Route accepted team memberships without granting professional credentials.`}
          onOpen={() =>
            void params.setParams({
              serviceCommerceSheet: "team",
              storeId: selectedStoreId,
            })
          }
          title="Team & routing"
        />
        <ChannelTaskCard
          action={
            data.entryPoint?.status === "published"
              ? "View link & QR"
              : "Publish link & QR"
          }
          description={
            data.entryPoint?.status === "published"
              ? "The stable Store entry point is published and resolves current allowed channels."
              : "Publish one revocable Store link after an active attendant and an allowed channel are ready."
          }
          onOpen={() =>
            void params.setParams({
              entryPointId: data.entryPoint?.id ?? null,
              serviceCommerceSheet: "entry_point",
              storeId: selectedStoreId,
            })
          }
          title="Customer entry point"
        />
      </section>
    </div>
  )
}

function ChannelTaskCard({
  action,
  description,
  onOpen,
  title,
}: {
  action: string
  description: string
  onOpen: () => void
  title: string
}) {
  return (
    <article className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button className="w-fit" onClick={onOpen} variant="outline">
        {action}
      </Button>
    </article>
  )
}

export function CustomerChannelsSkeleton() {
  return (
    <div className="grid flex-1 gap-6 p-6 lg:p-8">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}
