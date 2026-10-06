"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@ewatrade/ui"
import { useState } from "react"
import {
  type OrderCatalogItem,
  type OrderOffering,
  orderCatalogChoices,
} from "./order-draft"

type CatalogChoice = ReturnType<typeof orderCatalogChoices>[number]

export function OrderItemPicker({
  items,
  offerings,
  disabled,
  onSelect,
}: {
  items: OrderCatalogItem[]
  offerings: OrderOffering[]
  disabled?: boolean
  onSelect: (item: OrderCatalogItem) => void
}) {
  const [search, setSearch] = useState("")
  const choices = orderCatalogChoices(items, offerings)
  return (
    <Combobox<CatalogChoice>
      items={choices}
      value={null}
      itemToStringLabel={(choice) => choice.item.name}
      inputValue={search}
      onInputValueChange={setSearch}
      onValueChange={(choice) => {
        if (choice && !choice.disabled) {
          onSelect(choice.item)
          setSearch("")
        }
      }}
      autoHighlight
      disabled={disabled}
    >
      <ComboboxInput
        disabled={disabled}
        aria-label="Add catalog item"
        placeholder="Search catalog to add an item…"
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxEmpty>
          No matching items available in this store.
        </ComboboxEmpty>
        <ComboboxList>
          {(choice: CatalogChoice) => (
            <ComboboxItem
              key={choice.item.id}
              value={choice}
              disabled={choice.disabled}
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span>{choice.item.name}</span>
                {choice.disabledReason ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {choice.disabledReason}
                  </span>
                ) : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
