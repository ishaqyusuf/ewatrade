"use client"

import { StorefrontCommercePageProvider } from "@ewatrade/storefront-runtime/commerce/provider"
import { CommerceStudioPageContent } from "@ewatrade/storefront-templates/commerce-studio/body"
import { CommerceStudioPageProvider } from "@ewatrade/storefront-templates/commerce-studio/context"
import type { CommerceStudioProps } from "@ewatrade/storefront-templates/commerce-studio/types"
import {
  storefrontFeaturePresentation,
  storefrontSharedDetail,
} from "@ewatrade/storefront-templates/feature-presentation"
import dynamic from "next/dynamic"
import { StorefrontLoading } from "./storefront-loading"

const loading = () => <StorefrontLoading />
const Account = dynamic(
  () =>
    import("@ewatrade/storefront-runtime/features/account").then(
      (module) => module.StorefrontAccount,
    ),
  { loading },
)
const Checkout = dynamic(
  () =>
    import("@ewatrade/storefront-runtime/features/checkout").then(
      (module) => module.StorefrontCheckout,
    ),
  { loading },
)
const Receipt = dynamic(
  () =>
    import("@ewatrade/storefront-runtime/features/receipt").then(
      (module) => module.StorefrontReceipt,
    ),
  { loading },
)
const Product = dynamic(
  () =>
    import("@ewatrade/storefront-runtime/features/product").then(
      (module) => module.ProductDetail,
    ),
  { loading },
)
const Service = dynamic(
  () =>
    import("@ewatrade/storefront-runtime/features/service").then(
      (module) => module.ServiceDetail,
    ),
  { loading },
)

/** SSR stays enabled. Only the selected journey mounts; the persistent bag owner stays above it. */
function FeaturePage(props: CommerceStudioProps) {
  if (props.route?.kind === "account")
    return <Account account={props.route.account} />
  if (props.route?.kind === "checkout") return <Checkout />
  if (props.route?.kind === "receipt")
    return <Receipt receipt={props.route.receipt} />
  const detail =
    props.snapshot.composition.template.key === "commerce-studio"
      ? props.snapshot.resources.catalog.highlightedItem
      : storefrontSharedDetail(props.snapshot)
  if (detail?.kind === "PRODUCT") return <Product item={detail} />
  if (detail?.kind === "SERVICE") return <Service item={detail} />
  return props.snapshot.composition.template.key === "commerce-studio" ? (
    <CommerceStudioPageContent {...props} />
  ) : null
}

export function CommerceStudioPage(props: CommerceStudioProps) {
  return (
    <CommerceStudioPageProvider
      snapshot={props.snapshot}
      customer={props.customer}
    >
      <FeaturePage {...props} />
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
      <FeaturePage {...props} />
    </StorefrontCommercePageProvider>
  )
}
