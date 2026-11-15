"use client"
import {
  SettingsHeader,
  SettingsNotice,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { SettingsStatusPill } from "@/components/settings/settings-status-pill"
import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import {
  ChatHoursRow,
  ConversationModeSection,
  QuoteReleasePolicyRow,
} from "./channel-management-settings"
import { peopleCount } from "./channel-settings-labels"
import { ChannelsHeader } from "./channels-header"
import { ConnectionsList } from "./connections-list"
import { PendingQuoteApprovals } from "./pending-quote-approvals"
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
  const storeName =
    stores.find((store) => store.id === selectedStoreId)?.name ?? "your store"
  const workspace = useQuery(
    trpc.serviceCommerce.channelWorkspace.queryOptions(
      { storeId: selectedStoreId },
      { retry: false },
    ),
  )
  const canManage = Boolean(workspace.data?.access.canManage)
  const approvals = useQuery(
    trpc.serviceCommerce.pendingQuoteApprovals.queryOptions(
      { storeId: selectedStoreId },
      { retry: false },
    ),
  )

  if (workspace.isLoading) return <CustomerChannelsSkeleton />
  if (workspace.isError || !workspace.data) {
    return (
      <SettingsPage>
        <SettingsHeader title="Customer channels" />
        <SettingsNotice
          tone="warning"
          action={
            <Button
              className="bg-background"
              onClick={() => void workspace.refetch()}
              variant="outline"
            >
              Try again
            </Button>
          }
        >
          Couldn't load customer channels.
        </SettingsNotice>
      </SettingsPage>
    )
  }

  const data = workspace.data
  const openSheet = (
    serviceCommerceSheet:
      | "availability"
      | "conversation_mode"
      | "quote_policy"
      | "team",
  ) => void params.setParams({ serviceCommerceSheet, storeId: selectedStoreId })
  const activeTeam = data.team.filter((member) => member.status === "active")
  const linkLive = data.entryPoint?.status === "published"

  return (
    <SettingsPage>
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

      {canManage ? (
        <ConversationModeSection
          onShowDetails={() => openSheet("conversation_mode")}
          storeId={selectedStoreId}
          storeName={storeName}
        />
      ) : null}

      <SettingsSection title="Chats">
        {canManage ? (
          <ChatHoursRow
            onChange={() => openSheet("availability")}
            storeId={selectedStoreId}
          />
        ) : null}
        <SettingsRow label="Who replies">
          <span className="text-sm font-medium">
            {peopleCount(activeTeam.length)}
          </span>
          <Button onClick={() => openSheet("team")} variant="outline">
            Choose
          </Button>
        </SettingsRow>
        {canManage ? (
          <QuoteReleasePolicyRow
            onChange={() => openSheet("quote_policy")}
            storeId={selectedStoreId}
          />
        ) : null}
        <SettingsRow label="Customer link and QR code">
          <SettingsStatusPill tone={linkLive ? "ok" : "muted"}>
            {linkLive
              ? "Live"
              : data.entryPoint?.status === "revoked"
                ? "Turned off"
                : "Not created"}
          </SettingsStatusPill>
          <Button
            onClick={() =>
              void params.setParams({
                entryPointId: data.entryPoint?.id ?? null,
                serviceCommerceSheet: "entry_point",
                storeId: selectedStoreId,
              })
            }
            variant="outline"
          >
            {linkLive ? "View" : "Create"}
          </Button>
        </SettingsRow>
      </SettingsSection>

      <PendingQuoteApprovals
        query={approvals}
        onReview={(approval) =>
          void params.setParams({
            quoteApprovalId: approval.id,
            quoteId: approval.quoteId,
            serviceCommerceSheet: "quote_approval",
            storeId: selectedStoreId,
          })
        }
      />
    </SettingsPage>
  )
}

export function CustomerChannelsSkeleton() {
  return (
    <SettingsPage>
      <div className="grid gap-2">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-24 animate-pulse rounded-[10px] bg-muted" />
      <div className="h-40 animate-pulse rounded-[10px] bg-muted" />
      <div className="h-56 animate-pulse rounded-[10px] bg-muted" />
    </SettingsPage>
  )
}
