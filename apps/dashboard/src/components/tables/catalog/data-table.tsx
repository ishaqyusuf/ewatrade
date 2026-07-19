"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useTRPC } from "@/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { createCatalogColumns } from "./columns"
import { CatalogEmptyState } from "./empty-states"

export function CatalogDataTable() {
  const trpc = useTRPC()
  const { catalogKind, catalogQuery, setParams } = useCatalogItemParams()
  const { data } = useSuspenseQuery(
    trpc.catalog.listItems.queryOptions(
      { kind: catalogKind ?? undefined },
      { retry: false },
    ),
  )
  const rows = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase()
    if (!query) return data
    return data.filter((item) =>
      [
        item.category ?? "",
        item.description ?? "",
        item.kind,
        item.name,
        item.slug,
        ...item.variants.map((variant) => variant.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    )
  }, [catalogQuery, data])
  const columns = useMemo(
    () =>
      createCatalogColumns((productId) =>
        setParams({ productUnits: productId }),
      ),
    [setParams],
  )

  return (
    <DashboardTable
      rows={rows}
      columns={columns}
      getRowKey={(item) => item.id}
      emptyState={
        <CatalogEmptyState
          filtered={Boolean(catalogKind || catalogQuery.trim())}
        />
      }
    />
  )
}
