import { MobileAppShell } from "@/components/mobile/app-shell"
import {
  DashboardActionRow,
  DashboardOverviewMetric,
  DashboardRevenueCard,
} from "@/components/mobile/dashboard-kit"
import type {
  DashboardOverviewProps,
  DashboardScreenProps,
  DashboardSectionProps,
  DashboardSetupProps,
  DashboardSyncProps,
} from "@/components/mobile/dashboard/dashboard-presentation"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"

export function ClassicDashboardScreen({
  children,
  hero,
  ...props
}: DashboardScreenProps) {
  return (
    <MobileAppShell
      {...props}
      keyboardBottomOffset={12}
      showHeader={false}
      translucentStatusBar
    >
      {hero}
      {children}
    </MobileAppShell>
  )
}

function SyncNote({ syncLabel, syncTone }: DashboardSyncProps) {
  return syncLabel ? (
    <Text
      className={
        syncTone === "attention"
          ? "text-xs font-semibold text-foreground"
          : "text-xs text-muted-foreground"
      }
    >
      {syncLabel}
    </Text>
  ) : null
}

export function ClassicDashboardOverview(props: DashboardOverviewProps) {
  const largeText = useLargeTextLayout()
  return (
    <View className="gap-3">
      <SyncNote {...props} />
      <View className={largeText ? "gap-3" : "flex-row gap-3"}>
        <DashboardOverviewMetric
          detail={props.primaryDetail}
          icon={
            props.primaryLabel === "Stock balances" ||
            props.primaryLabel === "Catalog"
              ? "Warehouse"
              : "Wrench"
          }
          label={props.primaryLabel}
          value={props.primaryValue}
        />
        <DashboardOverviewMetric
          detail={props.recentOrderDetail}
          icon="ReceiptText"
          label="Recent orders"
          tone="accent"
          value={props.recentOrderValue}
        />
      </View>
      <DashboardRevenueCard
        detail={props.revenueDetail}
        label="Recent revenue"
        value={props.revenueValue}
      />
    </View>
  )
}

export function ClassicDashboardSetup(props: DashboardSetupProps) {
  return (
    <View className="gap-4">
      <ClassicDashboardOverview
        primaryDetail="Sellable catalog readiness"
        primaryLabel="Catalog"
        primaryValue={props.itemValue}
        recentOrderDetail="Latest orders and queued work"
        recentOrderValue={props.orderValue}
        revenueDetail="Across loaded orders"
        revenueValue={props.revenueValue}
        syncLabel={props.syncLabel}
        syncTone={props.syncTone}
      />
      <View className="rounded-2xl bg-card p-4">
        <Text
          accessibilityRole="header"
          className="text-xl font-extrabold text-foreground"
        >
          Set up your Store
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">
          {props.catalogReady
            ? "Your catalog is ready. Take your first order."
            : "Take your first order now, or add an item or service."}
        </Text>
        <DashboardActionRow
          disabled={props.catalogReady}
          icon="Warehouse"
          label={
            props.catalogReady ? "Catalog is ready" : "Add an item or service"
          }
          onPress={props.onAddItemPress}
        />
        <DashboardActionRow
          icon="ReceiptText"
          label="Take your first order"
          onPress={props.onCreateOrderPress}
        />
        <DashboardActionRow
          icon="Users"
          label="Invite your team"
          onPress={props.onInviteStaffPress}
        />
      </View>
    </View>
  )
}

export function ClassicDashboardSectionHeader({
  actionLabel,
  onActionPress,
  title,
}: DashboardSectionProps) {
  const largeText = useLargeTextLayout()
  return (
    <View
      className={
        largeText ? "gap-2" : "flex-row items-center justify-between gap-3"
      }
    >
      <Text
        accessibilityRole="header"
        className={cn(
          "min-w-0 text-xl font-extrabold tracking-tight text-foreground",
          !largeText && "flex-1",
        )}
      >
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center px-2"
          haptic
          onPress={onActionPress}
        >
          <Text className="text-sm font-bold text-primary">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
