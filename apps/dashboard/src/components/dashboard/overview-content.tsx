import { CollapsibleSummary } from "@/components/collapsible-summary"
import { GettingStarted } from "@/components/dashboard/getting-started"
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
import { getGettingStartedActions } from "@/lib/dashboard-overview"
import { canAccessDashboardPath } from "@/lib/navigation"
import type { TenantContext, TenantStore } from "@/lib/tenant"
import { getDashboardFeatureAvailability } from "@/lib/workspace-feature-availability"
import { prisma } from "@ewatrade/db"
import { resolveOrderScope } from "@ewatrade/db/queries"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import Link from "next/link"
import { Suspense } from "react"

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
  tenant: Pick<TenantContext["tenant"], "id" | "name" | "slug" | "timezone">
  userId: string
}) {
  const availabilityRead = store
    ? getDashboardFeatureAvailability(store.id, tenant.id)
    : Promise.resolve(null)
  const scopeRead = store
    ? resolveOrderScope(prisma, {
        role: membership.role,
        userId,
        tenantId: tenant.id,
        storeId: store.id,
        allowedStoreIds,
      })
    : Promise.resolve(undefined)
  const [scope, availability] = await Promise.all([scopeRead, availabilityRead])
  // Matches the shell's catalog sheet and assistant launcher gating.
  const navigationContext = {
    staffAccessMode: membership.staffAccessMode,
    catalogEditor: membership.catalogEditor,
  }
  const actions =
    availability && !availability.hasOrders
      ? getGettingStartedActions(membership.role, availability, membership)
      : []
  const role = membership.role
  const isOwner = ["OWNER", "ADMIN"].includes(role)
  const timeZone = tenant?.timezone ?? "Africa/Lagos"
  // Overview order (workshop direction 02, "Numbers first"): numbers, what
  // needs the owner, recent orders, then setup and the online store link.
  // While there are no orders, setup leads instead.
  const setup = store ? (
    <SetupAssistant
      key="setup"
      hasCatalogItems={availability?.hasCatalogItems ?? false}
      offerSetup={actions.length > 0}
      fallback={
        actions.length === 0 ? null : (
          <GettingStarted
            actions={actions}
            store={{
              businessProfileKey:
                store.businessOnboarding?.businessProfileKey ?? null,
              id: store.id,
              currencyCode: store.currencyCode,
            }}
          />
        )
      }
    />
  ) : null
  const numbers =
    availability && store && tenant ? (
      <CollapsibleSummary key="numbers">
        <ErrorBoundary errorComponent={OverviewNumbersError}>
          <Suspense
            fallback={<OverviewMetricsSkeleton availability={availability} />}
          >
            <OverviewMetrics
              availability={availability}
              store={store}
              tenantId={tenant.id}
              createdByUserId={scope?.createdByUserId}
            />
          </Suspense>
        </ErrorBoundary>
      </CollapsibleSummary>
    ) : null
  const needsYou =
    store && isOwner ? (
      <OverviewNeedsYou
        key="needs-you"
        storeId={store.id}
        storeName={store.name}
        timeZone={timeZone}
      />
    ) : null
  const recent =
    availability?.hasOrders && store ? (
      <section
        key="recent"
        className="flex min-w-0 flex-col rounded-lg border border-border bg-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="font-semibold">
            {["CASHIER", "OPERATOR"].includes(role)
              ? "Your recent orders"
              : "Recent orders"}
          </h2>
          {canAccessDashboardPath(
            "/sales",
            membership.role,
            navigationContext,
          ) ? (
            <Link
              href="/sales"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View all
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
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
              tenantId={tenant?.id ?? ""}
              timeZone={timeZone}
              createdByUserId={scope?.createdByUserId}
            />
          </Suspense>
        </ErrorBoundary>
      </section>
    ) : null
  const storeLink =
    store && tenant && isOwner ? (
      <OnlineStoreStrip
        key={`store:${tenant.id}:${store.id}`}
        tenant={{ id: tenant.id, name: tenant.name, slug: tenant.slug }}
        hasCatalogItems={availability?.hasCatalogItems ?? false}
      />
    ) : null
  const businesses =
    store && tenant && isOwner ? (
      <OwnerBusinesses key={`businesses:${tenant.id}`} />
    ) : null
  const sections = availability?.hasOrders
    ? [numbers, needsYou, recent, setup, storeLink, businesses]
    : [setup, needsYou, storeLink, numbers, businesses]

  return <>{sections}</>
}
