"use client"

import { SettingsSavedMark } from "@/components/settings/settings-page"
import { cn } from "@/utils"
import { RadioGroup, RadioGroupItem } from "@ewatrade/ui"
import { useId } from "react"

/**
 * A settings row that asks one question with a few labelled answers (radio
 * cards). It saves as soon as the answer changes, like a switch.
 */
export function SettingsChoice<T extends string>({
  disabled,
  label,
  onChange,
  options,
  saved,
  value,
}: {
  disabled?: boolean
  label: string
  onChange: (value: T) => void
  options: Array<{ description?: string; label: string; value: T }>
  saved?: boolean
  value: T
}) {
  const id = useId()
  return (
    <div className="grid gap-2.5 px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        {saved ? <SettingsSavedMark /> : null}
      </div>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]"
        disabled={disabled}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string" && next !== value) onChange(next as T)
        }}
      >
        {options.map((option) => {
          const optionId = `${id}-${option.value}`
          const checked = option.value === value
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2.5",
                checked && "border-primary bg-primary/5",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <RadioGroupItem
                id={optionId}
                value={option.value}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}
