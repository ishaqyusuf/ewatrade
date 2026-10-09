"use client"

import { cn } from "@/utils"
import { Input } from "@ewatrade/ui"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react"

type Props = {
  children?: ReactNode
  className?: string
  maxLength?: number
  onClear?: () => void
  onSearch: (value: string) => void
  placeholder: string
  ref?: Ref<HTMLFormElement>
  submit?: boolean
  value: string
}

export function SearchField({
  children,
  className,
  maxLength = 160,
  onClear,
  onSearch,
  placeholder,
  ref,
  submit = false,
  value,
}: Props) {
  const [input, setInput] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => setInput(value), [value])
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", focusSearch)
    return () => window.removeEventListener("keydown", focusSearch)
  }, [])

  return (
    <form
      ref={ref}
      className={cn("relative w-full min-w-0 sm:max-w-[380px]", className)}
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(input.trim())
      }}
    >
      <HugeiconsIcon
        icon={Search01Icon}
        className="pointer-events-none absolute left-3 top-[10px] size-4 text-muted-foreground"
      />
      <Input
        maxLength={maxLength}
        ref={inputRef}
        aria-label={placeholder.replace(/\.\.\.$/, "")}
        placeholder={placeholder}
        className={cn(
          "h-9 rounded-md bg-transparent py-1 pl-9 focus:ring-0 focus:border-border",
          children ? "pr-10" : "pr-3",
        )}
        value={input}
        onChange={(event) => {
          const next = event.target.value
          setInput(next)
          if (!submit || !next) onSearch(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            setInput("")
            if (onClear) onClear()
            else onSearch("")
          }
        }}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {children}
    </form>
  )
}
