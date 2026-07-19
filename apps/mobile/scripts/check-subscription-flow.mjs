import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile");
const FILES = {
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  subscriptionsRouter: join(
    REPO_ROOT,
    "apps/api/src/trpc/routers/retail-ops-subscriptions.ts",
  ),
  subscriptionLib: join(MOBILE_DIR, "src/lib/retail-ops-subscription.ts"),
  secondaryOperations: join(
    MOBILE_DIR,
    "src/components/mobile/secondary-operations.tsx",
  ),
  subscriptionSheet: join(
    MOBILE_DIR,
    "src/components/mobile/subscription-plan-sheet.tsx",
  ),
  subscriptionStore: join(MOBILE_DIR, "src/store/subscriptionStore.ts"),
};

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
    file: FILES.subscriptionSheet,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "SecondaryOperationalRow",
      "SecondarySheetHeader",
      "StatusBadge",
      "StatusBanner",
      "trpc.retailOps.subscription",
      "trpc.retailOps.createSubscriptionCheckoutIntent",
      "shouldUseProductionSnapshot",
      "RETAIL_OPS_PLANS",
      "UsageRow",
      "PlanCard",
      "Business plan",
      "billing provider boundary",
      "Upgrade requests need production billing",
      "Online required",
      "Request upgrade",
      "Linking.canOpenURL",
      "Linking.openURL",
    ],
    reason:
      "subscription sheet must keep production snapshot reads, local fallback, reusable secondary operation rows, three-tier plan comparison, provider-neutral checkout handoff, and safe link opening",
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
    file: FILES.dashboard,
    markers: [
      'label="Plans"',
      'router.push("/subscription-modal" as never)',
      "!isAttendant",
    ],
    reason:
      "the generic dashboard must keep an owner-only route to the subscription surface",
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
];
const failures = [];

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8");
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  );

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    });
  }
}

if (failures.length > 0) {
  console.error(
    "Subscription flow check failed. Restore the three-tier model, mobile plan surface, dashboard entry point, or billing API boundary.",
  );

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`);
  }

  process.exit(1);
}

console.log("Subscription flow check passed.");
