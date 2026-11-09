import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  RETAIL_OPS_PLANS,
  type RetailOpsPlan,
  type RetailOpsPlanId,
} from "@/lib/retail-ops-subscription"
import type { ReactNode } from "react"
import {
  getPlanBenefitGroups,
  getPlanSummary,
} from "./subscription-plan-benefits-model"

export type SubscriptionPlanAction = {
  label: string
  disabled: boolean
  onPress: () => void
  disclosure?: string | null
  note?: string | null
}

export function SubscriptionPlanAction({
  action,
}: { action: SubscriptionPlanAction }) {
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: action.disabled }}
        disabled={action.disabled}
        onPress={action.onPress}
        className="min-h-[50px] items-center justify-center rounded-full bg-primary px-5 py-3 disabled:bg-muted"
      >
        <Text
          className={
            action.disabled
              ? "text-base font-bold text-muted-foreground"
              : "text-base font-bold text-primary-foreground"
          }
        >
          {action.label}
        </Text>
      </Pressable>
      {action.disclosure ? (
        <Text className="text-center text-sm text-muted-foreground">
          {action.disclosure}
        </Text>
      ) : null}
      {action.note ? (
        <Text className="text-center text-sm text-muted-foreground">
          {action.note}
        </Text>
      ) : null}
    </View>
  )
}

export function SubscriptionPlanBenefits({
  currentPlanId,
  selectedPlan,
  options,
  onSelect,
  price,
  period,
  onSettingsPress,
  children,
  inlineAction,
}: {
  currentPlanId: RetailOpsPlanId | null
  selectedPlan: RetailOpsPlan | null
  options: RetailOpsPlan[]
  onSelect: (id: RetailOpsPlanId) => void
  price: string | null
  period: string | null
  onSettingsPress: () => void
  children?: ReactNode
  inlineAction?: SubscriptionPlanAction | null
}) {
  const current =
    RETAIL_OPS_PLANS.find((plan) => plan.id === currentPlanId) ?? null
  const upgrading = options.length > 0
  return (
    <View className="gap-4" testID="subscription-benefits">
      {children}
      <View className="gap-0.5">
        <Text
          accessibilityRole="header"
          className="text-[22px] font-bold [-rn-line-height:28] text-foreground"
        >
          {upgrading ? "Upgrade" : current ? "Your plan" : "Plan unavailable"}
        </Text>
        {current ? (
          <Text className="text-sm text-muted-foreground">
            This business is on {current.name}
          </Text>
        ) : null}
      </View>
      {options.length > 1 ? (
        <View accessibilityRole="tablist" className="flex-row flex-wrap gap-1">
          {options.map((plan) => (
            <Pressable
              key={plan.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedPlan?.id === plan.id }}
              onPress={() => onSelect(plan.id)}
              className={`min-h-11 items-center justify-center rounded-full px-[18px] ${selectedPlan?.id === plan.id ? "bg-card" : "bg-transparent"}`}
            >
              <Text
                className={`text-base font-semibold ${selectedPlan?.id === plan.id ? "text-foreground" : "text-muted-foreground"}`}
              >
                {plan.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {selectedPlan ? (
        <>
          <View className="gap-1 rounded-2xl bg-foreground px-5 py-5">
            <Text
              accessibilityRole="header"
              className="text-[34px] font-bold [-rn-line-height:40] text-background"
            >
              {selectedPlan.name}
            </Text>
            <Text className="text-base font-semibold text-background">
              {selectedPlan.id === "free"
                ? "Free"
                : price && period
                  ? `${price} ${period}`
                  : "Price unavailable"}
            </Text>
            <Text className="text-sm text-background/80">
              {getPlanSummary(selectedPlan)}
            </Text>
          </View>
          <Text
            accessibilityRole="header"
            className="mt-2 px-1 text-lg font-bold text-foreground"
          >
            Included in {selectedPlan.name}
          </Text>
          <View className="gap-3">
            {getPlanBenefitGroups(selectedPlan, upgrading ? current : null).map(
              (group) => (
                <View
                  key={group.key}
                  className="overflow-hidden rounded-2xl bg-card py-1"
                >
                  <View className="flex-row items-center gap-3 px-4 pb-1 pt-2.5">
                    <Icon
                      name={group.icon}
                      size={20}
                      className="text-foreground"
                    />
                    <Text
                      accessibilityRole="header"
                      className="text-base font-semibold text-foreground"
                    >
                      {group.title}
                    </Text>
                  </View>
                  {group.rows.map((row, index) => (
                    <View key={row.key} className="pl-12">
                      <View
                        className={`min-h-11 flex-row items-baseline gap-3 py-[11px] pr-4 ${index ? "border-t border-border" : ""}`}
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="text-base text-foreground">
                            {row.label}
                          </Text>
                          {row.note ? (
                            <Text className="text-sm text-muted-foreground">
                              {row.note}
                            </Text>
                          ) : null}
                        </View>
                        {row.value || row.added ? (
                          <Text
                            accessibilityLabel={
                              row.added && current
                                ? `${row.value ?? "Added"}, compared with ${current.name}`
                                : undefined
                            }
                            className={`max-w-[50%] text-right text-base font-semibold ${row.added ? "text-primary" : "text-foreground"}`}
                          >
                            {row.value ?? "Added"}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        </>
      ) : (
        <Text className="text-sm text-muted-foreground">
          Refresh your current plan to see available options.
        </Text>
      )}
      {inlineAction ? <SubscriptionPlanAction action={inlineAction} /> : null}
      <Pressable
        accessibilityRole="button"
        onPress={onSettingsPress}
        className="min-h-11 flex-row items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3"
      >
        <Text className="text-base text-foreground">Subscription settings</Text>
        <Icon name="ChevronRight" size={20} className="text-muted-foreground" />
      </Pressable>
    </View>
  )
}
