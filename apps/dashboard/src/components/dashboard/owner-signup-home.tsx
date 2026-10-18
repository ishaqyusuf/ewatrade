"use client"

import { OWNER_PLAN_LIMITS } from "@/components/owner-signup/model"
import { useTRPC } from "@/trpc/client"
import { Button, Input } from "@ewatrade/ui"
import { buildInternalTenantHostname } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import "./owner-signup-home.css"

function storefrontUrl(slug: string) {
  const hostname = buildInternalTenantHostname({
    tenantSlug: slug,
    surface: "storefront",
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
    localProjectSlug: slug,
  })
  return `https://${hostname}`
}

/** Mounted only for the current server-resolved Owner/Admin membership. */
export function OwnerSignupHome({
  tenant,
}: { tenant: { id: string; name: string; slug: string } }) {
  const trpc = useTRPC()
  const summary = useQuery(
    trpc.tenant.ownerSignupSummary.queryOptions(undefined, { retry: false }),
  )
  const subscription = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, { retry: false }),
  )
  const summaryData = summary.data
  const plan = subscription.data?.plan
  const limited = plan ? plan.limits.storefrontItems !== null : false
  const preview = useQuery(
    trpc.tenant.storefrontPreview.queryOptions(undefined, {
      enabled: Boolean(plan && limited),
      retry: false,
    }),
  )
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
        setFeedback(`Copied ${name}’s store link.`)
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return
      setFeedback(
        "Sharing is unavailable here. Select the store link and copy it manually.",
      )
    }
  }
  return (
    <div className="owner-home grid gap-4">
      <section
        className="owner-home-share rounded-xl border bg-muted/10 p-5 sm:p-6"
        aria-labelledby="owner-share-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="owner-home-identity">
            <span className="owner-home-avatar" aria-hidden="true">
              {tenant.name
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")}
            </span>
            <div>
              <p className="owner-home-eyebrow">{tenant.name}</p>
              <h2 id="owner-share-title">Share your store</h2>
            </div>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {plan?.name ?? "Loading plan…"}
          </span>
        </div>
        <label className="sr-only" htmlFor={`current-store-link-${tenant.id}`}>
          {tenant.name} store link
        </label>
        <Input
          className="mt-3 max-w-xl text-sm"
          id={`current-store-link-${tenant.id}`}
          value={storefrontUrl(tenant.slug)}
          readOnly
          onFocus={(event) => event.target.select()}
        />
        {plan && (
          <p className="mt-3 text-sm text-muted-foreground">
            {limited
              ? "Your first 3 items show. Upgrade to list everything and let customers message you."
              : "Everything you list can show here. Customer messages are included once your store chat is set up."}
          </p>
        )}
        {subscription.error && (
          <div className="mt-3 text-sm">
            <p role="alert">Your current plan could not be loaded.</p>
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              onClick={() => void subscription.refetch()}
            >
              Retry plan
            </Button>
          </div>
        )}
        {limited && (
          <div
            className="mt-4 grid gap-3 sm:grid-cols-3"
            aria-label="Your first three storefront items"
          >
            {[0, 1, 2].map((index) => {
              const item = preview.data?.[index]
              return (
                <div
                  className="flex min-h-20 items-center rounded-lg border bg-background p-4 text-sm"
                  key={item?.id ?? `slot-${index}`}
                >
                  {item?.name ??
                    (preview.isPending
                      ? "Loading items…"
                      : preview.error
                        ? "Preview unavailable"
                        : `Item ${index + 1} · add what you sell`)}
                </div>
              )
            })}
          </div>
        )}
        {preview.error && limited && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => void preview.refetch()}
          >
            Retry item preview
          </Button>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void share(tenant.name, tenant.slug, false)}
          >
            {copied === tenant.slug ? "Copied ✓" : "Copy link"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void share(tenant.name, tenant.slug, true)}
          >
            Share store link
          </Button>
          <a
            href={storefrontUrl(tenant.slug)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center px-2 text-xs underline underline-offset-4"
          >
            Open store ↗
          </a>
          <Link
            className="inline-flex items-center px-2 text-xs underline underline-offset-4"
            href="/settings/billing"
          >
            See plans
          </Link>
          <Link
            className="inline-flex items-center px-2 text-xs underline underline-offset-4"
            href="/catalog"
          >
            Add your first item
          </Link>
        </div>
        <output
          className="mt-2 block text-xs text-muted-foreground"
          aria-live="polite"
        >
          {feedback}
        </output>
      </section>
      {summary.error && (
        <section className="rounded-xl border p-5">
          <p className="text-sm" role="alert">
            Your other businesses could not be loaded.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => void summary.refetch()}
          >
            Try again
          </Button>
        </section>
      )}
      {summaryData &&
        summaryData.readyBusinesses.length +
          summaryData.pendingBusinesses.length >
          1 && (
          <section
            className="owner-home-businesses rounded-xl border p-5 sm:p-6"
            aria-labelledby="owner-businesses-title"
          >
            <h2
              id="owner-businesses-title"
              className="mb-4 text-lg font-semibold"
            >
              Your businesses
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {summaryData.readyBusinesses.map((business) => (
                <article
                  key={business.id}
                  className="min-w-0 rounded-lg border bg-background p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="owner-home-business-title">
                      <span className="owner-home-avatar" aria-hidden="true">
                        {business.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((word) => word[0])
                          .join("")}
                      </span>
                      {business.name}
                    </h3>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">
                      Ready
                    </span>
                  </div>
                  <a
                    href={storefrontUrl(business.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-xs text-primary underline underline-offset-4"
                  >
                    {business.slug}.ewatrade.com ↗
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      void share(business.name, business.slug, false)
                    }
                  >
                    {copied === business.slug ? "Copied ✓" : "Copy link"}
                  </Button>
                </article>
              ))}
              {summaryData.pendingBusinesses.map((business, index) => {
                const needed =
                  summaryData.readyBusinesses.length + index + 1 >
                  OWNER_PLAN_LIMITS.growth
                    ? "Pro"
                    : "Growth"
                return (
                  <article
                    key={business.id ?? business.slug}
                    className="min-w-0 rounded-lg border border-dashed p-4"
                  >
                    <h3 className="owner-home-business-title">
                      <span className="owner-home-avatar" aria-hidden="true">
                        {business.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((word) => word[0])
                          .join("")}
                      </span>
                      {business.name}
                    </h3>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {business.slug}.ewatrade.com
                    </p>
                    <p className="mt-3 text-sm">Waiting · needs {needed}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your business choices are saved. This business needs more
                      room on your plan.
                    </p>
                    <Link
                      className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-4"
                      href="/settings/billing"
                    >
                      Upgrade
                    </Link>
                  </article>
                )
              })}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Switch businesses from the top of Home.
            </p>
          </section>
        )}
    </div>
  )
}
