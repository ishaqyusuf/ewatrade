"use client"

import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import {
  GridViewIcon,
  LayoutTable01Icon,
  ListViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ComponentProps } from "react"

export type ViewOption<Value extends string> = {
  value: Value
  label: string
  icon: ComponentProps<typeof HugeiconsIcon>["icon"]
}

export const directoryViewOptions = [
  { value: "table", label: "Table", icon: LayoutTable01Icon },
  { value: "list", label: "List", icon: ListViewIcon },
  { value: "cards", label: "Cards", icon: GridViewIcon },
] as const satisfies readonly ViewOption<DirectoryView>[]

type ViewOptions<Value extends string> =
  | readonly [ViewOption<Value>, ViewOption<Value>]
  | readonly [ViewOption<Value>, ViewOption<Value>, ViewOption<Value>]

export function ViewSwitcher<Value extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string
  value: Value
  options: ViewOptions<Value>
  onValueChange: (value: Value) => void
}) {
  const current = options.find((option) => option.value === value) ?? options[0]
  const next =
    options.find((option) => option.value !== current.value) ?? current

  return (
    <>
      <ButtonGroup aria-label={label} className="hidden md:flex">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={option.value === current.value ? "secondary" : "outline"}
            aria-label={`${option.label} view`}
            aria-pressed={option.value === current.value}
            onClick={() => onValueChange(option.value)}
          >
            <HugeiconsIcon
              icon={option.icon}
              data-icon="inline-start"
              aria-hidden="true"
            />
            {option.label}
          </Button>
        ))}
      </ButtonGroup>
      <div className="md:hidden">
        {options.length === 2 ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`${label}: ${current.label}. Switch to ${next.label} view`}
            title={`${current.label} view. Switch to ${next.label}`}
            onClick={() => onValueChange(next.value)}
          >
            <HugeiconsIcon icon={current.icon} aria-hidden="true" />
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`${label}: ${current.label}. Choose view`}
                  title={`${current.label} view`}
                />
              }
            >
              <HugeiconsIcon icon={current.icon} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent appearance="dashboard" align="end">
              <DropdownMenuRadioGroup
                aria-label={label}
                value={current.value}
                onValueChange={(nextValue) => {
                  const option = options.find(
                    (option) => option.value === nextValue,
                  )
                  if (option) onValueChange(option.value)
                }}
              >
                {options.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    closeOnClick
                  >
                    <HugeiconsIcon icon={option.icon} aria-hidden="true" />
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </>
  )
}
