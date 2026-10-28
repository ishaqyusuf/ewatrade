"use client"

import type { PublicCatalogItem } from "@ewatrade/storefront-contracts/resources"
import type { StorefrontRoute } from "@ewatrade/storefront-contracts/routes"
import type { ReactNode } from "react"
import { StorefrontAccount } from "./account/account"
import { StorefrontCheckout } from "./checkout"
import { ProductDetail } from "./product"
import { StorefrontReceipt } from "./receipt/receipt"
import { ServiceDetail } from "./service"

export function StorefrontFeatureBody({
  route,
  detail,
  children,
}: {
  route?: StorefrontRoute
  detail?: PublicCatalogItem | null
  children?: ReactNode
}) {
  if (route?.kind === "account")
    return <StorefrontAccount account={route.account} />
  if (route?.kind === "checkout") return <StorefrontCheckout />
  if (route?.kind === "receipt")
    return <StorefrontReceipt receipt={route.receipt} />
  if (detail?.kind === "PRODUCT") return <ProductDetail item={detail} />
  if (detail?.kind === "SERVICE") return <ServiceDetail item={detail} />
  return children
}
