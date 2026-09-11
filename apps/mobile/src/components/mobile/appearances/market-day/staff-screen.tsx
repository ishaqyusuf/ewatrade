import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { StaffRow } from "../../staff/staff-model"
import { MarketDayActionButton } from "../../action-button"

export function MarketDayStaffHeader({ loadedCount }: { loadedCount: number }) {
  return (
    <View className="gap-3 rounded-b-3xl border-b-4 border-market-marigold bg-market-palm px-5 py-6">
      <Text className="font-market-mono text-xs uppercase tracking-widest text-market-on-palm">
        Your counter crew
      </Text>
      <Text
        accessibilityRole="header"
        className="font-market-display text-4xl text-market-on-palm"
      >
        Good people.{"\n"}Shared progress.
      </Text>
      <Text className="text-sm leading-6 text-market-on-palm">
        Give attendants their own access to orders and stock work.
      </Text>
      <View className="self-start rounded-xl bg-market-marigold px-3 py-2">
        <Text className="font-market-mono text-xs text-market-on-marigold">
          {loadedCount} loaded attendants
        </Text>
      </View>
      <Text className="text-xs text-market-on-palm">Not total staff usage</Text>
    </View>
  )
}

export function MarketDayStaffRow({ staff }: { staff: StaffRow }) {
  return (
    <View className="mx-2 mb-3 flex-row items-start gap-3 rounded-2xl border border-market-line bg-market-field p-4">
      <View className="size-12 items-center justify-center rounded-xl bg-market-palm">
        <Text
          maxFontSizeMultiplier={1.2}
          accessible={false}
          className="text-base font-extrabold text-market-on-palm"
        >
          {staff.initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <Text className="text-lg font-extrabold text-market-ink">
          {staff.name}
        </Text>
        <Text selectable className="text-sm text-market-muted-ink">
          {staff.email}
        </Text>
        <Text className="text-xs leading-5 text-market-muted-ink">
          {staff.detail}
        </Text>
        <View
          className={
            staff.statusLabel === "Pending"
              ? "self-start rounded-lg bg-market-marigold px-2 py-1"
              : "self-start rounded-lg border border-market-line bg-market-soft-band px-2 py-1"
          }
        >
          <Text
            className={
              staff.statusLabel === "Pending"
                ? "text-xs font-bold text-market-on-marigold"
                : "text-xs font-bold text-market-ink"
            }
          >
            {staff.statusLabel}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function MarketDayStaffEmpty({
  title,
  message,
  onInvite,
}: { title: string; message: string; onInvite?: () => void }) {
  return (
    <View className="gap-4 px-5 py-8">
      <Text
        accessibilityRole="header"
        className="font-market-display text-3xl text-market-ink"
      >
        {title}
      </Text>
      <Text className="text-sm leading-6 text-market-muted-ink">{message}</Text>
      {onInvite ? (
        <MarketDayActionButton
          tone="palm"
          icon="UserPlus"
          onPress={onInvite}
          testID="staff-add-first-action"
        >
          Invite first attendant
        </MarketDayActionButton>
      ) : null}
    </View>
  )
}
