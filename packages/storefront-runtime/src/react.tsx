"use client"

import { type ReactNode, createContext, useContext, useMemo } from "react"
import {
  type StorefrontAction,
  type StorefrontActionAdapter,
  createPreviewActionAdapter,
  storefrontActionAllowed,
} from "../../storefront-contracts/src/actions"
import type { StorefrontCapability } from "../../storefront-contracts/src/manifest"
import type { StorefrontClientSnapshot } from "./server"

type RuntimeValue = {
  snapshot: StorefrontClientSnapshot
  act: StorefrontActionAdapter
}
const RuntimeContext = createContext<RuntimeValue | null>(null)

/**
 * `onAction` is a host server action wrapping `handleStorefrontAction`. Preview
 * never calls it, and the server rechecks scope and capabilities anyway.
 */
export function StorefrontRuntimeProvider({
  snapshot,
  onAction,
  children,
}: {
  snapshot: StorefrontClientSnapshot
  onAction: StorefrontActionAdapter
  children: ReactNode
}) {
  const value = useMemo<RuntimeValue>(
    () => ({
      snapshot,
      act:
        snapshot.mode === "preview" ? createPreviewActionAdapter() : onAction,
    }),
    [snapshot, onAction],
  )
  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  )
}

function useRuntime() {
  const value = useContext(RuntimeContext)
  if (!value)
    throw new Error("Storefront hooks need StorefrontRuntimeProvider.")
  return value
}

export function useStorefrontContext() {
  const { mode, locale, currencyCode, resources } = useRuntime().snapshot
  return { mode, locale, currencyCode, business: resources.business }
}

export const useStorefrontTheme = () => useRuntime().snapshot.composition.theme

export function useStorefrontAsset(id: string | null) {
  const { assets } = useRuntime().snapshot.resources
  return id ? (assets[id] ?? null) : null
}

export const useStorefrontCatalog = () =>
  useRuntime().snapshot.resources.catalog
export const useStorefrontContact = () =>
  useRuntime().snapshot.resources.contact

/** Current options, prices and availability for one item, from the load only. */
export function useOfferingOptions(itemId: string) {
  const { items, highlightedItem } = useRuntime().snapshot.resources.catalog
  const item =
    items.find((entry) => entry.id === itemId) ??
    (highlightedItem?.id === itemId ? highlightedItem : null)
  return item?.options ?? []
}

export const useStorefrontCapability = (capability: StorefrontCapability) =>
  useRuntime().snapshot.capabilities[capability]

/**
 * `allowed` only controls presentation (previews show what live would offer);
 * the server decides any effect.
 */
export function useStorefrontAction() {
  const { snapshot, act } = useRuntime()
  return {
    allowed: (action: StorefrontAction) =>
      storefrontActionAllowed("live", snapshot.capabilities, action),
    run: act,
  }
}
