"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import type { Virtualizer } from "@tanstack/react-virtual"
import { type RefObject, useCallback, useEffect, useRef } from "react"

export interface UseInfiniteScrollProps<
  TScrollElement extends HTMLElement = HTMLElement,
> {
  scrollRef: RefObject<TScrollElement | null>
  rowVirtualizer: Virtualizer<TScrollElement, Element>
  rowCount: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isError?: boolean
  fetchNextPage: () => Promise<unknown>
  threshold?: number
}

/**
 * Loads at most one cursor page for each scroll interaction. Query errors stop
 * automatic loading; consumers can expose the returned retry function.
 */
export function useInfiniteScroll<
  TScrollElement extends HTMLElement = HTMLElement,
>({
  scrollRef,
  rowVirtualizer,
  rowCount,
  hasNextPage,
  isFetchingNextPage,
  isError = false,
  fetchNextPage,
  threshold = 20,
}: UseInfiniteScrollProps<TScrollElement>) {
  const workflow = useDashboardWorkflow()
  const latest = useRef({
    rowVirtualizer,
    rowCount,
    hasNextPage,
    isFetchingNextPage,
    isError,
    fetchNextPage,
    threshold,
  })
  const requestInFlight = useRef(false)
  const virtualItems = rowVirtualizer.getVirtualItems()
  const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? -1
  const scrollEffectKey = `${rowCount}:${hasNextPage}:${isFetchingNextPage}:${isError}:${lastVisibleIndex}`

  useEffect(() => {
    latest.current = {
      rowVirtualizer,
      rowCount,
      hasNextPage,
      isFetchingNextPage,
      isError,
      fetchNextPage,
      threshold,
    }
  }, [
    rowVirtualizer,
    rowCount,
    hasNextPage,
    isFetchingNextPage,
    isError,
    fetchNextPage,
    threshold,
  ])

  const requestNextPage = useCallback(
    (explicitRetry = false) => {
      const state = latest.current
      if (
        !state.hasNextPage ||
        state.isFetchingNextPage ||
        requestInFlight.current ||
        (state.isError && !explicitRetry)
      ) {
        return
      }

      if (explicitRetry)
        workflow.track("retry", "started", { channel: "pagination" })
      requestInFlight.current = true
      try {
        Promise.resolve(state.fetchNextPage()).then(
          (result) => {
            if (explicitRetry)
              workflow.track(
                "retry",
                result &&
                  typeof result === "object" &&
                  "isError" in result &&
                  result.isError
                  ? "failed"
                  : "completed",
                { channel: "pagination" },
              )
            requestInFlight.current = false
          },
          () => {
            if (explicitRetry)
              workflow.track("retry", "failed", { channel: "pagination" })
            requestInFlight.current = false
          },
        )
      } catch {
        if (explicitRetry)
          workflow.track("retry", "failed", { channel: "pagination" })
        requestInFlight.current = false
      }
    },
    [workflow],
  )

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return
    // Depend on query/virtual-range changes so the listener rechecks readiness.
    void scrollEffectKey

    const checkLoadMore = () => {
      const state = latest.current
      const virtualItems = state.rowVirtualizer.getVirtualItems()
      const lastItem = virtualItems[virtualItems.length - 1]
      if (
        lastItem &&
        lastItem.index >= Math.max(0, state.rowCount - state.threshold)
      ) {
        requestNextPage()
      }
    }

    // Recheck on page/query/virtual-range changes so a short first page can fill
    // the viewport. The row threshold and in-flight guard stop at the buffer.
    checkLoadMore()
    scrollElement.addEventListener("scroll", checkLoadMore, { passive: true })
    return () => scrollElement.removeEventListener("scroll", checkLoadMore)
  }, [scrollRef, scrollEffectKey, requestNextPage])

  const retry = useCallback(() => requestNextPage(true), [requestNextPage])

  return {
    retry,
  }
}
