"use client"

import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import {
  type CSSProperties,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { SectionInstance } from "../../../storefront-contracts/src/manifest"
import {
  type BagLine,
  type BagState,
  type StorefrontCommerceAdapter,
  type StorefrontCustomerView,
  accentInk,
  addBagLine,
  previewCommerceAdapter,
  readBag,
  readableOn,
  storefrontMode,
  writeBag,
} from "./commerce"

export type HeaderSettings = {
  tagline: string
  location: string
  hours: string
  offerPickup: boolean
  offerDelivery: boolean
  deliveryNote: string
  showLogin: boolean
}

export function headerSettings(
  composition: StorefrontClientSnapshot["composition"],
): HeaderSettings {
  const header = composition.pages
    .flatMap((page) => page.sections)
    .find((section) => section.type === "commerce-studio-header")
  const value = (key: string) => String(header?.settings[key] ?? "").trim()
  return {
    tagline: value("tagline"),
    location: value("location"),
    hours: value("hours"),
    offerPickup: header?.settings["offer-pickup"] !== false,
    offerDelivery: header?.settings["offer-delivery"] === true,
    deliveryNote: value("delivery-note"),
    showLogin: header?.settings["show-login"] !== false,
  }
}

/** Merchant theme as CSS variables; applied to the store root and to portals (sheets, dialogs). */
export function commerceThemeStyle(
  theme: StorefrontClientSnapshot["composition"]["theme"],
) {
  return {
    "--cs-accent": theme.accent,
    "--cs-on-accent": readableOn(theme.accent),
    "--cs-accent-ink": accentInk(theme.accent, theme.background),
    "--cs-paper": theme.background,
    "--cs-radius":
      theme.radius === "none"
        ? "0px"
        : theme.radius === "rounded"
          ? "14px"
          : "6px",
    "--cs-width":
      theme.width === "narrow"
        ? "1040px"
        : theme.width === "wide"
          ? "1440px"
          : "1240px",
  } as CSSProperties
}

export type CommerceStudioContext = {
  snapshot: StorefrontClientSnapshot
  themeStyle: CSSProperties
  adapter: StorefrontCommerceAdapter
  customer: StorefrontCustomerView
  header: HeaderSettings
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
  href(path: string): string
  navigate(path: string): void
}

const Context = createContext<CommerceStudioContext | null>(null)

export function useCommerceStudio() {
  const value = useContext(Context)
  if (!value) throw new Error("Commerce studio context is missing.")
  return value
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

export function CommerceStudioProvider({
  snapshot,
  adapter,
  customer,
  preview,
  onPageChange,
  children,
}: {
  snapshot: StorefrontClientSnapshot
  adapter?: StorefrontCommerceAdapter
  customer?: StorefrontCustomerView
  preview: boolean
  onPageChange?: (key: string) => void
  children: ReactNode
}) {
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
  const ordering =
    facts.products > 0 && (preview || !!commerce?.orderRequests.available)
  const accounts =
    !preview &&
    !!commerce?.customerAccounts.available &&
    headerSettings(snapshot.composition).showLogin
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
  const value = useMemo<CommerceStudioContext>(
    () => ({
      snapshot,
      themeStyle: commerceThemeStyle(snapshot.composition.theme),
      adapter: effectiveAdapter,
      customer: customer ?? null,
      header: headerSettings(snapshot.composition),
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
      href: (path) => (preview ? "#" : path),
      navigate: (path) => {
        if (preview) {
          const key = path.replace(/^\//, "").split("?")[0] || "home"
          onPageChange?.(key)
          return
        }
        window.location.assign(path)
      },
    }),
    [
      snapshot,
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
    ],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function sectionText(
  section: SectionInstance,
  key: string,
  fallback = "",
) {
  const value = section.settings[key]
  return typeof value === "string" && value.trim() ? value : fallback
}
