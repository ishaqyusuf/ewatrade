"use client"

import { commerceThemeStyle, headerSettings } from "./presentation"
export { headerSettings, commerceThemeStyle } from "./presentation"

import type { SectionInstance } from "@ewatrade/storefront-contracts/manifest"

import {
  StorefrontCommercePageProvider,
  StorefrontCommerceProvider,
} from "@ewatrade/storefront-runtime/commerce/provider"
import type { StorefrontDetails as HeaderSettings } from "@ewatrade/storefront-runtime/feature-theme"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import type { ComponentProps } from "react"
export { useStorefrontCommerce as useCommerceStudio } from "@ewatrade/storefront-runtime/commerce/provider"
export type { StorefrontCommerceContext as CommerceStudioContext } from "@ewatrade/storefront-runtime/commerce/provider"
export type { StorefrontDetails as HeaderSettings } from "@ewatrade/storefront-runtime/feature-theme"

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
