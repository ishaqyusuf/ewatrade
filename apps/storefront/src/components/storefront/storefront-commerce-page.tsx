"use client"

import { StorefrontCommercePageProvider } from "@ewatrade/storefront-runtime/commerce/provider"
import { StorefrontFeatureBody } from "@ewatrade/storefront-runtime/features/route"
import {
  CommerceStudioBody,
  CommerceStudioPageProvider,
  type CommerceStudioProps,
} from "@ewatrade/storefront-templates/commerce-studio"
import {
  storefrontFeaturePresentation,
  storefrontSharedDetail,
} from "@ewatrade/storefront-templates/feature-presentation"

export function CommerceStudioPage(props: CommerceStudioProps) {
  return (
    <CommerceStudioPageProvider
      snapshot={props.snapshot}
      customer={props.customer}
    >
      <CommerceStudioBody {...props} />
    </CommerceStudioPageProvider>
  )
}

export function StorefrontSharedPage(props: CommerceStudioProps) {
  return (
    <StorefrontCommercePageProvider
      snapshot={props.snapshot}
      customer={props.customer}
      presentation={storefrontFeaturePresentation(props.snapshot)}
    >
      <StorefrontFeatureBody
        route={props.route}
        detail={storefrontSharedDetail(props.snapshot)}
      />
    </StorefrontCommercePageProvider>
  )
}
