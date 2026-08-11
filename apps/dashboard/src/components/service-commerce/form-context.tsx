"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import {
  type ServiceCommerceBookingConfiguration,
  type ServiceCommerceCatalogDraftFormValues,
  type ServiceCommerceCatalogGraduationFormValues,
  type ServiceCommerceCatalogPricePromotionFormValues,
  type ServiceCommerceHumanVerifiedObservationDraft,
  serviceCommerceBookingConfigurationFormSchema,
  serviceCommerceCatalogDraftFormSchema,
  serviceCommerceCatalogGraduationFormSchema,
  serviceCommerceCatalogPricePromotionFormSchema,
  serviceCommerceChangeReasonSchema,
  serviceCommerceHumanVerifiedObservationDraftSchema,
  serviceCommerceQuoteReleaseModeSchema,
} from "@ewatrade/service-commerce"
import { useEffect } from "react"
import { FormProvider } from "react-hook-form"
import { z } from "zod"

export type RegisterServiceCommerceFormReset = (reset: () => void) => () => void

export type ServiceCommerceBookingConfigurationFormValues = Omit<
  ServiceCommerceBookingConfiguration,
  "storeId" | "tenantId"
>

export const serviceCommerceQuoteReleaseSettingsFormSchema = z
  .object({
    mode: serviceCommerceQuoteReleaseModeSchema,
    reason: serviceCommerceChangeReasonSchema,
    selectedApproverMembershipIds: z.array(z.string().trim().min(1)).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.mode === "approval_required" &&
      input.selectedApproverMembershipIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one quotation approver.",
        path: ["selectedApproverMembershipIds"],
      })
    }
  })

export type ServiceCommerceQuoteReleaseSettingsFormValues = z.infer<
  typeof serviceCommerceQuoteReleaseSettingsFormSchema
>

const serviceCommerceQuoteDecisionFormSchema = z
  .object({ reason: serviceCommerceChangeReasonSchema })
  .strict()
export type ServiceCommerceQuoteDecisionFormValues = z.infer<
  typeof serviceCommerceQuoteDecisionFormSchema
>

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

export function ServiceCommerceCatalogGraduationFormProvider({
  children,
  registerReset,
}: {
  children: React.ReactNode
  registerReset: RegisterServiceCommerceFormReset
}) {
  const form = useZodForm<ServiceCommerceCatalogGraduationFormValues>(
    serviceCommerceCatalogGraduationFormSchema,
    {
      defaultValues: {
        barcode: "",
        canonicalUnitName: "Unit",
        canonicalUnitSymbol: "",
        category: "",
        clientOperationId: "pending",
        confirmed: true,
        currencyCode: "NGN",
        draftKind: "product",
        expectedOfferingRevision: 0,
        fixedPriceMinor: 0,
        openingStockQuantity: "0",
        offeringId: "pending",
        reason: "",
        sku: "",
        transactionScale: 0,
        variantName: "",
      },
      mode: "onChange",
    },
  )
  useRegisteredFormReset(form.reset, registerReset)
  return <FormProvider {...form}>{children}</FormProvider>
}

export function ServiceCommerceQuoteReleaseSettingsFormProvider({
  children,
  registerReset,
}: {
  children: React.ReactNode
  registerReset: RegisterServiceCommerceFormReset
}) {
  const form = useZodForm<ServiceCommerceQuoteReleaseSettingsFormValues>(
    serviceCommerceQuoteReleaseSettingsFormSchema,
    {
      defaultValues: {
        mode: "attendant_can_release",
        reason: "Configure quotation release",
        selectedApproverMembershipIds: [],
      },
      mode: "onChange",
    },
  )
  useRegisteredFormReset(form.reset, registerReset)
  return <FormProvider {...form}>{children}</FormProvider>
}

export function ServiceCommerceQuoteDecisionFormProvider({
  children,
  registerReset,
}: {
  children: React.ReactNode
  registerReset: RegisterServiceCommerceFormReset
}) {
  const form = useZodForm<ServiceCommerceQuoteDecisionFormValues>(
    serviceCommerceQuoteDecisionFormSchema,
    {
      defaultValues: { reason: "" },
      mode: "onChange",
    },
  )
  useRegisteredFormReset(form.reset, registerReset)
  return <FormProvider {...form}>{children}</FormProvider>
}

export function ServiceCommerceBookingConfigurationFormProvider({
  children,
  registerReset,
}: {
  children: React.ReactNode
  registerReset: RegisterServiceCommerceFormReset
}) {
  const form = useZodForm<ServiceCommerceBookingConfigurationFormValues>(
    serviceCommerceBookingConfigurationFormSchema,
    {
      defaultValues: {
        availabilityRules: [],
        bookingHorizonMinutes: 43_200,
        cancellationPolicy: {
          allowedUntilMinutesBeforeStart: 1_440,
          refundPolicy: "manual_review",
          revision: 0,
        },
        exceptions: [],
        holdDurationMinutes: 15,
        leadTimeMinutes: 60,
        offeringId: "",
        paymentPolicy: {
          depositMinor: null,
          requirement: "none",
          revision: 0,
        },
        reminderLeadMinutes: 1_440,
        resources: [],
        slotDurationMinutes: 30,
        timezone: "Africa/Lagos",
      },
      mode: "onChange",
    },
  )
  useRegisteredFormReset(form.reset, registerReset)
  return <FormProvider {...form}>{children}</FormProvider>
}
