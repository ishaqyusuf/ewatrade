import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  adminNavigation: join(MOBILE_DIR, "src/lib/admin-navigation.ts"),
  subscriptionsRouter: join(
    REPO_ROOT,
    "apps/api/src/trpc/routers/retail-ops-subscriptions.ts",
  ),
  subscriptionLib: join(MOBILE_DIR, "src/lib/retail-ops-subscription.ts"),
  subscriptionPresentation: join(
    MOBILE_DIR,
    "src/components/mobile/subscription-plan-presentation.ts",
  ),
  subscriptionRoute: join(MOBILE_DIR, "src/app/subscription-modal.tsx"),
  secondaryOperations: join(
    MOBILE_DIR,
    "src/components/mobile/secondary-operations.tsx",
  ),
  subscriptionSheet: join(
    MOBILE_DIR,
    "src/components/mobile/subscription-plan-sheet.tsx",
  ),
  subscriptionStore: join(MOBILE_DIR, "src/store/subscriptionStore.ts"),
  themeToggle: join(
    MOBILE_DIR,
    "src/components/mobile/floating-theme-toggle.tsx",
  ),
}

const CONTRACTS = [
  {
    file: FILES.subscriptionLib,
    markers: [
      'export type RetailOpsPlanId = "starter" | "growth" | "pro"',
      "RETAIL_OPS_PLANS",
      'id: "starter"',
      'id: "growth"',
      'id: "pro"',
      'name: "Starter"',
      'name: "Growth"',
      'name: "Pro"',
      "offlineDevices",
      "reportsHistoryDays",
      "getDefaultSubscription",
      'planId: "starter"',
      'status: "trialing"',
      "getUsageLimitState",
    ],
    reason:
      "subscription model must keep the three MVP tiers, business limits, default starter trial, and usage-limit labels",
  },
  {
    file: FILES.subscriptionStore,
    markers: [
      "createJSONStorage",
      "zustandStorage",
      "ewatrade-mobile-subscriptions",
      "setBusinessPlan",
      "subscriptions",
      'status: "active"',
    ],
    reason:
      "mobile subscription fallback state must stay business-scoped and persisted locally",
  },
  {
    file: FILES.subscriptionPresentation,
    markers: [
      "SUBSCRIPTION_SCREEN_COPY",
      'title: "Plan & billing"',
      "getSubscriptionUsagePresentation",
      "getSubscriptionStatusTone",
      "getSubscriptionPlanPresentation",
      'statusLabel: limitState.isAtLimit ? "At limit" : null',
      "canSelect",
      "Online required",
      "Request upgrade",
    ],
    reason:
      "subscription presentation must keep the compact title, exact usage pressure, and current-versus-upgrade interaction rules",
  },
  {
    file: FILES.subscriptionSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "StatusBadge",
      "StatusBanner",
      "trpc.retailOps.subscription",
      "trpc.retailOps.createSubscriptionCheckoutIntent",
      "shouldUseProductionSnapshot",
      "RETAIL_OPS_PLANS",
      "UsageTile",
      "PlanCard",
      "SUBSCRIPTION_SCREEN_COPY",
      "Current plan",
      "Compare plans",
      "accessibilityLabel={`${plan.name} plan, ${presentation.badgeLabel}`}",
      "presentation.canSelect ? onSelect : undefined",
      "() => void subscriptionQuery.refetch()",
      "Upgrade requests need production billing",
      "Linking.canOpenURL",
      "Linking.openURL",
      'testID="subscription-scroll"',
      "contentContainerStyle={{ paddingBottom: 40 }}",
    ],
    forbiddenMarkers: [
      "Business plan",
      ">\n        Done\n      </ActionButton>",
    ],
    reason:
      "subscription sheet must keep production snapshot reads, local fallback, compact usage and three-tier comparison, provider-neutral checkout handoff, and safe link opening",
  },
  {
    file: FILES.subscriptionRoute,
    markers: [
      "SUBSCRIPTION_SCREEN_COPY",
      'closeLabel="Close plan and billing"',
      "title={SUBSCRIPTION_SCREEN_COPY.title}",
    ],
    reason:
      "the full-screen route must own the single Plan and billing title and close action",
  },
  {
    file: FILES.themeToggle,
    markers: ['pathname.startsWith("/subscription-modal")'],
    reason:
      "the development theme control must not overlap subscription usage or checkout actions",
  },
  {
    file: FILES.secondaryOperations,
    markers: [
      "SecondarySheetHeader",
      "SecondaryOperationalRow",
      "onPress",
      "selected",
      "border-t border-border py-4",
      "rounded-full bg-primary/10",
    ],
    reason:
      "secondary operational screens must share flat headers and selectable divider rows for plan and settings-style surfaces",
  },
  {
    file: FILES.adminNavigation,
    markers: ['label: "Plan & billing"', 'href: "/subscription-modal"'],
    reason: "the owner More menu must keep a route to the subscription surface",
  },
  {
    file: FILES.subscriptionsRouter,
    markers: [
      "assertCanViewRetailOpsSubscription",
      "assertCanManageRetailOpsBilling",
      "subscription: protectedProcedure",
      "getRetailOpsSubscriptionSnapshot",
      "createSubscriptionCheckoutIntent: protectedProcedure",
      "retailOpsCreateSubscriptionCheckoutIntentSchema",
      "createRetailOpsSubscriptionCheckoutIntent",
      "surface: input.surface",
    ],
    reason:
      "API must keep billing permission boundaries, subscription snapshot reads, and provider-neutral checkout intent creation",
  },
]
const failures = []

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )
  const forbiddenMarkers = (contract.forbiddenMarkers ?? []).filter((marker) =>
    source.includes(marker),
  )

  if (missingMarkers.length > 0 || forbiddenMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `${
        missingMarkers.length > 0
          ? `missing ${missingMarkers.join(", ")}`
          : `must not include ${forbiddenMarkers.join(", ")}`
      } (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Subscription flow check failed. Restore the three-tier model, mobile plan surface, dashboard entry point, or billing API boundary.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Subscription flow check passed.")
