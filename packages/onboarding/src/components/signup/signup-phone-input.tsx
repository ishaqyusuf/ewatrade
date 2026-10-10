"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ewatrade/ui"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js/max"
import { type ClipboardEvent, type Ref, useState } from "react"
import PhoneInput from "react-phone-number-input/input-max"
import {
  PHONE_COUNTRIES,
  phoneCountry,
  phoneFlag,
  phonePlaceholder,
} from "../../lib/international-phone"

export function SignupPhoneInput({
  id,
  name,
  value,
  country,
  onChange,
  onCountryChange,
  onBlur,
  inputRef,
  invalid,
  describedBy,
}: {
  id: string
  name?: string
  value: string
  country?: string
  onChange: (value: string) => void
  onCountryChange: (country: string) => void
  onBlur?: () => void
  inputRef?: Ref<HTMLInputElement>
  invalid?: boolean
  describedBy?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = phoneCountry(country)
  const current = PHONE_COUNTRIES.find((item) => item.code === selected)

  return (
    <InputGroup className="signup-phone-input mt-1.5" dir="ltr">
      <PhoneInput
        ref={inputRef}
        id={id}
        name={name}
        inputComponent={InputGroupInput}
        className="signup-input"
        country={selected}
        international={selected ? true : undefined}
        withCountryCallingCode={selected ? false : undefined}
        value={value || undefined}
        onChange={(next) => onChange(next ?? "")}
        onBlur={onBlur}
        onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
          const text = event.clipboardData
            .getData("text")
            .trim()
            .replace(/^00/, "+")
          if (!text.startsWith("+")) return
          const parsed = parsePhoneNumberFromString(text, { extract: false })
          if (!parsed?.country || parsed.ext) return
          event.preventDefault()
          onCountryChange(parsed.country)
          onChange(parsed.number)
        }}
        onFocus={() => {
          if (!selected) setOpen(true)
        }}
        autoComplete="tel-national"
        inputMode="tel"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        placeholder={phonePlaceholder(selected)}
      />
      <InputGroupAddon
        align="inline-start"
        onClick={(event) => event.stopPropagation()}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<InputGroupButton size="sm" />}
            aria-label={
              current
                ? `Phone country: ${current.name}, +${current.callingCode}. Change country`
                : "Select phone country or region"
            }
          >
            <span aria-hidden="true">
              {selected ? phoneFlag(selected) : "🌐"}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <PopoverTitle className="sr-only">
              Phone country or region
            </PopoverTitle>
            <Command>
              <CommandInput
                placeholder="Search country or calling code…"
                aria-label="Search country or calling code"
              />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {PHONE_COUNTRIES.map((item) => (
                    <CommandItem
                      key={item.code}
                      value={`${item.name} ${item.code} +${item.callingCode}`}
                      onSelect={() => {
                        if (item.code !== selected) {
                          // Keep the national digits when changing the prefix.
                          const national =
                            value && selected
                              ? value.replace(
                                  new RegExp(
                                    `^\\+${getCountryCallingCode(selected)}`,
                                  ),
                                  "",
                                )
                              : ""
                          onCountryChange(item.code)
                          onChange(
                            national ? `+${item.callingCode}${national}` : "",
                          )
                        }
                        setOpen(false)
                        onBlur?.()
                      }}
                    >
                      <span aria-hidden="true">{phoneFlag(item.code)}</span>
                      <span className="flex-1">{item.name}</span>
                      <span>+{item.callingCode}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <InputGroupText aria-label="Country calling code">
          {current ? `+${current.callingCode}` : "+"}
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}
