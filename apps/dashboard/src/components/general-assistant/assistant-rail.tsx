"use client"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useSetupAssistantParams } from "@/hooks/use-setup-assistant-params"
import { useTRPC } from "@/trpc/client"
import { Badge, Button, cn } from "@ewatrade/ui"
import { CheckmarkCircle02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import type { GeneralPendingReview } from "./general-chat"

type SetupArea = {
  area: string
  label: string
  status: "DONE" | "SKIPPED" | "STARTED" | "OPEN"
}

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0">
      <h2 className="flex items-center justify-between gap-2 text-xs font-semibold">
        {title}
        {aside}
      </h2>
      {children}
    </section>
  )
}

function Meter({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary"
        style={{
          width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`,
        }}
      />
    </div>
  )
}

function Item({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      {action}
    </div>
  )
}

const short = (iso: string | Date) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })

/** What is waiting on the person: drafts to review, products, setup, allowance. */
export function AssistantRail({
  pending,
  onReview,
  onLeave,
}: {
  pending: GeneralPendingReview[]
  onReview: (pending: GeneralPendingReview) => void
  /** Called before opening the product chat or setup over this page. */
  onLeave?: () => void
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
  const openProduct = (conversation: string | null) => {
    onLeave?.()
    void setParams({
      catalogItem: "create",
      catalogCreateKind: "product",
      catalogCreateMode: "chat",
      catalogConversation: conversation,
    })
  }
  const productData = products.data?.enabled ? products.data : null
  const setupData = setup.data?.enabled ? setup.data : null
  const areas: SetupArea[] =
    setupData && "areas" in setupData ? (setupData.areas as SetupArea[]) : []
  const done = areas.filter(
    (area) => area.status === "DONE" || area.status === "SKIPPED",
  ).length
  const general = allowance.data

  return (
    <div className="flex flex-col">
      <Section
        title="Needs your review"
        aside={
          <Badge variant={pending.length ? "default" : "secondary"}>
            {pending.length}
          </Badge>
        }
      >
        {pending.length ? (
          pending.map((row) => (
            <Item
              key={row.id}
              title={row.title}
              detail={row.summary}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReview(row)}
                >
                  Review
                </Button>
              }
            />
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing waiting. Drafts you ask for stay here until you confirm or
            cancel them.
          </p>
        )}
      </Section>
      {productData ? (
        <Section title="Products">
          {productData.drafts.slice(0, 3).map((draft) => (
            <Item
              key={draft.id}
              title={draft.title ?? "Product draft"}
              detail={`Draft · ${short(draft.updatedAt)}`}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openProduct(draft.id)}
                >
                  Continue
                </Button>
              }
            />
          ))}
          <Button variant="outline" size="sm" onClick={() => openProduct(null)}>
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Add product with AI
          </Button>
        </Section>
      ) : null}
      {setupData && areas.length ? (
        <Section
          title="Setup"
          aside={
            <span className="font-normal text-muted-foreground">
              {done} of {areas.length}
            </span>
          }
        >
          <Meter value={done} max={areas.length} />
          <ul className="flex flex-col gap-1.5 text-sm">
            {areas.map((area) => {
              const finished =
                area.status === "DONE" || area.status === "SKIPPED"
              return (
                <li
                  key={area.area}
                  className={cn(
                    "flex items-center gap-2",
                    finished && "text-muted-foreground line-through",
                  )}
                >
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    className={cn(
                      "size-4 shrink-0",
                      finished ? "text-primary" : "text-muted-foreground/40",
                    )}
                  />
                  <span className="block first-letter:uppercase">
                    {area.label}
                  </span>
                </li>
              )
            })}
          </ul>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onLeave?.()
              void setSetupOpen(true)
            }}
          >
            {done === areas.length ? "Add more with AI" : "Continue setup"}
          </Button>
        </Section>
      ) : null}
      {general || productData ? (
        <Section title="AI allowance">
          {general ? (
            <div className="flex flex-col gap-2">
              <Meter
                value={general.remainingRequests}
                max={general.requestLimit}
              />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Chat messages left
                </span>
                <span className="font-semibold tabular-nums">
                  {general.remainingRequests} / {general.requestLimit}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Shared across this business. Resets {short(general.resetsAt)}.
              </p>
            </div>
          ) : null}
          {productData ? (
            <div className="flex flex-col gap-2">
              <Meter
                value={productData.allowance.requestsRemaining}
                max={productData.allowance.requestLimit}
              />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  Setup and product messages
                </span>
                <span className="font-semibold tabular-nums">
                  {productData.allowance.requestsRemaining} /{" "}
                  {productData.allowance.requestLimit}
                </span>
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  )
}
