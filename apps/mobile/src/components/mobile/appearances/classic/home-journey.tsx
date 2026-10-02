import { ActionButton } from "@/components/mobile/action-button"
import type { HomeJourneyPresentationProps } from "@/components/mobile/dashboard/home-journey-presentation"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { ClassicDashboardSectionHeader } from "./dashboard-screen"
import {
  CounterFacts,
  CounterHeading,
  CounterPathStep,
  CounterRow,
  CounterTask,
} from "./home-counter-parts"

export function ClassicHomeJourney(props: HomeJourneyPresentationProps) {
  const { journey } = props
  if (
    ["loading", "unavailable", "offline-unknown"].includes(journey.workspace)
  ) {
    const loading = journey.workspace === "loading"
    const offline = journey.workspace === "offline-unknown"
    return (
      <View className="gap-5">
        <CounterHeading
          title="Let’s get you up to date."
          message="Load your business status to find the next useful step."
        />
        <StatusBanner
          icon={loading ? "Loader2" : offline ? "WifiOff" : "TriangleAlert"}
          title={
            loading
              ? "Loading your business"
              : offline
                ? "Business status unavailable offline"
                : "Business status unavailable"
          }
          message={
            loading
              ? "Checking your catalog and order history."
              : offline
                ? "Reconnect to confirm your setup and recent activity."
                : "We couldn’t confirm your setup or recent activity. Try again to load Home."
          }
          tone={loading ? "muted" : "warning"}
        />
        {loading ? null : (
          <ActionButton
            icon="RefreshCw"
            onPress={offline ? props.onSync : props.onRetry}
          >
            {offline ? "Open sync status" : "Try again"}
          </ActionButton>
        )}
        <CounterRow
          icon="Warehouse"
          label="Open your catalog"
          onPress={props.onCatalog}
        />
        <CounterRow
          icon="ReceiptText"
          label="Open order history"
          onPress={props.onOrders}
        />
      </View>
    )
  }
  const ready = journey.catalog === "ready"
  const unfinished = journey.catalog === "unfinished"
  const catalogLabel = unfinished
    ? "Finish item setup"
    : "Add a Product or Service"
  const catalogAction = unfinished ? props.onCatalog : props.onAddItem
  return (
    <View className="gap-5" testID="classic-home-journey">
      {journey.workspace === "cached" || props.availabilityStale ? (
        <StatusBanner
          icon="WifiOff"
          tone="warning"
          title="Cached business status"
          message="Reconnect or refresh to confirm the latest catalog, order history and team status."
        />
      ) : null}
      {journey.hasOrderHistory ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open sync status, ${props.syncLabel}`}
            className="min-h-12 flex-row items-center gap-2"
            haptic
            onPress={props.onSync}
          >
            <Icon
              className="size-xs text-primary"
              name={props.syncAttention ? "RefreshCw" : "Check"}
            />
            <Text className="text-xs text-muted-foreground">
              {props.syncLabel}
            </Text>
          </Pressable>
          <CounterHeading
            title="Your store, at a glance."
            message={
              ready
                ? "Create an order or catch up on recent activity."
                : "Get your catalog ready to take another order."
            }
          />
          <ActionButton
            icon="Plus"
            disabled={!ready && props.isOffline}
            onPress={ready ? props.onCreateOrder : catalogAction}
          >
            {ready ? "New order" : "Get catalog ready"}
          </ActionButton>
          <CounterFacts
            primary={props.primaryMetric}
            orders={props.recentOrderMetric}
            revenue={props.revenueMetric}
          />
          {props.primaryMetric.label !== "Catalog" ? (
            <Text className="text-xs text-muted-foreground">
              Catalog {ready ? "ready" : "not ready"}
            </Text>
          ) : null}
          <View className="gap-2">
            <ClassicDashboardSectionHeader
              title="Recent orders"
              actionLabel="See all"
              onActionPress={props.onOrders}
            />
            <RecentOrders {...props} />
          </View>
        </>
      ) : (
        <>
          <View className="gap-2">
            <Text className="text-xs font-bold tracking-widest text-muted-foreground">
              GETTING STARTED
            </Text>
            <Text className="text-xs text-muted-foreground">
              {ready ? "1" : "0"} of 2 essentials complete
            </Text>
          </View>
          <CounterHeading
            title={
              ready
                ? "Ready for your first order."
                : unfinished
                  ? "Let’s finish your catalog."
                  : "Let’s get your business ready."
            }
            message={
              ready
                ? "You have something to sell. Let’s record your first customer order."
                : unfinished
                  ? "Your items are here. Make one available for customers to buy."
                  : "Start small. Add one Product or Service your customers can buy."
            }
          />
          <CounterTask
            title={
              ready
                ? "Take your first order"
                : unfinished
                  ? "Make an item sellable"
                  : "Add your first item"
            }
            message={
              ready
                ? "Choose the item and record what your customer is buying."
                : unfinished
                  ? "Check its price, active status and store availability."
                  : "Choose a Product or Service, give it a name and set a price."
            }
            label={ready ? "Create an order" : catalogLabel}
            icon={ready ? "ReceiptText" : "Warehouse"}
            disabled={!ready && props.isOffline}
            onPress={ready ? props.onCreateOrder : catalogAction}
          />
          <View>
            <CounterPathStep
              step="1"
              title="Add a Product or Service"
              complete={ready}
              current={!ready}
              message={
                ready
                  ? "Your catalog is ready."
                  : unfinished
                    ? "Finish making an item sellable."
                    : "Choose one thing your customers can buy."
              }
            />
            <CounterPathStep
              step="2"
              title="Take your first order"
              current={ready}
              message={
                ready
                  ? "Ready whenever your customer is."
                  : "After your catalog is ready."
              }
            />
            {props.canManageTeam ? (
              <CounterPathStep
                title="Bring your team along"
                complete={journey.team === "active"}
                message={
                  journey.team === "active"
                    ? "Team already set up."
                    : journey.team === "pending"
                      ? "Invitation pending."
                      : "Optional · whenever you need a hand."
                }
              />
            ) : null}
          </View>
        </>
      )}
      <HomeTeam {...props} />
      {journey.hasOrderHistory ? (
        <ClassicDashboardSectionHeader title="Store shortcuts" />
      ) : null}
      <View>
        <CounterRow
          icon="Warehouse"
          label={
            journey.catalog === "empty"
              ? "Open your catalog"
              : "View your catalog"
          }
          onPress={props.onCatalog}
        />
        {props.canManageTeam ? (
          <CounterRow
            icon="Users"
            label={
              journey.team === "active"
                ? "View your team"
                : journey.team === "pending"
                  ? "View invitation"
                  : journey.team === "none"
                    ? "Invite your team"
                    : "Open team directory"
            }
            detail={
              journey.team === "none"
                ? "Optional · whenever you’re ready"
                : undefined
            }
            onPress={props.onTeam}
          />
        ) : null}
        {journey.hasOrderHistory ? (
          <CounterRow
            icon="Wrench"
            label={props.operationalActionLabel}
            onPress={props.onOperationalAction}
          />
        ) : null}
      </View>
    </View>
  )
}

function HomeTeam(props: HomeJourneyPresentationProps) {
  const { journey } = props
  if (!props.canManageTeam) return null
  if (
    journey.team !== "pending" &&
    !journey.showTeamPrompt &&
    !props.teamPreferenceError
  )
    return null
  return (
    <View className="gap-3">
      {journey.team === "pending" ? (
        <StatusBanner
          icon="Users"
          tone="primary"
          title="Invitation pending"
          message={`${journey.pendingTeamName ?? "A team member"} has not joined yet.`}
        />
      ) : null}
      {journey.showTeamPrompt ? (
        <View className="gap-3 rounded-2xl border border-border bg-card p-4">
          <Text className="text-xs font-bold tracking-wider text-muted-foreground">
            WHEN YOU NEED A HAND
          </Text>
          <Text
            accessibilityRole="header"
            className="text-lg font-bold text-foreground"
          >
            Share the work with your team.
          </Text>
          <Text className="text-sm text-muted-foreground">
            You can invite someone now or keep running your business on your
            own.
          </Text>
          <ActionButton variant="secondary" onPress={props.onTeam}>
            Invite someone
          </ActionButton>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: props.teamPreferenceSaving }}
            disabled={props.teamPreferenceSaving}
            className="min-h-12 items-center justify-center px-3 active:bg-accent"
            haptic
            onPress={props.onDismissTeam}
          >
            <Text className="text-center text-sm text-muted-foreground">
              {props.teamPreferenceSaving
                ? "Saving your choice…"
                : "I work on my own"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {props.teamPreferenceError ? (
        <StatusBanner tone="warning" message={props.teamPreferenceError} />
      ) : null}
    </View>
  )
}

function RecentOrders(props: HomeJourneyPresentationProps) {
  if (props.ordersState === "loaded") return <>{props.recentOrders}</>
  if (props.ordersState === "loading")
    return <StatusBanner icon="Loader2" message="Loading recent orders." />
  if (props.ordersState === "unavailable")
    return (
      <StatusBanner
        tone="warning"
        icon="TriangleAlert"
        title="Recent orders unavailable"
        message="Refresh to load recent orders. Your order history is still available."
        actionLabel="Try again"
        onActionPress={props.onRetry}
      />
    )
  if (props.ordersState === "offline-empty")
    return (
      <StatusBanner
        tone="warning"
        icon="WifiOff"
        title="No cached recent orders"
        message="Reconnect to load the latest orders. Your business history has not been reset."
      />
    )
  if (props.ordersState === "queued")
    return (
      <StatusBanner
        tone="warning"
        icon="Wind"
        title="Orders pending sync"
        message="Your queued orders will appear here after sync. Their value is not included in loaded-order revenue."
      />
    )
  return (
    <EmptyState
      variant="flat"
      title="No recent orders to show"
      icon="ReceiptText"
      message="Your order history is still available."
      actionLabel="See all orders"
      actionProps={{ onPress: props.onOrders }}
    />
  )
}
