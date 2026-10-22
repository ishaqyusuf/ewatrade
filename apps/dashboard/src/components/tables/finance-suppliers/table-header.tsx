"use client"

import {
  HorizontalPagination,
  SELECT_COLUMN_ID,
  SelectAllCheckbox,
  type TableColumnMeta,
  type TableScrollState,
  TableToolbarPortal,
  getHeaderLabel,
} from "@/components/tables/core"
import { DraggableHeader } from "@/components/tables/draggable-header"
import { ResizeHandle } from "@/components/tables/resize-handle"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { cn } from "@/utils"
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  TableHead,
  TableHeader,
  TableRow,
} from "@ewatrade/ui"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Table } from "@tanstack/react-table"
import type { CSSProperties } from "react"
import type { FinanceSupplierListRow } from "./columns"

const STICKY_COLUMN_IDS = new Set([SELECT_COLUMN_ID, "name", "actions"])

export function FinanceSupplierTableHeader({
  table,
  sortableColumnIds,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  tableScroll,
}: {
  table: Table<FinanceSupplierListRow>
  sortableColumnIds: string[]
  getStickyStyle: (columnId: string) => CSSProperties
  getStickyClassName: (columnId: string, baseClassName?: string) => string
  isVisible: (columnId: string) => boolean
  tableScroll: TableScrollState
}) {
  return (
    <TableHeader className="sticky top-0 z-20 block w-full border-0 bg-background">
      {table.getHeaderGroups().map((group) => {
        const headers = group.headers.filter((header) =>
          isVisible(header.column.id),
        )
        const flexColumnId =
          headers.at(-1)?.column.id === "actions"
            ? headers.at(-2)?.column.id
            : undefined

        return (
          <TableRow
            className="flex h-[45px] min-w-full items-center border-b-0 hover:bg-transparent"
            key={group.id}
          >
            <SortableContext
              items={sortableColumnIds}
              strategy={horizontalListSortingStrategy}
            >
              {headers.map((header) => {
                const id = header.column.id
                const meta = header.column.columnDef.meta as
                  | TableColumnMeta
                  | undefined
                const isAction = id === "actions"
                const isSticky =
                  STICKY_COLUMN_IDS.has(id) || Boolean(meta?.sticky)
                const actionsFullWidth =
                  isAction &&
                  !headers.some((item) => {
                    if (item.column.id === "actions") return false
                    const itemMeta = item.column.columnDef.meta as
                      | TableColumnMeta
                      | undefined
                    return !itemMeta?.sticky
                  })
                const shouldFlex =
                  (id === flexColumnId && !meta?.sticky) || actionsFullWidth
                const style: CSSProperties = {
                  width: actionsFullWidth ? undefined : header.getSize(),
                  minWidth: actionsFullWidth ? 0 : header.getSize(),
                  ...(!actionsFullWidth && getStickyStyle(id)),
                  ...(shouldFlex ? { flex: 1 } : undefined),
                }
                const className = getStickyClassName(
                  id,
                  "group/header relative flex h-full shrink-0 items-center border-t border-border px-4 text-sm font-normal text-muted-foreground",
                )
                const content = isAction ? (
                  <span>Actions</span>
                ) : id === SELECT_COLUMN_ID ? (
                  <SelectAllCheckbox
                    table={table}
                    label="Select all loaded suppliers"
                  />
                ) : (
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="truncate">
                      {getHeaderLabel(header.column.columnDef)}
                    </span>
                    {id === "name" && tableScroll.isScrollable ? (
                      <HorizontalPagination
                        className="hidden shrink-0 md:flex"
                        canScrollLeft={tableScroll.canScrollLeft}
                        canScrollRight={tableScroll.canScrollRight}
                        onScrollLeft={tableScroll.scrollLeft}
                        onScrollRight={tableScroll.scrollRight}
                      />
                    ) : null}
                  </div>
                )
                const resize = header.column.getCanResize() ? (
                  <ResizeHandle header={header} />
                ) : null

                if (!sortableColumnIds.includes(id)) {
                  return (
                    <TableHead
                      key={header.id}
                      scope="col"
                      data-table-column-id={id}
                      data-table-sticky={
                        isSticky && !actionsFullWidth ? "true" : undefined
                      }
                      data-table-sticky-side={
                        isAction && !actionsFullWidth ? "right" : undefined
                      }
                      className={cn(
                        className,
                        isAction
                          ? "justify-center border-l"
                          : "z-10 bg-background",
                      )}
                      style={style}
                    >
                      {content}
                      {resize}
                    </TableHead>
                  )
                }

                return (
                  <DraggableHeader
                    key={header.id}
                    id={id}
                    sticky={isSticky}
                    stickySide={isAction ? "right" : "left"}
                    className={className}
                    style={style}
                  >
                    {content}
                    {resize}
                  </DraggableHeader>
                )
              })}
            </SortableContext>
          </TableRow>
        )
      })}
    </TableHeader>
  )
}

const SUPPLIER_SORTS = [
  { id: "owed", label: "Most owed" },
  { id: "name", label: "Name A–Z" },
] as const

/** Columns (table only) and Sort, shown in the page header row. */
export function FinanceSupplierTableSettings({
  table,
  showColumns = true,
}: {
  table: Table<FinanceSupplierListRow>
  showColumns?: boolean
}) {
  const { supplierSort, setParams } = useFinanceParams()
  const current =
    SUPPLIER_SORTS.find((item) => item.id === supplierSort) ?? SUPPLIER_SORTS[0]
  return (
    <TableToolbarPortal>
      {showColumns ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="outline" className="rounded-none">
                Columns
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  data-icon="inline-end"
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              </Button>
            }
          />
          <DropdownMenuContent
            appearance="dashboard"
            align="end"
            sideOffset={8}
            className="min-w-48"
          >
            <DropdownMenuGroup>
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  const meta = column.columnDef.meta as
                    | TableColumnMeta
                    | undefined
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      closeOnClick={false}
                      onCheckedChange={(checked) =>
                        column.toggleVisibility(checked)
                      }
                    >
                      {meta?.headerLabel ?? getHeaderLabel(column.columnDef)}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" className="rounded-none">
              {current.label}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                data-icon="inline-end"
                className="text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          }
        />
        <DropdownMenuContent appearance="dashboard" align="end">
          <DropdownMenuRadioGroup
            aria-label="Sort Suppliers"
            value={current.id}
            onValueChange={(value) => {
              const option = SUPPLIER_SORTS.find((item) => item.id === value)
              if (option) void setParams({ supplierSort: option.id })
            }}
          >
            {SUPPLIER_SORTS.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id} closeOnClick>
                {item.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableToolbarPortal>
  )
}
