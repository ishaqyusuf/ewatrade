"use client"

import { type ComponentProps, useEffect, useRef } from "react"

/**
 * The Subcategories row. On a phone it scrolls sideways, and each listing
 * navigation renders it scrolled to the start; this brings the current link
 * back into view so a subcategory chosen near the end of a long row stays visible.
 */
export function SubcategoryNav({
  current,
  ...props
}: Omit<ComponentProps<"nav">, "aria-label"> & {
  /** The selected scope; the row re-centres only when it changes. */
  current: string | null | undefined
}) {
  const ref = useRef<HTMLElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the selected scope changes.
  useEffect(() => {
    const row = ref.current
    const link = row?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!row || !link || row.scrollWidth <= row.clientWidth) return
    const box = row.getBoundingClientRect()
    const target = link.getBoundingClientRect()
    if (target.left >= box.left && target.right <= box.right) return
    row.scrollLeft += target.left - box.left - (box.width - target.width) / 2
  }, [current])
  return <nav ref={ref} aria-label="Subcategories" {...props} />
}
