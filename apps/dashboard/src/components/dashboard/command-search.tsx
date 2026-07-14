"use client"

import {
  type DashboardSearchResponse,
  filterDashboardCommands,
  filterSearchablePages,
  getDashboardCommands,
} from "@/lib/dashboard-search"
import type { DashboardNavItem } from "@/lib/navigation"
import { cn } from "@/utils"
import { Badge, Button } from "@ewatrade/ui"
import {
  Cancel01Icon,
  Search01Icon,
  SquareArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

type Props = {
  navItems: DashboardNavItem[]
}

function groupLabel(group: string) {
  switch (group) {
    case "products":
      return "Products"
    case "customers":
      return "Customers"
    case "staff":
      return "Staff"
    case "sales":
      return "Sales"
    case "links":
      return "Generated links"
    default:
      return "Results"
  }
}

export function DashboardCommandSearch({ navItems }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DashboardSearchResponse["results"]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pages = useMemo(
    () => filterSearchablePages(navItems, query),
    [navItems, query],
  )
  const commands = useMemo(
    () => filterDashboardCommands(getDashboardCommands(navItems), query),
    [navItems, query],
  )
  const groupedResults = useMemo(() => {
    const groups = new Map<string, typeof results>()

    for (const item of results) {
      groups.set(item.group, [...(groups.get(item.group) ?? []), item])
    }

    return Array.from(groups.entries())
  }, [results])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const target = event.target
        const isTyping =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement

        if (!isTyping) {
          event.preventDefault()
          setOpen(true)
        }
      }

      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([])
        setError(null)
        return
      }

      setIsLoading(true)

      try {
        const params = new URLSearchParams({ q: query.trim() })
        const response = await fetch(`/api/search?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = (await response.json()) as
          | DashboardSearchResponse
          | { error?: string }

        if (!response.ok) {
          throw new Error(
            "error" in data && data.error ? data.error : "Search failed.",
          )
        }

        setResults((data as DashboardSearchResponse).results)
        setError(null)
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Search failed.",
          )
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 180)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [open, query])

  function goTo(href: string) {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-foreground lg:hidden"
        aria-label="Open dashboard search"
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={Search01Icon} className="size-4" />
      </button>

      <button
        type="button"
        className="hidden min-w-[220px] items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground lg:flex"
        aria-label="Open dashboard search"
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon icon={Search01Icon} className="size-4" />
        <span className="flex-1 text-left">Find anything...</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          /
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close search"
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setOpen(false)}
          />
          <section className="absolute left-1/2 top-8 flex w-[min(720px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <HugeiconsIcon
                icon={Search01Icon}
                className="size-4 text-muted-foreground"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages, records, and commands"
                className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </Button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-3">
              {error ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {isLoading ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  Searching...
                </p>
              ) : null}

              {!isLoading &&
              !error &&
              pages.length === 0 &&
              commands.length === 0 &&
              groupedResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {query.trim().length < 2
                    ? "Type at least two characters to search records."
                    : "No matching pages, records, or commands."}
                </p>
              ) : null}

              {commands.length ? (
                <div className="mb-3">
                  <p className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    Commands
                  </p>
                  {commands.map((command) => (
                    <button
                      key={command.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                      onClick={() => goTo(command.href)}
                    >
                      <HugeiconsIcon
                        icon={SquareArrowRight01Icon}
                        className="size-4 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {command.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {command.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {pages.length ? (
                <div className="mb-3">
                  <p className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    Pages
                  </p>
                  {pages.map((page) => (
                    <button
                      key={page.href}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                      onClick={() => goTo(page.href)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {page.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {page.description}
                        </span>
                      </span>
                      <Badge className="rounded-full">{page.href}</Badge>
                    </button>
                  ))}
                </div>
              ) : null}

              {groupedResults.map(([group, items]) => (
                <div key={group} className="mb-3">
                  <p className="px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
                    {groupLabel(group)}
                  </p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted",
                      )}
                      onClick={() => goTo(item.href)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      <Badge className="rounded-full">
                        {groupLabel(item.group)}
                      </Badge>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
