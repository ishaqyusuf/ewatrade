"use client"

import type { ReactNode } from "react"
import { useStorefrontCommerce } from "../commerce/provider"

/** Trusted presentation follows the feature into any template and its portals. */
export function StorefrontFeatureFrame({ children }: { children: ReactNode }) {
  const { snapshot, themeStyle } = useStorefrontCommerce()
  return (
    <div
      className="sf-feature-root"
      data-font={snapshot.composition.theme.font}
      data-density={snapshot.composition.theme.density ?? "comfortable"}
      style={themeStyle}
    >
      {children}
    </div>
  )
}
