import { useColorScheme } from "@/hooks/use-color"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { getSalesRepShiftLedgerPresentation } from "@/lib/sales-rep-shift-ledger"
import type { SalesRepShiftLedgerQaState } from "@/lib/sales-rep-shift-ledger-qa"
import { useEffect } from "react"
import { MobileAppShell } from "./app-shell"
import { DashboardRecentOrderRow } from "./dashboard-kit"
import {
  SalesRepShiftLedgerEmptySales,
  SalesRepShiftLedgerHero,
  SalesRepShiftLedgerOverview,
  SalesRepShiftLedgerSection,
} from "./sales-rep-shift-ledger"
import { StatusBanner } from "./status-banner"

const inert = () => undefined

export function SalesRepShiftLedgerQaScreen({
  state,
  theme,
}: {
  state: SalesRepShiftLedgerQaState
  theme: "dark" | "light"
}) {
  const { setColorScheme } = useColorScheme()
  const marketDay = useMarketDayPalette()

  useEffect(() => {
    setColorScheme(theme)
  }, [setColorScheme, theme])

  const isDisabled = state === "disabled"
  const isWorkspaceUnavailable = state === "error" || state === "loading"
  const isOffline = state === "offline"
  const isPendingSync = state === "pending-sync"
  const isPopulated = state === "operational-populated"
  const pendingCommandCount = isOffline || isPendingSync ? 2 : 0
  const presentation = getSalesRepShiftLedgerPresentation({
    hasSellableCatalogItem: !(isDisabled || isWorkspaceUnavailable),
    isOffline,
    pendingCommandCount,
    workspaceState:
      state === "loading"
        ? "loading"
        : state === "error"
          ? "unavailable"
          : "available",
  })
  const recentOrderCount = isPopulated ? "6" : "0"
  const recentOrderValue = isPopulated ? "₦86,400" : "₦0.00"

  return (
    // biome-ignore lint/a11y/useValidAriaRole: MobileAppShell uses an app-specific permission role prop.
    <MobileAppShell
      key={`shift-ledger-${state}-${theme}`}
      backgroundColor={marketDay.canvas}
      businessName="Northstar Trading Company"
      centralAction={{
        disabled: presentation.saleActionDisabled,
        icon: "Plus",
        label: "Start sale",
        onPress: inert,
      }}
      contentStyle={{
        backgroundColor: marketDay.canvas,
        gap: 18,
        paddingHorizontal: 20,
        paddingTop: 16,
      }}
      hero={
        <SalesRepShiftLedgerHero
          businessName="Northstar Trading Company"
          cue={presentation.heroCue}
          greetingName="Alexandria"
          hasNotification={isOffline || isPendingSync}
          onBusinessPress={inert}
          onNotificationPress={inert}
          onSearchPress={isOffline ? undefined : inert}
        />
      }
      heroStatusBarStyle="dark"
      keyboardBottomOffset={12}
      navItems={[
        { icon: "home", isActive: true, label: "Home", onPress: inert },
        { icon: "Wrench", label: "Work", onPress: inert },
      ]}
      role="attendant"
      scrolledStatusBarColor={marketDay.canvas}
      scrolledStatusBarStyle={theme === "dark" ? "light" : "dark"}
      showHeader={false}
      statusBarColor={marketDay.marigold}
      statusBarFollowsHero
      title="Today"
    >
      {isOffline ? (
        <StatusBanner
          icon="Wind"
          message="2 commands waiting. Provisional: 1 order."
          title="Offline work is provisional"
          tone="warning"
        />
      ) : state === "error" ? (
        <StatusBanner
          icon="TriangleAlert"
          message="Refresh to load the latest sales workspace."
          title="Sales workspace unavailable"
          tone="warning"
        />
      ) : state === "loading" ? (
        <StatusBanner icon="Loader2" message="Loading sales workspace." />
      ) : null}

      {isWorkspaceUnavailable ? null : (
        <SalesRepShiftLedgerOverview
          {...presentation}
          onCloseoutPress={inert}
          onCustomerBookPress={inert}
          onStartSalePress={inert}
          onSyncPress={inert}
          recentOrderCount={recentOrderCount}
          recentOrderValue={recentOrderValue}
        />
      )}

      <SalesRepShiftLedgerSection title="Recent sales">
        {state === "loading" ? (
          <StatusBanner icon="Loader2" message="Loading recent sales." />
        ) : state === "error" ? (
          <StatusBanner
            icon="TriangleAlert"
            message="Recent sales could not be loaded. Pull to refresh."
            tone="warning"
          />
        ) : isOffline || isPendingSync ? (
          <StatusBanner
            icon="Wind"
            message="Your queued sales will appear here after sync."
            title="Sales pending sync"
            tone="warning"
          />
        ) : isPopulated ? (
          <>
            <DashboardRecentOrderRow
              amount="₦24,800"
              customer="Amina Yusuf"
              detail="ORD-1048 · 2 × Ankara set"
              onPress={inert}
              status="Completed"
              tone="success"
            />
            <DashboardRecentOrderRow
              amount="₦12,500"
              customer="Walk-in customer"
              detail="ORD-1047 · 1 × Market tote"
              onPress={inert}
              status="Pending"
              tone="warning"
            />
          </>
        ) : (
          <SalesRepShiftLedgerEmptySales message="New sales will appear here as soon as they are created." />
        )}
      </SalesRepShiftLedgerSection>
    </MobileAppShell>
  )
}
