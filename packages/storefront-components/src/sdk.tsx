"use client"

import type { StorefrontAction } from "@ewatrade/storefront-contracts/actions"
import type { CSSProperties, ReactNode } from "react"
import { useComponentHost } from "./context"
import type { ComponentInput } from "./contracts"

/** Public presentation props only; dispatch and trusted input stay in private context. */
export type ComponentProps = ComponentInput
export function ComponentFrame({ children }: { children: ReactNode }) {
  const { input } = useComponentHost()
  const style = {
    "--sf-component-accent": input.theme.accent,
    "--sf-component-background": input.theme.background,
    "--sf-component-font":
      input.theme.font === "serif" ? "Georgia, serif" : "system-ui, sans-serif",
    "--sf-component-radius": { none: "0", small: "6px", rounded: "20px" }[
      input.theme.radius
    ],
    "--sf-component-space-1": "4px",
    "--sf-component-space-2": "8px",
    "--sf-component-space-3": "16px",
    "--sf-component-space-4": "24px",
  } as CSSProperties
  return (
    <section className={`sf-component-${input.componentKey}`} style={style}>
      {children}
    </section>
  )
}
export function ComponentText({ children }: { children: ReactNode }) {
  return <span>{children}</span>
}
export function ComponentAsset({ assetId }: { assetId: string | null }) {
  const { input } = useComponentHost()
  const asset = assetId ? input.data.assets[assetId] : null
  return asset ? <img src={asset.url} alt={asset.alt} loading="lazy" /> : null
}
export function ComponentAction({
  action,
  children,
}: {
  action: StorefrontAction
  children: ReactNode
}) {
  const { input } = useComponentHost()
  const index = input.actions.findIndex(
    (value) => JSON.stringify(value) === JSON.stringify(action),
  )
  return (
    <button
      type="button"
      disabled={index < 0}
      data-sf-action-index={index < 0 ? undefined : index}
    >
      {children}
    </button>
  )
}
