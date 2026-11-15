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
  activitySentence,
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

/** The event as one plain sentence, with the person and amount emphasised. */
export function ActivitySummary({
  event,
  showFlag = true,
}: {
  event: BusinessActivityView
  showFlag?: boolean
}) {
  const viewer = useActivityViewer()
  return (
    <>
      {activitySentence(event, viewer).map((part, index) =>
        part.emphasis ? (
          <strong
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are a fixed sentence.
            key={index}
            className={cn(
              "font-semibold",
              part.emphasis === "amount" && "tabular-nums whitespace-nowrap",
            )}
          >
            {part.text}
          </strong>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are a fixed sentence.
          <span key={index}>{part.text}</span>
        ),
      )}
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
      className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--highlight-border)] bg-[var(--highlight)] px-2 align-[1px] text-xs font-medium whitespace-nowrap text-[var(--highlight-foreground)]"
    >
      <HugeiconsIcon icon={SparklesIcon} className="size-3.5" aria-hidden />
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

/** Status words for the row's second line: "now cancelled". */
function currentStatusNote(event: BusinessActivityView) {
  const now = event.currentStatus?.value
  if (!now || now === event.statusAtEvent?.value) return null
  return {
    negative: activityStatusTone(now) === "negative",
    text: `Now ${formatActivityStatus(now).toLowerCase()}`,
  }
}

/**
 * One activity as a sentence ("Ada recorded a ₦5,000 cash payment on
 * ORD-041"), then time, Store and any later status. The whole row opens the
 * entry's sheet.
 */
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
  const status = currentStatusNote(event)
  const later = wasRecordedLater(event, timeZone)
  return (
    <li>
      <button
        type="button"
        data-activity-key={event.key}
        onClick={(e) => onOpen(event, e.currentTarget)}
        className="flex min-h-16 w-full items-start gap-3 rounded-[var(--ui-radius-item)] px-3 py-3 text-left outline-none hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset max-sm:px-2"
      >
        <ActivityCategoryIcon category={event.category} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-base leading-snug break-words">
            <ActivitySummary event={event} />
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
            <time dateTime={event.occurredAt} className="tabular-nums">
              {time}
            </time>
            {showStore && event.store?.name ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{event.store.name}</span>
              </>
            ) : null}
            {later ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Entered{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    timeZone,
                    day: "numeric",
                    month: "short",
                  }).format(new Date(event.recordedAt))}
                </span>
              </>
            ) : null}
            {status ? (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={cn(
                    "font-medium",
                    status.negative
                      ? "text-destructive"
                      : "text-[var(--success-foreground)]",
                  )}
                >
                  {status.text}
                </span>
              </>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  )
}
