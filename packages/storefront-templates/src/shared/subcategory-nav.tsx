"use client"

import { type ComponentProps, type FocusEvent, useEffect, useRef } from "react"

/** Space kept between a revealed link and the row's edge. */
const EDGE = 8

/**
 * A row of links that scrolls sideways on a phone. Each listing navigation
 * renders it scrolled to the start, so this brings the current link back into
 * view (a choice near the end of a long row stays visible), and scrolls a link
 * that gets keyboard focus fully into view when it is only partly shown.
 */
export function CurrentLinkNav({
  current,
  onFocus,
  ...props
}: ComponentProps<"nav"> & {
  /** The selected scope; the row re-centres only when it changes. */
  current: string | null | undefined
}) {
  const ref = useRef<HTMLElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the selected scope changes.
  useEffect(() => {
    const row = ref.current
    // "page" for the current page, "true" for a root whose subcategory is open.
    const link = row?.querySelector<HTMLElement>(
      '[aria-current]:not([aria-current="false"])',
    )
    if (!row || !link || row.scrollWidth <= row.clientWidth) return
    const box = row.getBoundingClientRect()
    const target = link.getBoundingClientRect()
    if (target.left >= box.left && target.right <= box.right) return
    row.scrollLeft += target.left - box.left - (box.width - target.width) / 2
  }, [current])

  function revealFocused(event: FocusEvent<HTMLElement>) {
    onFocus?.(event)
    const row = ref.current
    const link = event.target
    if (!row || link === row || row.scrollWidth <= row.clientWidth) return
    const box = row.getBoundingClientRect()
    const target = link.getBoundingClientRect()
    if (target.left < box.left) row.scrollLeft += target.left - box.left - EDGE
    else if (target.right > box.right)
      row.scrollLeft += target.right - box.right + EDGE
  }

  return <nav ref={ref} onFocus={revealFocused} {...props} />
}

/** The Subcategories row under an open root category. */
export function SubcategoryNav(
  props: Omit<ComponentProps<typeof CurrentLinkNav>, "aria-label">,
) {
  return <CurrentLinkNav aria-label="Subcategories" {...props} />
}
