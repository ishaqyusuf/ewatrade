"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"

import { CatalogDraftForm } from "./catalog-adoption/catalog-draft-form"
import { CatalogPricePromotionForm } from "./catalog-adoption/catalog-price-promotion-form"
import {
  type RegisterServiceCommerceFormReset,
  ServiceCommerceCatalogFormProvider,
  ServiceCommerceCatalogPriceFormProvider,
} from "./form-context"
import { SERVICE_COMMERCE_CONTROLLERS } from "./service-commerce-controllers"

export function ServiceCommerceSheetContent({
  registerFormReset,
  storeId,
}: {
  registerFormReset: RegisterServiceCommerceFormReset
  storeId: string
}) {
  const params = useServiceCommerceParams()
  const mode = params.serviceCommerceSheet
  if (!mode) return null
  const controller = SERVICE_COMMERCE_CONTROLLERS[mode]
  if (!controller.implemented) {
    return <Unavailable message={controller.description} />
  }
  const missing = controller.requiredIds.some((id) => !params[id])
  if (missing || mode !== "catalog_draft") {
    return (
      <Unavailable message="This link is incomplete, stale, or no longer authorized." />
    )
  }
  const sourceKey = `${params.sourceKind}:${params.sourceId}:${params.sourceLineId}`
  return (
    <div className="grid gap-8">
      <ServiceCommerceCatalogFormProvider
        key={sourceKey}
        registerReset={registerFormReset}
      >
        <CatalogDraftForm storeId={storeId} />
      </ServiceCommerceCatalogFormProvider>
      {params.quoteId ? (
        <ServiceCommerceCatalogPriceFormProvider
          key={`${sourceKey}:${params.quoteId}`}
          registerReset={registerFormReset}
        >
          <CatalogPricePromotionForm storeId={storeId} />
        </ServiceCommerceCatalogPriceFormProvider>
      ) : null}
    </div>
  )
}

function Unavailable({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  )
}
