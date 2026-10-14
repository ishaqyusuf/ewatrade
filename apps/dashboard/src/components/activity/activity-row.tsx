"use client"

import type { BusinessActivityView } from "@ewatrade/notifications/business-events"
import { cn } from "@ewatrade/ui"
import {
  BankIcon,
  Cash01Icon,
  CreditCardIcon,
  SparklesIcon,
  UserIcon,
  UserQuestion01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ActivityCategoryIcon } from "./activity-category-icon"
import {
  activityAuthor,
  activityStatusTone,
  activityTitle,
  formatActivityAmount,
  formatActivityStatus,
  formatActivityTime,
  isNegativeAmount,
  recordedThroughAssistant,
  splitActivitySummary,
  wasRecordedLater,
} from "./activity-format"
import { useActivityViewer } from "./activity-viewer"

export function ActivitySummary({
  event,
  showFlag = true,
}: {
  event: BusinessActivityView
  showFlag?: boolean
}) {
  const { actor, rest } = splitActivitySummary(event)
  return (
    <>
      {actor ? <strong className="font-medium">{actor}</strong> : null}
      {event.actor.coverage !== "recorded" && !actor ? (
        <span className="sr-only">Author not recorded. </span>
      ) : null}
      {rest}
      {showFlag && recordedThroughAssistant(event) ? (
        <>
          {" "}
          <AssistantFlag />
        </>
      ) : null}
    </>
  )
}

/** What happened, author-free; the author is in the row's subtitle. */
export function ActivityTitle({ event }: { event: BusinessActivityView }) {
  return (
    <>
      <span className="font-medium">{activityTitle(event)}</span>
      {recordedThroughAssistant(event) ? (
        <>
          {" "}
          <AssistantFlag />
        </>
      ) : null}
    </>
  )
}

/** Marks events recorded through the AI assistant; the actor stays the author. */
export function AssistantFlag() {
  return (
    <span
      title="Prepared by the EwaTrade Assistant and confirmed by the person shown"
      className="inline-flex h-[18px] items-center gap-1 border border-violet-200 bg-violet-50 px-1.5 align-[1px] text-[11.5px] font-medium whitespace-nowrap text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300"
    >
      <HugeiconsIcon icon={SparklesIcon} className="size-3" aria-hidden />
      Assistant
    </span>
  )
}

export function ActivityStatusBadges({
  event,
}: {
  event: BusinessActivityView
}) {
  const atEvent = event.statusAtEvent?.value
  const now = event.currentStatus?.value
  return (
    <>
      {atEvent ? (
        <span className="ml-1.5 inline-block bg-secondary px-1.5 align-[1px] text-xs">
          {formatActivityStatus(atEvent)}
        </span>
      ) : null}
      {now && now !== atEvent ? (
        <span
          title="Current status"
          className={cn(
            "ml-1.5 inline-block px-1.5 align-[1px] text-xs",
            activityStatusTone(now) === "negative"
              ? "bg-destructive/10 text-destructive"
              : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
          )}
        >
          Now {formatActivityStatus(now)}
        </span>
      ) : null}
    </>
  )
}

export function ActivityAmount({ event }: { event: BusinessActivityView }) {
  const amount = formatActivityAmount(event)
  if (!amount) return null
  return (
    <span
      className={cn(
        "font-medium tabular-nums whitespace-nowrap",
        isNegativeAmount(event) && "text-destructive",
      )}
    >
      {amount}
    </span>
  )
}

/** Payment method labels the server presents, mapped to a small icon. */
const METHOD_ICONS: Record<string, typeof Cash01Icon> = {
  cash: Cash01Icon,
  "bank transfer": BankIcon,
  card: CreditCardIcon,
  pos: CreditCardIcon,
  "customer credit": Wallet01Icon,
}

function methodIcon(event: BusinessActivityView) {
  if (event.category !== "payments" || !event.detail) return null
  return METHOD_ICONS[event.detail.trim().toLowerCase()] ?? null
}

/**
 * Row subtitle: author (person icon), detail (payment method icon when it is
 * a known method) and optionally the Store, separated by dots.
 */
export function ActivityMeta({
  event,
  showStore,
  extra = [],
}: {
  event: BusinessActivityView
  showStore: boolean
  extra?: string[]
}) {
  const viewer = useActivityViewer()
  const recorded = event.actor.coverage === "recorded" && event.actor.name
  const method = methodIcon(event)
  // Earlier orders carry only a "details not captured" note; the "Earlier
  // record" tag and the page's coverage notice already say that.
  const detail =
    event.coverage === "legacy_fact" && event.type === "order.recorded"
      ? null
      : event.detail
  const parts = [
    {
      key: "author",
      icon: recorded ? UserIcon : UserQuestion01Icon,
      text: activityAuthor(event, viewer),
    },
    ...(detail ? [{ key: "detail", icon: method, text: detail }] : []),
    ...(showStore && event.store?.name
      ? [{ key: "store", icon: null, text: event.store.name }]
      : []),
    ...extra.map((text, index) => ({
      key: `extra-${index}`,
      icon: null,
      text,
    })),
  ]
  return (
    <>
      {parts.map((part, index) => (
        <span key={part.key} className="inline-flex items-center gap-1">
          {index ? (
            <span aria-hidden="true" className="px-0.5">
              ·
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            {part.icon ? (
              <HugeiconsIcon
                icon={part.icon}
                className="size-3.5 shrink-0"
                aria-hidden
              />
            ) : null}
            {part.text}
          </span>
        </span>
      ))}
    </>
  )
}

export function ActivityRow({
  event,
  timeZone,
  showStore,
  onOpen,
}: {
  event: BusinessActivityView
  timeZone: string
  showStore: boolean
  onOpen: (event: BusinessActivityView, trigger: HTMLButtonElement) => void
}) {
  const time = formatActivityTime(event.occurredAt, timeZone)
  return (
    <li className="border-b">
      <button
        type="button"
        data-activity-key={event.key}
        onClick={(e) => onOpen(event, e.currentTarget)}
        className="flex w-full items-start gap-3.5 px-2 py-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-sm:gap-2.5 max-sm:px-0.5"
      >
        <ActivityCategoryIcon
          category={event.category}
          className="max-sm:size-7"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm">
            <ActivityTitle event={event} />
            <ActivityStatusBadges event={event} />
          </span>
          {
            <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] text-muted-foreground">
              <ActivityMeta event={event} showStore={showStore} />
              {wasRecordedLater(event, timeZone) ? (
                <span className="ml-1 border px-1 text-xs whitespace-nowrap">
                  Recorded{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    timeZone,
                    day: "numeric",
                    month: "short",
                  }).format(new Date(event.recordedAt))}
                </span>
              ) : null}
              {event.coverage !== "snapshot" ? (
                <span className="ml-1 border px-1 text-xs whitespace-nowrap">
                  Earlier record
                </span>
              ) : null}
            </span>
          }
        </span>
        <span className="flex min-w-[76px] flex-col items-end gap-0.5 max-sm:min-w-[58px]">
          <ActivityAmount event={event} />
          <time
            dateTime={event.occurredAt}
            className="text-xs tabular-nums text-muted-foreground"
          >
            {time}
          </time>
        </span>
      </button>
    </li>
  )
}
