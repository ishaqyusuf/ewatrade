import type { StorefrontComposition } from "@ewatrade/storefront-contracts/manifest"
import type { CSSProperties } from "react"
import { accentInk, readableOn } from "./commerce/model"

export type StorefrontDetails = {
  tagline: string
  location: string
  hours: string
  offerPickup: boolean
  offerDelivery: boolean
  deliveryNote: string
  showLogin: boolean
}
export type StorefrontFeaturePresentation = {
  details: StorefrontDetails
  style: CSSProperties
}

/** Semantic tokens are scoped to a feature root and repeated on portalled surfaces. */
export function storefrontFeatureTokens(
  theme: StorefrontComposition["theme"],
): CSSProperties {
  const text = readableOn(theme.background)
  return {
    "--sf-feature-background": theme.background,
    "--sf-feature-surface": `color-mix(in oklab, ${theme.background} 70%, #ffffff)`,
    "--sf-feature-text": text,
    "--sf-feature-text-secondary": text,
    "--sf-feature-muted": accentInk("#5a645e", theme.background),
    "--sf-feature-border-strong": `color-mix(in oklab, ${text} 28%, transparent)`,
    "--sf-feature-accent-ink": accentInk(theme.accent, theme.background),
    "--sf-feature-border": `color-mix(in oklab, ${text} 14%, transparent)`,
    "--sf-feature-accent": theme.accent,
    "--sf-feature-on-accent": readableOn(theme.accent),
    "--sf-feature-radius":
      theme.radius === "none"
        ? "0px"
        : theme.radius === "rounded"
          ? "14px"
          : "6px",
    "--sf-feature-content-width":
      theme.width === "narrow"
        ? "1040px"
        : theme.width === "wide"
          ? "1440px"
          : "1240px",
    "--sf-feature-spacing": theme.density === "compact" ? "18px" : "28px",
    "--sf-feature-font-body": "system-ui, sans-serif",
    "--sf-feature-font-heading":
      theme.font === "serif" ? "Georgia, serif" : "system-ui, sans-serif",
  } as CSSProperties
}
