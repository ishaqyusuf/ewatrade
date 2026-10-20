"use client"

import {
  DOMAIN_STATUS,
  domainBoughtFrom,
  domainCount,
  domainRenews,
} from "@/components/domains/domain-status"
import { SettingsNotice } from "@/components/settings/settings-page"
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
import { GlobeIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo } from "react"
import { DomainActionsMenu } from "./actions-menu"
import { type DomainRow, DomainStatusBadge, domainColumns } from "./columns"
import { DomainsEmptyState } from "./empty-states"

const getDomainId = (domain: DomainRow) => domain.id
const INTERACTIVE_TARGET = "a, button, input, [role='menuitem']"

function DomainIcon() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <HugeiconsIcon icon={GlobeIcon} className="size-4" />
    </span>
  )
}

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
          [
            domain.hostname,
            domainBoughtFrom(domain),
            DOMAIN_STATUS[domain.status].label,
            domain.store.name,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        return matchesStatus && matchesQuery
      }),
    [data, normalizedQuery, statuses],
  )
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
    state: { sorting },
  })
  const filtered = Boolean(query.trim() || statuses.length)
  // The first domain still waiting for its record gets a reminder.
  const pending = data.find((domain) => domain.status === "OWNERSHIP_PENDING")
  const notice = pending ? (
    <SettingsNotice
      tone="warning"
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => openDetails(pending)}
        >
          Show steps
        </Button>
      }
    >
      <b>{pending.hostname}</b> isn’t connected yet. Add one record where you
      bought the domain, then check again.
    </SettingsNotice>
  ) : null
  if (!rows.length)
    return (
      <>
        {notice}
        <DomainsEmptyState filtered={filtered} />
      </>
    )
  const sortedBy = sort
    ? String(
        columns.find((column) => column.id === sort.field)?.header ??
          sort.field,
      ).toLowerCase()
    : null
  const sorted = table.getRowModel().rows.map((row) => row.original)

  return (
    <div className="grid gap-2.5">
      {notice}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {domainCount(rows.length)}
        {sortedBy
          ? ` · sorted by ${sortedBy}, ${sort?.direction === "desc" ? "descending" : "ascending"}`
          : ""}
      </p>
      {view === "list" ? (
        <ul
          aria-label="Domain list"
          className="divide-y divide-border rounded-[10px] border border-border bg-card"
        >
          {sorted.map((domain) => (
            <li
              key={domain.id}
              className="flex flex-wrap items-center gap-3.5 px-3.5 py-3"
            >
              <DomainIcon />
              <div className="min-w-0 flex-[1_1_200px]">
                <p className="break-all font-medium">{domain.hostname}</p>
                <p className="text-sm text-muted-foreground">
                  {domain.store.name} · {domainBoughtFrom(domain)}
                  {domain.expiresAt ? ` · renews ${domainRenews(domain)}` : ""}
                </p>
              </div>
              <DomainStatusBadge domain={domain} />
              <DomainActionsMenu domain={domain} onManage={openDetails} />
            </li>
          ))}
        </ul>
      ) : view === "cards" ? (
        <ul aria-label="Domain grid" className="grid gap-4 md:grid-cols-2">
          {sorted.map((domain) => (
            <li
              key={domain.id}
              className="grid content-start justify-items-start gap-2 rounded-xl border border-border bg-card p-4"
            >
              <DomainIcon />
              <p className="break-all font-semibold">{domain.hostname}</p>
              <p className="text-sm text-muted-foreground">
                {domain.isPrimary ? "Main address · " : ""}
                {domain.store.name}
              </p>
              <DomainStatusBadge domain={domain} />
              <dl className="grid w-full gap-1 text-sm">
                <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                  <dt className="text-muted-foreground">Bought from</dt>
                  <dd>{domainBoughtFrom(domain)}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                  <dt className="text-muted-foreground">Renews</dt>
                  <dd>{domainRenews(domain)}</dd>
                </div>
              </dl>
              <div className="w-full pt-1">
                <DomainActionsMenu domain={domain} onManage={openDetails} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div
          className="overflow-x-auto rounded-[10px] border border-border bg-card"
          aria-label="Domain directory"
        >
          <Table className="min-w-[680px]">
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
                    const label =
                      typeof header.column.columnDef.header === "string"
                        ? header.column.columnDef.header
                        : id
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
                  onClick={(event) => {
                    // Button and menu clicks keep their own behaviour.
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
    </div>
  )
}
