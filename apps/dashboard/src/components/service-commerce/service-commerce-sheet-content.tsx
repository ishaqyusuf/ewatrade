"use client"

import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"

import { CustomerChannelSheetContent } from "@/components/customer-channels/customer-channel-sheet-content"
import { BookingWorkspace } from "./booking/booking-workspace"
import { CatalogDraftForm } from "./catalog-adoption/catalog-draft-form"
import { CatalogGraduationForm } from "./catalog-adoption/catalog-graduation-form"
import { CatalogPricePromotionForm } from "./catalog-adoption/catalog-price-promotion-form"
import {
  type RegisterServiceCommerceFormReset,
  ServiceCommerceCatalogFormProvider,
  ServiceCommerceCatalogGraduationFormProvider,
  ServiceCommerceCatalogPriceFormProvider,
  ServiceCommerceObservationFormProvider,
  ServiceCommerceQuoteDecisionFormProvider,
  ServiceCommerceQuoteReleaseSettingsFormProvider,
} from "./form-context"
import { MediaViewer } from "./media/media-viewer"
import { ObservationForm } from "./media/observation-form"
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
  if (missing) {
    return (
      <Unavailable message="This link is incomplete, stale, or no longer authorized." />
    )
  }
  if (
    mode === "availability" ||
    mode === "connection" ||
    mode === "conversation_mode" ||
    mode === "team" ||
    mode === "entry_point" ||
    mode === "quote_policy" ||
    mode === "quote_approval"
  ) {
    const channelContent = (
      <CustomerChannelSheetContent
        mode={mode}
        registerFormReset={registerFormReset}
        storeId={storeId}
      />
    )
    if (mode === "quote_policy") {
      return (
        <ServiceCommerceQuoteReleaseSettingsFormProvider
          registerReset={registerFormReset}
        >
          {channelContent}
        </ServiceCommerceQuoteReleaseSettingsFormProvider>
      )
    }
    if (mode === "quote_approval") {
      return (
        <ServiceCommerceQuoteDecisionFormProvider
          key={params.quoteApprovalId}
          registerReset={registerFormReset}
        >
          {channelContent}
        </ServiceCommerceQuoteDecisionFormProvider>
      )
    }
    return channelContent
  }
  if (mode === "media") {
    return <MediaViewer storeId={storeId} />
  }
  if (mode === "booking") {
    return (
      <BookingWorkspace
        registerFormReset={registerFormReset}
        storeId={storeId}
      />
    )
  }
  if (mode === "attachment_review") {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <MediaViewer storeId={storeId} />
        <ServiceCommerceObservationFormProvider
          registerReset={registerFormReset}
        >
          <ObservationForm storeId={storeId} />
        </ServiceCommerceObservationFormProvider>
      </div>
    )
  }
  if (mode === "inventory_graduation") {
    return (
      <ServiceCommerceCatalogGraduationFormProvider
        key={params.offeringId}
        registerReset={registerFormReset}
      >
        <CatalogGraduationForm storeId={storeId} />
      </ServiceCommerceCatalogGraduationFormProvider>
    )
  }
  if (mode !== "catalog_draft") {
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
