"use client"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useSetupAssistantParams } from "@/hooks/use-setup-assistant-params"
import { useTRPC } from "@/trpc/client"
import { cn } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import type { GeneralPendingReview } from "./general-chat"

type SetupArea = {
  area: string
  label: string
  status: "DONE" | "SKIPPED" | "STARTED" | "OPEN"
}

function QuietLink({
  onClick,
  warn = false,
  children,
}: {
  onClick: () => void
  warn?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-xs hover:bg-muted",
        warn
          ? "font-medium text-amber-700 dark:text-amber-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

/**
 * What is waiting, as quiet links under the composer: drafts to review,
 * product chat, setup and the monthly allowance.
 */
export function AssistantLinks({
  pending,
  onReview,
  className,
}: {
  pending: GeneralPendingReview[]
  onReview: (pending: GeneralPendingReview) => void
  className?: string
}) {
  const trpc = useTRPC()
  const products = useQuery(
    trpc.productAssistant.capabilities.queryOptions(undefined, {
      staleTime: 0,
      refetchInterval: 30_000,
    }),
  )
  const setup = useQuery(trpc.setupAssistant.state.queryOptions())
  const allowance = useQuery(
    trpc.assistant.allowance.queryOptions(undefined, {
      retry: false,
      refetchInterval: 30_000,
    }),
  )
  const { setParams } = useCatalogItemParams()
  const { setSetupOpen } = useSetupAssistantParams()
  const openProduct = (conversation: string | null) =>
    void setParams({
      catalogItem: "create",
      catalogCreateKind: "product",
      catalogCreateMode: "chat",
      catalogConversation: conversation,
    })
  const productData = products.data?.enabled ? products.data : null
  const draft = productData?.drafts[0]
  const setupData = setup.data?.enabled ? setup.data : null
  const areas: SetupArea[] =
    setupData && "areas" in setupData ? (setupData.areas as SetupArea[]) : []
  const done = areas.filter(
    (area) => area.status === "DONE" || area.status === "SKIPPED",
  ).length
  const general = allowance.data
  const first = pending[0]

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="flex flex-wrap items-center justify-center gap-x-1">
        {first ? (
          <QuietLink warn onClick={() => onReview(first)}>
            {pending.length} draft{pending.length > 1 ? "s" : ""} need
            {pending.length > 1 ? "" : "s"} review →
          </QuietLink>
        ) : null}
        {productData ? (
          <QuietLink onClick={() => openProduct(null)}>
            Add product with AI
          </QuietLink>
        ) : null}
        {draft ? (
          <QuietLink onClick={() => openProduct(draft.id)}>
            Continue “{draft.title ?? "product"}” draft
          </QuietLink>
        ) : null}
        {setupData && areas.length ? (
          <QuietLink onClick={() => void setSetupOpen(true)}>
            {done === areas.length
              ? "Add more with AI"
              : `Setup ${done} of ${areas.length}`}
          </QuietLink>
        ) : null}
      </div>
      {general ? (
        <p className="text-[11px] text-muted-foreground">
          {general.remainingRequests} of {general.requestLimit} chat messages
          left · resets{" "}
          {new Date(general.resetsAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}
        </p>
      ) : null}
    </div>
  )
}
