import { ActionButton } from "@/components/mobile/action-button";
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useBusinessStore } from "@/store/businessStore";
import { useRetailOpsStore } from "@/store/retailOpsStore";
import {
  RETAIL_OPS_PLANS,
  type RetailOpsPlan,
  type RetailOpsPlanId,
  type RetailOpsSubscription,
  getBusinessSubscription,
  getPlan,
  getUsageLimitState,
  useSubscriptionStore,
} from "@/store/subscriptionStore";
import { useTRPC } from "@/trpc/client";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMutation, useQuery } from "@tanstack/react-query";
import { forwardRef, useMemo } from "react";
import { View } from "react-native";

type SubscriptionPlanSheetProps = {
  onComplete?: () => void;
  usage: {
    businesses: number;
    products: number;
    staff: number;
  };
};

type ProductionSubscriptionSnapshot = {
  entitlements: Array<{
    isAtLimit: boolean;
    key: keyof RetailOpsPlan["limits"];
    limit: number;
    used: number;
  }>;
  plan: RetailOpsPlan;
  plans: RetailOpsPlan[];
  subscription: {
    currentPeriodEndsAt: string | null;
    planId: RetailOpsPlanId;
    status: RetailOpsSubscription["status"];
    trialEndsAt: string | null;
    updatedAt: string;
  };
  usage: {
    businesses: number;
    offlineDevices: number;
    products: number;
    staff: number;
  };
};

type CheckoutIntent = {
  checkoutUrl: string | null;
  intent: {
    status: "active_plan" | "provider_not_configured";
  };
  message: string;
  provider: "none";
  targetPlan: RetailOpsPlan;
};

function formatDate(value: string | undefined) {
  if (!value) return "Not set";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function subscriptionStatusLabel(status: RetailOpsSubscription["status"]) {
  if (status === "trialing") return "Trial";
  if (status === "past_due") return "Past due";
  if (status === "cancelled") return "Cancelled";
  return "Active";
}

function toOptionalDate(value: string | null | undefined) {
  return value ?? undefined;
}

function UsageRow({
  label,
  limit,
  used,
}: {
  label: string;
  limit: number;
  used: number;
}) {
  const limitState = getUsageLimitState(used, limit);

  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <Text
        className={cn(
          "text-xs font-bold",
          limitState.isAtLimit ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {limitState.label}
      </Text>
    </View>
  );
}

function PlanLimitRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <Text className="text-xs font-bold text-muted-foreground">{value}</Text>
    </View>
  );
}

function PlanCard({
  actionLabel,
  current,
  disabled,
  onSelect,
  plan,
}: {
  actionLabel: string;
  current: boolean;
  disabled: boolean;
  onSelect: () => void;
  plan: RetailOpsPlan;
}) {
  return (
    <Pressable
      className={cn(
        "gap-4 rounded-2xl border border-border bg-card p-4 active:bg-accent",
        current && "border-primary bg-primary/10",
        disabled && "opacity-70",
      )}
      disabled={disabled}
      haptic
      onPress={onSelect}
      transition
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="text-base font-bold text-foreground">
            {plan.name}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {plan.description}
          </Text>
        </View>
        <View
          className={cn(
            "rounded-full px-3 py-1",
            current ? "bg-primary/10" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-xs font-bold",
              current ? "text-primary" : "text-muted-foreground",
            )}
          >
            {current ? "Current" : plan.priceLabel}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        <PlanLimitRow
          label="Businesses"
          value={`Up to ${plan.limits.businesses}`}
        />
        <PlanLimitRow
          label="Products"
          value={`Up to ${plan.limits.products}`}
        />
        <PlanLimitRow label="Staff" value={`Up to ${plan.limits.staff}`} />
      </View>

      <View className="flex-row items-center gap-2">
        <Icon className="size-sm text-primary" name="ShieldCheck" />
        <Text className="flex-1 text-xs font-semibold text-muted-foreground">
          {plan.supportLabel}
        </Text>
        <Text className="text-xs font-bold text-primary">{actionLabel}</Text>
      </View>
    </Pressable>
  );
}

function CheckoutIntentNotice({ intent }: { intent: CheckoutIntent }) {
  return (
    <View className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
      <Text className="font-semibold text-foreground">
        {intent.targetPlan.name} checkout
      </Text>
      <Text className="mt-1 text-sm leading-5 text-muted-foreground">
        {intent.message}
      </Text>
    </View>
  );
}

export const SubscriptionPlanSheet = forwardRef<
  BottomSheetModal,
  SubscriptionPlanSheetProps
>(({ onComplete, usage }, ref) => {
  const trpc = useTRPC();
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId);
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode);
  const setBusinessPlan = useSubscriptionStore((state) => state.setBusinessPlan);
  const subscriptions = useSubscriptionStore((state) => state.subscriptions);
  const localSubscription = getBusinessSubscription(
    subscriptions,
    activeBusinessId,
  );
  const subscriptionQuery = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      enabled: !isOfflineMode,
      retry: false,
    }),
  );
  const checkoutIntentMutation = useMutation(
    trpc.retailOps.createSubscriptionCheckoutIntent.mutationOptions(),
  );
  const productionSnapshot =
    subscriptionQuery.data as ProductionSubscriptionSnapshot | undefined;
  const shouldUseProductionSnapshot =
    !isOfflineMode && !!productionSnapshot && !subscriptionQuery.isError;
  const subscription = shouldUseProductionSnapshot
    ? {
        businessId: activeBusinessId ?? "production-business",
        currentPeriodEndsAt: toOptionalDate(
          productionSnapshot.subscription.currentPeriodEndsAt,
        ),
        planId: productionSnapshot.subscription.planId,
        status: productionSnapshot.subscription.status,
        trialEndsAt: toOptionalDate(productionSnapshot.subscription.trialEndsAt),
        updatedAt: productionSnapshot.subscription.updatedAt,
      }
    : localSubscription;
  const currentPlan = shouldUseProductionSnapshot
    ? productionSnapshot.plan
    : getPlan(subscription.planId);
  const plans = shouldUseProductionSnapshot
    ? productionSnapshot.plans
    : RETAIL_OPS_PLANS;
  const usageSnapshot = shouldUseProductionSnapshot
    ? productionSnapshot.usage
    : usage;
  const checkoutIntent = checkoutIntentMutation.data as
    | CheckoutIntent
    | undefined;
  const sourceLabel = isOfflineMode
    ? "Local"
    : subscriptionQuery.isError
      ? "Local fallback"
      : subscriptionQuery.isFetching
        ? "Refreshing"
        : "Online";
  const sourceDetail = isOfflineMode
    ? "Plan changes stay local while this device is offline."
    : subscriptionQuery.isError
      ? "Production billing is unavailable, so local plan state is shown."
      : subscriptionQuery.isFetching
        ? "Refreshing production plan and entitlement usage."
        : "Production billing controls the current plan, limits, and upgrade handoff.";
  const offlineDeviceUsage = shouldUseProductionSnapshot
    ? productionSnapshot.usage.offlineDevices
    : null;
  const reportHistoryLimit = currentPlan.limits.reportsHistoryDays;
  const isCheckoutPending = checkoutIntentMutation.isPending;

  const selectPlan = (plan: RetailOpsPlan) => {
    if (plan.id === currentPlan.id || isCheckoutPending) return;

    if (shouldUseProductionSnapshot) {
      checkoutIntentMutation.mutate({
        planId: plan.id,
        surface: "mobile",
      });
      return;
    }

    setBusinessPlan(subscription.businessId, plan.id);
  };
  const planActionLabels = useMemo(
    () => {
      const labels: Record<string, string> = {};

      for (const plan of plans) {
        if (plan.id === currentPlan.id) {
          labels[plan.id] = "Current plan";
          continue;
        }

        if (isCheckoutPending) {
          labels[plan.id] = "Preparing";
          continue;
        }

        labels[plan.id] = shouldUseProductionSnapshot
          ? "Request upgrade"
          : "Set local plan";
      }

      return labels;
    },
    [currentPlan.id, isCheckoutPending, plans, shouldUseProductionSnapshot],
  );

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Subscription"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={112}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Icon className="size-base text-primary" name="CreditCard" />
            </View>
            <View className="gap-2">
              <Text className="text-xl font-bold text-foreground">
                Business plan
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Plan limits are business-scoped and upgrade requests stay behind
                the billing provider boundary.
              </Text>
            </View>
          </View>

          <View className="rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="font-semibold text-foreground">
                  Billing source
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {sourceDetail}
                </Text>
              </View>
              <View className="rounded-full bg-muted px-3 py-1">
                <Text className="text-xs font-bold text-muted-foreground">
                  {sourceLabel}
                </Text>
              </View>
            </View>
          </View>

          {subscriptionQuery.error ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                {subscriptionQuery.error.message}
              </Text>
            </View>
          ) : null}

          {checkoutIntentMutation.error ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                {checkoutIntentMutation.error.message}
              </Text>
            </View>
          ) : null}

          {checkoutIntent ? <CheckoutIntentNotice intent={checkoutIntent} /> : null}

          <View className="gap-3 rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="font-bold text-foreground">
                  {currentPlan.name}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {subscription.status === "trialing"
                    ? `Trial ends ${formatDate(subscription.trialEndsAt)}`
                    : `Renews ${formatDate(subscription.currentPeriodEndsAt)}`}
                </Text>
              </View>
              <View className="rounded-full bg-emerald-500/10 px-3 py-1">
                <Text className="text-xs font-bold text-emerald-700">
                  {subscriptionStatusLabel(subscription.status)}
                </Text>
              </View>
            </View>
            <UsageRow
              label="Businesses"
              limit={currentPlan.limits.businesses}
              used={usageSnapshot.businesses}
            />
            <UsageRow
              label="Products"
              limit={currentPlan.limits.products}
              used={usageSnapshot.products}
            />
            <UsageRow
              label="Staff"
              limit={currentPlan.limits.staff}
              used={usageSnapshot.staff}
            />
            {offlineDeviceUsage === null ? null : (
              <UsageRow
                label="Offline devices"
                limit={currentPlan.limits.offlineDevices}
                used={offlineDeviceUsage}
              />
            )}
            <PlanLimitRow
              label="Report history"
              value={`${reportHistoryLimit} days`}
            />
          </View>

          <View className="gap-3">
            <Text className="text-base font-bold text-foreground">
              Tiers
            </Text>
            {plans.map((plan) => (
              <PlanCard
                actionLabel={planActionLabels[plan.id] ?? "Select"}
                current={plan.id === subscription.planId}
                disabled={plan.id === currentPlan.id || isCheckoutPending}
                key={plan.id}
                onSelect={() => selectPlan(plan)}
                plan={plan}
              />
            ))}
          </View>

          <ActionButton onPress={onComplete} variant="outline">
            Done
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  );
});

SubscriptionPlanSheet.displayName = "SubscriptionPlanSheet";
