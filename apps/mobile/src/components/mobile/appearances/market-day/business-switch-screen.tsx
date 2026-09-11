import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { getBusinessSwitchRowPresentation } from "../../business-switch-presentation"
import type {
  WorkspaceHeaderProps,
  WorkspaceRowProps,
} from "../../business-switch/business-switch-view"

export function MarketDayWorkspaceHeader({
  count,
  currentName,
}: WorkspaceHeaderProps) {
  return (
    <View className="gap-3 rounded-b-3xl border-b-4 border-market-marigold bg-market-palm px-5 py-6">
      <Text className="font-market-mono text-xs uppercase tracking-widest text-market-on-palm">
        Your market addresses
      </Text>
      <Text
        accessibilityRole="header"
        className="font-market-display text-4xl text-market-on-palm"
      >
        One account.{"\n"}Room to grow.
      </Text>
      <Text className="text-sm leading-6 text-market-on-palm">
        Choose where you manage orders, stock and staff.
      </Text>
      <View className="gap-2 rounded-xl bg-market-marigold px-3 py-3">
        <Text className="text-xs font-bold uppercase text-market-on-marigold">
          Current workspace
        </Text>
        <Text className="text-base font-bold text-market-on-marigold">
          {currentName}
        </Text>
      </View>
      <Text className="font-market-mono text-xs text-market-on-palm">
        {count} listed workspaces · Each has its own access
      </Text>
    </View>
  )
}

export function MarketDayWorkspaceRow({
  business,
  currentBusinessId,
  disabled,
  busy,
  onPress,
}: WorkspaceRowProps) {
  const row = getBusinessSwitchRowPresentation(business, currentBusinessId)
  const initials = business.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        business.name +
        ", " +
        row.detail +
        (row.selected ? ", current workspace" : ", choose workspace")
      }
      accessibilityState={{
        selected: row.selected,
        disabled: disabled || row.selected,
        busy,
      }}
      disabled={disabled || row.selected}
      onPress={onPress}
      haptic
      className={
        row.selected
          ? "mx-4 mb-3 flex-row items-start gap-3 rounded-2xl border-2 border-market-palm bg-market-field p-4"
          : "mx-4 mb-3 flex-row items-start gap-3 rounded-2xl border border-market-line bg-market-field p-4 active:bg-market-soft-band"
      }
    >
      <View className="size-12 items-center justify-center rounded-xl bg-market-palm">
        <Text
          accessible={false}
          maxFontSizeMultiplier={1.2}
          className="text-base font-extrabold text-market-on-palm"
        >
          {initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <Text className="text-lg font-extrabold text-market-ink">
          {business.name}
        </Text>
        <Text className="text-sm text-market-muted-ink">{row.detail}</Text>
        {row.metadata ? (
          <Text className="text-xs leading-5 text-market-muted-ink">
            {row.metadata}
          </Text>
        ) : null}
        <View
          className={
            row.selected
              ? "self-start rounded-lg bg-market-marigold px-2 py-1"
              : "self-start rounded-lg bg-market-soft-band px-2 py-1"
          }
        >
          <Text
            className={
              row.selected
                ? "text-xs font-bold text-market-on-marigold"
                : "text-xs font-bold text-market-ink"
            }
          >
            {busy
              ? "Checking access…"
              : row.selected
                ? "Current"
                : "Choose workspace"}
          </Text>
        </View>
      </View>
      <Icon
        name={row.selected ? "CircleCheck" : "ChevronRight"}
        className="mt-1 size-sm text-market-muted-ink"
      />
    </Pressable>
  )
}
