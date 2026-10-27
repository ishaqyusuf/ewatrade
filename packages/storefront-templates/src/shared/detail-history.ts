"use client"

import { type RefObject, useEffect, useRef, useState } from "react"

/** "push" lets Back close the detail; "none" is for embedded previews that must not touch the host URL. */
export type DetailHistory = "replace" | "push" | "none"

/**
 * Whether a history entry changes the open detail. Back/Forward between listing
 * entries (search, category, page) leaves focus and the page title alone.
 */
export function detailHistoryChange(
  openItemId: string | null,
  urlItemId: string | null,
) {
  return (openItemId ?? null) !== (urlItemId || null)
}

/** Only an item from the current public load can open; an unknown ?item= stays closed. */
export function knownDetail<T extends { id: string }>(
  items: readonly T[],
  id: string | null | undefined,
) {
  return (id && items.find((entry) => entry.id === id)) || null
}

/** The same listing URL with only ?item= changed, so category, search, sort and cursor survive. */
export function detailUrl(href: string, itemId: string | null) {
  const url = new URL(href)
  if (itemId) url.searchParams.set("item", itemId)
  else url.searchParams.delete("item")
  return url
}

/**
 * What a Back/Forward entry means for the open detail: `undefined` when nothing changes
 * (listing-only history), otherwise the known item to show, or null to close.
 */
export function historyDetail<T extends { id: string }>(
  openItemId: string | null,
  href: string,
  items: readonly T[],
) {
  const id = new URL(href).searchParams.get("item")
  if (!detailHistoryChange(openItemId, id)) return undefined
  return knownDetail(items, id)
}

/** Return focus once to the card that opened the detail, never to a stale one later. */
function restoreFocus(opener: RefObject<HTMLElement | null>) {
  const trigger = opener.current
  opener.current = null
  if (trigger?.isConnected) trigger.focus({ preventScroll: true })
}

/**
 * One item-detail selection with ?item= history, title and focus return. Provider-free so
 * every layout can share it. `items` are the public items that may open (page + highlight).
 */
export function useDetailHistory<T extends { id: string; name: string }>({
  initial,
  items,
  history,
  siteName,
}: {
  initial: T | null
  items: readonly T[]
  history: DetailHistory
  siteName: string
}) {
  const [selected, setSelected] = useState<T | null>(initial)
  const opener = useRef<HTMLElement | null>(null)
  const pushed = useRef(false)
  const openId = useRef<string | null>(initial?.id ?? null)
  const known = useRef(items)
  useEffect(() => {
    known.current = items
  }, [items])
  // A new server load (deep link, Back after a refetch) owns the highlighted detail.
  useEffect(() => {
    openId.current = initial?.id ?? null
    setSelected(initial)
  }, [initial])
  useEffect(() => {
    if (history !== "push") return
    const sync = () => {
      pushed.current = false
      const item = historyDetail(
        openId.current,
        window.location.href,
        known.current,
      )
      if (item === undefined) return
      openId.current = item?.id ?? null
      setSelected(item)
      document.title = item
        ? `${item.name} | ${siteName}`
        : `${siteName} | ẸwáTrade`
      if (!item) restoreFocus(opener)
    }
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [history, siteName])
  const open = (item: T, trigger: HTMLElement) => {
    if (!knownDetail(known.current, item.id)) return
    opener.current = trigger
    openId.current = item.id
    setSelected(item)
    if (history === "none") return
    document.title = `${item.name} | ${siteName}`
    const url = detailUrl(window.location.href, item.id)
    if (history === "push" && !pushed.current) {
      window.history.pushState(null, "", url)
      pushed.current = true
    } else window.history.replaceState(null, "", url)
  }
  const close = () => {
    openId.current = null
    setSelected(null)
    if (history !== "none") {
      document.title = `${siteName} | ẸwáTrade`
      if (pushed.current) {
        pushed.current = false
        window.history.back()
      } else
        window.history.replaceState(
          null,
          "",
          detailUrl(window.location.href, null),
        )
    }
    restoreFocus(opener)
  }
  return { selected, open, close }
}
