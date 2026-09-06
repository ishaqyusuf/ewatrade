import { useColorScheme } from "@/hooks/use-color"
import type { BusinessHomeMarketLedgerQaState } from "@/lib/business-home-market-ledger-qa"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { getMobileDashboardNavigation } from "@/lib/workspace-feature-availability"
import { useEffect } from "react"
import { View } from "react-native"
import { MobileAppShell } from "./app-shell"
import {
  BusinessHomeMarketLedgerEmptyOrders,
  BusinessHomeMarketLedgerHero,
  BusinessHomeMarketLedgerOverview,
  BusinessHomeMarketLedgerSectionHeader,
  BusinessHomeMarketLedgerSetup,
} from "./business-home-market-ledger"
import { DashboardActionRow, DashboardRecentOrderRow } from "./dashboard-kit"
import { StatusBanner } from "./status-banner"

const inert = () => undefined

export function BusinessHomeMarketLedgerQaScreen({
  state,
  theme,
}: {
  state: BusinessHomeMarketLedgerQaState
  theme: "dark" | "light"
}) {
  const { setColorScheme } = useColorScheme()
  const marketDay = useMarketDayPalette()

  useEffect(() => {
    setColorScheme(theme)
  }, [setColorScheme, theme])

  const isOffline = state === "offline"
  const isAttendant = state === "attendant"
  const showSetup = state === "setup" || state === "catalog-ready"
  const catalogReady = state === "catalog-ready"
  const populated = state === "operational-populated"
  const pendingSync = state === "pending-sync"
  const navigation = getMobileDashboardNavigation(isAttendant)

  return (
    <MobileAppShell
      key={`market-ledger-${state}-${theme}`}
      backgroundColor={marketDay.canvas}
      businessName="Northstar Trading Company"
      centralAction={{
        disabled: isAttendant,
        icon: "Plus",
        label: navigation.centralActionLabel,
        onPress: inert,
      }}
      contentStyle={{
        backgroundColor: marketDay.canvas,
        gap: 18,
        paddingHorizontal: 20,
        paddingTop: 16,
      }}
      hero={
        <BusinessHomeMarketLedgerHero
          businessName="Northstar Trading Company"
          greetingName="Alexandria"
          hasNotification={isOffline || pendingSync}
          onBusinessPress={inert}
          onNotificationPress={inert}
          onSearchPress={isOffline ? undefined : inert}
        />
      }
      heroStatusBarStyle="dark"
      keyboardBottomOffset={12}
      navItems={[
        { icon: "home", isActive: true, label: "Home", onPress: inert },
        ...(navigation.navItemLabels.includes("Catalog")
          ? [
              {
                icon: "Warehouse" as const,
                label: "Catalog",
                onPress: inert,
                ownerOnly: true,
              },
            ]
          : []),
        { icon: "Wrench", label: "Work", onPress: inert },
        ...(navigation.navItemLabels.includes("Reports")
          ? [
              {
                icon: "analytics" as const,
                label: "Reports",
                onPress: inert,
                ownerOnly: true,
              },
            ]
          : []),
      ]}
      role={isAttendant ? "attendant" : "owner"}
      scrolledStatusBarColor={marketDay.canvas}
      scrolledStatusBarStyle={theme === "dark" ? "light" : "dark"}
      showHeader={false}
      statusBarColor={marketDay.paprika}
      statusBarFollowsHero
      title="Today"
    >
      {isOffline ? (
        <StatusBanner
          icon="Wind"
          message="2 commands waiting. Provisional: 1 order, 1 inventory operation, 0 service operations."
          title="Offline work is provisional"
          tone="warning"
        />
      ) : null}

      {showSetup || state === "loading" ? (
        <BusinessHomeMarketLedgerSetup
          catalogReady={catalogReady}
          itemValue={catalogReady ? "Ready" : "0"}
          onAddItemPress={inert}
          onCreateOrderPress={inert}
          onInviteStaffPress={inert}
          orderValue={isOffline ? "1" : "0"}
          revenueValue={isOffline ? "₦12,500" : "₦0.00"}
          syncLabel={isOffline ? "2 waiting to sync" : "Synced now"}
          syncTone={isOffline ? "attention" : "ready"}
        />
      ) : (
        <>
          <BusinessHomeMarketLedgerOverview
            primaryDetail="Current inventory ledger"
            primaryLabel="Stock balances"
            primaryValue="18"
            recentOrderDetail={
              pendingSync ? "2 waiting to sync" : "Latest orders loaded"
            }
            recentOrderValue={
              populated ? "4" : pendingSync ? "2" : isOffline ? "1" : "0"
            }
            revenueDetail={
              populated
                ? "Across the latest 4 orders"
                : "No synced order value yet"
            }
            revenueValue={
              populated ? "₦126,400" : isOffline ? "₦12,500" : "₦0.00"
            }
            syncLabel={
              pendingSync || isOffline ? "2 waiting to sync" : "Synced now"
            }
            syncTone={pendingSync || isOffline ? "attention" : "ready"}
          />
          <View>
            <BusinessHomeMarketLedgerSectionHeader title="Today’s work" />
            {isAttendant ? (
              <>
                <DashboardActionRow
                  disabled
                  icon="PlusCircle"
                  label="Add a sellable item to create orders"
                  onPress={inert}
                  tone="success"
                />
                <DashboardActionRow
                  icon="ClipboardCheck"
                  label="Complete daily closeout"
                  onPress={inert}
                  tone="primary"
                />
                <DashboardActionRow
                  icon="RefreshCw"
                  label="Review sync status"
                  onPress={inert}
                  tone="warning"
                />
              </>
            ) : (
              <>
                <DashboardActionRow
                  disabled={isOffline}
                  icon="FolderPlus"
                  label="Add a product"
                  onPress={inert}
                  tone="success"
                />
                <DashboardActionRow
                  disabled={isOffline}
                  icon="Wrench"
                  label="Add a service"
                  onPress={inert}
                  tone="warning"
                />
                <DashboardActionRow
                  disabled={!populated}
                  icon="PlusCircle"
                  label={
                    populated
                      ? "Create a new order"
                      : "Add a sellable item to create orders"
                  }
                  onPress={inert}
                  tone="primary"
                />
              </>
            )}
          </View>
        </>
      )}

      <View>
        <BusinessHomeMarketLedgerSectionHeader
          actionLabel={isAttendant ? undefined : "See all"}
          onActionPress={isAttendant ? undefined : inert}
          title="Recent orders"
        />
        {state === "loading" ? (
          <StatusBanner icon="Loader2" message="Loading recent orders." />
        ) : pendingSync || isOffline ? (
          <StatusBanner
            icon="Wind"
            message="Your queued orders will appear here after sync."
            title="Orders pending sync"
            tone="warning"
          />
        ) : populated ? (
          <>
            <DashboardRecentOrderRow
              amount="₦72,400"
              customer="Amina Yusuf"
              detail="ORD-1048 · 2 × Ankara set"
              onPress={inert}
              status="Completed"
              tone="success"
            />
            <DashboardRecentOrderRow
              amount="₦54,000"
              customer="Walk-in customer"
              detail="ORD-1047 · 3 × Market tote"
              onPress={inert}
              status="Pending"
              tone="warning"
            />
          </>
        ) : (
          <BusinessHomeMarketLedgerEmptyOrders
            actionDisabled={!catalogReady}
            actionLabel={isAttendant ? undefined : "Create first order"}
            message="Add an item, then create your first order. It will appear here."
            onActionPress={isAttendant ? undefined : inert}
          />
        )}
      </View>
    </MobileAppShell>
  )
}
