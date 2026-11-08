import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { getPlan } from "@/lib/retail-ops-subscription"
import { Alert } from "react-native"
import { useStoreSubscription } from "./store-subscription-provider"

export function StoreOwnerCoverage({
  disabled = false,
  onSwitchBusiness,
}: {
  disabled?: boolean
  onSwitchBusiness?: () => void
}) {
  const billing = useStoreSubscription()
  const catalog = billing?.catalog.data
  if (!billing || catalog?.billingScope !== "owner") return null
  const coverage = catalog.ownerCoverage
  const busy =
    disabled || billing.coveragePending || billing.verification.isPending
  const canEnroll =
    catalog.coverageAvailable &&
    coverage &&
    !coverage.enrolled &&
    coverage.reason === "uncovered" &&
    coverage.coveredBusinessCount < coverage.businessLimit
  const canRelease = catalog.coverageAvailable && coverage?.enrolled
  const verifiedOwnerPlan =
    coverage &&
    coverage.businessLimit > 0 &&
    ["covered", "uncovered", "over_business_limit"].includes(coverage.reason)
  const title =
    coverage?.reason === "covered" && coverage.planId !== "free"
      ? `${getPlan(coverage.planId).name} owner subscription`
      : verifiedOwnerPlan
        ? "Verified owner subscription"
        : "No active owner subscription"
  const slotsFull =
    coverage?.reason === "uncovered" &&
    coverage.businessLimit > 0 &&
    coverage.coveredBusinessCount >= coverage.businessLimit
  const status =
    !coverage || coverage.reason === "inactive_subscription"
      ? "Choose a monthly owner plan, then cover this business. Existing records and any saved coverage are kept."
      : coverage.reason === "covered"
        ? "This business is covered by your owner subscription."
        : coverage.reason === "over_business_limit"
          ? "This enrollment is outside your current plan's business limit. This business uses Free limits; its records and existing staff are kept."
          : coverage.reason === "uncovered"
            ? "This business remains on Free until you explicitly cover it."
            : "Owner subscription coverage is unavailable for this business."
  return (
    <View className="gap-2 rounded-[18px] border border-border p-3.5">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="min-w-0 flex-1 font-bold text-foreground">
          {title}
        </Text>
        {coverage && coverage.businessLimit > 0 ? (
          <Text
            accessibilityLabel={`${coverage.coveredBusinessCount} of ${coverage.businessLimit} business slots in use.`}
            className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
          >
            {coverage.coveredBusinessCount} of {coverage.businessLimit} slots
          </Text>
        ) : null}
      </View>
      <Text className="text-sm text-muted-foreground">{status}</Text>
      <Text className="text-sm text-muted-foreground">
        Staff do not need separate subscriptions.
      </Text>
      {canEnroll ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          accessibilityState={{ disabled: busy, busy: billing.coveragePending }}
          className="mt-1 min-h-11 items-center justify-center rounded-xl bg-primary px-3 py-2.5 disabled:opacity-50"
          onPress={() => void billing.changeCoverage("enroll")}
        >
          <Text className="font-bold text-primary-foreground">
            {billing.coveragePending
              ? "Updating coverage…"
              : "Cover this business"}
          </Text>
        </Pressable>
      ) : null}
      {canRelease ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          accessibilityState={{ disabled: busy, busy: billing.coveragePending }}
          className="min-h-11 justify-center disabled:opacity-50"
          onPress={() =>
            Alert.alert(
              "Release this business?",
              "This business will lose coverage from your owner plan. Its data will be kept. This does not cancel your store subscription or stop renewal.",
              [
                { text: "Keep coverage", style: "cancel" },
                {
                  text: "Release coverage",
                  onPress: () => void billing.changeCoverage("release"),
                },
              ],
            )
          }
        >
          <Text className="font-semibold text-primary">
            {billing.coveragePending
              ? "Updating coverage…"
              : "Release this business"}
          </Text>
        </Pressable>
      ) : null}
      {slotsFull ? (
        <Text className="text-sm text-muted-foreground">
          All business slots are in use. Release another business or choose a
          plan with more slots.
        </Text>
      ) : null}
      {onSwitchBusiness &&
      (slotsFull || coverage?.reason === "over_business_limit") ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          className="min-h-11 justify-center disabled:opacity-50"
          onPress={onSwitchBusiness}
        >
          <Text className="font-semibold text-primary">
            Review another business
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}
