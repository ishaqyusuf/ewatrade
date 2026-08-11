"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { ChannelRecommendationCard } from "./channel-recommendation-card"
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
  const releaseSettings = useQuery({
    ...trpc.serviceCommerce.quoteReleaseSettings.queryOptions({
      storeId: selectedStoreId,
    }),
    enabled: Boolean(workspace.data?.access.canManage),
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
    (workspace.data?.access.canManage && releaseSettings.isLoading) ||
    approvals.isLoading
  ) {
    return <CustomerChannelsSkeleton />
  }
  const error = workspace.error ?? releaseSettings.error ?? approvals.error
  if (
    error ||
    !workspace.data ||
    (workspace.data.access.canManage && !releaseSettings.data) ||
    !approvals.data
  ) {
    return (
      <div className="grid gap-3 p-6 lg:p-8">
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          {error?.message ?? "Customer channels are unavailable."}
        </p>
        <Button
          className="w-fit"
          onClick={() =>
            void Promise.all([
              workspace.refetch(),
              releaseSettings.refetch(),
              approvals.refetch(),
            ])
          }
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

      {data.recommendation ? (
        <ChannelRecommendationCard recommendation={data.recommendation} />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
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
        {data.access.canManage && releaseSettings.data ? (
          <ChannelTaskCard
            action="Configure approval"
            description={
              releaseSettings.data.policy.mode === "approval_required"
                ? `${releaseSettings.data.policy.selectedApproverMembershipIds.length} selected approver${releaseSettings.data.policy.selectedApproverMembershipIds.length === 1 ? "" : "s"}. Another selected team member must approve each exact Quote Version.`
                : "Approval is off. Assigned attendants are trusted to prepare and release quotations."
            }
            onOpen={() =>
              void params.setParams({
                serviceCommerceSheet: "quote_policy",
                storeId: selectedStoreId,
              })
            }
            title="Quotation approval"
          />
        ) : null}
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

      <section aria-labelledby="pending-approvals-title" className="grid gap-4">
        <div>
          <h2 className="font-semibold" id="pending-approvals-title">
            Pending quotation approvals
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the exact immutable version before it becomes visible to the
            customer.
          </p>
        </div>
        {approvals.data.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {approvals.data.map((approval) => (
              <article
                className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"
                key={approval.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {approval.sourceKind.replace("_", " ")}
                    </p>
                    <h3 className="font-semibold">
                      Quote version {approval.version}
                    </h3>
                  </div>
                  <p className="font-semibold tabular-nums">
                    {formatMoney(approval.totalMinor, approval.currencyCode)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {approval.canApprove || approval.canReject
                    ? "Your selected approver assignment permits a decision."
                    : "Visible for coordination. Another selected approver must decide."}
                </p>
                <Button
                  className="mt-auto w-fit"
                  onClick={() =>
                    void params.setParams({
                      quoteApprovalId: approval.id,
                      quoteId: approval.quoteId,
                      serviceCommerceSheet: "quote_approval",
                      storeId: selectedStoreId,
                    })
                  }
                  variant="outline"
                >
                  Review exact version
                </Button>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            No quotations are waiting for approval.
          </p>
        )}
      </section>
    </div>
  )
}

function formatMoney(amount: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(amount / 100)
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
