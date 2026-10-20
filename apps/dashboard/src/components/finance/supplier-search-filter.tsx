"use client"

import { SearchField } from "@/components/search-field"
import { useFinanceParams } from "@/hooks/use-finance-params"

export function FinanceSupplierSearchFilter() {
  const { supplierQuery, setParams } = useFinanceParams()

  return (
    <SearchField
      maxLength={160}
      placeholder="Search suppliers..."
      value={supplierQuery}
      onSearch={(value) =>
        void setParams({ supplierQuery: value.trim() || null })
      }
      onClear={() => void setParams({ supplierQuery: null })}
    />
  )
}
