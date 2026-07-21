import {
  MobileAppShell,
  SecondaryOperationalRow,
  StatusBanner,
} from "@/components/mobile"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { isSalesRepRole } from "@/lib/mobile-roles"
import {
  getMobileDashboardFeatureVisibility,
  getMobileDashboardNavigation,
  mergeMobileWorkspaceFeatureAvailability,
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
import { Redirect, useRouter } from "expo-router"
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
  const { profile } = useAuthContext()
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
      label: "Product",
      onPress: () => openCreateRoute("/first-product-setup-modal?kind=product"),
    },
    {
      detail: "Add work that you price and deliver.",
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
    ...(hasProduct
      ? [
          {
            detail: "Receive, count, adjust, or assign stock.",
            label: "Stock Entry",
            onPress: () => openCreateRoute("/stock-intake-modal"),
          },
        ]
      : []),
    {
      detail: "Invite a team member into this workspace.",
      label: "Staff",
      onPress: () => openCreateRoute("/staff-invite-modal"),
    },
  ]

  return (
    <MobileAppShell
      businessName={profile?.businessName ?? "Business"}
      centralAction={{
        disabled: isAttendant && !hasSellableCatalogItem,
        icon: "Plus",
        label: navigation.centralActionLabel,
        onPress: isAttendant
          ? () => router.push("/create-sale-modal" as never)
          : createModal.present,
      }}
      navItems={navItems}
      onBottomTabVisibilityChange={onBottomTabVisibilityChange}
      role={isAttendant ? "attendant" : "owner"}
      showBottomTabs={!embeddedInAdminTabs}
      title="Today"
    >
      {isOffline ? (
        <StatusBanner
          icon="Wind"
          message={`${commands.filter((command) => command.localStatus === "pending").length} commands waiting. Provisional: ${provisional.commercialOrders} orders, ${provisional.inventoryOperations} inventory operations, ${provisional.serviceOperations} service operations.`}
          title="Offline work is provisional"
          tone="warning"
        />
      ) : null}

      {featureAvailability.hasOrders ||
      hasProduct ||
      featureAvailability.hasServiceJobs ? (
        <View className="rounded-3xl border border-border bg-card p-5">
          {featureAvailability.hasOrders ? (
            <View
              className={
                hasProduct || featureAvailability.hasServiceJobs
                  ? "flex-row items-center justify-between border-b border-border pb-4"
                  : "flex-row items-center justify-between"
              }
            >
              <Metric
                label="Orders"
                value={String(orderRows.length + provisional.commercialOrders)}
              />
              <View className="h-9 w-px bg-border" />
              <Metric
                label="Order value"
                value={formatMinorMoney(orderValue, currency)}
              />
            </View>
          ) : null}
          {hasProduct || featureAvailability.hasServiceJobs ? (
            <View
              className={
                featureAvailability.hasOrders
                  ? "flex-row items-center justify-between pt-4"
                  : "flex-row items-center justify-between"
              }
            >
              {hasProduct ? (
                <Metric
                  label="Balances"
                  value={String(
                    (balances.data?.rows.length ?? 0) +
                      provisional.inventoryOperations,
                  )}
                />
              ) : null}
              {hasProduct && featureAvailability.hasServiceJobs ? (
                <View className="h-9 w-px bg-border" />
              ) : null}
              {featureAvailability.hasServiceJobs ? (
                <Metric
                  label="Active work"
                  value={String(
                    (service.data?.length ?? 0) + provisional.serviceOperations,
                  )}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {featureVisibility.showGettingStarted ? (
        <View className="border-y border-border bg-card">
          <View className="border-b border-border py-4">
            <Text className="text-lg font-extrabold text-foreground">
              Set up your business
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              Start with what you need. More tools appear as you begin using
              them.
            </Text>
          </View>
          {!featureAvailability.hasCatalogItems ? (
            <SecondaryOperationalRow
              detail="Create a Product or Service with the shortest valid setup."
              icon="Plus"
              onPress={() => router.push("/first-product-setup-modal" as never)}
              title="Add your first item"
              trailing={
                <Icon
                  className="mt-2 size-sm text-muted-foreground"
                  name="ChevronRight"
                />
              }
            />
          ) : (
            <SecondaryOperationalRow
              detail={
                hasSellableCatalogItem
                  ? "Create an order from an active Product or Service."
                  : "Add an active fixed-price item before creating an order."
              }
              disabled={!hasSellableCatalogItem}
              icon="Receipt"
              onPress={() => router.push("/create-sale-modal" as never)}
              title="Create first order"
              trailing={
                <Icon
                  className="mt-2 size-sm text-muted-foreground"
                  name="ChevronRight"
                />
              }
            />
          )}
          {!featureAvailability.hasStaff ? (
            <SecondaryOperationalRow
              detail="Invite a team member into this workspace."
              icon="Users"
              onPress={() => router.push("/staff-invite-modal" as never)}
              title="Invite staff"
              trailing={
                <Icon
                  className="mt-2 size-sm text-muted-foreground"
                  name="ChevronRight"
                />
              }
            />
          ) : null}
        </View>
      ) : null}

      <View className="gap-3">
        <Text className="text-lg font-extrabold text-foreground">
          Quick actions
        </Text>
        <View className="flex-row flex-wrap gap-3">
          {!isAttendant && hasProduct ? (
            <QuickAction
              icon="Warehouse"
              label="Stock"
              onPress={() => router.push("/stock-intake-modal" as never)}
            />
          ) : null}
          {!isAttendant && packagedBalanceCount >= 2 ? (
            <QuickAction
              icon="RefreshCw"
              label="Transform"
              onPress={() => router.push("/unit-conversion-modal" as never)}
            />
          ) : null}
          {isAttendant && featureAvailability.hasOrders ? (
            <QuickAction
              icon="ClipboardCheck"
              label="Closeout"
              onPress={() => router.push("/closeout-modal" as never)}
            />
          ) : null}
          <QuickAction
            icon="RefreshCw"
            label="Sync"
            onPress={() => router.push("/sync-status-modal" as never)}
          />
          {!embeddedInAdminTabs ? (
            <QuickAction
              icon="Lock"
              label="App lock"
              onPress={() => router.push("/app-lock-modal" as never)}
            />
          ) : null}
          {!isAttendant && !embeddedInAdminTabs ? (
            <QuickAction
              icon="CreditCard"
              label="Plans"
              onPress={() => router.push("/subscription-modal" as never)}
            />
          ) : null}
        </View>
      </View>

      {featureVisibility.showOrderHistory ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-foreground">
              Recent orders
            </Text>
            <Pressable
              className="min-h-11 justify-center px-2"
              onPress={() => router.push("/create-sale-modal" as never)}
            >
              <Text className="text-sm font-bold text-primary">New</Text>
            </Pressable>
          </View>
          {orders.isLoading ? (
            <StatusBanner icon="Loader2" message="Loading recent orders." />
          ) : orderRows.length === 0 && provisional.commercialOrders > 0 ? (
            <StatusBanner
              icon="Wind"
              message="Your queued orders will appear here after sync."
              title="Orders pending sync"
              tone="warning"
            />
          ) : (
            orderRows.map((order) => (
              <View
                className="gap-2 rounded-2xl border border-border bg-card p-4"
                key={order.id}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="font-bold text-foreground">
                      {order.orderNumber}
                    </Text>
                    <Text
                      className="mt-1 text-xs text-muted-foreground"
                      numberOfLines={2}
                    >
                      {order.lines
                        .map(
                          (line) =>
                            `${line.quantity} × ${line.snapshot?.catalogItemName ?? "Item"}`,
                        )
                        .join(", ")}
                    </Text>
                  </View>
                  <Text className="font-bold text-foreground">
                    {formatMinorMoney(order.totalMinor, order.currencyCode)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      ) : null}

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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 items-center px-2">
      <Text
        className="text-lg font-extrabold text-foreground"
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text className="mt-1 text-center text-xs text-muted-foreground">
        {label}
      </Text>
    </View>
  )
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: "ClipboardCheck" | "CreditCard" | "Lock" | "RefreshCw" | "Warehouse"
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-w-[46%] flex-1 flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4"
      haptic
      onPress={onPress}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <Text className="font-bold text-foreground">{label}</Text>
    </Pressable>
  )
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
              <Icon
                className="mt-2 size-sm text-muted-foreground"
                name="ChevronRight"
              />
            }
          />
        ))}
      </View>
    </Modal>
  )
}
