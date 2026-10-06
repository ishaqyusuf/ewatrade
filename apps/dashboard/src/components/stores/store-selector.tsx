"use client"
import { useTRPC } from "@/trpc/client"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
export type StoreOption = { id: string; name: string; currencyCode: string }
type Option = StoreOption
export function StoreSelector({
  value,
  onChange,
  excludeId,
  disabled = false,
  label = "Store",
}: {
  value: StoreOption | null
  onChange: (store: StoreOption) => void
  excludeId?: string
  disabled?: boolean
  label?: string
}) {
  const trpc = useTRPC()
  const stores = useQuery(trpc.tenant.stores.queryOptions())
  const [text, setText] = useState(value?.name ?? "")
  useEffect(() => setText(value?.name ?? ""), [value?.name])
  const options = (stores.data ?? (value ? [value] : [])).filter(
    (store) => store.id !== excludeId,
  )
  function choose(option: Option | null) {
    if (!option || disabled) return
    onChange(option)
    setText(option.name)
  }
  return (
    <div className="grid gap-2">
      <Combobox<Option>
        items={options}
        value={value}
        itemToStringLabel={(option) => option.name}
        isItemEqualToValue={(a, b) => a.id === b.id}
        inputValue={text}
        onInputValueChange={setText}
        onOpenChange={(open) => {
          if (!open) setText(value?.name ?? "")
        }}
        onValueChange={(option) => void choose(option)}
        autoHighlight
        disabled={disabled || stores.isPending || stores.isError}
      >
        <ComboboxInput
          aria-label={label}
          placeholder="Search stores…"
          className="w-full"
        />
        <ComboboxContent>
          <ComboboxEmpty>No matching stores.</ComboboxEmpty>
          <ComboboxList>
            {(option: Option) => (
              <ComboboxItem key={option.id} value={option}>
                {option.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {stores.error ? (
        <p role="alert" className="text-sm text-destructive">
          {stores.error.message}
        </p>
      ) : null}
    </div>
  )
}
