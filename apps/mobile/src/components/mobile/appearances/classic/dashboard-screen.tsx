import { ActionButton } from "@/components/mobile/action-button"
import { MobileAppShell } from "@/components/mobile/app-shell"
import {
  DashboardActionRow,
  DashboardHomeHeader,
  DashboardOverviewMetric,
  DashboardRevenueCard,
} from "@/components/mobile/dashboard-kit"
import type {
  DashboardEmptyOrdersProps,
  DashboardHeroProps,
  DashboardOverviewProps,
  DashboardScreenProps,
  DashboardSectionProps,
  DashboardSetupProps,
  DashboardSyncProps,
  SalesRepOverviewProps,
  SalesRepSectionProps,
} from "@/components/mobile/dashboard/dashboard-presentation"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
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
    <MobileAppShell {...props} keyboardBottomOffset={12} showHeader={false}>
      {hero}
      {children}
    </MobileAppShell>
  )
}

export function ClassicDashboardHero({
  onBusinessPress,
  cue,
  ...props
}: DashboardHeroProps) {
  return (
    <View className="gap-2">
      <DashboardHomeHeader {...props} />
      <Pressable
        accessibilityLabel="Switch Business"
        accessibilityRole="button"
        className="min-h-11 self-start justify-center px-2 active:bg-muted"
        haptic
        onPress={onBusinessPress}
      >
        <Text className="text-xs font-bold text-primary">Switch Business</Text>
      </Pressable>
      {cue ? (
        <Text className="text-sm text-muted-foreground">{cue}</Text>
      ) : null}
    </View>
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
            : "Add a Product or Service, then take your first order."}
        </Text>
        <DashboardActionRow
          disabled={props.catalogReady}
          icon="Warehouse"
          label={
            props.catalogReady ? "Catalog is ready" : "Add a Product or Service"
          }
          onPress={props.onAddItemPress}
        />
        <DashboardActionRow
          disabled={!props.catalogReady}
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

export function ClassicDashboardEmptyOrders({
  actionDisabled,
  actionLabel,
  message,
  onActionPress,
}: DashboardEmptyOrdersProps) {
  return (
    <EmptyState
      actionLabel={actionLabel}
      actionProps={{ disabled: actionDisabled, onPress: onActionPress }}
      className="mt-2"
      icon="ReceiptText"
      message={message}
      title="No orders yet"
    />
  )
}

export function ClassicSalesRepOverview(props: SalesRepOverviewProps) {
  const largeText = useLargeTextLayout()
  return (
    <View className="gap-4">
      <StatusBanner
        icon="Building2"
        message={props.saleActionDetail}
        title={props.readinessLabel}
        tone="muted"
      />
      <SyncNote {...props} />
      <View className={largeText ? "gap-3" : "flex-row gap-3"}>
        <DashboardOverviewMetric
          detail="Latest orders loaded"
          icon="ReceiptText"
          label="Recent sales"
          value={props.recentOrderCount}
        />
        <DashboardOverviewMetric
          detail={props.catalogFactDetail}
          icon="Warehouse"
          label="Sellable catalog"
          tone="accent"
          value={props.catalogFactValue}
        />
      </View>
      <DashboardRevenueCard
        detail="Across loaded sales"
        label="Recent value"
        value={props.recentOrderValue}
      />
      <ActionButton
        disabled={props.saleActionDisabled}
        onPress={props.onStartSalePress}
        trailingIcon="ArrowRight"
      >
        {props.saleActionLabel}
      </ActionButton>
      {props.onCustomerBookPress ? (
        <DashboardActionRow
          icon="Users"
          label="Customer book"
          onPress={props.onCustomerBookPress}
        />
      ) : null}
      <DashboardActionRow
        icon="ClipboardList"
        label="Daily closeout"
        onPress={props.onCloseoutPress}
      />
      <DashboardActionRow
        icon="RefreshCw"
        label="Sync status"
        onPress={props.onSyncPress}
      />
    </View>
  )
}

export function ClassicSalesRepSection({
  children,
  title,
}: SalesRepSectionProps) {
  return (
    <View>
      <ClassicDashboardSectionHeader title={title} />
      {children}
    </View>
  )
}

export function ClassicSalesRepEmptySales({ message }: { message: string }) {
  return (
    <EmptyState
      className="mt-2"
      icon="ReceiptText"
      message={message}
      title="No sales yet"
    />
  )
}
