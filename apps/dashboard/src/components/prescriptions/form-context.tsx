"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import {
  type PrescriptionStaffIntakeFormValues,
  prescriptionStaffIntakeFormSchema,
} from "@ewatrade/prescriptions/schemas"
import { FormProvider, useForm } from "react-hook-form"

export type PrescriptionIntakeFormValues = PrescriptionStaffIntakeFormValues

export type PrescriptionWorkspaceFormValues = {
  clearerReason: string
  lineMapping: Record<
    string,
    {
      availability:
        | "available"
        | "declined"
        | "partial"
        | "restricted"
        | "unavailable"
      customerWording: string
      isAlternative: boolean
      offeringId: string
      quantity: string
    }
  >
  prices: Record<string, string>
  revisionText: string
  verifiedText: Record<string, string>
}

export function PrescriptionFormContext({
  children,
}: {
  children: React.ReactNode
}) {
  const form = useZodForm<PrescriptionIntakeFormValues>(
    prescriptionStaffIntakeFormSchema,
    {
      defaultValues: {
        consentAccepted: true,
        consentVersion: "2026-08-08",
        customerEmail: "",
        customerName: "",
        customerPhone: "",
        fulfilmentPreference: "pickup",
        manualIntakeText: "",
        source: "staff_walk_in",
      },
      mode: "onChange",
    },
  )
  return <FormProvider {...form}>{children}</FormProvider>
}

export function PrescriptionWorkspaceFormContext({
  children,
}: {
  children: React.ReactNode
}) {
  const form = useForm<PrescriptionWorkspaceFormValues>({
    defaultValues: {
      clearerReason: "",
      lineMapping: {},
      prices: {},
      revisionText: "",
      verifiedText: {},
    },
    mode: "onChange",
  })
  return <FormProvider {...form}>{children}</FormProvider>
}
