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
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { ChannelRecommendationNote } from "./channel-recommendation-note"
import {
  chatHoursSummary,
  peopleCount,
  quoteSourceLabel,
} from "./channel-settings-labels"
import { ChannelsHeader } from "./channels-header"
import { ConnectionsList } from "./connections-list"
import { ConversationModeChoice } from "./conversation-mode-choice"
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
  const releaseSettings = useQuery({
    ...trpc.serviceCommerce.quoteReleaseSettings.queryOptions({
      storeId: selectedStoreId,
    }),
    enabled: canManage,
    retry: false,
  })
  const availability = useQuery({
    ...trpc.serviceCommerce.storeConversationAvailabilitySettings.queryOptions({
      storeId: selectedStoreId,
    }),
    enabled: canManage,
    retry: false,
  })
  const modeSettings = useQuery({
    ...trpc.serviceCommerce.storeConversationChannelModeSettings.queryOptions({
      storeId: selectedStoreId,
    }),
    enabled: canManage,
    retry: false,
  })
  const approvals = useQuery(
    trpc.serviceCommerce.pendingQuoteApprovals.queryOptions(
      { storeId: selectedStoreId },
      { retry: false },
    ),
  )

  if (
    workspace.isLoading ||
    (canManage &&
      (availability.isLoading ||
        releaseSettings.isLoading ||
        modeSettings.isLoading)) ||
    approvals.isLoading
  ) {
    return <CustomerChannelsSkeleton />
  }
  const error =
    workspace.error ??
    availability.error ??
    releaseSettings.error ??
    modeSettings.error ??
    approvals.error
  if (
    error ||
    !workspace.data ||
    (canManage &&
      (!availability.data || !releaseSettings.data || !modeSettings.data)) ||
    !approvals.data
  ) {
    return (
      <SettingsPage>
        <SettingsHeader title="Customer channels" />
        <SettingsNotice
          tone="warning"
          action={
            <Button
              className="bg-background"
              onClick={() =>
                void Promise.all([
                  workspace.refetch(),
                  availability.refetch(),
                  releaseSettings.refetch(),
                  modeSettings.refetch(),
                  approvals.refetch(),
                ])
              }
              size="sm"
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
  const approverCount =
    releaseSettings.data?.policy.selectedApproverMembershipIds.length ?? 0

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

      {modeSettings.data ? (
        <SettingsSection title={`How customers reach ${storeName}`}>
          <ConversationModeChoice
            key={selectedStoreId}
            onShowDetails={() => openSheet("conversation_mode")}
            settings={modeSettings.data}
            storeId={selectedStoreId}
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Who replies">
        {availability.data ? (
          <SettingsRow
            label="Chat hours"
            description={
              availability.data.manualPaused
                ? "New chats are paused. Your team can still reply to existing chats."
                : "Chat is open in these hours when someone is free to reply."
            }
          >
            <span className="text-sm font-medium">
              {availability.data.manualPaused
                ? "Paused"
                : chatHoursSummary(availability.data.weeklyHours)}
            </span>
            <Button
              onClick={() => openSheet("availability")}
              size="sm"
              variant="outline"
            >
              Change
            </Button>
          </SettingsRow>
        ) : null}
        <SettingsRow
          label="Team members replying"
          description="They answer customer chats for this store."
        >
          <span className="text-sm font-medium">
            {peopleCount(activeTeam.length)}
          </span>
          <Button onClick={() => openSheet("team")} size="sm" variant="outline">
            Choose
          </Button>
        </SettingsRow>
        {releaseSettings.data ? (
          <SettingsRow
            label="Quotes need approval"
            description="Another person must approve each quote before the customer sees it."
          >
            <span className="text-sm font-medium">
              {releaseSettings.data.policy.mode === "approval_required"
                ? `On · ${approverCount === 1 ? "1 approver" : `${approverCount} approvers`}`
                : "Off"}
            </span>
            <Button
              onClick={() => openSheet("quote_policy")}
              size="sm"
              variant="outline"
            >
              Change
            </Button>
          </SettingsRow>
        ) : null}
        <SettingsRow
          label="Customer link and QR code"
          description={
            linkLive
              ? `Customers use it to message ${storeName}.`
              : "Create a link and QR code customers can use to message you. You need one team member and one channel ready first."
          }
        >
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
            size="sm"
            variant="outline"
          >
            {linkLive ? "View" : "Create"}
          </Button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Quotes waiting for approval">
        {approvals.data.length > 0 ? (
          approvals.data.map((approval) => (
            <PendingApprovalRow
              approval={approval}
              key={approval.id}
              onReview={() =>
                void params.setParams({
                  quoteApprovalId: approval.id,
                  quoteId: approval.quoteId,
                  serviceCommerceSheet: "quote_approval",
                  storeId: selectedStoreId,
                })
              }
            />
          ))
        ) : (
          <p className="px-4 py-3.5 text-sm text-muted-foreground">
            No quotes waiting for approval.
          </p>
        )}
      </SettingsSection>

      {data.recommendation ? (
        <ChannelRecommendationNote recommendation={data.recommendation} />
      ) : null}
    </SettingsPage>
  )
}

type PendingApproval =
  RouterOutputs["serviceCommerce"]["pendingQuoteApprovals"][number]

function PendingApprovalRow({
  approval,
  onReview,
}: {
  approval: PendingApproval
  onReview: () => void
}) {
  return (
    <SettingsRow
      label={`${quoteSourceLabel(approval.sourceKind)} · ${formatMoney(approval.totalMinor, approval.currencyCode)}`}
      description={`Quote ${approval.version}. ${
        approval.canApprove || approval.canReject
          ? "You can approve this quote."
          : "Waiting for another approver."
      }`}
    >
      <Button onClick={onReview} size="sm" variant="outline">
        Review quote
      </Button>
    </SettingsRow>
  )
}

function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(amount / 100)
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
