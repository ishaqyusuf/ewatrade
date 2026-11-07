import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { Alert } from "react-native"
import { useStoreSubscription } from "./store-subscription-provider"

export function StoreOwnerCoverage() {
  const billing = useStoreSubscription()
  const catalog = billing?.catalog.data
  if (!billing || catalog?.billingScope !== "owner") return null
  const coverage = catalog.ownerCoverage
  const busy = billing.coveragePending || billing.verification.isPending
  const canEnroll =
    catalog.coverageAvailable &&
    coverage &&
    !coverage.enrolled &&
    coverage.reason === "uncovered" &&
    coverage.coveredBusinessCount < coverage.businessLimit
  const canRelease = catalog.coverageAvailable && coverage?.enrolled
  const status =
    !coverage || coverage.reason === "inactive_subscription"
      ? "There is no active owner subscription covering this business. Any saved coverage and business data are kept."
      : coverage.reason === "covered"
        ? "This business is covered by your owner subscription."
        : coverage.reason === "over_business_limit"
          ? "This business is enrolled, but is outside your current plan's business limit. Its data is kept."
          : coverage.reason === "uncovered"
            ? "This business is not enrolled in your owner subscription."
            : "Owner subscription coverage is unavailable for this business."
  return (
    <View className="gap-3 rounded-lg border border-border p-4">
      <Text className="font-semibold text-foreground">Business coverage</Text>
      <Text className="text-sm text-muted-foreground">{status}</Text>
      {coverage && coverage.businessLimit > 0 ? (
        <Text className="text-sm text-muted-foreground">
          {coverage.coveredBusinessCount} of {coverage.businessLimit} business
          slots in use.
        </Text>
      ) : null}
      <Text className="text-sm text-muted-foreground">
        You subscribe as the owner. Staff do not need separate subscriptions.
        Switch businesses to review or change another business's coverage.
      </Text>
      {canEnroll ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          className="min-h-11 justify-center disabled:opacity-50"
          onPress={() => void billing.changeCoverage("enroll")}
        >
          <Text className="font-semibold text-primary">
            Cover this business
          </Text>
        </Pressable>
      ) : null}
      {canRelease ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
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
            Release this business
          </Text>
        </Pressable>
      ) : null}
      {coverage?.reason === "uncovered" &&
      coverage.coveredBusinessCount >= coverage.businessLimit &&
      coverage.businessLimit > 0 ? (
        <Text className="text-sm text-muted-foreground">
          All business slots are in use. Release another business or choose a
          plan with more slots.
        </Text>
      ) : null}
    </View>
  )
}
