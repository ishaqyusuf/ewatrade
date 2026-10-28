"use client"

import { CommerceAccount } from "./account"
import { CommerceStudioPageContent } from "./body"
import { CommerceCheckout } from "./checkout"
import { CommerceStudioProvider } from "./context"
import { ProductDetail } from "./product"
import { CommerceReceipt } from "./receipt"
import { ServiceDetail } from "./service"
import { CommerceStudioShell } from "./shell"
import type { CommerceStudioProps } from "./types"
export type { CommerceStudioProps, CommerceStudioRoute } from "./types"
export {
  CommerceStudioSectionPreview,
  featuredItems,
  chosenPhotoItem,
  ProductGrid,
  servicePriceLabel,
} from "./body"

export function CommerceStudio(props: CommerceStudioProps) {
  const { snapshot } = props
  const preview = Boolean(
    props.editing || props.onPageChange || props.draftPreview,
  )
  return (
    <CommerceStudioProvider
      snapshot={snapshot}
      adapter={props.commerce}
      customer={props.customer}
      preview={preview}
      onPageChange={props.onPageChange}
    >
      <CommerceStudioShell
        current={
          props.route && props.route.kind !== "page"
            ? props.route.kind
            : !props.editing && snapshot.resources.catalog.highlightedItem
              ? snapshot.resources.catalog.highlightedItem.kind === "SERVICE"
                ? "services"
                : "shop"
              : (props.pageKey ?? "home")
        }
        routeKind={props.route?.kind}
      >
        <CommerceStudioBody {...props} />
      </CommerceStudioShell>
    </CommerceStudioProvider>
  )
}

export function CommerceStudioBody(props: CommerceStudioProps) {
  const { snapshot, route } = props
  if (route?.kind === "checkout") return <CommerceCheckout />
  if (route?.kind === "receipt")
    return <CommerceReceipt receipt={route.receipt} />
  if (route?.kind === "account")
    return <CommerceAccount account={route.account} />
  const detail = props.editing
    ? null
    : snapshot.resources.catalog.highlightedItem
  if (detail?.kind === "PRODUCT") return <ProductDetail item={detail} />
  if (detail?.kind === "SERVICE") return <ServiceDetail item={detail} />
  return <CommerceStudioPageContent {...props} />
}
