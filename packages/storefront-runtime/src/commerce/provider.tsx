"use client"

import { readStorefrontFeatureConfig } from "@ewatrade/storefront-contracts/features"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { CSSProperties } from "react"
import type {
  StorefrontDetails,
  StorefrontFeaturePresentation,
} from "../feature-theme"
import type { StorefrontClientSnapshot } from "../server"
import {
  type BagLine,
  type BagState,
  type StorefrontCommerceAdapter,
  type StorefrontCustomerView,
  addBagLine,
  readBag,
  storefrontMode,
  writeBag,
} from "./model"
import { useCommerceNavigation } from "./navigation"
import { previewCommerceAdapter } from "./preview"

export type StorefrontCommerceContext = {
  snapshot: StorefrontClientSnapshot
  themeStyle: CSSProperties
  adapter: StorefrontCommerceAdapter
  customer: StorefrontCustomerView
  header: StorefrontDetails
  facts: ReturnType<typeof storefrontMode>
  /** Product ordering is live (server re-checks on every write). */
  ordering: boolean
  accounts: boolean
  /** Studio/editor preview: links stay inert and nothing is written. */
  preview: boolean
  bag: BagState
  bagReady: boolean
  addToBag(line: BagLine): string | null
  setQuantity(offeringId: string, quantity: string): void
  updateLine(offeringId: string, patch: Partial<BagLine>): void
  removeLine(offeringId: string): void
  clearBag(): void
  bagOpen: boolean
  setBagOpen(open: boolean): void
  openItem(itemId: string): void
  href(path: string): string
  navigate(
    path: string,
    options?: { replace?: boolean; refresh?: boolean },
  ): void
  refresh(): void
  refreshing: boolean
}

const Context = createContext<StorefrontCommerceContext | null>(null)

export function useOptionalStorefrontCommerce() {
  return useContext(Context)
}

export function useStorefrontCommerce() {
  const value = useContext(Context)
  if (!value) throw new Error("Storefront commerce context is missing.")
  return value
}

/** Route data changes independently of the shell's persistent bag state. */
export function StorefrontCommercePageProvider({
  snapshot,
  customer,
  children,
  presentation,
}: {
  snapshot: StorefrontClientSnapshot
  customer?: StorefrontCustomerView
  children: ReactNode
  presentation: StorefrontFeaturePresentation
}) {
  const parent = useStorefrontCommerce()
  const facts = storefrontMode({
    offeringCounts: snapshot.resources.catalog.offeringCounts,
    items: snapshot.resources.catalog.items,
  })
  const value: StorefrontCommerceContext = {
    ...parent,
    snapshot,
    customer: customer ?? null,
    facts,
    header: presentation.details,
    themeStyle: presentation.style,
    ordering:
      facts.products > 0 &&
      !!snapshot.resources.commerce?.orderRequests.available,
    accounts:
      !!snapshot.resources.commerce?.customerAccounts.available &&
      presentation.details.showLogin,
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}

function safeStorage() {
  try {
    const storage = window.localStorage
    const probe = "ewatrade.storefront.probe"
    storage.setItem(probe, "1")
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

export function StorefrontCommerceProvider({
  snapshot,
  adapter,
  customer,
  preview,
  onPageChange,
  onOpenItem,
  children,
  presentation,
}: {
  snapshot: StorefrontClientSnapshot
  adapter?: StorefrontCommerceAdapter
  customer?: StorefrontCustomerView
  preview: boolean
  onPageChange?: (key: string) => void
  onOpenItem?: (itemId: string) => void
  children: ReactNode
  presentation: StorefrontFeaturePresentation
}) {
  const navigation = useCommerceNavigation()
  const commerce = snapshot.resources.commerce
  // The host's server-derived flags decide; QA data writes only under local QA
  // preview admission. Studio previews never get a live adapter.
  const live =
    !preview &&
    !!adapter &&
    Boolean(
      commerce?.orderRequests.available ||
        commerce?.customerAccounts.available ||
        snapshot.resources.contact.serviceRequestEntry,
    )
  const effectiveAdapter = live && adapter ? adapter : previewCommerceAdapter
  const facts = storefrontMode({
    offeringCounts: snapshot.resources.catalog.offeringCounts,
    items: snapshot.resources.catalog.items,
  })
  const config = readStorefrontFeatureConfig(snapshot.composition)
  const ordering =
    facts.products > 0 &&
    (preview
      ? !!config?.orders.enabled && config.orders.fulfilment.length > 0
      : !!commerce?.orderRequests.available)
  const accounts =
    !preview &&
    !!commerce?.customerAccounts.available &&
    presentation.details.showLogin
  // Bag is scoped to one business; the slug comes from the verified load.
  const scope = snapshot.resources.business.slug || "storefront"
  const storage = useRef<Storage | null>(null)
  const [bag, setBag] = useState<BagState>({
    lines: [],
    persistence: "storage",
    recovered: false,
  })
  const [bagReady, setBagReady] = useState(false)
  const [bagOpen, setBagOpen] = useState(false)
  useEffect(() => {
    if (preview) {
      setBag({ lines: [], persistence: "memory", recovered: false })
      setBagReady(true)
      return
    }
    storage.current = safeStorage()
    setBag(readBag(storage.current, scope))
    setBagReady(true)
    const sync = (event: StorageEvent) => {
      if (event.key?.endsWith(`:${scope}`))
        setBag(readBag(storage.current, scope))
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [scope, preview])
  const commit = useCallback(
    (lines: BagLine[]) => {
      const persistence = preview
        ? "memory"
        : writeBag(storage.current, scope, lines)
      setBag((current) => ({ ...current, lines, persistence }))
    },
    [scope, preview],
  )
  const addToBag = useCallback(
    (line: BagLine) => {
      try {
        commit(addBagLine(bag.lines, line))
        return null
      } catch (error) {
        return error instanceof Error ? error.message : "Couldn't add this."
      }
    },
    [bag.lines, commit],
  )
  const value = useMemo<StorefrontCommerceContext>(
    () => ({
      snapshot,
      themeStyle: presentation.style,
      adapter: effectiveAdapter,
      customer: customer ?? null,
      header: presentation.details,
      facts,
      ordering,
      accounts,
      preview,
      bag,
      bagReady,
      addToBag,
      setQuantity: (offeringId, quantity) =>
        commit(
          bag.lines.map((line) =>
            line.offeringId === offeringId ? { ...line, quantity } : line,
          ),
        ),
      updateLine: (offeringId, patch) =>
        commit(
          bag.lines.map((line) =>
            line.offeringId === offeringId ? { ...line, ...patch } : line,
          ),
        ),
      removeLine: (offeringId) =>
        commit(bag.lines.filter((line) => line.offeringId !== offeringId)),
      clearBag: () => commit([]),
      bagOpen,
      setBagOpen,
      openItem: (itemId) => {
        if (preview) {
          onOpenItem?.(itemId)
          return
        }
        const url = new URL(window.location.href)
        url.searchParams.set("item", itemId)
        const path = `${url.pathname}${url.search}`
        if (navigation) navigation.navigate(path)
        else window.location.assign(path)
      },
      href: (path) => (preview ? "#" : path),
      refresh: () => navigation?.refresh(),
      refreshing: navigation?.pending ?? false,
      navigate: (path, options) => {
        if (preview) {
          const key = path.replace(/^\//, "").split("?")[0] || "home"
          onPageChange?.(key)
          return
        }
        if (navigation) navigation.navigate(path, options)
        else window.location.assign(path)
      },
    }),
    [
      snapshot,
      presentation,
      effectiveAdapter,
      customer,
      facts,
      ordering,
      accounts,
      preview,
      bag,
      bagReady,
      addToBag,
      commit,
      bagOpen,
      onPageChange,
      onOpenItem,
      navigation,
    ],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}
