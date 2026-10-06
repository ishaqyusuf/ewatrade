"use client"

import {
  DirectoryCollection,
  DirectoryRecord,
  DirectoryToolbar,
  SelectionBar,
  useLoadedRowSelection,
} from "@/components/tables/core"
import { domainSortFields } from "@/components/tables/domains/sort"
import { useDomainFilterParams } from "@/hooks/use-domain-filter-params"
import { useDomainParams } from "@/hooks/use-domain-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
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
import { DomainActionsMenu } from "./actions-menu"
import {
  type DomainRow,
  DomainStatusBadge,
  domainColumns,
  formatDomainExpiry,
  readableDomainValue,
} from "./columns"
import { DomainsEmptyState } from "./empty-states"

const getDomainId = (domain: DomainRow) => domain.id
const INTERACTIVE_TARGET =
  "a, button, input, [role='checkbox'], [role='menuitem']"

export function DomainDataTable({ view }: { view: DirectoryView }) {
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
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows,
    getRowId: getDomainId,
    scope: JSON.stringify([normalizedQuery, statuses]),
  })
  const openDetails = (domain: DomainRow) =>
    setParams({ domainId: domain.id, domainMode: "details" })
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
    getRowId: getDomainId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
  })
  const filtered = Boolean(query.trim() || statuses.length)
  if (!rows.length) return <DomainsEmptyState filtered={filtered} />

  return (
    <div className="grid gap-2">
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all listed domains"
        summary={`${rows.length} domains${
          sort ? ` · sorted by ${sort.field} ${sort.direction}` : ""
        }`}
      />
      {view !== "table" ? (
        <DirectoryCollection view={view} label="Domain">
          {table.getRowModel().rows.map((row) => {
            const domain = row.original
            return (
              <DirectoryRecord
                key={row.id}
                row={row}
                view={view}
                selectLabel={`Select ${domain.hostname}`}
                title={domain.hostname}
                onOpen={() => openDetails(domain)}
                description={`${domain.store.name}${domain.isPrimary ? " · Primary" : ""}`}
                badges={<DomainStatusBadge domain={domain} />}
                details={[
                  {
                    label: "Registrar",
                    value: readableDomainValue(domain.provider),
                  },
                  {
                    label: "Renewal / expiry",
                    value: formatDomainExpiry(domain),
                  },
                ]}
                actions={
                  <DomainActionsMenu domain={domain} onManage={openDetails} />
                }
              />
            )
          })}
        </DirectoryCollection>
      ) : (
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
                      field && sort?.field === field
                        ? sort.direction
                        : undefined
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
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  onClick={(event) => {
                    // Checkbox and menu clicks keep their own behaviour.
                    if ((event.target as Element).closest(INTERACTIVE_TARGET))
                      return
                    setParams({
                      domainId: row.original.id,
                      domainMode: "details",
                    })
                  }}
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
