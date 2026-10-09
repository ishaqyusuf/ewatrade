"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { OpenSearchButton } from "@/components/dashboard/open-search-button"
import {
  type DashboardSearchResponse,
  filterDashboardCommands,
  filterSearchablePages,
  getDashboardCommands,
} from "@/lib/dashboard-search"
import type { DashboardNavItem } from "@/lib/navigation"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import {
  Button,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ewatrade/ui"
import {
  Cancel01Icon,
  Search01Icon,
  SquareArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

type Props = {
  commandPaths: string[]
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
    default:
      return "Results"
  }
}

export function DashboardCommandSearch({ commandPaths, navItems }: Props) {
  const workflow = useDashboardWorkflow()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const trpc = useTRPC()
  // Checked only once search opens; the API decides role, Store and flag.
  const setupAssistant = useQuery(
    trpc.setupAssistant.state.queryOptions(undefined, {
      enabled: open,
      staleTime: 60_000,
    }),
  )
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DashboardSearchResponse["results"]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pages = useMemo(
    () => filterSearchablePages(navItems, query),
    [navItems, query],
  )
  const commands = useMemo(
    () =>
      filterDashboardCommands(
        getDashboardCommands(navItems, commandPaths, {
          setupAssistant: setupAssistant.data?.enabled === true,
        }),
        query,
      ),
    [commandPaths, navItems, query, setupAssistant.data?.enabled],
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
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable)

        if (!isTyping) {
          event.preventDefault()
          setOpen(true)
        }
      }

      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault()
        setOpen(true)
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
        setIsLoading(false)
        return
      }

      workflow.track("search", "started", { channel: "command" })
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

        workflow.track("search", "completed", {
          channel: "command",
          item_count: (data as DashboardSearchResponse).results.length,
        })
        setResults((data as DashboardSearchResponse).results)
        setError(null)
      } catch (searchError) {
        if (!controller.signal.aborted) {
          workflow.track("search", "failed", { channel: "command" })
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
  }, [open, query, workflow])

  function goTo(href: string) {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  return (
    <>
      <OpenSearchButton onClick={() => setOpen(true)} />
      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="relative border-b border-border">
          <CommandInput
            ref={inputRef}
            aria-label="Search pages, records, and commands"
            placeholder="Search pages, records, and commands"
            maxLength={160}
            value={query}
            onValueChange={setQuery}
            className="h-[55px] px-4 pr-12 py-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close search"
            className="absolute right-3 top-3"
            onClick={() => setOpen(false)}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>
        <CommandList className="max-h-[min(480px,calc(100dvh-140px))] px-2">
          {error ? (
            <FormFeedback appearance="dashboard">{error}</FormFeedback>
          ) : null}
          {isLoading ? (
            <output className="block px-3 py-3 text-sm text-muted-foreground">
              Searching...
            </output>
          ) : null}
          {!isLoading &&
          !error &&
          !pages.length &&
          !commands.length &&
          !groupedResults.length ? (
            <CommandEmpty>
              {query.trim().length < 2
                ? "Type at least two characters to search records."
                : "No matching pages, records, or commands."}
            </CommandEmpty>
          ) : null}
          {commands.length ? (
            <CommandGroup heading="Commands">
              {commands.map((command) => (
                <CommandItem
                  key={command.id}
                  value={command.id}
                  onSelect={() => goTo(command.href)}
                  className="gap-3"
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
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {pages.length ? (
            <CommandGroup heading="Pages">
              {pages.map((page) => (
                <CommandItem
                  key={page.href}
                  value={`page:${page.href}`}
                  onSelect={() => goTo(page.href)}
                  className="justify-between gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {page.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {page.description}
                    </span>
                  </span>
                  <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                    {page.href}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {groupedResults.map(([group, items]) => (
            <CommandGroup key={group} heading={groupLabel(group)}>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => goTo(item.href)}
                  className="justify-between gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                    {groupLabel(item.group)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
