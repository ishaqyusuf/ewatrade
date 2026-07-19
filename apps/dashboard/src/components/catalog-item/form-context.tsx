"use client"

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react"

export type SimpleCatalogItemKind = "product" | "service"

export type SimpleCatalogItemFormState = {
  description: string
  kind: SimpleCatalogItemKind | null
  name: string
  openingStockQuantity: string
  price: string
  unitName: string
}

type CatalogItemFormContextValue = {
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
}

export function CatalogItemFormProvider({ children }: { children: ReactNode }) {
  const [form, setForm] = useState(initialForm)
  const [showDescription, setShowDescription] = useState(false)
  const [showOpeningStock, setShowOpeningStock] = useState(false)
  const value = useMemo(
    () => ({
      form,
      setForm,
      setShowDescription,
      setShowOpeningStock,
      showDescription,
      showOpeningStock,
    }),
    [form, showDescription, showOpeningStock],
  )

  return (
    <CatalogItemFormContext.Provider value={value}>
      {children}
    </CatalogItemFormContext.Provider>
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
