"use client"

import { OWNER_PLAN_LIMITS } from "@/components/owner-signup/model"
import { useGrowthIntent } from "@/hooks/use-growth-intent"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  buildInternalTenantHostname,
  getStorefrontDomain,
} from "@ewatrade/utils"
import {
  Copy01Icon,
  Share08Icon,
  Store04Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState, useSyncExternalStore } from "react"

function storefrontUrl(slug: string) {
  const hostname = buildInternalTenantHostname({
    tenantSlug: slug,
    surface: "storefront",
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  })
  return `https://${hostname}`
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
}

/** Copy or share an online store link, with a short spoken result. */
function useStoreLinkShare() {
  const [feedback, setFeedback] = useState("")
  const [copied, setCopied] = useState<string | null>(null)
  async function share(name: string, slug: string, native: boolean) {
    const url = storefrontUrl(slug)
    try {
      if (native && navigator.share)
        await navigator.share({
          title: name,
          text: `Visit ${name} on ẸwáTrade`,
          url,
        })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(slug)
        setFeedback("Link copied.")
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return
      setFeedback("Can’t share from this browser. Copy the link instead.")
    }
  }
  return { share, copied, feedback }
}

const storefrontDomain = getStorefrontDomain(
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
)

/** Native share on touch screens; desktops copy the link instead. */
function useCanShare() {
  return useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator.share === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
    () => false,
  )
}

/**
 * Overview: the online store link as one slim row. Mounted only for the
 * server-resolved Owner/Admin. `itemLimit` comes from the server's plan
 * features (null = every item shows), so the card makes no plan request.
 */
export function OnlineStoreStrip({
  tenant,
  hasCatalogItems,
  itemLimit,
}: {
  tenant: { id: string; name: string; slug: string }
  hasCatalogItems: boolean
  itemLimit: number | null
}) {
  const intent = useGrowthIntent()
  const canShare = useCanShare()
  const { share, copied, feedback } = useStoreLinkShare()
  const url = storefrontUrl(tenant.slug)
  return (
    <section
      className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card px-4 py-4 sm:px-5"
      aria-labelledby="online-store-title"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-muted text-muted-foreground">
          <HugeiconsIcon icon={Store04Icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-[1_1_14rem]">
          <h2 id="online-store-title" className="font-semibold">
            Online store
          </h2>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm text-[var(--link)] hover:underline"
          >
            {url.replace(/^https:\/\//, "")}
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canShare ? (
            <Button
              variant="outline"
              onClick={() => void share(tenant.name, tenant.slug, true)}
            >
              <HugeiconsIcon icon={Share08Icon} className="size-4" />
              Share
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => void share(tenant.name, tenant.slug, false)}
          >
            <HugeiconsIcon
              icon={copied === tenant.slug ? Tick02Icon : Copy01Icon}
              className="size-4"
            />
            {copied === tenant.slug ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
      {itemLimit !== null || !hasCatalogItems ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {itemLimit !== null ? (
            <span>
              Only your first {itemLimit} items show online.{" "}
              <Link
                className="font-medium text-[var(--link)] underline underline-offset-4"
                href="/settings/billing"
                onClick={() => intent.seePlans("storefront", "home_card")}
              >
                See plans
              </Link>
            </span>
          ) : null}
          {hasCatalogItems ? null : (
            <Link
              className="font-medium text-[var(--link)] underline underline-offset-4"
              href="/catalog"
            >
              Add items to show
            </Link>
          )}
        </p>
      ) : null}
      <output
        className="block text-sm text-muted-foreground empty:hidden"
        aria-live="polite"
      >
        {feedback}
      </output>
    </section>
  )
}

/** Overview: the owner's other businesses, shown once there is more than one. */
export function OwnerBusinesses({
  currentTenantId,
}: { currentTenantId: string }) {
  const intent = useGrowthIntent()
  const trpc = useTRPC()
  const summary = useQuery(
    trpc.tenant.ownerSignupSummary.queryOptions(undefined, { retry: false }),
  )
  const data = summary.data
  if (summary.error)
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4">
        <p role="alert">Couldn’t load your other businesses.</p>
        <Button variant="outline" onClick={() => void summary.refetch()}>
          Try again
        </Button>
      </section>
    )
  if (!data || data.readyBusinesses.length + data.pendingBusinesses.length <= 1)
    return null
  const others = data.readyBusinesses.filter(
    (business) => business.id !== currentTenantId,
  )
  return (
    <section
      className="overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
      aria-labelledby="owner-businesses-title"
    >
      <h2
        id="owner-businesses-title"
        className="border-b border-border px-4 py-4 text-lg font-semibold sm:px-5"
      >
        Your other businesses
      </h2>
      <ul className="divide-y divide-border">
        {others.map((business) => (
          <li
            key={business.id}
            className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5"
          >
            <BusinessName name={business.name} />
            <a
              href={storefrontUrl(business.slug)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto hidden truncate text-sm text-[var(--link)] hover:underline sm:block"
            >
              {business.slug}.{storefrontDomain}
            </a>
            <span className="ml-auto shrink-0 rounded-full bg-success px-2.5 py-0.5 text-sm font-medium text-success-foreground sm:ml-0">
              Live
            </span>
          </li>
        ))}
        {data.pendingBusinesses.map((business, index) => {
          const needed =
            data.readyBusinesses.length + index + 1 > OWNER_PLAN_LIMITS.growth
              ? "Pro"
              : "Growth"
          return (
            <li
              key={business.id ?? business.slug}
              className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5"
            >
              <BusinessName name={business.name} muted />
              <span className="ml-auto flex items-center gap-3">
                <span className="rounded-full bg-warning px-2.5 py-0.5 text-sm font-medium text-warning-foreground">
                  Needs {needed} plan
                </span>
                <Link
                  className="font-medium text-[var(--link)] underline underline-offset-4"
                  href="/settings/billing"
                  onClick={() => intent.seePlans("businesses", "home_card")}
                >
                  Upgrade
                </Link>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function BusinessName({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3 font-medium">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm ${muted ? "bg-muted text-muted-foreground" : "bg-[var(--avatar)] text-foreground"}`}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}
