"use client"

import { CatalogItemForm } from "./form"

type CatalogItemContentProps = {
  currencyCode: string
  onCreated: (name: string) => void
  storeId: string
}

export function CatalogItemContent(props: CatalogItemContentProps) {
  return <CatalogItemForm {...props} />
}
