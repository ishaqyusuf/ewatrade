"use client"

import { OWNER_PLAN_LIMITS } from "@/components/owner-signup/model"
import { useTRPC } from "@/trpc/client"
import { Button, Skeleton, buttonVariants } from "@ewatrade/ui"
import { buildInternalTenantHostname } from "@ewatrade/utils"
import {
  Copy01Icon,
  LinkSquare02Icon,
  Share08Icon,
  Store04Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

function storefrontUrl(slug: string) {
  const hostname = buildInternalTenantHostname({
    tenantSlug: slug,
    surface: "storefront",
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
    localProjectSlug: slug,
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

/**
 * Overview: the online store link as a slim strip. Mounted only for the
 * current server-resolved Owner/Admin membership.
 */
export function OnlineStoreStrip({
  tenant,
  hasCatalogItems,
}: {
  tenant: { id: string; name: string; slug: string }
  hasCatalogItems: boolean
}) {
  const trpc = useTRPC()
  const subscription = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, { retry: false }),
  )
  const plan = subscription.data?.plan
  const limited = plan ? plan.limits.storefrontItems !== null : false
  const preview = useQuery(
    trpc.tenant.storefrontPreview.queryOptions(undefined, {
      enabled: Boolean(plan && limited),
      retry: false,
    }),
  )
  const { share, copied, feedback } = useStoreLinkShare()
  const url = storefrontUrl(tenant.slug)
  return (
    <section
      className="grid gap-2.5 rounded-lg border border-border bg-card px-4 py-3"
      aria-labelledby="online-store-title"
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <HugeiconsIcon icon={Store04Icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-[1_1_12rem]">
          <h2 id="online-store-title" className="text-sm font-semibold">
            Your online store
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {url.replace(/^https:\/\//, "")}
          </p>
        </div>
        {subscription.isPending ? (
          <Skeleton className="h-6 w-24 rounded-full" />
        ) : plan ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {plan.name} plan
          </span>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void share(tenant.name, tenant.slug, false)}
          >
            <HugeiconsIcon
              icon={copied === tenant.slug ? Tick02Icon : Copy01Icon}
              className="size-4"
            />
            {copied === tenant.slug ? "Copied" : "Copy link"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void share(tenant.name, tenant.slug, true)}
          >
            <HugeiconsIcon icon={Share08Icon} className="size-4" />
            Share
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
            Open
          </a>
          {limited ? (
            <Link
              className="px-1 text-sm text-primary underline underline-offset-4"
              href="/settings/billing"
            >
              See plans
            </Link>
          ) : null}
          {hasCatalogItems ? null : (
            <Link
              className="px-1 text-sm text-primary underline underline-offset-4"
              href="/catalog"
            >
              Add items
            </Link>
          )}
        </div>
      </div>
      {subscription.error ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="alert">Couldn’t load your plan.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void subscription.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : plan ? (
        <p className="text-sm text-muted-foreground">
          {limited
            ? "Only your first 3 items show online. Upgrade to show all items and get customer messages."
            : "All your items can show online. Customers can message you once chat is set up."}
        </p>
      ) : null}
      {limited ? (
        <div
          className="grid gap-2 sm:grid-cols-3 sm:gap-3"
          aria-label="Your first three items online"
        >
          {[0, 1, 2].map((index) => {
            const item = preview.data?.[index]
            return (
              <div
                className={`flex min-h-12 items-center rounded-md border px-3.5 py-2.5 text-sm ${item ? "bg-background" : "border-dashed text-muted-foreground"}`}
                key={item?.id ?? `slot-${index}`}
              >
                {item?.name ??
                  (preview.isPending
                    ? "Loading items…"
                    : preview.error
                      ? "Couldn’t load items"
                      : "Empty · add an item")}
              </div>
            )
          })}
        </div>
      ) : null}
      {preview.error && limited ? (
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => void preview.refetch()}
        >
          Try again
        </Button>
      ) : null}
      <output
        className="block text-xs text-muted-foreground empty:hidden"
        aria-live="polite"
      >
        {feedback}
      </output>
    </section>
  )
}

/** Overview: the owner's other businesses, shown once there is more than one. */
export function OwnerBusinesses() {
  const trpc = useTRPC()
  const summary = useQuery(
    trpc.tenant.ownerSignupSummary.queryOptions(undefined, { retry: false }),
  )
  const { share, copied, feedback } = useStoreLinkShare()
  const data = summary.data
  if (summary.error)
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
        <p className="text-sm" role="alert">
          Couldn’t load your other businesses.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void summary.refetch()}
        >
          Try again
        </Button>
      </section>
    )
  if (!data || data.readyBusinesses.length + data.pendingBusinesses.length <= 1)
    return null
  return (
    <section
      className="grid gap-3 rounded-lg border border-border bg-card p-5"
      aria-labelledby="owner-businesses-title"
    >
      <h2 id="owner-businesses-title" className="font-semibold">
        Your businesses
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {data.readyBusinesses.map((business) => (
          <article
            key={business.id}
            className="grid min-w-0 justify-items-start gap-1.5 rounded-md border border-border bg-background p-4"
          >
            <div className="flex w-full items-center justify-between gap-3">
              <h3 className="flex items-center gap-2.5 text-sm font-semibold">
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs text-primary"
                  aria-hidden="true"
                >
                  {initials(business.name)}
                </span>
                {business.name}
              </h3>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                Live
              </span>
            </div>
            <a
              href={storefrontUrl(business.slug)}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm text-primary underline underline-offset-4"
            >
              {business.slug}.ewatrade.com
            </a>
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => void share(business.name, business.slug, false)}
            >
              {copied === business.slug ? "Copied" : "Copy link"}
            </Button>
          </article>
        ))}
        {data.pendingBusinesses.map((business, index) => {
          const needed =
            data.readyBusinesses.length + index + 1 > OWNER_PLAN_LIMITS.growth
              ? "Pro"
              : "Growth"
          return (
            <article
              key={business.id ?? business.slug}
              className="grid min-w-0 justify-items-start gap-1.5 rounded-md border border-dashed border-border p-4"
            >
              <h3 className="flex items-center gap-2.5 text-sm font-semibold">
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
                  aria-hidden="true"
                >
                  {initials(business.name)}
                </span>
                {business.name}
              </h3>
              <p className="break-all text-sm text-muted-foreground">
                {business.slug}.ewatrade.com
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  Needs {needed} plan
                </span>
                Saved. Upgrade to open it.
              </p>
              <Link
                className="text-sm font-medium text-primary underline underline-offset-4"
                href="/settings/billing"
              >
                Upgrade
              </Link>
            </article>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Switch business from the menu at the top left.
      </p>
      <output
        className="block text-xs text-muted-foreground empty:hidden"
        aria-live="polite"
      >
        {feedback}
      </output>
    </section>
  )
}
