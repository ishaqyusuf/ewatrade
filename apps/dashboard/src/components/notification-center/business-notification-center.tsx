"use client"

import { isAccessDrift } from "@/components/activity/activity-read-errors"
import { ActivityViewerProvider } from "@/components/activity/activity-viewer"
import { useActivityParams } from "@/hooks/use-activity-params"
import { useTRPC } from "@/trpc/client"
import {
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import type { BusinessNotificationReceiptView } from "@ewatrade/notifications/business-events"
import { Popover, PopoverContent, PopoverTrigger, cn } from "@ewatrade/ui"
import { Notification01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  BusinessNotificationInbox,
  type InboxTab,
} from "./business-notification-inbox"
import { useAlertPreferencesParams } from "./business-notification-settings"
import {
  PaymentPlanNotices,
  usePaymentPlanNotices,
} from "./payment-plan-notices"
import {
  PaymentReportNotifications,
  usePendingPaymentReports,
} from "./payment-report-notifications"

/** Fresh, mount-owned reads: never joined across user, Business or Store. */
const freshRead = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always",
  trpc: { abortOnUnmount: true },
} as const

/**
 * Personal alerts trigger and inbox. Mount it keyed by the current user,
 * Business and Store so no earlier scope's count or rows can render.
 */
export function BusinessNotificationCenter({
  timeZone,
  viewerMembershipId,
}: {
  timeZone: string
  /** The signed-in membership; its own actions read "You". */
  viewerMembershipId: string
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const [open, setOpen] = useState(false)
  // A new generation on every open: the panel remounts, aborting the earlier
  // read and showing nothing until its own fresh read succeeds.
  const [generation, setGeneration] = useState(0)
  const [tab, setTab] = useState<InboxTab>("unread")

  const count = useQuery(
    mountOwnedRead(
      trpc.businessNotifications.unreadCount.queryOptions(undefined, {
        ...freshRead,
        refetchInterval: 60_000,
      }),
      mount,
    ),
  )
  const alerts = count.isSuccess ? count.data.count : 0
  // Customer payment claims waiting for a check also light the bell.
  const payments = usePendingPaymentReports()
  // So do unread payment alert plan changes.
  const planNotices = usePaymentPlanNotices()
  const unread =
    alerts +
    (payments.isSuccess ? payments.data.items.length : 0) +
    (planNotices.isSuccess ? planNotices.data.unreadCount : 0)

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (value) setGeneration((current) => current + 1)
      }}
    >
      <PopoverTrigger
        aria-label={
          unread ? `My notifications, ${unread} unread` : "My notifications"
        }
        className="relative flex size-9 items-center justify-center outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HugeiconsIcon icon={Notification01Icon} className="size-5" />
        {unread ? (
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white dark:bg-blue-500",
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        appearance="dashboard"
        align="end"
        sideOffset={8}
        className="flex max-h-[min(560px,calc(100dvh-96px))] w-[420px] max-w-[calc(100vw-16px)] gap-0 p-0"
      >
        <p className="px-3.5 pt-3 text-[15px] font-medium">My notifications</p>
        {open ? (
          <PaymentPlanNotices
            appearance="bell"
            timeZone={timeZone}
            onNavigate={() => setOpen(false)}
          />
        ) : null}
        {open ? (
          <PaymentReportNotifications
            timeZone={timeZone}
            onNavigate={() => setOpen(false)}
          />
        ) : null}
        {open ? (
          <ActivityViewerProvider membershipId={viewerMembershipId}>
            <InboxPanel
              key={`${generation}:${tab}`}
              tab={tab}
              onTabChange={setTab}
              timeZone={timeZone}
              onChanged={() => void count.refetch()}
              onClose={() => setOpen(false)}
              onRestart={() => setGeneration((current) => current + 1)}
            />
          </ActivityViewerProvider>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function InboxPanel({
  tab,
  onTabChange,
  timeZone,
  onChanged,
  onClose,
  onRestart,
}: {
  tab: InboxTab
  onTabChange: (tab: InboxTab) => void
  timeZone: string
  onChanged: () => void
  onClose: () => void
  onRestart: () => void
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const [now] = useState(() => new Date())
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const { open: openActivity } = useActivityParams()
  const preferences = useAlertPreferencesParams()
  const list = useInfiniteQuery(
    mountOwnedRead(
      trpc.businessNotifications.listMine.infiniteQueryOptions(
        { state: tab },
        {
          ...freshRead,
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        },
      ),
      mount,
    ),
  )
  const markRead = useMutation(
    trpc.businessNotifications.markRead.mutationOptions(),
  )
  const archive = useMutation(
    trpc.businessNotifications.archive.mutationOptions(),
  )
  const markAllRead = useMutation(
    trpc.businessNotifications.markAllRead.mutationOptions(),
  )

  // Never optimistic: rows change only after the server's fresh re-read.
  const settle = (ids: string[], failure: string) => ({
    onError: () => setActionError(failure),
    onSuccess: () => setActionError(null),
    onSettled: () => {
      setPendingIds((current) => {
        const next = new Set(current)
        for (const id of ids) next.delete(id)
        return next
      })
      onChanged()
      void list.refetch()
    },
  })

  function run(
    mutation: typeof markRead | typeof archive,
    receipt: BusinessNotificationReceiptView,
    failure: string,
  ) {
    setPendingIds((current) => new Set(current).add(receipt.id))
    mutation.mutate({ receiptIds: [receipt.id] }, settle([receipt.id], failure))
  }

  // Drift discards every page; a plain next-page failure keeps earlier ones.
  const drift = list.isError && isAccessDrift(list.error)
  const pages = !drift && list.data ? list.data.pages : []
  const items = pages.flatMap((page) => page.items)
  const firstPage = pages[0]

  return (
    <BusinessNotificationInbox
      tab={tab}
      onTabChange={onTabChange}
      items={items}
      unreadCount={firstPage?.unreadCount ?? 0}
      timeZone={timeZone}
      now={now}
      isPending={list.isPending}
      isError={drift || (list.isError && !list.isFetchNextPageError)}
      errorMessage={
        drift
          ? "Your access has changed, so earlier alerts were cleared."
          : "Your alerts couldn't load."
      }
      actionError={
        actionError ??
        (list.isFetchNextPageError && !drift
          ? "More alerts couldn't load. Try Load more again."
          : null)
      }
      markAllPending={markAllRead.isPending}
      pendingIds={pendingIds}
      hasNextPage={!drift && list.hasNextPage}
      isFetchingNextPage={list.isFetchingNextPage}
      onLoadMore={() => void list.fetchNextPage()}
      onRetry={() => (drift ? onRestart() : void list.refetch())}
      onOpen={(receipt) => {
        // Opening the event is independent of whether the read-state saved;
        // the Activity sheet re-reads it under current access.
        if (receipt.state === "unread")
          run(markRead, receipt, "Couldn't mark that alert as read.")
        onClose()
        void openActivity(receipt.event.key)
      }}
      onMarkRead={(receipt) =>
        run(markRead, receipt, "Couldn't mark that alert as read. Try again.")
      }
      onArchive={(receipt) =>
        run(archive, receipt, "Couldn't archive that alert. Try again.")
      }
      onMarkAllRead={() => {
        if (!firstPage) return
        markAllRead.mutate(
          { through: firstPage.snapshotAt },
          settle([], "Couldn't mark your alerts as read. Try again."),
        )
      }}
      onOpenPreferences={() => {
        onClose()
        void preferences.open()
      }}
    />
  )
}
