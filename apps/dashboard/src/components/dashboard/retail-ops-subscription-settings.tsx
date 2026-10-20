"use client"

import {
  SettingsHeader,
  SettingsNotice,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type {
  RetailOpsPaidPlanId,
  RetailOpsPlanFeature,
} from "@ewatrade/db/subscription-plans"
import { Button, toast } from "@ewatrade/ui"
import {
  Analytics01Icon,
  Archive01Icon,
  Invoice01Icon,
  Package01Icon,
  Store04Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"

type SubscriptionSnapshot = RouterOutputs["retailOps"]["subscription"]
type Entitlement = SubscriptionSnapshot["entitlements"][number]
type Plan = SubscriptionSnapshot["plans"][number]

// The store limit is the "businesses" entitlement.
const ENTITLEMENT_LABELS: Record<Entitlement["key"], string> = {
  businesses: "Stores",
  products: "Catalog items",
  staff: "Staff",
  offlineDevices: "Offline devices",
  reportsHistoryDays: "Report history",
  ordersPerMonth: "Orders this month",
  storefrontItems: "Online store items",
}
const ENTITLEMENT_ORDER = Object.keys(
  ENTITLEMENT_LABELS,
) as Entitlement["key"][]

const ENTITLEMENT_ICONS: Record<Entitlement["key"], typeof Store04Icon> = {
  businesses: Store04Icon,
  offlineDevices: Archive01Icon,
  ordersPerMonth: Invoice01Icon,
  products: Package01Icon,
  reportsHistoryDays: Analytics01Icon,
  staff: UserCircle02Icon,
  storefrontItems: Store04Icon,
}

// Plain names for what a plan leaves out; matches the settings menu nouns.
const FEATURE_LABELS: Record<RetailOpsPlanFeature, string> = {
  invoices: "Receipts",
  finance: "Finance",
  staff: "Staff accounts",
  attachments: "Photos and documents",
  suppliers: "Suppliers",
  advancedReports: "Advanced reports",
  orderReminders: "Reminder emails",
  customerMessages: "WhatsApp messages",
  multipleBusinesses: "More than one store",
}
const FEATURE_ORDER = Object.keys(FEATURE_LABELS) as RetailOpsPlanFeature[]

const number = new Intl.NumberFormat("en-NG")

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(
    new Date(value),
  )
}

function planLimit(key: Entitlement["key"], limit: number | null) {
  if (limit === null) return "No limit"
  if (key === "reportsHistoryDays") return `${number.format(limit)} days`
  return number.format(limit)
}

function usageText(entitlement: Entitlement) {
  if (entitlement.key === "reportsHistoryDays")
    return entitlement.limit === null
      ? "All of it"
      : `Last ${number.format(entitlement.limit)} days`
  if (entitlement.limit === null)
    return `${number.format(entitlement.used)} · no limit`
  return `${number.format(entitlement.used)} of ${number.format(entitlement.limit)}`
}

function statusLabel(status: SubscriptionSnapshot["subscription"]["status"]) {
  if (status === "past_due") return "Payment due"
  if (status === "trialing") return "Trial"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function Pill({
  children,
  tone,
}: {
  children: ReactNode
  tone: "ok" | "warn" | "muted"
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "ok" &&
          "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
        tone === "warn" &&
          "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

function UsageRow({ entitlement }: { entitlement: Entitlement }) {
  const full = entitlement.isAtLimit
  const share =
    entitlement.limit && entitlement.key !== "reportsHistoryDays"
      ? Math.min(100, Math.round((entitlement.used / entitlement.limit) * 100))
      : null
  return (
    <SettingsRow
      label={
        <span className="inline-flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <HugeiconsIcon
              icon={ENTITLEMENT_ICONS[entitlement.key]}
              className="size-4 text-muted-foreground"
            />
          </span>
          {ENTITLEMENT_LABELS[entitlement.key]}
        </span>
      }
      description={
        share === null ? null : (
          <span
            className="mt-1.5 block h-1.5 max-w-72 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <span
              className={cn(
                "block h-full rounded-full",
                full ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${share}%` }}
            />
          </span>
        )
      }
    >
      <span className="text-sm tabular-nums">{usageText(entitlement)}</span>
      {full ? <Pill tone="warn">Limit reached</Pill> : null}
    </SettingsRow>
  )
}

function PlanCard({
  current,
  onUpgrade,
  pending,
  plan,
  upgrade,
}: {
  current: boolean
  onUpgrade: (planId: RetailOpsPaidPlanId) => void
  pending: boolean
  plan: Plan
  upgrade: boolean
}) {
  const missing = FEATURE_ORDER.filter(
    (feature) => !plan.features.includes(feature),
  )
  const limits: Array<[string, string]> = [
    ["Stores", planLimit("businesses", plan.limits.businesses)],
    ["Catalog items", planLimit("products", plan.limits.products)],
    ["Staff", planLimit("staff", plan.limits.staff)],
    [
      "Orders per month",
      planLimit("ordersPerMonth", plan.limits.ordersPerMonth),
    ],
    [
      "Report history",
      planLimit("reportsHistoryDays", plan.limits.reportsHistoryDays),
    ],
  ]
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card p-3.5",
        current ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{plan.name}</h3>
        {current ? <Pill tone="ok">Your plan</Pill> : null}
      </div>
      <p className="text-sm font-semibold">{plan.priceLabel}</p>
      <p className="text-sm text-muted-foreground">{plan.description}</p>
      <dl className="mt-2 grid gap-1 text-sm">
        {limits.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {missing.length ? (
        <div className="mt-2 border-t border-border pt-2 text-sm">
          <p className="text-muted-foreground">Not included</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {missing.map((feature) => (
              <li key={feature}>{FEATURE_LABELS[feature]}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {upgrade && plan.id !== "free" ? (
        <Button
          type="button"
          size="sm"
          className="mt-3 w-full"
          disabled={pending}
          onClick={() => {
            if (plan.id !== "free") onUpgrade(plan.id)
          }}
        >
          {pending ? "Checking…" : `Upgrade to ${plan.name}`}
        </Button>
      ) : null}
    </div>
  )
}

function limitNotice(snapshot: SubscriptionSnapshot) {
  const full = snapshot.entitlements.find(
    (entitlement) =>
      entitlement.isAtLimit &&
      entitlement.limit !== null &&
      entitlement.key !== "reportsHistoryDays",
  )
  if (!full || full.limit === null) return null
  const used = full.limit
  const current = snapshot.plans.findIndex(
    (plan) => plan.id === snapshot.plan.id,
  )
  const next = snapshot.plans.slice(current + 1).find((plan) => {
    const limit = plan.limits[full.key]
    return limit === null || limit > used
  })
  const more = next
    ? `move to ${next.name} for ${planLimit(full.key, next.limits[full.key]).toLowerCase()}.`
    : "contact us for more."
  return (
    <>
      You've used all <b>{number.format(used)}</b>{" "}
      {ENTITLEMENT_LABELS[full.key].toLowerCase()} on {snapshot.plan.name}.{" "}
      {full.key === "products"
        ? `Archive items you no longer sell, or ${more}`
        : more.charAt(0).toUpperCase() + more.slice(1)}
    </>
  )
}

export function RetailOpsSubscriptionSettings() {
  const trpc = useTRPC()
  const subscriptionQuery = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      retry: false,
    }),
  )
  const upgrade = useMutation(
    trpc.retailOps.createSubscriptionCheckoutIntent.mutationOptions({
      onSuccess: (intent) => toast(intent.message),
      onError: (error) => toast.error(error.message),
    }),
  )
  const snapshot = subscriptionQuery.data
  const notice = snapshot ? limitNotice(snapshot) : null
  const currentIndex = snapshot
    ? snapshot.plans.findIndex((plan) => plan.id === snapshot.plan.id)
    : -1

  return (
    <SettingsPage>
      <SettingsHeader
        title="Plan and billing"
        description="Your plan, how much you've used, and what each plan includes."
      />

      {subscriptionQuery.isError ? (
        <SettingsNotice
          tone="warning"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void subscriptionQuery.refetch()}
            >
              Try again
            </Button>
          }
        >
          Couldn't load your plan. {subscriptionQuery.error.message}
        </SettingsNotice>
      ) : null}

      {notice ? (
        <SettingsNotice
          tone="warning"
          action={
            <Button
              variant="outline"
              size="sm"
              className="bg-background"
              onClick={() =>
                document
                  .getElementById("plans")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Compare plans
            </Button>
          }
        >
          {notice}
        </SettingsNotice>
      ) : null}

      <SettingsSection title="Your plan">
        {snapshot ? (
          <SettingsRow
            label={
              <span className="text-lg font-semibold">
                {snapshot.plan.name}
              </span>
            }
            description={
              <>
                {snapshot.plan.priceLabel}.
                {snapshot.subscription.status === "trialing" &&
                snapshot.subscription.trialEndsAt
                  ? ` Your trial ends on ${formatDate(snapshot.subscription.trialEndsAt)}.`
                  : snapshot.subscription.currentPeriodEndsAt
                    ? ` Renews on ${formatDate(snapshot.subscription.currentPeriodEndsAt)}.`
                    : ""}
              </>
            }
          >
            <Pill
              tone={snapshot.subscription.status === "active" ? "ok" : "warn"}
            >
              {statusLabel(snapshot.subscription.status)}
            </Pill>
          </SettingsRow>
        ) : (
          <SettingsRow label="Loading your plan…" />
        )}
      </SettingsSection>

      <SettingsSection title="What you've used">
        {snapshot ? (
          ENTITLEMENT_ORDER.flatMap((key) => {
            const entitlement = snapshot.entitlements.find(
              (row) => row.key === key,
            )
            return entitlement ? (
              <UsageRow key={key} entitlement={entitlement} />
            ) : (
              []
            )
          })
        ) : (
          <SettingsRow label="Loading what you've used…" />
        )}
      </SettingsSection>

      <section id="plans" className="grid scroll-mt-4 gap-2.5">
        <h2 className="text-[15px] font-semibold">Plans</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(snapshot?.plans ?? []).map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={plan.id === snapshot?.plan.id}
              upgrade={currentIndex >= 0 && index > currentIndex}
              pending={
                upgrade.isPending && upgrade.variables?.planId === plan.id
              }
              onUpgrade={(planId) =>
                upgrade.mutate({ planId, surface: "dashboard" })
              }
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Free is free forever. Starter, Growth and Pro are free during launch.
          Free plan orders reset on the 1st of each month.
        </p>
      </section>
    </SettingsPage>
  )
}
