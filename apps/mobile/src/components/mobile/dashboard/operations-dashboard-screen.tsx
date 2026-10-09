import { ActionButton } from "@/components/mobile/action-button"
import {
  ClassicDashboardEmptyOrders,
  ClassicDashboardHero,
  ClassicDashboardOverview,
  ClassicDashboardScreen,
  ClassicDashboardSectionHeader,
  ClassicDashboardSetup,
  ClassicSalesRepEmptySales,
  ClassicSalesRepOverview,
  ClassicSalesRepSection,
} from "@/components/mobile/appearances/classic/dashboard-screen"
import {
  GreenTillOwnerHome,
  GreenTillRepHome,
  type HomeRecentOrder,
} from "@/components/mobile/appearances/classic/green-till-home"
import { ClassicCounterHeader } from "@/components/mobile/appearances/classic/home-counter-parts"
import {
  BusinessHomeMarketLedgerEmptyOrders,
  BusinessHomeMarketLedgerHero,
  BusinessHomeMarketLedgerOverview,
  BusinessHomeMarketLedgerSectionHeader,
  BusinessHomeMarketLedgerSetup,
} from "@/components/mobile/appearances/market-day/business-home-market-ledger"
import { MarketDayDashboardScreen } from "@/components/mobile/appearances/market-day/dashboard-screen"
import {
  SalesRepShiftLedgerEmptySales,
  SalesRepShiftLedgerHero,
  SalesRepShiftLedgerOverview,
  SalesRepShiftLedgerSection,
} from "@/components/mobile/appearances/market-day/sales-rep-shift-ledger"
import {
  DashboardActionRow,
  DashboardRecentOrderRow,
} from "@/components/mobile/dashboard-kit"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { SecondaryOperationalRow } from "@/components/mobile/secondary-operations"
import { OrderVisibilityCard } from "@/components/mobile/staff/order-visibility-card"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { hasStoredCustomerShellAccess } from "@/lib/customer-conversation-store"
import { setLastMobileShell } from "@/lib/customer-shell-preference"
import {
  canEditMobileCatalog,
  canManageMobileStaff,
  canManageMobileStock,
  isSalesRepRole,
  normalizeMobileRole,
} from "@/lib/mobile-roles"
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
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useMemo, useState } from "react"
import { View } from "react-native"
import {
  SALE_STATUSES,
  greenTillHomeStage,
  homeMoney,
  orderPaymentPill,
  recordAvatar,
  salesDelta,
  salesWindows,
  timeLabel,
} from "./green-till-home-model"
import { useHomeJourney } from "./use-home-journey"

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
  const scopedStaff =
    profile?.staffAccessMode === "SCOPED" &&
    !["OWNER", "ADMIN"].includes(normalizeMobileRole(profile?.role))
  const canEditCatalog = canEditMobileCatalog(profile)
  const isAttendant = isSalesRepRole(profile?.role)
  const appearance = useMobileDesign(
    isAttendant ? "sales-rep-home" : "business-home",
  )
  const isMarketDay = appearance === "market-day"
  const isClassicOwner = !isMarketDay && !isAttendant && !scopedStaff
  const Screen = isMarketDay ? MarketDayDashboardScreen : ClassicDashboardScreen
  const OwnerHero = isMarketDay
    ? BusinessHomeMarketLedgerHero
    : ClassicCounterHeader
  const RepHero = isMarketDay ? SalesRepShiftLedgerHero : ClassicDashboardHero
  const OwnerOverview = isMarketDay
    ? BusinessHomeMarketLedgerOverview
    : ClassicDashboardOverview
  const OwnerSetup = isMarketDay
    ? BusinessHomeMarketLedgerSetup
    : ClassicDashboardSetup
  const OwnerSection = isMarketDay
    ? BusinessHomeMarketLedgerSectionHeader
    : ClassicDashboardSectionHeader
  const OwnerEmpty = isMarketDay
    ? BusinessHomeMarketLedgerEmptyOrders
    : ClassicDashboardEmptyOrders
  const RepOverview = isMarketDay
    ? SalesRepShiftLedgerOverview
    : ClassicSalesRepOverview
  const RepSection = isMarketDay
    ? SalesRepShiftLedgerSection
    : ClassicSalesRepSection
  const RepEmpty = isMarketDay
    ? SalesRepShiftLedgerEmptySales
    : ClassicSalesRepEmptySales
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
      { enabled: !isOffline && !scopedStaff, retry: false },
    ),
  )
  // Green Till Home: today's sales, yesterday for the change, and what needs
  // attention. Windows are fixed per day so query keys stay stable.
  const dayKey = new Date().toDateString()
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute once per day
  const windows = useMemo(() => salesWindows(new Date()), [dayKey])
  const salesQueryEnabled = isClassicOwner && !isOffline
  const todaySales = useQuery(
    trpc.orders.reportSummary.queryOptions(
      { ...windows.today, statuses: [...SALE_STATUSES] },
      { enabled: salesQueryEnabled, retry: false },
    ),
  )
  const yesterdaySales = useQuery(
    trpc.orders.reportSummary.queryOptions(
      { ...windows.yesterday, statuses: [...SALE_STATUSES] },
      { enabled: salesQueryEnabled, retry: false },
    ),
  )
  const recentUnpaid = useQuery(
    trpc.orders.reportSummary.queryOptions(
      {
        createdAfter: new Date(
          windows.today.createdAfter.getTime() - 30 * 24 * 60 * 60_000,
        ),
        statuses: [...SALE_STATUSES],
      },
      { enabled: salesQueryEnabled, retry: false },
    ),
  )
  const toDeliver = useQuery(
    trpc.orders.listPage.queryOptions(
      { limit: 50, statuses: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"] },
      { enabled: salesQueryEnabled, retry: false },
    ),
  )
  const repSalesQueryEnabled = isAttendant && !isMarketDay && !isOffline
  const repTodaySales = useQuery(
    trpc.orders.reportSummary.queryOptions(
      { ...windows.today, mine: true, statuses: [...SALE_STATUSES] },
      { enabled: repSalesQueryEnabled, retry: false },
    ),
  )
  const orderRows = orders.data ?? []
  const toHomeOrder = (
    order: (typeof orderRows)[number],
    index: number,
  ): HomeRecentOrder => {
    const customer =
      order.customerName || order.customerPhone || "Walk-in customer"
    return {
      amount: homeMoney(order.totalMinor, order.currencyCode),
      avatar: recordAvatar(customer, index),
      customer,
      id: order.id,
      meta: [
        order.orderNumber,
        order.lines
          .map(
            (line) =>
              `${line.quantity} × ${line.snapshot?.catalogItemName ?? "Item"}`,
          )
          .join(", "),
        timeLabel(order.createdAt),
      ]
        .filter(Boolean)
        .join(" · "),
      onPress: () =>
        router.push(`/order/${encodeURIComponent(order.id)}` as never),
      pill: orderPaymentPill(order),
    }
  }
  const recentState: "empty" | "loaded" | "loading" | "unavailable" =
    orders.data !== undefined
      ? orderRows.length
        ? "loaded"
        : "empty"
      : orders.isError
        ? "unavailable"
        : isOffline
          ? "empty"
          : "loading"
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
  const showStoreSetup =
    !scopedStaff &&
    shouldShowMobileStoreSetup({
      availabilityResolved: hasResolvedFeatureAvailability,
      isAttendant,
      showGettingStarted: featureVisibility.showGettingStarted,
    })
  const isOfflineAvailabilityUnknown =
    isOffline && !hasResolvedFeatureAvailability
  const ownerHome = useHomeJourney({
    enabled: isClassicOwner,
    availability: featureAvailability,
    availabilityResolved: hasResolvedFeatureAvailability,
    availabilityPending: isFeatureAvailabilityPending,
    isOffline,
    loadedOrderCount: orderRows.length,
  })
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
  const allNavItems = [
    {
      icon: "home" as const,
      isActive: true,
      label: "Home",
      onPress: () => undefined,
    },
    ...(navigation.navItemLabels.includes("Catalog") || canEditCatalog
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
  const navItems = scopedStaff
    ? allNavItems.filter(
        (item) =>
          item.label === "Home" || (item.label === "Catalog" && canEditCatalog),
      )
    : allNavItems
  const openCreateRoute = (href: string) => {
    createModal.dismiss()
    router.push(href as never)
  }
  const allCreateActions: CreateAction[] = [
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
  const createActions = allCreateActions.filter((action) => {
    if (["Product", "Service"].includes(action.label)) return canEditCatalog
    if (action.label === "Staff") return canManageMobileStaff(profile)
    if (action.label === "Customer") return !scopedStaff
    if (action.label === "Stock Entry")
      return canManageMobileStock(profile?.role, profile?.staffAccessMode)
    return true
  })
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
  const allHomeActions: HomeAction[] = [
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

  const homeActions = allHomeActions.filter(
    (action) =>
      !scopedStaff ||
      (action.label === "Add a product" || action.label === "Add a service"
        ? canEditCatalog
        : action !== operationalAction || hasProduct),
  )
  return (
    <Screen
      businessName={profile?.businessName ?? "Business"}
      centralAction={{
        disabled: isAttendant && !hasSellableCatalogItem,
        icon: "Plus",
        label: navigation.centralActionLabel,
        onPress: isAttendant
          ? () => router.push("/create-sale-modal" as never)
          : createModal.present,
      }}
      hero={
        isAttendant && !isMarketDay ? (
          <ClassicCounterHeader
            businessName={profile?.businessName ?? "Business"}
            greetingName={firstName}
            hasNotification={isOffline || pendingCommandCount > 0}
            hideSearch
            onBusinessPress={() =>
              router.push("/business-switch-modal" as never)
            }
            onNotificationPress={() =>
              router.push("/sync-status-modal" as never)
            }
            onProfilePress={() => router.push("/account")}
            roleLabel="Sales rep"
          />
        ) : isAttendant ? (
          <RepHero
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
          <OwnerHero
            businessName={profile?.businessName ?? "Business"}
            greetingName={firstName}
            hasNotification={isOffline || pendingCommandCount > 0}
            onBusinessPress={() =>
              router.push("/business-switch-modal" as never)
            }
            onNotificationPress={() =>
              router.push("/sync-status-modal" as never)
            }
            onProfilePress={
              isClassicOwner
                ? () => router.push("/(admin-tabs)/more" as never)
                : undefined
            }
            onSearchPress={
              isOffline || scopedStaff
                ? undefined
                : () => router.push("/global-search" as never)
            }
          />
        )
      }
      navItems={navItems}
      onBottomTabVisibilityChange={onBottomTabVisibilityChange}
      refreshControl={<QueryRefreshControl />}
      role={isAttendant ? "attendant" : "owner"}
      showBottomTabs={!embeddedInAdminTabs}
      title="Today"
    >
      {!isAttendant ? <OrderVisibilityCard review /> : null}
      {isOffline && !isClassicOwner ? (
        <StatusBanner
          icon="Wind"
          message={`${commands.filter((command) => command.localStatus === "pending" || command.localStatus === "approval").length} commands waiting. Provisional: ${provisional.commercialOrders} orders, ${provisional.inventoryOperations} inventory operations, ${provisional.serviceOperations} service operations.`}
          title="Offline work is provisional"
          tone="warning"
        />
      ) : null}

      {isClassicOwner ? (
        <GreenTillOwnerHome
          attention={[
            ...((recentUnpaid.data?.outstandingCount ?? 0) > 0
              ? [
                  {
                    icon: "Wallet" as const,
                    key: "unpaid",
                    onPress: () => router.push("/orders" as never),
                    sub: `${homeMoney(recentUnpaid.data?.outstandingMinor ?? 0, currency)} to collect`,
                    tint: "amber" as const,
                    title: `${recentUnpaid.data?.outstandingCount} unpaid ${recentUnpaid.data?.outstandingCount === 1 ? "order" : "orders"}`,
                  },
                ]
              : []),
            ...((toDeliver.data?.items.length ?? 0) > 0
              ? [
                  {
                    icon: "Truck" as const,
                    key: "deliver",
                    onPress: () => router.push("/orders" as never),
                    sub: "Ready or on the way",
                    tint: "sky" as const,
                    title: `${toDeliver.data?.items.length}${toDeliver.data?.nextCursor ? "+" : ""} ${toDeliver.data?.items.length === 1 ? "order" : "orders"} to deliver`,
                  },
                ]
              : []),
          ]}
          blocked={
            ownerHome.journey.workspace === "offline-unknown"
              ? {
                  icon: "WifiOff",
                  message:
                    "Reconnect to confirm your latest catalog and Store setup.",
                  title: "Store overview unavailable offline",
                }
              : {
                  icon: "TriangleAlert",
                  message: "Pull down or try again to load your Store.",
                  onRetry: () => void featureAvailabilityQuery.refetch(),
                  title: "Store overview unavailable",
                }
          }
          businessName={profile?.businessName ?? "your business"}
          canCreateSale={hasSellableCatalogItem}
          isOffline={isOffline}
          onAddItem={() => router.push("/first-product-setup-modal" as never)}
          onInviteTeam={
            ownerHome.canManage
              ? () => router.push("/staff-invite-modal" as never)
              : undefined
          }
          onNewSale={() => {
            if (hasSellableCatalogItem)
              router.push("/create-sale-modal" as never)
          }}
          onOrders={() => router.push("/orders" as never)}
          onPayment={() => router.push("/payments-received-modal" as never)}
          onStockIn={() => router.push("/stock-intake-modal" as never)}
          onSync={() => router.push("/sync-status-modal" as never)}
          pendingCommandCount={pendingCommandCount}
          recentOrders={orderRows.slice(0, 4).map(toHomeOrder)}
          recentState={recentState}
          sales={
            todaySales.data
              ? {
                  amount: homeMoney(
                    todaySales.data.orderValueMinor,
                    todaySales.data.currencyCode,
                  ),
                  asOf: isOffline
                    ? timeLabel(new Date(todaySales.dataUpdatedAt))
                    : undefined,
                  delta:
                    yesterdaySales.data && "paidMinor" in todaySales.data
                      ? salesDelta(
                          todaySales.data.orderValueMinor,
                          yesterdaySales.data.orderValueMinor,
                        )
                      : null,
                  orderCount: todaySales.data.orderCount,
                  partial:
                    "partial" in todaySales.data && !!todaySales.data.partial,
                  stats:
                    "paidMinor" in todaySales.data
                      ? [
                          {
                            label: "Paid",
                            value: homeMoney(
                              todaySales.data.paidMinor,
                              todaySales.data.currencyCode,
                            ),
                          },
                          {
                            label: "Unpaid",
                            value: homeMoney(
                              todaySales.data.outstandingMinor,
                              todaySales.data.currencyCode,
                            ),
                          },
                          {
                            label: "Items sold",
                            value: String(todaySales.data.itemsSold),
                          },
                        ]
                      : [],
                  status: isOffline ? "cached" : "ready",
                }
              : todaySales.isError || isOffline
                ? { status: "unavailable" }
                : { status: "loading" }
          }
          stage={greenTillHomeStage(ownerHome.journey)}
          team={
            ownerHome.journey.showTeamPrompt
              ? {
                  error: ownerHome.preference.error,
                  onDismiss: () => void ownerHome.preference.dismiss(),
                  saving: ownerHome.preference.saving,
                }
              : undefined
          }
        />
      ) : isOfflineAvailabilityUnknown ? (
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
      ) : isAttendant && !isMarketDay ? (
        <GreenTillRepHome
          canCreateSale={hasSellableCatalogItem}
          isOffline={isOffline}
          onCloseout={() => router.push("/closeout-modal" as never)}
          onCustomers={
            featureAvailability.hasCustomers && !scopedStaff
              ? () => router.push("/customer-book-modal" as never)
              : undefined
          }
          onNewSale={() => router.push("/create-sale-modal" as never)}
          onSales={() => router.push("/your-sales" as never)}
          onStockIn={
            canManageMobileStock(profile?.role, profile?.staffAccessMode)
              ? () => router.push("/stock-intake-modal" as never)
              : undefined
          }
          onSync={() => router.push("/sync-status-modal" as never)}
          pendingCommandCount={pendingCommandCount}
          recentOrders={orderRows.slice(0, 4).map(toHomeOrder)}
          recentState={recentState}
          sales={
            repTodaySales.data
              ? {
                  amount: homeMoney(
                    repTodaySales.data.orderValueMinor,
                    repTodaySales.data.currencyCode,
                  ),
                  delta: null,
                  orderCount: repTodaySales.data.orderCount,
                  partial:
                    "partial" in repTodaySales.data &&
                    !!repTodaySales.data.partial,
                  stats:
                    "paidByMethod" in repTodaySales.data
                      ? [
                          {
                            label: "Cash",
                            value: homeMoney(
                              repTodaySales.data.paidByMethod.CASH ?? 0,
                              repTodaySales.data.currencyCode,
                            ),
                          },
                          {
                            label: "Transfer",
                            value: homeMoney(
                              repTodaySales.data.paidByMethod.BANK_TRANSFER ??
                                0,
                              repTodaySales.data.currencyCode,
                            ),
                          },
                          {
                            label: "Items",
                            value: String(repTodaySales.data.itemsSold),
                          },
                        ]
                      : [],
                  status: isOffline ? "cached" : "ready",
                }
              : repTodaySales.isError || isOffline
                ? { status: "unavailable" }
                : { status: "loading" }
          }
        />
      ) : isAttendant ? (
        <RepOverview
          {...salesRepPresentation}
          onCloseoutPress={() => router.push("/closeout-modal" as never)}
          onCustomerBookPress={
            featureAvailability.hasCustomers && !scopedStaff
              ? () => router.push("/customer-book-modal" as never)
              : undefined
          }
          onStartSalePress={() => router.push("/create-sale-modal" as never)}
          onSyncPress={() => router.push("/sync-status-modal" as never)}
          recentOrderCount={String(orderRows.length)}
          recentOrderValue={formatMinorMoney(orderValue, currency)}
        />
      ) : showStoreSetup ? (
        <OwnerSetup
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
          <OwnerOverview
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
            <OwnerSection title="Today’s work" />
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

      {isAttendant &&
      isMarketDay &&
      canManageMobileStock(profile?.role, profile?.staffAccessMode) ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/stock-intake-modal" as never)}
          className="mx-4 flex-row items-center gap-3 border border-border p-4"
        >
          <Icon name="Warehouse" className="size-sm text-muted-foreground" />
          <Text className="flex-1 text-base font-medium text-foreground">
            Receive or adjust stock
          </Text>
          <Icon name="ChevronRight" className="size-sm text-muted-foreground" />
        </Pressable>
      ) : null}

      {isAttendant && isMarketDay ? (
        <RepSection title="Your sales">
          <ActionButton
            variant="outline"
            onPress={() => router.push("/your-sales" as never)}
          >
            View all sales
          </ActionButton>
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
            <RepEmpty message="New sales will appear here as soon as they are created." />
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
        </RepSection>
      ) : isMarketDay ? (
        <View>
          <OwnerSection
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
            <OwnerEmpty
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
      ) : null}

      {!isAttendant && !embeddedInAdminTabs ? (
        <CreateActionSheet actions={createActions} modal={createModal} />
      ) : null}
    </Screen>
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
