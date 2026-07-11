"use client"

import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import {
  Analytics01Icon,
  Archive01Icon,
  Package01Icon,
  Settings01Icon,
  Store04Icon,
  UserCircle02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"

type SubscriptionSnapshot = RouterOutputs["retailOps"]["subscription"]
type CheckoutIntent =
  RouterOutputs["retailOps"]["createSubscriptionCheckoutIntent"]
type Entitlement = SubscriptionSnapshot["entitlements"][number]
type Plan = SubscriptionSnapshot["plans"][number]

const ENTITLEMENT_LABELS: Record<Entitlement["key"], string> = {
  businesses: "Businesses",
  offlineDevices: "Offline devices",
  products: "Products",
  reportsHistoryDays: "Report history",
  staff: "Staff",
}

const ENTITLEMENT_ICONS: Record<Entitlement["key"], typeof Store04Icon> = {
  businesses: Store04Icon,
  offlineDevices: Archive01Icon,
  products: Package01Icon,
  reportsHistoryDays: Analytics01Icon,
  staff: UserCircle02Icon,
}

function formatDate(value: string | null) {
  if (!value) return "Not set"

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
  }).format(new Date(value))
}

function formatLimit(key: Entitlement["key"], limit: number) {
  if (key === "reportsHistoryDays") {
    return `${limit} days`
  }

  return new Intl.NumberFormat("en-NG").format(limit)
}

function formatUsage(entitlement: Entitlement) {
  if (entitlement.key === "reportsHistoryDays") {
    return `${formatLimit(entitlement.key, entitlement.limit)} included`
  }

  return `${new Intl.NumberFormat("en-NG").format(
    entitlement.used,
  )} of ${formatLimit(entitlement.key, entitlement.limit)} used`
}

function statusLabel(status: SubscriptionSnapshot["subscription"]["status"]) {
  if (status === "past_due") return "Past due"
  if (status === "trialing") return "Trial"

  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusTone(status: SubscriptionSnapshot["subscription"]["status"]) {
  if (status === "active") return "bg-emerald-50 text-emerald-700"
  if (status === "past_due") return "bg-amber-50 text-amber-700"
  if (status === "cancelled") return "bg-red-50 text-red-700"

  return "bg-primary/10 text-primary"
}

function EntitlementRow({ entitlement }: { entitlement: Entitlement }) {
  const Icon = ENTITLEMENT_ICONS[entitlement.key]

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <HugeiconsIcon icon={Icon} className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {ENTITLEMENT_LABELS[entitlement.key]}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatUsage(entitlement)}
          </p>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
          entitlement.isAtLimit
            ? "bg-amber-50 text-amber-700"
            : "bg-emerald-50 text-emerald-700",
        )}
      >
        {entitlement.isAtLimit ? "At limit" : "Available"}
      </span>
    </div>
  )
}

function PlanCard({
  checkoutPending,
  current,
  onCheckout,
  plan,
}: {
  checkoutPending: boolean
  current: boolean
  onCheckout: (planId: Plan["id"]) => void
  plan: Plan
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-background p-4 shadow-sm",
        current ? "border-primary" : "border-border/70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{plan.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.description}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            current ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
          )}
        >
          {current ? "Current" : plan.priceLabel}
        </span>
      </div>
      <dl className="mt-4 grid gap-2 text-xs text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>Businesses</dt>
          <dd className="font-medium text-foreground">
            {formatLimit("businesses", plan.limits.businesses)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Products</dt>
          <dd className="font-medium text-foreground">
            {formatLimit("products", plan.limits.products)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Staff</dt>
          <dd className="font-medium text-foreground">
            {formatLimit("staff", plan.limits.staff)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Report history</dt>
          <dd className="font-medium text-foreground">
            {formatLimit("reportsHistoryDays", plan.limits.reportsHistoryDays)}
          </dd>
        </div>
      </dl>
      <Button
        type="button"
        variant={current ? "outline" : "default"}
        size="sm"
        disabled={current || checkoutPending}
        onClick={() => onCheckout(plan.id)}
        className="mt-4 w-full rounded-lg"
      >
        {current
          ? "Active plan"
          : checkoutPending
            ? "Preparing checkout"
            : "Request upgrade"}
      </Button>
    </div>
  )
}

function CheckoutIntentNotice({ intent }: { intent: CheckoutIntent }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <p className="font-medium text-foreground">
        {intent.targetPlan.name} checkout
      </p>
      <p className="mt-1 text-muted-foreground">{intent.message}</p>
    </div>
  )
}

export function RetailOpsSubscriptionSettings() {
  const trpc = useTRPC()
  const subscriptionQuery = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      retry: false,
    }),
  )
  const checkoutIntentMutation = useMutation(
    trpc.retailOps.createSubscriptionCheckoutIntent.mutationOptions(),
  )
  const snapshot = subscriptionQuery.data
  const requestCheckout = (planId: Plan["id"]) => {
    checkoutIntentMutation.mutate({
      planId,
      surface: "dashboard",
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <HugeiconsIcon icon={Settings01Icon} className="size-4" />
          Settings
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Billing and plan
        </h1>
        <p className="text-sm text-muted-foreground">
          Plan limits, usage, and billing state for Retail Ops.
        </p>
      </div>

      {subscriptionQuery.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {subscriptionQuery.error.message}
        </div>
      ) : null}

      {checkoutIntentMutation.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {checkoutIntentMutation.error.message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-border/70 bg-background p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current plan
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                {snapshot?.plan.name ?? "Loading..."}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {snapshot?.tenant.name ?? "Resolving tenant plan"}
              </p>
            </div>
            {snapshot ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  statusTone(snapshot.subscription.status),
                )}
              >
                {statusLabel(snapshot.subscription.status)}
              </span>
            ) : null}
          </div>

          <dl className="mt-6 grid gap-3 text-sm">
            <div className="flex justify-between gap-4 border-t border-border/70 pt-3">
              <dt className="text-muted-foreground">Trial ends</dt>
              <dd className="font-medium">
                {formatDate(snapshot?.subscription.trialEndsAt ?? null)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border/70 pt-3">
              <dt className="text-muted-foreground">Current period ends</dt>
              <dd className="font-medium">
                {formatDate(snapshot?.subscription.currentPeriodEndsAt ?? null)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border/70 pt-3">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="font-medium">
                {snapshot?.subscription.source === "tenant_subscription"
                  ? "Billing record"
                  : snapshot?.subscription.source === "tenant_metadata"
                  ? "Production metadata"
                  : "Starter trial fallback"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm">
          <div className="border-b border-border/70 px-4 py-3">
            <h2 className="text-sm font-semibold">Usage and limits</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Server-enforced counters for plan-limited Retail Ops workflows.
            </p>
          </div>
          {snapshot ? (
            snapshot.entitlements.map((entitlement) => (
              <EntitlementRow key={entitlement.key} entitlement={entitlement} />
            ))
          ) : (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              Loading subscription usage...
            </div>
          )}
        </section>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {(snapshot?.plans ?? []).map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={plan.id === snapshot?.plan.id}
            checkoutPending={checkoutIntentMutation.isPending}
            onCheckout={requestCheckout}
          />
        ))}
      </section>

      {checkoutIntentMutation.data ? (
        <CheckoutIntentNotice intent={checkoutIntentMutation.data} />
      ) : null}

      <div className="rounded-lg border border-border/70 bg-background px-4 py-3 text-xs text-muted-foreground">
        Billing checkout is provider-neutral in this phase. Plan limits are
        enforced by production Retail Ops APIs; dedicated subscription rows,
        checkout, webhooks, invoices, and app-store purchases remain future
        slices.
      </div>
    </div>
  )
}
