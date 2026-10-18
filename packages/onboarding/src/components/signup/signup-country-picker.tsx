"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ewatrade/ui"
import { COUNTRIES, findCountry } from "@ewatrade/utils/countries"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import { phoneCountry, phoneFlag } from "../../lib/international-phone"

/** Searchable country picker: the shared country list (supported markets first). */
export function SignupCountryPicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const current = value ? findCountry(value) : undefined
  const flag = (code: string) => {
    const supported = phoneCountry(code)
    return supported ? phoneFlag(supported) : ""
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className="signup-input owner-country-trigger"
        aria-label={
          current
            ? `Country: ${current.name}. Change country`
            : "Choose country"
        }
      >
        {current ? (
          <>
            <span aria-hidden="true">{flag(current.code)}</span>
            <span className="owner-country-name">{current.name}</span>
          </>
        ) : (
          <span className="owner-country-name owner-country-placeholder">
            Choose country
          </span>
        )}
        <HugeiconsIcon icon={ArrowDown01Icon} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <PopoverTitle className="sr-only">Country</PopoverTitle>
        <Command>
          <CommandInput
            placeholder="Search country…"
            aria-label="Search country"
          />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((country) => (
                <CommandItem
                  className="gap-2"
                  key={country.code}
                  value={`${country.name} ${country.code}`}
                  onSelect={() => {
                    onChange(country.code)
                    setOpen(false)
                  }}
                >
                  <span aria-hidden="true">{flag(country.code)}</span>
                  <span className="flex-1">{country.name}</span>
                  {country.code === value && <span aria-hidden="true">✓</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
