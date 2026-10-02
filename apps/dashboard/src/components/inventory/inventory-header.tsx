"use client"

import { PageHeader, PageToolbar } from "@/components/page-header"
import { SearchField } from "@/components/search-field"
import {
  type InventoryOperationMode,
  useInventoryParams,
} from "@/hooks/use-inventory-params"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const operations: Array<{ label: string; mode: InventoryOperationMode }> = [
  { label: "Receive", mode: "receipt" },
  { label: "Count", mode: "count" },
  { label: "Adjust", mode: "adjustment" },
  { label: "Transform", mode: "transformation" },
  { label: "Custody", mode: "custody" },
  { label: "Transfer", mode: "transfer" },
]

export function InventoryHeader({
  storeName,
}: {
  storeName: string
}) {
  const { query, setParams } = useInventoryParams()
  return (
    <PageHeader
      eyebrow={storeName}
      title="Inventory"
      description="Exact physical balances and immutable stock operations."
    >
      <PageToolbar
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="h-9 rounded-none">
                  <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
                  Stock operation
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className="ml-2 size-4"
                  />
                </Button>
              }
            />
            <DropdownMenuContent appearance="dashboard" align="end">
              {operations.map((operation) => (
                <DropdownMenuItem
                  key={operation.mode}
                  onClick={() =>
                    setParams({ inventoryOperation: operation.mode })
                  }
                >
                  <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
                  {operation.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <SearchField
          value={query}
          placeholder="Search product, variant, unit, or custody..."
          onSearch={(value) =>
            setParams({ inventoryQuery: value.trim() || null })
          }
          onClear={() => setParams({ inventoryQuery: null })}
        />
      </PageToolbar>
    </PageHeader>
  )
}
