"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface UseTableScrollOptions {
  scrollAmount?: number
  /** Snap to measured header cells rather than using a fixed pixel amount. */
  useColumnWidths?: boolean
  /** Legacy fallback for tables without data-table-column-id header attributes. */
  startFromColumn?: number
}

interface ColumnPositions {
  positions: number[]
  leftStickyWidth: number
}

/** Horizontal table scrolling and optional column-by-column navigation. */
export function useTableScroll(options: UseTableScrollOptions = {}) {
  const {
    scrollAmount = 120,
    useColumnWidths = false,
    startFromColumn = 0,
  } = options
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerElement, setContainerElement] =
    useState<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isScrollable, setIsScrollable] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setContainerRef = useCallback((element: HTMLDivElement | null) => {
    containerRef.current = element
    setContainerElement(element)
  }, [])

  const getColumnPositions = useCallback((): ColumnPositions => {
    const container = containerRef.current
    const header = container?.querySelector("thead")
    if (!container || !header) return { positions: [], leftStickyWidth: 0 }

    const allHeaders = Array.from(header.querySelectorAll<HTMLElement>("th"))
    const hasCompleteColumnContract =
      allHeaders.length > 0 &&
      allHeaders.every((element) => Boolean(element.dataset.tableColumnId))
    // The shared header contract describes actual current visible DOM order.
    // Apply the legacy index fallback only when that contract is unavailable.
    const headers = hasCompleteColumnContract
      ? allHeaders
      : allHeaders.slice(Math.max(0, startFromColumn))
    const leftStickyHeaders = headers.filter(
      (element) =>
        element.dataset.tableSticky === "true" &&
        element.dataset.tableStickySide !== "right",
    )
    const leftStickyWidth = leftStickyHeaders.reduce(
      (width, element) => width + element.getBoundingClientRect().width,
      0,
    )
    const targets = headers.filter(
      (element) => element.dataset.tableSticky !== "true",
    )
    const containerLeft = container.getBoundingClientRect().left

    return {
      positions: targets.map(
        (element) =>
          container.scrollLeft +
          element.getBoundingClientRect().left -
          containerLeft,
      ),
      leftStickyWidth,
    }
  }, [startFromColumn])

  const syncScrollability = useCallback(() => {
    const container = containerRef.current
    if (!container) {
      setIsScrollable(false)
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }
    const maximum = Math.max(0, container.scrollWidth - container.clientWidth)
    const scrollable = maximum > 1
    setIsScrollable(scrollable)
    setCanScrollLeft(scrollable && container.scrollLeft > 1)
    setCanScrollRight(scrollable && container.scrollLeft < maximum - 1)
  }, [])

  const scrollLeft = useCallback(
    (smooth = true) => {
      const container = containerRef.current
      if (!container) return
      if (!useColumnWidths) {
        container.scrollBy({
          left: -scrollAmount,
          behavior: smooth ? "smooth" : "auto",
        })
        return
      }

      const { positions, leftStickyWidth } = getColumnPositions()
      const currentVisibleEdge = container.scrollLeft + leftStickyWidth
      const target = [...positions]
        .reverse()
        .find((position) => position < currentVisibleEdge - 2)
      const maximum = Math.max(0, container.scrollWidth - container.clientWidth)
      container.scrollTo({
        left:
          target === undefined
            ? 0
            : Math.min(maximum, Math.max(0, target - leftStickyWidth)),
        behavior: smooth ? "smooth" : "auto",
      })
    },
    [getColumnPositions, scrollAmount, useColumnWidths],
  )

  const scrollRight = useCallback(
    (smooth = true) => {
      const container = containerRef.current
      if (!container) return
      if (!useColumnWidths) {
        container.scrollBy({
          left: scrollAmount,
          behavior: smooth ? "smooth" : "auto",
        })
        return
      }

      const maximum = Math.max(0, container.scrollWidth - container.clientWidth)
      const { positions, leftStickyWidth } = getColumnPositions()
      const currentVisibleEdge = container.scrollLeft + leftStickyWidth
      const target = positions.find(
        (position) => position > currentVisibleEdge + 2,
      )
      container.scrollTo({
        left:
          target === undefined
            ? maximum
            : Math.min(maximum, Math.max(0, target - leftStickyWidth)),
        behavior: smooth ? "smooth" : "auto",
      })
    },
    [getColumnPositions, scrollAmount, useColumnWidths],
  )

  useEffect(() => {
    const container = containerElement
    if (!container) return

    const handleScroll = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(syncScrollability, 80)
    }
    const resizeObserver = new ResizeObserver(syncScrollability)
    const observeContent = () => {
      resizeObserver.disconnect()
      resizeObserver.observe(container)
      const content = container.querySelector("table")
      if (content) resizeObserver.observe(content)
      for (const element of container.querySelectorAll(
        "thead, tbody, colgroup",
      )) {
        resizeObserver.observe(element)
      }
      syncScrollability()
    }
    const mutationObserver = new MutationObserver(observeContent)

    container.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", syncScrollability)
    mutationObserver.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
    })
    observeContent()

    return () => {
      container.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", syncScrollability)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [containerElement, syncScrollability])

  // Arrow keys bubble only from this table's focused descendants; unrelated page
  // controls and tables are never captured by a global window listener.
  useEffect(() => {
    const container = containerElement
    if (!container || !isScrollable) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            "input, textarea, select, button, [role='button'], [role='combobox'], [data-table-scroll-disable-hotkeys]",
          ))
      ) {
        return
      }

      if (event.key === "ArrowLeft" && canScrollLeft) {
        event.preventDefault()
        scrollLeft()
      } else if (event.key === "ArrowRight" && canScrollRight) {
        event.preventDefault()
        scrollRight()
      }
    }

    container.addEventListener("keydown", onKeyDown)
    return () => container.removeEventListener("keydown", onKeyDown)
  }, [
    canScrollLeft,
    canScrollRight,
    containerElement,
    isScrollable,
    scrollLeft,
    scrollRight,
  ])

  return {
    containerRef,
    setContainerRef,
    canScrollLeft,
    canScrollRight,
    isScrollable,
    scrollLeft,
    scrollRight,
  }
}
