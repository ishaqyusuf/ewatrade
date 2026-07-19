"use client"

import { CatalogHeader } from "@/components/catalog-item/catalog-header"
import { CatalogItemSheet } from "@/components/catalog-item/catalog-item-sheet"
import { CatalogUnitConfigurationSheet } from "@/components/catalog-item/catalog-unit-configuration-sheet"
import { CatalogDataTable } from "@/components/tables/catalog/data-table"
import { useState } from "react"

type StoreSummary = {
  currencyCode: string
  id: string
  name: string
}

export function CatalogItemsPage({ store }: { store: StoreSummary }) {
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <CatalogHeader storeName={store.name} />
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}
      <CatalogDataTable />
      <CatalogUnitConfigurationSheet />
      <CatalogItemSheet
        currencyCode={store.currencyCode}
        storeId={store.id}
        onCreated={(name) => setNotice(`${name} added.`)}
      />
    </div>
  )
}
