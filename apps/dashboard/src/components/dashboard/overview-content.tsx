import { GettingStarted } from "@/components/dashboard/getting-started"
import { LifecycleNudgeCard } from "@/components/dashboard/lifecycle-nudge-card"
import {
  OverviewMetrics,
  OverviewMetricsSkeleton,
} from "@/components/dashboard/overview-metrics"
import { OverviewNeedsYou } from "@/components/dashboard/overview-needs-you"
import { OverviewRecentOrders } from "@/components/dashboard/overview-recent-orders"
import {
  OnlineStoreStrip,
  OwnerBusinesses,
} from "@/components/dashboard/owner-signup-home"
import {
  OverviewNumbersError,
  OverviewOrdersError,
} from "@/components/dashboard/workspace-error"
import { SetupAssistant } from "@/components/setup-assistant/setup-assistant"
import {
  getGettingStartedActions,
  getOverviewAccess,
} from "@/lib/dashboard-overview"
import { canAccessDashboardPath } from "@/lib/navigation"
import { isStorefrontLive } from "@/lib/storefront-manage"
import type { TenantContext, TenantStore } from "@/lib/tenant"
import { getDashboardFeatureAvailability } from "@/lib/workspace-feature-availability"
import { prisma } from "@ewatrade/db"
import { resolveOrderScope } from "@ewatrade/db/queries"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import Link from "next/link"
import { Suspense } from "react"

/**
 * "Today" and the date above the numbers, for people who see sales once the
 * Store has orders. Reuses the request's cached presence read.
 */
export async function OverviewTodayHeading({
  role,
  storeId,
  tenantId,
  timeZone,
}: {
  role: string
  storeId: string
  tenantId: string
  timeZone: string
}) {
  if (!getOverviewAccess(role).sales) return null
  // The content below reports a failed read; the heading just stays away.
  const availability = await getDashboardFeatureAvailability(
    storeId,
    tenantId,
  ).catch(() => null)
  if (!availability?.hasOrders) return null
  return (
    <div data-overview-today className="min-w-0">
      <h2 className="text-lg font-semibold">Today</h2>
      <p className="text-sm text-muted-foreground">
        {new Date().toLocaleDateString("en-NG", {
          timeZone,
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>
    </div>
  )
}

/**
 * Overview, top to bottom: today's numbers, what needs the owner (approvals,
 * the setup list, one nudge), recent orders, then the online store. Before the
 * first order the setup list leads instead. Each card is shown only to roles
 * that may see it (`getOverviewAccess`).
 */
export async function OverviewContent({
  allowedStoreIds,
  membership,
  store,
  tenant,
  userId,
}: {
  allowedStoreIds: string[]
  membership: Pick<
    TenantContext["membership"],
    "role" | "staffAccessMode" | "catalogEditor"
  >
  store: TenantStore | null
  tenant: Pick<TenantContext["tenant"], "id" | "name" | "slug" | "timezone"> & {
    storefrontItemLimit: number | null
  }
  userId: string
}) {
  const access = getOverviewAccess(membership.role)
  const availabilityRead = store
    ? getDashboardFeatureAvailability(store.id, tenant.id)
    : Promise.resolve(null)
  const scopeRead =
    store && access.sales
      ? resolveOrderScope(prisma, {
          role: membership.role,
          userId,
          tenantId: tenant.id,
          storeId: store.id,
          allowedStoreIds,
        })
      : Promise.resolve(undefined)
  // The store strip offers set-up until customers can visit (1 SQL).
  const liveRead =
    store && access.owner ? isStorefrontLive(tenant.id) : Promise.resolve(false)
  const [scope, availability, storeLive] = await Promise.all([
    scopeRead,
    availabilityRead,
    liveRead,
  ])
  // Matches the shell's catalog sheet and assistant launcher gating.
  const navigationContext = {
    staffAccessMode: membership.staffAccessMode,
    catalogEditor: membership.catalogEditor,
  }
  const firstSteps =
    availability && !availability.hasOrders
      ? getGettingStartedActions(membership.role, availability, membership)
      : []
  const timeZone = tenant.timezone ?? "Africa/Lagos"
  const hasSales = Boolean(store && access.sales && availability?.hasOrders)
  const own = scope?.createdByUserId !== undefined

  const gettingStarted = firstSteps.length ? (
    <GettingStarted actions={firstSteps} />
  ) : null
  // Owners and Admins get the setup list banner beside the first steps; the
  // API answers nobody else, so other roles never ask.
  const setup =
    store && access.owner ? (
      <SetupAssistant
        key="setup"
        hasCatalogItems={availability?.hasCatalogItems ?? false}
        offerSetup={firstSteps.length > 0}
        fallback={gettingStarted}
      />
    ) : gettingStarted ? (
      <div key="setup">{gettingStarted}</div>
    ) : null
  const numbers =
    hasSales && store ? (
      <ErrorBoundary key="numbers" errorComponent={OverviewNumbersError}>
        <Suspense fallback={<OverviewMetricsSkeleton />}>
          <OverviewMetrics
            storeId={store.id}
            tenantId={tenant.id}
            currencyCode={store.currencyCode}
            timeZone={timeZone}
            createdByUserId={scope?.createdByUserId}
          />
        </Suspense>
      </ErrorBoundary>
    ) : null
  const needsYou =
    store && access.owner ? (
      <OverviewNeedsYou
        key="needs-you"
        storeId={store.id}
        storeName={store.name}
        timeZone={timeZone}
      />
    ) : null
  // One lifecycle nudge at a time, chosen by the server sweep (Owner/Admin).
  const nudge =
    store && access.owner ? <LifecycleNudgeCard key="nudge" /> : null
  const recent =
    hasSales && store ? (
      <section
        key="recent"
        aria-labelledby="recent-orders-title"
        className="flex min-w-0 flex-col overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
      >
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
          <h2 id="recent-orders-title" className="text-lg font-semibold">
            {own ? "Your recent orders" : "Recent orders"}
          </h2>
          {canAccessDashboardPath(
            "/sales",
            membership.role,
            navigationContext,
          ) ? (
            <Link
              href="/sales"
              className="-mr-2 inline-flex min-h-11 items-center gap-1 px-2 font-medium text-[var(--link)] hover:underline"
            >
              All orders
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
            </Link>
          ) : null}
        </div>
        <ErrorBoundary errorComponent={OverviewOrdersError}>
          <Suspense
            fallback={
              <div className="m-4 h-60 animate-pulse rounded-md bg-muted" />
            }
          >
            <OverviewRecentOrders
              storeId={store.id}
              tenantId={tenant.id}
              timeZone={timeZone}
              createdByUserId={scope?.createdByUserId}
            />
          </Suspense>
        </ErrorBoundary>
      </section>
    ) : null
  const storeLink =
    store && access.owner ? (
      <OnlineStoreStrip
        key={`store:${tenant.id}:${store.id}`}
        tenant={{ id: tenant.id, name: tenant.name, slug: tenant.slug }}
        hasCatalogItems={availability?.hasCatalogItems ?? false}
        itemLimit={tenant.storefrontItemLimit}
        live={storeLive}
      />
    ) : null
  const businesses =
    store && access.owner ? (
      <OwnerBusinesses
        key={`businesses:${tenant.id}`}
        currentTenantId={tenant.id}
      />
    ) : null
  const sections = hasSales
    ? [numbers, needsYou, setup, nudge, recent, storeLink, businesses]
    : [setup, needsYou, nudge, storeLink, businesses]

  return <>{sections}</>
}
