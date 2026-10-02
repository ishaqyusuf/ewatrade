"use client"

import { domainSortFields } from "@/components/tables/domains/sort"
import { useDomainFilterParams } from "@/hooks/use-domain-filter-params"
import { useDomainParams } from "@/hooks/use-domain-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { useSuspenseQuery } from "@tanstack/react-query"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo } from "react"
import { domainColumns } from "./columns"
import { DomainsEmptyState } from "./empty-states"

export function DomainDataTable() {
  const trpc = useTRPC()
  const { query, statuses } = useDomainFilterParams()
  const { setParams } = useDomainParams()
  const { data } = useSuspenseQuery(trpc.domains.list.queryOptions({}))
  const { sort, sorting, toggleSort } = useSortParams({
    fields: domainSortFields,
  })
  const normalizedQuery = query.trim().toLowerCase()
  const rows = useMemo(
    () =>
      data.filter((domain) => {
        const matchesStatus =
          statuses.length === 0 || statuses.includes(domain.status)
        const matchesQuery =
          !normalizedQuery ||
          [domain.hostname, domain.provider, domain.status, domain.store.name]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        return matchesStatus && matchesQuery
      }),
    [data, normalizedQuery, statuses],
  )
  const columns = useMemo(
    () =>
      domainColumns((domain) =>
        setParams({ domainId: domain.id, domainMode: "details" }),
      ),
    [setParams],
  )
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  })
  const filtered = Boolean(query.trim() || statuses.length)
  if (!rows.length) return <DomainsEmptyState filtered={filtered} />

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {rows.length} domains
        {sort ? ` · sorted by ${sort.field} ${sort.direction}` : ""}
      </p>
      <div
        className="overflow-x-auto border border-border"
        aria-label="Domain directory"
      >
        <Table className="min-w-[760px]">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const id = header.column.id
                  const field = domainSortFields.find(
                    (candidate) => candidate === id,
                  )
                  const direction =
                    field && sort?.field === field ? sort.direction : undefined
                  const label = String(header.column.columnDef.header ?? id)
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      aria-sort={
                        field
                          ? direction === "asc"
                            ? "ascending"
                            : direction === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                    >
                      {field ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto rounded-none p-0 font-normal hover:bg-transparent"
                          aria-label={`Sort by ${label}${direction ? `, currently ${direction}` : ""}`}
                          onClick={() => void toggleSort(field)}
                        >
                          {label}
                          {direction === "asc"
                            ? " ↑"
                            : direction === "desc"
                              ? " ↓"
                              : ""}
                        </Button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                tabIndex={0}
                className="cursor-pointer"
                onClick={() =>
                  setParams({
                    domainId: row.original.id,
                    domainMode: "details",
                  })
                }
                onKeyDown={(event) => {
                  if (
                    (event.key === "Enter" || event.key === " ") &&
                    event.target === event.currentTarget
                  ) {
                    event.preventDefault()
                    setParams({
                      domainId: row.original.id,
                      domainMode: "details",
                    })
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
