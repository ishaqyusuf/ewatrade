"use client"

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import { useZodForm } from "@/hooks/use-zod-form"
import { type ProductUsage, productUsages } from "@ewatrade/utils/product-usage"
import { FormProvider, useWatch } from "react-hook-form"
import { z } from "zod"

export type SimpleCatalogItemKind = "product" | "service"

export type SimpleCatalogItemFormState = {
  description: string
  kind: SimpleCatalogItemKind | null
  name: string
  openingStockQuantity: string
  price: string
  unitName: string
  usage: ProductUsage
}

type CatalogItemFormContextValue = {
  validate: () => Promise<string | null>
  form: SimpleCatalogItemFormState
  setForm: Dispatch<SetStateAction<SimpleCatalogItemFormState>>
  showDescription: boolean
  setShowDescription: Dispatch<SetStateAction<boolean>>
  showOpeningStock: boolean
  setShowOpeningStock: Dispatch<SetStateAction<boolean>>
}

const CatalogItemFormContext =
  createContext<CatalogItemFormContextValue | null>(null)

const initialForm: SimpleCatalogItemFormState = {
  description: "",
  kind: null,
  name: "",
  openingStockQuantity: "",
  price: "",
  unitName: "",
  usage: "FOR_SALE",
}

export const catalogItemFormSchema = z.object({
  kind: z.enum(["product", "service"]).nullable(),
  name: z.string().trim().min(1, "Enter an item name."),
  description: z.string(),
  openingStockQuantity: z.string(),
  price: z.string(),
  unitName: z.string(),
  usage: z.enum(productUsages),
})

export function CatalogItemFormProvider({
  children,
  initialKind = null,
}: { children: ReactNode; initialKind?: SimpleCatalogItemKind | null }) {
  const methods = useZodForm<SimpleCatalogItemFormState>(
    catalogItemFormSchema,
    {
      defaultValues: { ...initialForm, kind: initialKind },
    },
  )
  const watched = useWatch({ control: methods.control })
  const form = useMemo<SimpleCatalogItemFormState>(
    () => ({ ...initialForm, ...watched }),
    [watched],
  )
  const setForm: Dispatch<SetStateAction<SimpleCatalogItemFormState>> =
    useCallback(
      (update) => {
        const next =
          typeof update === "function" ? update(methods.getValues()) : update
        for (const key of Object.keys(
          initialForm,
        ) as (keyof SimpleCatalogItemFormState)[]) {
          methods.setValue(key, next[key], { shouldDirty: true })
        }
      },
      [methods],
    )
  const validate = useCallback(async () => {
    if (await methods.trigger()) return null
    return (
      methods.getFieldState("name").error?.message ?? "Check the item details."
    )
  }, [methods])
  const [showDescription, setShowDescription] = useState(false)
  const [showOpeningStock, setShowOpeningStock] = useState(false)
  const value = useMemo(
    () => ({
      form,
      validate,
      setForm,
      setShowDescription,
      setShowOpeningStock,
      showDescription,
      showOpeningStock,
    }),
    [form, validate, setForm, showDescription, showOpeningStock],
  )

  return (
    <FormProvider {...methods}>
      <CatalogItemFormContext.Provider value={value}>
        {children}
      </CatalogItemFormContext.Provider>
    </FormProvider>
  )
}

export function useCatalogItemForm() {
  const context = useContext(CatalogItemFormContext)

  if (!context) {
    throw new Error(
      "useCatalogItemForm must be used inside CatalogItemFormProvider.",
    )
  }

  return context
}
