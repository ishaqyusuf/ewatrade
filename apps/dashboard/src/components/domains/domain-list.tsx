"use client"

import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  ArrowRight01Icon,
  Copy01Icon,
  Globe02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { DomainStatusBadge, copyText } from "./domain-badge"
import { type DomainRow, domainRenews } from "./domain-status"

/**
 * Every web address: the free ẸwáTrade one first (always on), then the
 * owner's own domains. A row opens that domain's sheet.
 */
export function DomainList({ freeAddress }: { freeAddress: string }) {
  const trpc = useTRPC()
  const { setParams } = useDomainParams()
  const { data } = useSuspenseQuery(trpc.domains.list.queryOptions({}))
  const domains = data.filter((domain) => domain.status !== "DISCONNECTED")
  return (
    <ul
      aria-label="Web addresses"
      className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      <li className="flex min-h-[72px] items-center gap-3 px-4 py-3 sm:px-5">
        <Icon />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate font-medium">
            {freeAddress.replace(/^https:\/\//, "")}
          </span>
          <span className="text-sm text-muted-foreground">
            Free address · Always on
          </span>
        </span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Copy free address"
          onClick={() => copyText(freeAddress, `Copied ${freeAddress}`)}
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-4" />
        </Button>
      </li>
      {domains.map((domain) => (
        <li key={domain.id}>
          <button
            type="button"
            className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--hover)] focus-visible:-outline-offset-[3px] sm:px-5"
            onClick={() =>
              void setParams({ domainId: domain.id, domainMode: "details" })
            }
          >
            <Icon />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="truncate font-medium">{domain.hostname}</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <DomainStatusBadge domain={domain} />
                {detail(domain)}
              </span>
            </span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              className="size-5 shrink-0 text-muted-foreground"
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

function detail(domain: DomainRow) {
  if (domain.isPrimary) return "Main address"
  if (domain.expiresAt) return `Renews ${domainRenews(domain)}`
  return null
}

function Icon() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-muted text-muted-foreground">
      <HugeiconsIcon icon={Globe02Icon} className="size-5" />
    </span>
  )
}

export function DomainListSkeleton() {
  return (
    <div
      aria-busy="true"
      className="h-[216px] animate-pulse rounded-[var(--ui-radius-surface)] border border-border bg-card"
    />
  )
}
