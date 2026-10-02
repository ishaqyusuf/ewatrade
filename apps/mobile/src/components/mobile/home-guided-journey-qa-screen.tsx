import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import type { HomeGuidedJourneyQaState } from "@/lib/home-guided-journey-qa"
import { mergeMobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import { useFocusEffect } from "expo-router"
import { useCallback, useState } from "react"
import { ClassicDashboardScreen } from "./appearances/classic/dashboard-screen"
import {
  ClassicCounterHeader,
  CounterRow,
} from "./appearances/classic/home-counter-parts"
import { ClassicHomeJourney } from "./appearances/classic/home-journey"
import { DashboardRecentOrderRow } from "./dashboard-kit"
import { getHomeJourneyMetrics } from "./dashboard/home-journey-metrics"
import {
  getHomeJourney,
  getHomeJourneyScope,
} from "./dashboard/home-journey-model"
import { useHomeTeamPreference } from "./dashboard/use-home-team-preference"

export function HomeGuidedJourneyQaScreen({
  state,
  theme,
  scope,
}: {
  state: HomeGuidedJourneyQaState
  theme: "light" | "dark"
  scope: string
}) {
  const { setColorScheme } = useColorScheme()
  const [scene, setScene] = useState(state)
  const [lastAction, setLastAction] = useState("None")
  useFocusEffect(
    useCallback(() => {
      setColorScheme(theme)
    }, [setColorScheme, theme]),
  )
  const preferenceScope = getHomeJourneyScope({
    userId: `home-qa-account-${scope === "account-b" ? "b" : "a"}`,
    businessId: `home-qa-business-${scope === "business-b" ? "b" : "a"}`,
    storeId: `home-qa-store-${scope === "store-b" ? "b" : "a"}-20261002`,
  })
  const preference = useHomeTeamPreference(preferenceScope)
  const record = (action: string) => () => setLastAction(action)
  const unknown = ["loading", "unavailable", "offline-empty"].includes(scene)
  const offline = ["offline-cached", "offline-empty", "queued"].includes(scene)
  const early = [
    "new-business",
    "unfinished-catalog",
    "catalog-ready",
  ].includes(scene)
  const availability = mergeMobileWorkspaceFeatureAvailability(undefined, {
    catalogItems: [],
    commercialOrders: 0,
    customers: 0,
    inventoryOperations: 0,
    serviceOperations: 0,
  })
  availability.hasCatalogItems = scene !== "new-business"
  availability.hasActiveSellableItems = ![
    "new-business",
    "unfinished-catalog",
    "established-unready",
  ].includes(scene)
  availability.hasOrders = !early && !unknown
  availability.hasProductItems = scene === "stock-work"
  availability.hasServiceJobs = scene === "stock-work"
  const loaded =
    !early &&
    !unknown &&
    !["returning-empty", "queued", "orders-unavailable"].includes(scene)
  const journey = getHomeJourney({
    availability,
    availabilityResolved: !unknown,
    availabilityPending: scene === "loading",
    isOffline: offline,
    loadedOrderCount: loaded ? 2 : 0,
    team:
      scene === "invitation-pending"
        ? "pending"
        : scene === "team-unknown"
          ? "unknown"
          : scene === "team-existing"
            ? "existing"
            : scene === "team-restricted"
              ? "restricted"
              : ["team-active", "everyday", "stock-work"].includes(scene)
                ? "active"
                : "none",
    pendingTeamName: "Alex",
    teamPreferenceResolved: preference.resolved,
    teamPromptDismissed: scene === "solo" || preference.dismissed,
  })
  const query = {
    resolved: scene !== "orders-unavailable" && !unknown,
    unavailable: scene === "orders-unavailable",
    stale: false,
  }
  const metrics = getHomeJourneyMetrics({
    isOffline: offline,
    catalogReady: availability.hasActiveSellableItems,
    hasProducts: availability.hasProductItems,
    hasServiceWork: availability.hasServiceJobs,
    orderQuery: query,
    stockQuery: query,
    workQuery: query,
    loadedOrderCount: loaded ? 2 : 0,
    queuedOrders: scene === "queued" ? 2 : 0,
    loadedStockCount: 3,
    queuedStockOperations: 0,
    loadedWorkCount: 1,
    queuedWorkOperations: 0,
    loadedOrderValue: loaded ? "R700.00" : "R0.00",
  })
  return (
    // biome-ignore lint/a11y/useValidAriaRole: App shell business role, not an ARIA role.
    <ClassicDashboardScreen
      businessName="QA Corner Store"
      title="Home"
      role="owner"
      hero={
        <ClassicCounterHeader
          businessName="QA Corner Store"
          greetingName="Alex"
          hasNotification={offline}
          onBusinessPress={record("business")}
          onNotificationPress={record("sync")}
          onProfilePress={record("settings")}
          onSearchPress={offline ? undefined : record("search")}
        />
      }
      centralAction={{
        icon: "Plus",
        label: "+",
        onPress: record("create chooser"),
      }}
      navItems={[
        {
          icon: "House",
          label: "Home",
          isActive: true,
          onPress: record("home"),
        },
        { icon: "ReceiptText", label: "Orders", onPress: record("orders") },
        { icon: "Warehouse", label: "Products", onPress: record("catalog") },
        { icon: "more", label: "More", onPress: record("settings") },
      ]}
    >
      <Text className="text-xs text-muted-foreground" testID="home-qa-scene">
        Home QA · Fixture only · {scene} · Scope {scope}
      </Text>
      <ClassicHomeJourney
        {...metrics}
        journey={journey}
        isOffline={offline}
        availabilityStale={false}
        syncLabel={offline ? "Working offline" : "All changes synced"}
        syncAttention={offline}
        canManageTeam={scene !== "team-restricted"}
        teamPreferenceError={preference.error}
        teamPreferenceSaving={preference.saving}
        onDismissTeam={() => {
          void preference.dismiss()
        }}
        onAddItem={() => setScene("unfinished-catalog")}
        onCatalog={() => {
          if (scene === "unfinished-catalog") setScene("catalog-ready")
          else setLastAction("catalog")
        }}
        onCreateOrder={() => setScene("first-order")}
        onTeam={() => setScene("invitation-pending")}
        onSync={record("sync")}
        onOrders={record("orders")}
        onRetry={() => setScene("everyday")}
        onOperationalAction={record("work")}
        operationalActionLabel="View active work"
        recentOrders={
          <View>
            <DashboardRecentOrderRow
              customer="Sample customer A"
              status="Completed"
              tone="success"
              detail="Consultation"
              onPress={record("order A")}
              amount="R450.00"
            />
            <DashboardRecentOrderRow
              customer="Sample customer B"
              status="Open"
              tone="primary"
              detail="Setup service"
              onPress={record("order B")}
              amount="R250.00"
            />
          </View>
        }
      />
      <View className="gap-2 border-t border-border pt-4">
        <Text className="text-xs text-muted-foreground">
          QA controls · Last action: {lastAction}
        </Text>
        <CounterRow
          icon="Users"
          label="QA: member joins"
          onPress={() => setScene("team-active")}
        />
      </View>
    </ClassicDashboardScreen>
  )
}
