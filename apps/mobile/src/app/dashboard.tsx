import {
  DashboardActionRow,
  DashboardRecentOrderRow,
  MobileAppShell,
  QueryRefreshControl,
  SecondaryOperationalRow,
  StatusBanner,
} from "@/components/mobile"
import {
  BusinessHomeMarketLedgerEmptyOrders,
  BusinessHomeMarketLedgerHero,
  BusinessHomeMarketLedgerOverview,
  BusinessHomeMarketLedgerSectionHeader,
  BusinessHomeMarketLedgerSetup,
} from "@/components/mobile/business-home-market-ledger"
import {
  SalesRepShiftLedgerEmptySales,
  SalesRepShiftLedgerHero,
  SalesRepShiftLedgerOverview,
  SalesRepShiftLedgerSection,
} from "@/components/mobile/sales-rep-shift-ledger"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { hasStoredCustomerShellAccess } from "@/lib/customer-conversation-store"
import { setLastMobileShell } from "@/lib/customer-shell-preference"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { getSalesRepShiftLedgerPresentation } from "@/lib/sales-rep-shift-ledger"
import {
  getMobileDashboardFeatureVisibility,
  getMobileDashboardNavigation,
  mergeMobileWorkspaceFeatureAvailability,
  shouldShowMobileStoreSetup,
} from "@/lib/workspace-feature-availability"
import {
  activeBusinessOfflineCommands,
  getOfflineProvisionalProjection,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { Redirect, useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { View } from "react-native"

export function OperationsDashboardSurface({
  embeddedInAdminTabs = false,
  onBottomTabVisibilityChange,
}: {
  embeddedInAdminTabs?: boolean
  onBottomTabVisibilityChange?: (hidden: boolean) => void
} = {}) {
  const router = useRouter()
  const createModal = useModal()
  const trpc = useTRPC()
  const marketDay = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  const { profile } = useAuthContext()
  const [showPersonalConversations, setShowPersonalConversations] =
    useState(false)
  useFocusEffect(
    useCallback(() => {
      setShowPersonalConversations(hasStoredCustomerShellAccess())
    }, []),
  )
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const allCommands = useOfflineCommandStore((state) => state.commands)
  const commands = activeBusinessOfflineCommands(
    allCommands,
    profile?.businessId,
  )
  const provisional = getOfflineProvisionalProjection(commands)
  const isAttendant = isSalesRepRole(profile?.role)
  const featureAvailabilityQuery = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: !isOffline,
      retry: false,
    }),
  )
  const orders = useQuery(
    trpc.orders.list.queryOptions(
      { limit: 8 },
      { enabled: !isOffline, retry: false },
    ),
  )
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: false },
      { enabled: !isOffline && !isAttendant, retry: false },
    ),
  )
  const service = useQuery(
    trpc.services.queue.queryOptions(
      { limit: 8 },
      { enabled: !isOffline, retry: false },
    ),
  )
  const orderRows = orders.data ?? []
  const currency = profile?.currencyCode ?? "NGN"
  const orderValue = orderRows.reduce(
    (total, order) => total + order.totalMinor,
    0,
  )
  const featureAvailability = mergeMobileWorkspaceFeatureAvailability(
    featureAvailabilityQuery.data,
    provisional,
  )
  const featureVisibility = getMobileDashboardFeatureVisibility(
    featureAvailability,
    isAttendant,
  )
  const navigation = getMobileDashboardNavigation(isAttendant)
  const hasProduct = featureAvailability.hasProductItems
  const hasSellableCatalogItem = featureAvailability.hasActiveSellableItems
  const packagedBalanceCount =
    balances.data?.rows.filter((row) => row.kind === "PACKAGED_STOCK").length ??
    0
  const activeWorkCount =
    (service.data?.length ?? 0) + provisional.serviceOperations
  const balanceCount =
    (balances.data?.rows.length ?? 0) + provisional.inventoryOperations
  const recentOrderCount = orderRows.length + provisional.commercialOrders
  const pendingCommandCount = commands.filter((command) =>
    ["approval", "blocked", "pending", "review"].includes(command.localStatus),
  ).length
  const firstName = profile?.name.trim().split(/\s+/)[0] || "there"
  const hasResolvedFeatureAvailability =
    featureAvailabilityQuery.data !== undefined
  const isFeatureAvailabilityPending =
    !isOffline && featureAvailabilityQuery.isPending
  const isFeatureAvailabilityUnavailable =
    !isOffline &&
    featureAvailabilityQuery.isError &&
    !hasResolvedFeatureAvailability
  const showStoreSetup = shouldShowMobileStoreSetup({
    availabilityResolved: hasResolvedFeatureAvailability,
    isAttendant,
    showGettingStarted: featureVisibility.showGettingStarted,
  })
  const isOfflineAvailabilityUnknown =
    isOffline && !hasResolvedFeatureAvailability
  const salesRepPresentation = getSalesRepShiftLedgerPresentation({
    hasSellableCatalogItem,
    isOffline,
    pendingCommandCount,
    workspaceState: isOfflineAvailabilityUnknown
      ? "offline-unknown"
      : isFeatureAvailabilityPending
        ? "loading"
        : isFeatureAvailabilityUnavailable
          ? "unavailable"
          : "available",
  })
  const navItems = [
    {
      icon: "home" as const,
      isActive: true,
      label: "Home",
      onPress: () => undefined,
    },
    ...(navigation.navItemLabels.includes("Catalog")
      ? [
          {
            icon: "Warehouse" as const,
            label: "Catalog",
            onPress: () => router.push("/catalog-items-modal" as never),
            ownerOnly: true,
          },
        ]
      : []),
    {
      icon: "Wrench" as const,
      label: "Work",
      onPress: () => router.push("/service-jobs-modal" as never),
    },
    ...(navigation.navItemLabels.includes("Reports")
      ? [
          {
            icon: "analytics" as const,
            label: "Reports",
            onPress: () => router.push("/reports-modal" as never),
            ownerOnly: true,
          },
        ]
      : []),
  ]
  const openCreateRoute = (href: string) => {
    createModal.dismiss()
    router.push(href as never)
  }
  const createActions: CreateAction[] = [
    {
      detail: "Add a stock-tracked item to your catalog.",
      disabled: isOffline,
      label: "Product",
      onPress: () => openCreateRoute("/first-product-setup-modal?kind=product"),
    },
    {
      detail: "Add work that you price and deliver.",
      disabled: isOffline,
      label: "Service",
      onPress: () => openCreateRoute("/first-product-setup-modal?kind=service"),
    },
    ...(featureAvailability.hasCustomers
      ? [
          {
            detail: "Open the customer book and customer activity.",
            label: "Customer",
            onPress: () => openCreateRoute("/customer-book-modal"),
          },
        ]
      : []),
    {
      detail: hasSellableCatalogItem
        ? "Create an order from active Products or Services."
        : "Create your first product/service to use order feature",
      disabled: !hasSellableCatalogItem,
      label: "Order",
      onPress: () => openCreateRoute("/create-sale-modal"),
    },
    {
      detail: hasProduct
        ? "Receive, count, adjust, or assign stock."
        : "Add a Product to enable stock management.",
      disabled: !hasProduct,
      label: "Stock Entry",
      onPress: () => openCreateRoute("/stock-intake-modal"),
    },
    {
      detail: "Invite a team member into this workspace.",
      label: "Staff",
      onPress: () => openCreateRoute("/staff-invite-modal"),
    },
  ]
  const operationalAction: HomeAction =
    packagedBalanceCount >= 2
      ? {
          icon: "RefreshCw",
          label: "Transform stock units",
          onPress: () => router.push("/unit-conversion-modal" as never),
          tone: "warning",
        }
      : hasProduct
        ? {
            icon: "Warehouse",
            label: "Receive or adjust stock",
            onPress: () => router.push("/stock-intake-modal" as never),
            tone: "success",
          }
        : featureAvailability.hasServiceItems ||
            featureAvailability.hasServiceJobs
          ? {
              icon: "Wrench",
              label: "Manage service work",
              onPress: () => router.push("/service-jobs-modal" as never),
              tone: "warning",
            }
          : {
              icon: "RefreshCw",
              label: "Review sync status",
              onPress: () => router.push("/sync-status-modal" as never),
              tone: "neutral",
            }
  const homeActions: HomeAction[] = [
    {
      disabled: isOffline,
      icon: "FolderPlus",
      label: "Add a product",
      onPress: () =>
        router.push("/first-product-setup-modal?kind=product" as never),
      tone: "success",
    },
    {
      disabled: isOffline,
      icon: "Wrench",
      label: "Add a service",
      onPress: () =>
        router.push("/first-product-setup-modal?kind=service" as never),
      tone: "warning",
    },
    {
      disabled: !hasSellableCatalogItem,
      icon: "PlusCircle",
      label: hasSellableCatalogItem
        ? "Create a new order"
        : "Add a sellable item to create orders",
      onPress: () => router.push("/create-sale-modal" as never),
      tone: "primary",
    },
    {
      icon: "ReceiptText",
      label: "View all orders",
      onPress: () => router.push("/orders" as never),
      tone: "neutral",
    },
    operationalAction,
  ]

  return (
    <MobileAppShell
      backgroundColor={marketDay.canvas}
      businessName={profile?.businessName ?? "Business"}
      centralAction={{
        disabled: isAttendant && !hasSellableCatalogItem,
        icon: "Plus",
        label: navigation.centralActionLabel,
        onPress: isAttendant
          ? () => router.push("/create-sale-modal" as never)
          : createModal.present,
      }}
      contentStyle={{
        backgroundColor: marketDay.canvas,
        gap: 18,
        paddingHorizontal: 20,
        paddingTop: 16,
      }}
      hero={
        isAttendant ? (
          <SalesRepShiftLedgerHero
            businessName={profile?.businessName ?? "Business"}
            cue={salesRepPresentation.heroCue}
            greetingName={firstName}
            hasNotification={isOffline || pendingCommandCount > 0}
            onBusinessPress={() =>
              router.push("/business-switch-modal" as never)
            }
            onNotificationPress={() =>
              router.push("/sync-status-modal" as never)
            }
            onSearchPress={
              isOffline
                ? undefined
                : () => router.push("/global-search" as never)
            }
          />
        ) : (
          <BusinessHomeMarketLedgerHero
            businessName={profile?.businessName ?? "Business"}
            greetingName={firstName}
            hasNotification={isOffline || pendingCommandCount > 0}
            onBusinessPress={() =>
              router.push("/business-switch-modal" as never)
            }
            onNotificationPress={() =>
              router.push("/sync-status-modal" as never)
            }
            onSearchPress={
              isOffline
                ? undefined
                : () => router.push("/global-search" as never)
            }
          />
        )
      }
      heroStatusBarStyle="dark"
      keyboardBottomOffset={12}
      navItems={navItems}
      onBottomTabVisibilityChange={onBottomTabVisibilityChange}
      refreshControl={<QueryRefreshControl />}
      role={isAttendant ? "attendant" : "owner"}
      scrolledStatusBarColor={marketDay.canvas}
      scrolledStatusBarStyle={colorScheme === "dark" ? "light" : "dark"}
      showHeader={false}
      showBottomTabs={!embeddedInAdminTabs}
      statusBarColor={isAttendant ? marketDay.marigold : marketDay.paprika}
      statusBarFollowsHero
      title="Today"
    >
      {isOffline ? (
        <StatusBanner
          icon="Wind"
          message={`${commands.filter((command) => command.localStatus === "pending" || command.localStatus === "approval").length} commands waiting. Provisional: ${provisional.commercialOrders} orders, ${provisional.inventoryOperations} inventory operations, ${provisional.serviceOperations} service operations.`}
          title="Offline work is provisional"
          tone="warning"
        />
      ) : null}

      {isOfflineAvailabilityUnknown ? (
        <StatusBanner
          icon="WifiOff"
          message="Reconnect to confirm your latest catalog and Store setup."
          title="Store overview unavailable offline"
          tone="warning"
        />
      ) : isFeatureAvailabilityPending ? (
        <StatusBanner icon="Loader2" message="Loading Store overview." />
      ) : isFeatureAvailabilityUnavailable ? (
        <StatusBanner
          icon="TriangleAlert"
          message="Refresh to load your latest Store setup and catalog state."
          title="Store overview unavailable"
          tone="warning"
        />
      ) : isAttendant ? (
        <SalesRepShiftLedgerOverview
          {...salesRepPresentation}
          onCloseoutPress={() => router.push("/closeout-modal" as never)}
          onCustomerBookPress={
            featureAvailability.hasCustomers
              ? () => router.push("/customer-book-modal" as never)
              : undefined
          }
          onStartSalePress={() => router.push("/create-sale-modal" as never)}
          onSyncPress={() => router.push("/sync-status-modal" as never)}
          recentOrderCount={String(orderRows.length)}
          recentOrderValue={formatMinorMoney(orderValue, currency)}
        />
      ) : showStoreSetup ? (
        <BusinessHomeMarketLedgerSetup
          catalogReady={hasSellableCatalogItem}
          itemValue={hasSellableCatalogItem ? "Ready" : "0"}
          onAddItemPress={() =>
            router.push("/first-product-setup-modal" as never)
          }
          onCreateOrderPress={() => router.push("/create-sale-modal" as never)}
          onInviteStaffPress={() => router.push("/staff-invite-modal" as never)}
          orderValue={String(recentOrderCount)}
          revenueValue={formatMinorMoney(orderValue, currency)}
          syncLabel={
            isOffline ? `${pendingCommandCount} waiting to sync` : "Synced now"
          }
          syncTone={isOffline ? "attention" : "ready"}
        />
      ) : (
        <>
          <BusinessHomeMarketLedgerOverview
            primaryDetail={
              hasProduct
                ? "Current inventory ledger"
                : featureAvailability.hasServiceItems ||
                    featureAvailability.hasServiceJobs
                  ? "Work currently in queue"
                  : "Ready for your first item"
            }
            primaryLabel={
              hasProduct
                ? "Stock balances"
                : featureAvailability.hasServiceItems ||
                    featureAvailability.hasServiceJobs
                  ? "Active work"
                  : "Catalog"
            }
            primaryValue={String(
              hasProduct
                ? balanceCount
                : featureAvailability.hasServiceItems ||
                    featureAvailability.hasServiceJobs
                  ? activeWorkCount
                  : 0,
            )}
            recentOrderDetail={
              provisional.commercialOrders > 0
                ? `${provisional.commercialOrders} waiting to sync`
                : "Latest orders loaded"
            }
            recentOrderValue={String(recentOrderCount)}
            revenueDetail={
              orderRows.length === 0
                ? "No synced order value yet"
                : `Across the latest ${orderRows.length} ${orderRows.length === 1 ? "order" : "orders"}`
            }
            revenueValue={formatMinorMoney(orderValue, currency)}
            syncLabel={
              isOffline
                ? `${pendingCommandCount} waiting to sync`
                : "Synced now"
            }
            syncTone={isOffline ? "attention" : "ready"}
          />

          <View>
            <BusinessHomeMarketLedgerSectionHeader title="Today’s work" />
            {homeActions.map((action) => (
              <DashboardActionRow key={action.label} {...action} />
            ))}
          </View>
        </>
      )}

      {showPersonalConversations ? (
        <Pressable
          accessibilityHint="Opens your private Store conversations"
          accessibilityLabel="Switch to Personal conversations"
          accessibilityRole="button"
          className="min-h-12 flex-row items-center gap-3 border-y border-border/70 py-3 active:bg-accent"
          haptic
          onPress={async () => {
            await setLastMobileShell("customer")
            router.push("/(customer)/conversations")
          }}
        >
          <Icon className="size-sm text-primary" name="User" />
          <View className="min-w-0 flex-1">
            <Text className="font-bold text-foreground">
              Personal conversations
            </Text>
            <Text className="text-xs text-muted-foreground">
              Switch from Business to your private Store inbox
            </Text>
          </View>
          <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
        </Pressable>
      ) : null}

      {isAttendant ? (
        <SalesRepShiftLedgerSection title="Recent sales">
          {orders.isLoading ? (
            <StatusBanner icon="Loader2" message="Loading recent sales." />
          ) : orderRows.length === 0 && provisional.commercialOrders > 0 ? (
            <StatusBanner
              icon="Wind"
              message="Your queued sales will appear here after sync."
              title="Sales pending sync"
              tone="warning"
            />
          ) : orderRows.length === 0 ? (
            <SalesRepShiftLedgerEmptySales message="New sales will appear here as soon as they are created." />
          ) : (
            orderRows
              .slice(0, 4)
              .map((order) => (
                <DashboardRecentOrderRow
                  amount={formatMinorMoney(
                    order.totalMinor,
                    order.currencyCode,
                  )}
                  customer={
                    order.customerName ||
                    order.customerPhone ||
                    "Walk-in customer"
                  }
                  detail={`${order.orderNumber} · ${order.lines
                    .map(
                      (line) =>
                        `${line.quantity} × ${line.snapshot?.catalogItemName ?? "Item"}`,
                    )
                    .join(", ")}`}
                  key={order.id}
                  onPress={() =>
                    router.push(
                      `/order/${encodeURIComponent(order.id)}` as never,
                    )
                  }
                  status={formatStatusLabel(order.status)}
                  tone={getOrderStatusTone(order.status)}
                />
              ))
          )}
        </SalesRepShiftLedgerSection>
      ) : (
        <View>
          <BusinessHomeMarketLedgerSectionHeader
            actionLabel="See all"
            onActionPress={() => router.push("/orders" as never)}
            title="Recent orders"
          />
          {orders.isLoading ? (
            <StatusBanner icon="Loader2" message="Loading recent orders." />
          ) : orderRows.length === 0 && provisional.commercialOrders > 0 ? (
            <StatusBanner
              icon="Wind"
              message="Your queued orders will appear here after sync."
              title="Orders pending sync"
              tone="warning"
            />
          ) : orderRows.length === 0 ? (
            <BusinessHomeMarketLedgerEmptyOrders
              actionDisabled={!hasSellableCatalogItem}
              actionLabel="Create first order"
              message={
                featureVisibility.showGettingStarted
                  ? "Add an item, then create your first order. It will appear here."
                  : "New orders will appear here as soon as they are created."
              }
              onActionPress={() => router.push("/create-sale-modal" as never)}
            />
          ) : (
            orderRows
              .slice(0, 4)
              .map((order) => (
                <DashboardRecentOrderRow
                  amount={formatMinorMoney(
                    order.totalMinor,
                    order.currencyCode,
                  )}
                  customer={
                    order.customerName ||
                    order.customerPhone ||
                    "Walk-in customer"
                  }
                  detail={`${order.orderNumber} · ${order.lines
                    .map(
                      (line) =>
                        `${line.quantity} × ${line.snapshot?.catalogItemName ?? "Item"}`,
                    )
                    .join(", ")}`}
                  key={order.id}
                  onPress={() =>
                    router.push(
                      `/order/${encodeURIComponent(order.id)}` as never,
                    )
                  }
                  status={formatStatusLabel(order.status)}
                  tone={getOrderStatusTone(order.status)}
                />
              ))
          )}
        </View>
      )}

      {!isAttendant && !embeddedInAdminTabs ? (
        <CreateActionSheet actions={createActions} modal={createModal} />
      ) : null}
    </MobileAppShell>
  )
}

export default function DashboardCompatibilityRoute() {
  const { profile } = useAuthContext()
  return (
    <Redirect
      href={isSalesRepRole(profile?.role) ? "/sales-rep-home" : "/admin-home"}
    />
  )
}

type HomeAction = {
  disabled?: boolean
  icon: IconKeys
  label: string
  onPress: () => void
  tone?: "neutral" | "primary" | "success" | "warning"
}

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function getOrderStatusTone(status: string) {
  if (status === "COMPLETED") return "success" as const
  if (status === "CANCELLED" || status === "REFUNDED") {
    return "destructive" as const
  }
  if (status === "DRAFT" || status === "PENDING") return "warning" as const
  return "primary" as const
}

type CreateAction = {
  detail: string
  disabled?: boolean
  label: string
  onPress: () => void
}

function CreateActionSheet({
  actions,
  modal,
}: {
  actions: CreateAction[]
  modal: ReturnType<typeof useModal>
}) {
  return (
    <Modal
      accessibilityLabel="Create"
      hideHeader
      ref={modal.ref}
      snapPoints={[
        actions.length > 5 ? "60%" : actions.length > 4 ? "52%" : "44%",
      ]}
    >
      <View className="px-5 pb-6">
        {actions.map((action) => (
          <SecondaryOperationalRow
            detail={action.detail}
            disabled={action.disabled}
            icon="Plus"
            key={action.label}
            onPress={action.onPress}
            title={action.label}
            trailing={
              action.disabled ? undefined : (
                <Icon
                  className="mt-2 size-sm text-muted-foreground"
                  name="ChevronRight"
                />
              )
            }
          />
        ))}
      </View>
    </Modal>
  )
}
