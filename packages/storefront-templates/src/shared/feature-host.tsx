"use client"
import { useState } from "react"

import { StorefrontCommerceProvider } from "@ewatrade/storefront-runtime/commerce/provider"
import { StorefrontFeatureBody } from "@ewatrade/storefront-runtime/features/route"
import type { ReactNode } from "react"
import type { CommerceStudioProps } from "../commerce-studio/render"
import {
  storefrontFeaturePresentation,
  storefrontSharedDetail,
  storefrontUsesFeaturePage,
} from "./feature-presentation"
import { StorefrontFeatureShell } from "./feature-shell"

/** Standalone/Studio renderer host. The live app provides its persistent host. */
export function StorefrontFeatureHost({
  children,
  ...props
}: CommerceStudioProps & { children: ReactNode }) {
  const [itemId, setItemId] = useState<string | null>(null)
  const catalog = props.snapshot.resources.catalog
  const detail =
    [
      ...catalog.items,
      ...(catalog.pinnedItems ?? []),
      ...(catalog.highlightedItem ? [catalog.highlightedItem] : []),
    ].find((item) => item.id === itemId) ??
    storefrontSharedDetail(props.snapshot)
  return (
    <StorefrontCommerceProvider
      snapshot={props.snapshot}
      adapter={props.commerce}
      customer={props.customer}
      preview={Boolean(
        props.draftPreview || props.editing || props.onPageChange,
      )}
      onPageChange={props.onPageChange}
      onOpenItem={setItemId}
      presentation={storefrontFeaturePresentation(props.snapshot)}
    >
      <StorefrontFeatureShell
        onReturn={() => setItemId(null)}
        featurePage={
          !props.editing &&
          (Boolean(detail) ||
            storefrontUsesFeaturePage(props.snapshot, props.route))
        }
      >
        <StorefrontFeatureBody
          route={props.route}
          detail={props.editing ? null : detail}
        >
          {children}
        </StorefrontFeatureBody>
      </StorefrontFeatureShell>
    </StorefrontCommerceProvider>
  )
}
