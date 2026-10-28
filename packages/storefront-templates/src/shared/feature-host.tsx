"use client"

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
  return (
    <StorefrontCommerceProvider
      snapshot={props.snapshot}
      adapter={props.commerce}
      customer={props.customer}
      preview={Boolean(
        props.draftPreview || props.editing || props.onPageChange,
      )}
      onPageChange={props.onPageChange}
      presentation={storefrontFeaturePresentation(props.snapshot)}
    >
      <StorefrontFeatureShell
        featurePage={
          !props.editing &&
          storefrontUsesFeaturePage(props.snapshot, props.route)
        }
      >
        <StorefrontFeatureBody
          route={props.route}
          detail={props.editing ? null : storefrontSharedDetail(props.snapshot)}
        >
          {children}
        </StorefrontFeatureBody>
      </StorefrontFeatureShell>
    </StorefrontCommerceProvider>
  )
}
