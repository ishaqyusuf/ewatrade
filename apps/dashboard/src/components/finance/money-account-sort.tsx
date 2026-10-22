"use client"

import { TableToolbarPortal } from "@/components/tables/core"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { parseAsStringLiteral, useQueryState } from "nuqs"

const ACCOUNT_SORTS = [
  { id: "balance", label: "Biggest balance" },
  { id: "name", label: "Name A–Z" },
] as const
type AccountSort = (typeof ACCOUNT_SORTS)[number]["id"]

export const accountSortParam = parseAsStringLiteral(
  ACCOUNT_SORTS.map((item) => item.id),
).withDefault("balance")

/** Money accounts are few, so they sort on the page. */
export function sortMoneyAccounts<
  Account extends { name: string; balanceMinor: string },
>(accounts: Account[], sort: AccountSort) {
  return [...accounts].sort((a, b) => {
    if (sort === "balance") {
      const diff = BigInt(b.balanceMinor) - BigInt(a.balanceMinor)
      if (diff !== 0n) return diff > 0n ? 1 : -1
    }
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" })
  })
}

/** Sort, shown in the page header row beside View. */
export function MoneyAccountSortMenu() {
  const [sort, setSort] = useQueryState("accountSort", accountSortParam)
  const current =
    ACCOUNT_SORTS.find((item) => item.id === sort) ?? ACCOUNT_SORTS[0]
  return (
    <TableToolbarPortal>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" className="rounded-none" />
          }
        >
          {current.label}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            data-icon="inline-end"
            className="text-muted-foreground"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent appearance="dashboard" align="end">
          <DropdownMenuRadioGroup
            aria-label="Sort money accounts"
            value={current.id}
            onValueChange={(value) => {
              const option = ACCOUNT_SORTS.find((item) => item.id === value)
              if (option) void setSort(option.id)
            }}
          >
            {ACCOUNT_SORTS.map((item) => (
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
