"use client"

import { readStorefrontFeatureConfig } from "@ewatrade/storefront-contracts/features"

import type { SectionInstance } from "@ewatrade/storefront-contracts/manifest"
import {
  accentInk,
  readableOn,
} from "@ewatrade/storefront-runtime/commerce/model"
import {
  StorefrontCommercePageProvider,
  StorefrontCommerceProvider,
} from "@ewatrade/storefront-runtime/commerce/provider"
import {
  type StorefrontDetails as HeaderSettings,
  storefrontFeatureTokens,
} from "@ewatrade/storefront-runtime/feature-theme"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import type { CSSProperties, ComponentProps } from "react"
export { useStorefrontCommerce as useCommerceStudio } from "@ewatrade/storefront-runtime/commerce/provider"
export type { StorefrontCommerceContext as CommerceStudioContext } from "@ewatrade/storefront-runtime/commerce/provider"
export type { StorefrontDetails as HeaderSettings } from "@ewatrade/storefront-runtime/feature-theme"

export function headerSettings(
  composition: StorefrontClientSnapshot["composition"],
): HeaderSettings {
  const header = composition.pages
    .flatMap((page) => page.sections)
    .find((section) => section.type === "commerce-studio-header")
  const value = (key: string) => String(header?.settings[key] ?? "").trim()
  const features =
    composition.schemaVersion === 2
      ? readStorefrontFeatureConfig(composition)
      : null
  return {
    tagline: value("tagline"),
    location: value("location"),
    hours: value("hours"),
    offerPickup: features
      ? features.orders.fulfilment.includes("pickup")
      : header?.settings["offer-pickup"] !== false,
    offerDelivery: features
      ? features.orders.fulfilment.includes("delivery")
      : header?.settings["offer-delivery"] === true,
    deliveryNote: value("delivery-note"),
    showLogin: header?.settings["show-login"] !== false,
  }
}

/** Merchant theme as CSS variables; applied to the store root and to portals (sheets, dialogs). */
export function commerceThemeStyle(
  theme: StorefrontClientSnapshot["composition"]["theme"],
) {
  return {
    ...storefrontFeatureTokens(theme),
    "--sf-feature-font-body":
      '"CS Sans", "Helvetica Neue", Arial, system-ui, sans-serif',
    "--sf-feature-font-heading":
      theme.font === "serif"
        ? '"CS Display", "Iowan Old Style", Georgia, serif'
        : '"CS Sans", "Helvetica Neue", Arial, system-ui, sans-serif',

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

function presentation(snapshot: StorefrontClientSnapshot) {
  return {
    details: headerSettings(snapshot.composition),
    style: commerceThemeStyle(snapshot.composition.theme),
  }
}
export function CommerceStudioProvider(
  props: Omit<
    ComponentProps<typeof StorefrontCommerceProvider>,
    "presentation"
  >,
) {
  return (
    <StorefrontCommerceProvider
      {...props}
      presentation={presentation(props.snapshot)}
    />
  )
}
export function CommerceStudioPageProvider(
  props: Omit<
    ComponentProps<typeof StorefrontCommercePageProvider>,
    "presentation"
  >,
) {
  return (
    <StorefrontCommercePageProvider
      {...props}
      presentation={presentation(props.snapshot)}
    />
  )
}

export function sectionText(
  section: SectionInstance,
  key: string,
  fallback = "",
) {
  const value = section.settings[key]
  return typeof value === "string" && value.trim() ? value : fallback
}
