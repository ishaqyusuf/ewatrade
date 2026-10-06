"use client"
import { useZodForm } from "@/hooks/use-zod-form"
import {
  type ReceiptSettings,
  receiptSettingsSchema,
} from "@ewatrade/order-receipts"
import type { ReactNode } from "react"
import { FormProvider } from "react-hook-form"

export function ReceiptSettingsFormContext({
  settings,
  children,
}: { settings: ReceiptSettings; children: ReactNode }) {
  const form = useZodForm<ReceiptSettings>(receiptSettingsSchema, {
    defaultValues: settings,
    mode: "onChange",
  })
  return <FormProvider {...form}>{children}</FormProvider>
}
