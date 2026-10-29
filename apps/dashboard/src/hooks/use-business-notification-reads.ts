"use client"

import { useTRPC } from "@/trpc/client"
import { readPollInterval } from "@/trpc/query-read-errors"
import {
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

/** Fresh private reads; each mounted consumer keeps its own generation. */
export const notificationReadOptions = {
  retry: false,
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always",
  trpc: { abortOnUnmount: true },
} as const

export function useUnreadBusinessNotificationCount() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.businessNotifications.unreadCount.queryOptions(undefined, {
        ...notificationReadOptions,
        refetchInterval: (query) => readPollInterval(query.state.error, 60_000),
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
        refetchInterval: (query) => readPollInterval(query.state.error, 30_000),
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
        refetchInterval: (query) => readPollInterval(query.state.error, 60_000),
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
        refetchInterval: (query) => readPollInterval(query.state.error, 60_000),
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
          refetchInterval: (query) =>
            readPollInterval(query.state.error, 30_000),
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
          refetchInterval: (query) =>
            readPollInterval(query.state.error, 60_000),
        },
      ),
      mount,
    ),
  )
}

/** Only the bell polls; the panel reads fresh each time it opens. */
export function useStorefrontRequestNotifications({ poll }: { poll: boolean }) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  return useQuery(
    mountOwnedRead(
      trpc.storefrontRequests.notifications.queryOptions(undefined, {
        ...notificationReadOptions,
        refetchOnWindowFocus: poll,
        refetchInterval: poll
          ? (query) => readPollInterval(query.state.error, 60_000)
          : false,
      }),
      mount,
    ),
  )
}
