import { useOptionalAdminTabs } from "@/components/mobile/admin-tabs/admin-tabs-context"
import {
  ClassicDashboardOverview,
  ClassicDashboardScreen,
  ClassicDashboardSectionHeader,
  ClassicDashboardSetup,
} from "@/components/mobile/appearances/classic/dashboard-screen"
import {
  GreenTillOwnerHome,
  GreenTillRepHome,
  type HomeRecentOrder,
} from "@/components/mobile/appearances/classic/green-till-home"
import { ClassicCounterHeader } from "@/components/mobile/appearances/classic/home-counter-parts"
import { DashboardActionRow } from "@/components/mobile/dashboard-kit"
import { HomeSkeleton } from "@/components/mobile/loading-skeletons"
import { PaymentNotificationsSection } from "@/components/mobile/payment-links/payment-notifications"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { SecondaryOperationalRow } from "@/components/mobile/secondary-operations"
import { OrderVisibilityCard } from "@/components/mobile/staff/order-visibility-card"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { hasStoredCustomerShellAccess } from "@/lib/customer-conversation-store"
import { setLastMobileShell } from "@/lib/customer-shell-preference"
import {
  canEditMobileCatalog,
  canManageMobileStaff,
  canManageMobileStock,
  isSalesRepRole,
  normalizeMobileRole,
} from "@/lib/mobile-roles"
import { salesValueScope } from "@/lib/sales-value-motion"
import { getSessionGeneration } from "@/lib/session-store"
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
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useMemo, useRef, useState } from "react"
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
import { HOME_METRIC_LOADING } from "./home-journey-metrics"
import { useHomeJourney } from "./use-home-journey"

export function OperationsDashboardSurface({
  embeddedInAdminTabs = false,
  onBottomTabVisibilityChange,
}: {
  embeddedInAdminTabs?: boolean
  onBottomTabVisibilityChange?: (hidden: boolean) => void
} = {}) {
  const router = useRouter()
  // Add item opens the same quick-create sheet as the tab bar's plus button
  // (its permissions and offline rules apply); outside the tabs it falls back
  // to the product setup route.
  const adminTabs = useOptionalAdminTabs()
  const openQuickCreate = () => {
    if (adminTabs) adminTabs.openCreate()
    else router.push("/first-product-setup-modal" as never)
  }
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
  const isClassicOwner = !isAttendant && !scopedStaff
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
      // Home is rebuilt after a sale: always reread the confirmed total.
      { enabled: salesQueryEnabled, retry: false, refetchOnMount: "always" },
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
  const unpaidSummary =
    recentUnpaid.data && "outstandingCount" in recentUnpaid.data
      ? recentUnpaid.data
      : undefined
  const toDeliver = useQuery(
    trpc.orders.listPage.queryOptions(
      { limit: 50, statuses: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"] },
      { enabled: salesQueryEnabled, retry: false },
    ),
  )
  // Owners and Admins decide staff return/refund requests (in-app only).
  const changeApprovals = useQuery(
    trpc.orders.pendingChangeApprovals.queryOptions(undefined, {
      enabled:
        salesQueryEnabled &&
        ["OWNER", "ADMIN"].includes(normalizeMobileRole(profile?.role)),
      refetchInterval: 60_000,
      retry: false,
    }),
  )
  const repSalesQueryEnabled = isAttendant && !isOffline
  const repTodaySales = useQuery(
    trpc.orders.reportSummary.queryOptions(
      { ...windows.today, mine: true, statuses: [...SALE_STATUSES] },
      { enabled: repSalesQueryEnabled, retry: false, refetchOnMount: "always" },
    ),
  )
  // Coming back to Home (after a sale, a modal or another tab) rereads the
  // confirmed total so the hero can count to it. The first focus is the
  // mount, which already fetches.
  const salesFocusSeen = useRef(false)
  const refetchTodaySales = todaySales.refetch
  const refetchRepTodaySales = repTodaySales.refetch
  useFocusEffect(
    useCallback(() => {
      if (!salesFocusSeen.current) {
        salesFocusSeen.current = true
        return
      }
      if (salesQueryEnabled) void refetchTodaySales({ cancelRefetch: false })
      if (repSalesQueryEnabled)
        void refetchRepTodaySales({ cancelRefetch: false })
    }, [
      salesQueryEnabled,
      repSalesQueryEnabled,
      refetchTodaySales,
      refetchRepTodaySales,
    ]),
  )
  /** Which confirmed total a value belongs to: a change starts a new count. */
  const salesScope = (mine: boolean, currencyCode: string) =>
    salesValueScope({
      actorId: profile?.id,
      businessId: profile?.businessId,
      storeId: profile?.storeId,
      role: profile?.role,
      mine,
      dayStartIso: windows.today.createdAfter.toISOString(),
      currencyCode,
      sessionGeneration: getSessionGeneration(),
      dataGeneration: getDataCacheGeneration(),
    })
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
      label: "Goods",
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
        ? "Create an order from active goods or services."
        : "Record a sale — pick catalog items or type a price.",
      label: "Order",
      onPress: () => openCreateRoute("/create-sale-modal"),
    },
    {
      detail: hasProduct
        ? "Receive, count, adjust, or assign stock."
        : "Add an item to enable stock management.",
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
    if (["Goods", "Service"].includes(action.label)) return canEditCatalog
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
      label: "Add an item",
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
      icon: "PlusCircle",
      label: "Create a new order",
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
      (action.label === "Add an item" || action.label === "Add a service"
        ? canEditCatalog
        : action !== operationalAction || hasProduct),
  )
  return (
    <ClassicDashboardScreen
      businessName={profile?.businessName ?? "Business"}
      centralAction={{
        icon: "Plus",
        label: navigation.centralActionLabel,
        onPress: isAttendant
          ? () => router.push("/create-sale-modal" as never)
          : createModal.present,
      }}
      hero={
        isAttendant ? (
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
        ) : (
          <ClassicCounterHeader
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
          paymentNotifications={<PaymentNotificationsSection />}
          attention={[
            ...((changeApprovals.data?.length ?? 0) > 0
              ? [
                  {
                    icon: "ShieldCheck" as const,
                    key: "change-approvals",
                    onPress: () =>
                      router.push("/change-approvals-modal" as never),
                    sub: "Returns and refunds to decide",
                    tint: "rose" as const,
                    title: `${changeApprovals.data?.length} ${changeApprovals.data?.length === 1 ? "approval" : "approvals"} waiting`,
                  },
                ]
              : []),
            ...((unpaidSummary?.outstandingCount ?? 0) > 0
              ? [
                  {
                    icon: "Wallet" as const,
                    key: "unpaid",
                    onPress: () => router.push("/orders" as never),
                    sub: `${homeMoney(unpaidSummary?.outstandingMinor ?? 0, currency)} to collect`,
                    tint: "amber" as const,
                    title: `${unpaidSummary?.outstandingCount} unpaid ${unpaidSummary?.outstandingCount === 1 ? "order" : "orders"}`,
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
          isOffline={isOffline}
          onAddItem={openQuickCreate}
          onInviteTeam={
            ownerHome.canManage
              ? () => router.push("/staff-invite-modal" as never)
              : undefined
          }
          onNewSale={() => router.push("/create-sale-modal" as never)}
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
                  value: {
                    minor: todaySales.data.orderValueMinor,
                    currencyCode: todaySales.data.currencyCode,
                    scopeKey: salesScope(false, todaySales.data.currencyCode),
                  },
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
        <HomeSkeleton label="Loading Store overview" />
      ) : isFeatureAvailabilityUnavailable ? (
        <StatusBanner
          icon="TriangleAlert"
          message="Refresh to load your latest Store setup and catalog state."
          title="Store overview unavailable"
          tone="warning"
        />
      ) : isAttendant ? (
        <GreenTillRepHome
          paymentNotifications={<PaymentNotificationsSection />}
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
                  value: {
                    minor: repTodaySales.data.orderValueMinor,
                    currencyCode: repTodaySales.data.currencyCode,
                    scopeKey: salesScope(true, repTodaySales.data.currencyCode),
                  },
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
      ) : showStoreSetup ? (
        <ClassicDashboardSetup
          catalogReady={hasSellableCatalogItem}
          itemValue={hasSellableCatalogItem ? "Ready" : "0"}
          onAddItemPress={openQuickCreate}
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
          <ClassicDashboardOverview
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
            primaryValue={
              hasProduct && balances.isLoading
                ? HOME_METRIC_LOADING
                : String(
                    hasProduct
                      ? balanceCount
                      : featureAvailability.hasServiceItems ||
                          featureAvailability.hasServiceJobs
                        ? activeWorkCount
                        : 0,
                  )
            }
            recentOrderDetail={
              provisional.commercialOrders > 0
                ? `${provisional.commercialOrders} waiting to sync`
                : "Latest orders loaded"
            }
            recentOrderValue={
              orders.isLoading ? HOME_METRIC_LOADING : String(recentOrderCount)
            }
            revenueDetail={
              orderRows.length === 0
                ? "No synced order value yet"
                : `Across the latest ${orderRows.length} ${orderRows.length === 1 ? "order" : "orders"}`
            }
            revenueValue={
              orders.isLoading
                ? HOME_METRIC_LOADING
                : formatMinorMoney(orderValue, currency)
            }
            syncLabel={
              isOffline
                ? `${pendingCommandCount} waiting to sync`
                : "Synced now"
            }
            syncTone={isOffline ? "attention" : "ready"}
          />

          {isOffline ? null : <PaymentNotificationsSection />}

          <View>
            <ClassicDashboardSectionHeader title="Today’s work" />
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

      {!isAttendant && !embeddedInAdminTabs ? (
        <CreateActionSheet actions={createActions} modal={createModal} />
      ) : null}
    </ClassicDashboardScreen>
  )
}

type HomeAction = {
  disabled?: boolean
  icon: IconKeys
  label: string
  onPress: () => void
  tone?: "neutral" | "primary" | "success" | "warning"
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
