"use client"

import { SearchFilter } from "@/components/search-filter"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"

export function CatalogSearchFilter() {
  const { catalogKind, catalogQuery, catalogStatus, setParams } =
    useCatalogItemParams()
  const kinds = [
    { id: "product", label: "Products" },
    { id: "service", label: "Services" },
  ] as const
  const statuses = [
    { id: "active", label: "Active" },
    { id: "draft", label: "Draft" },
    { id: "archived", label: "Archived" },
  ] as const
  function clear() {
    void setParams({
      catalogQuery: null,
      catalogKind: null,
      catalogStatus: null,
    })
  }
  return (
    <SearchFilter
      mobileFilters={{
        groups: [
          {
            id: "kind",
            label: "Item type",
            allLabel: "All types",
            options: kinds.map((item) => ({
              value: item.id,
              label: item.label,
            })),
          },
          {
            id: "status",
            label: "Status",
            allLabel: "All statuses",
            options: statuses.map((item) => ({
              value: item.id,
              label: item.label,
            })),
          },
        ],
        values: {
          kind: catalogKind ? [catalogKind] : [],
          status: catalogStatus ? [catalogStatus] : [],
        },
        onApply: (draft) =>
          setParams({
            catalogKind:
              kinds.find((item) => item.id === draft.kind?.[0])?.id ?? null,
            catalogStatus:
              statuses.find((item) => item.id === draft.status?.[0])?.id ??
              null,
          }),
      }}
      placeholder="Search items..."
      value={catalogQuery}
      onSearch={(value) => void setParams({ catalogQuery: value || null })}
      onClear={clear}
      filters={[
        ...(catalogKind
          ? [
              {
                id: "kind",
                label: catalogKind === "product" ? "Products" : "Services",
                onRemove: () => void setParams({ catalogKind: null }),
              },
            ]
          : []),
        ...(catalogStatus
          ? [
              {
                id: "status",
                label:
                  statuses.find((status) => status.id === catalogStatus)
                    ?.label ?? catalogStatus,
                onRemove: () => void setParams({ catalogStatus: null }),
              },
            ]
          : []),
      ]}
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Item type</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-40 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
            sideOffset={14}
            alignOffset={-4}
          >
            {kinds.map((kind) => (
              <DropdownMenuCheckboxItem
                key={kind.id}
                checked={catalogKind === kind.id}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setParams({ catalogKind: checked ? kind.id : null })
                }
              >
                {kind.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            sideOffset={14}
            alignOffset={-4}
          >
            {statuses.map((status) => (
              <DropdownMenuCheckboxItem
                key={status.id}
                checked={catalogStatus === status.id}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setParams({ catalogStatus: checked ? status.id : null })
                }
              >
                {status.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </SearchFilter>
  )
}
