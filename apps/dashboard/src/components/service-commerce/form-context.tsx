"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import {
  type ServiceCommerceCatalogDraftFormValues,
  type ServiceCommerceCatalogPricePromotionFormValues,
  type ServiceCommerceHumanVerifiedObservationDraft,
  serviceCommerceCatalogDraftFormSchema,
  serviceCommerceCatalogPricePromotionFormSchema,
  serviceCommerceHumanVerifiedObservationDraftSchema,
} from "@ewatrade/service-commerce"
import { useEffect } from "react"
import { FormProvider } from "react-hook-form"

export type RegisterServiceCommerceFormReset = (reset: () => void) => () => void

function useRegisteredFormReset(
  reset: () => void,
  registerReset: RegisterServiceCommerceFormReset,
) {
  useEffect(() => {
    const unregister = registerReset(reset)
    return () => {
      unregister()
      reset()
    }
  }, [registerReset, reset])
}

export function ServiceCommerceObservationFormProvider({
  children,
  registerReset,
}: {
  children: React.ReactNode
  registerReset: RegisterServiceCommerceFormReset
}) {
  const form = useZodForm<ServiceCommerceHumanVerifiedObservationDraft>(
    serviceCommerceHumanVerifiedObservationDraftSchema,
    {
      defaultValues: { attributes: [], displayLabel: "" },
      mode: "onChange",
    },
  )
  useRegisteredFormReset(form.reset, registerReset)
  return <FormProvider {...form}>{children}</FormProvider>
}

export function ServiceCommerceCatalogFormProvider({
  children,
  registerReset,
}: {
  children: React.ReactNode
  registerReset: RegisterServiceCommerceFormReset
}) {
  const form = useZodForm<ServiceCommerceCatalogDraftFormValues>(
    serviceCommerceCatalogDraftFormSchema,
    {
      defaultValues: { name: "", verifiedAlias: "" },
      mode: "onChange",
    },
  )
  useRegisteredFormReset(form.reset, registerReset)
  return <FormProvider {...form}>{children}</FormProvider>
}

export function ServiceCommerceCatalogPriceFormProvider({
  children,
  registerReset,
}: {
  children: React.ReactNode
  registerReset: RegisterServiceCommerceFormReset
}) {
  const form = useZodForm<ServiceCommerceCatalogPricePromotionFormValues>(
    serviceCommerceCatalogPricePromotionFormSchema,
    {
      defaultValues: { confirmed: false, reason: "" },
      mode: "onChange",
    },
  )
  useRegisteredFormReset(form.reset, registerReset)
  return <FormProvider {...form}>{children}</FormProvider>
}
