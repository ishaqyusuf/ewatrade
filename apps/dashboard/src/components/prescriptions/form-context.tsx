"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import {
  type PrescriptionStaffIntakeFormValues,
  prescriptionStaffIntakeFormSchema,
} from "@ewatrade/prescriptions/schemas"
import { FormProvider } from "react-hook-form"

export type PrescriptionIntakeFormValues = PrescriptionStaffIntakeFormValues

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
