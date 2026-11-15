"use client"

import type { StorefrontSummary } from "@/lib/storefront-manage"
import { Button, cn } from "@ewatrade/ui"
import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Copy01Icon,
  Globe02Icon,
  InboxIcon,
  PackageIcon,
  PaintBoardIcon,
  Share08Icon,
  Tick02Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { type ReactNode, useState } from "react"
import { StorePreviewDialog } from "./store-preview-dialog"
import { StoreShareDialog, useCopyLink } from "./store-share-dialog"

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

const DOMAIN_LABEL: Record<string, string> = {
  ACTIVE: "Live",
  OWNERSHIP_PENDING: "Needs one record",
  DNS_CONFIGURING: "Connecting",
  VERIFYING: "Connecting",
  FAILED: "Needs attention",
}

/**
 * Online store, for Owners and Admins: is it live, its link, and one list of
 * what they can change (design, preview, items, orders, web address).
 */
export function OnlineStore({
  businessName,
  summary,
  itemLimit,
  domainsEnabled,
}: {
  businessName: string
  summary: StorefrontSummary
  itemLimit: number | null
  domainsEnabled: boolean
}) {
  const [sharing, setSharing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const live = summary.state === "live"
  const customDomain = summary.domains.find(
    (domain) => domain.status === "ACTIVE",
  )
  const url = customDomain ? `https://${customDomain.hostname}` : summary.url
  const pendingDomain = summary.domains.find(
    (domain) => domain.status !== "ACTIVE",
  )
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 pt-4 pb-10 md:pt-6">
      <StatusCard
        businessName={businessName}
        summary={summary}
        url={url}
        onShare={() => setSharing(true)}
      />
      <ul
        aria-label="Your online store"
        className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
      >
        <Row
          href="/storefront/studio"
          icon={PaintBoardIcon}
          title={summary.state === "none" ? "Design your store" : "Edit design"}
          detail={
            summary.unpublishedChanges
              ? "You have changes that aren’t live yet"
              : "Colours, words and sections"
          }
          attention={summary.unpublishedChanges}
        />
        {summary.state === "none" ? null : (
          <Row
            icon={ViewIcon}
            title="Preview"
            detail={
              live ? "See your saved design" : "See it before you publish"
            }
            onClick={() => setPreviewing(true)}
          />
        )}
        <Row
          href="/catalog"
          icon={PackageIcon}
          title="Items that show"
          detail={itemsLine(summary.hiddenItems, itemLimit)}
        />
        <Row
          href="/website-requests"
          icon={InboxIcon}
          title="Orders from your store"
          detail={
            summary.toReview
              ? `${summary.toReview} waiting for you`
              : "Nothing waiting"
          }
          attention={summary.toReview > 0}
        />
        {domainsEnabled ? (
          <Row
            href={
              summary.domains.length
                ? "/settings/domains"
                : "/settings/domains?domainMode=connect"
            }
            icon={Globe02Icon}
            title={
              summary.domains.length
                ? "Your web address"
                : "Connect your own web address"
            }
            detail={
              customDomain
                ? customDomain.hostname
                : pendingDomain
                  ? `${pendingDomain.hostname} · ${DOMAIN_LABEL[pendingDomain.status] ?? "Not connected"}`
                  : "Like yourbusiness.com"
            }
            attention={Boolean(pendingDomain && !customDomain)}
          />
        ) : null}
      </ul>
      <StoreShareDialog
        open={sharing}
        onOpenChange={setSharing}
        businessName={businessName}
        url={url}
      />
      <StorePreviewDialog open={previewing} onOpenChange={setPreviewing} />
    </div>
  )
}

function itemsLine(hidden: number, limit: number | null) {
  const base =
    hidden > 0
      ? `Everything for sale, except ${hidden} you hid`
      : "Everything for sale"
  return limit === null ? base : `Your first ${limit} items on your plan`
}

function StatusCard({
  businessName,
  summary,
  url,
  onShare,
}: {
  businessName: string
  summary: StorefrontSummary
  url: string
  onShare: () => void
}) {
  const { copied, copy, problem } = useCopyLink(url)
  const live = summary.state === "live"
  const title =
    summary.state === "live"
      ? "Your store is live"
      : summary.state === "paused"
        ? "Your store is paused"
        : summary.state === "draft"
          ? "Your store isn’t live yet"
          : "Your store isn’t online yet"
  const detail =
    summary.state === "live"
      ? summary.publishedAt
        ? `Published ${day.format(new Date(summary.publishedAt))}`
        : null
      : summary.state === "paused"
        ? `${summary.storeName ?? "This store"} is turned off in Settings.`
        : summary.state === "draft"
          ? "Publish your design so customers can visit."
          : `Give ${businessName} a shop customers can order from.`
  return (
    <section
      aria-labelledby="store-status-title"
      className="grid gap-4 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-2 size-2.5 shrink-0 rounded-full",
            live ? "bg-[var(--success-foreground)]" : "bg-muted-foreground",
          )}
        />
        <div className="grid min-w-0 gap-1">
          <h2 id="store-status-title" className="text-xl">
            {title}
          </h2>
          {detail ? <p className="text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
      {live ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-[var(--ui-radius-control)] border border-border bg-[var(--canvas)] px-4 text-[var(--link)] hover:underline"
          >
            <span className="min-w-0 flex-1 truncate">
              {url.replace(/^https:\/\//, "")}
            </span>
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              className="size-4 shrink-0"
              aria-label="Opens in a new tab"
            />
          </a>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button onClick={onShare}>
              <HugeiconsIcon icon={Share08Icon} data-icon="inline-start" />
              Share
            </Button>
            <Button variant="outline" onClick={() => void copy()}>
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                data-icon="inline-start"
              />
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <output
            aria-live="polite"
            className="block text-sm text-destructive empty:hidden"
          >
            {problem}
          </output>
        </>
      ) : summary.state === "paused" ? (
        <Button
          className="w-full sm:w-fit"
          variant="outline"
          render={<Link href="/settings/stores" />}
        >
          Open store settings
        </Button>
      ) : (
        <Button
          className="w-full sm:w-fit"
          render={<Link href="/storefront/studio" />}
        >
          {summary.state === "draft"
            ? "Finish and publish"
            : "Set up your store"}
        </Button>
      )}
    </section>
  )
}

function Row({
  icon,
  title,
  detail,
  href,
  onClick,
  attention = false,
}: {
  icon: typeof ViewIcon
  title: string
  detail: ReactNode
  href?: string
  onClick?: () => void
  attention?: boolean
}) {
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-muted text-muted-foreground">
        <HugeiconsIcon icon={icon} className="size-5" />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5 text-left">
        <span className="font-medium">{title}</span>
        <span
          className={cn(
            "truncate text-sm",
            attention
              ? "font-medium text-[var(--warning-foreground)]"
              : "text-muted-foreground",
          )}
        >
          {detail}
        </span>
      </span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className="size-5 shrink-0 text-muted-foreground"
      />
    </>
  )
  const className =
    "flex min-h-[72px] w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--hover)] focus-visible:-outline-offset-[3px] sm:px-5"
  return (
    <li>
      {href ? (
        <Link href={href} className={className}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={className}>
          {body}
        </button>
      )}
    </li>
  )
}
