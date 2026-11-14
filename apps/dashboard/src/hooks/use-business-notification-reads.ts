"use client"

import { useTRPC } from "@/trpc/client"
import {
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

/**
 * Fresh private reads; each mounted consumer keeps its own generation. No
 * timers (dashboard shell rule, ADR-0060): reads run on mount, when the window
 * regains focus, and after the actions that invalidate them.
 */
export const notificationReadOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always",
  refetchInterval: false,
  trpc: { abortOnUnmount: true },
} as const

export function useUnreadBusinessNotificationCount() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.businessNotifications.unreadCount.queryOptions(undefined, {
        ...notificationReadOptions,
      }),
      mount,
    ),
  )
}

export function usePendingPaymentReportCount() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.businessBanking.pendingReportCount.queryOptions(undefined, {
        ...notificationReadOptions,
      }),
      mount,
    ),
  )
}

export function usePaymentPlanNoticeCount() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.businessBanking.notificationChangeCount.queryOptions(undefined, {
        ...notificationReadOptions,
      }),
      mount,
    ),
  )
}

export function useStorefrontRequestNotificationCount() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.storefrontRequests.notificationCount.queryOptions(undefined, {
        ...notificationReadOptions,
      }),
      mount,
    ),
  )
}

export function usePendingPaymentReports() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.businessBanking.pendingReports.queryOptions(
        { limit: 5 },
        {
          ...notificationReadOptions,
        },
      ),
      mount,
    ),
  )
}

export function usePaymentPlanNotices() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.businessBanking.notificationChanges.queryOptions(
        { limit: 5 },
        {
          ...notificationReadOptions,
        },
      ),
      mount,
    ),
  )
}

/** Only the bell refreshes on focus; the panel reads fresh each time it opens. */
export function useStorefrontRequestNotifications({ poll }: { poll: boolean }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.storefrontRequests.notifications.queryOptions(undefined, {
        ...notificationReadOptions,
        refetchOnWindowFocus: poll,
      }),
      mount,
    ),
  )
}
