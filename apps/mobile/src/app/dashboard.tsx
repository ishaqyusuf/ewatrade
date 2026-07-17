import { Logout } from "@/components/logout"
import {
  DashboardInlineStatus,
  DashboardPanel,
  DashboardRecordRow,
  DashboardStatTile,
  type DashboardTone,
  EmptyState,
  DashboardMetricCard as MetricCard,
  MobileAppShell,
  type MobileAppShellNavItem,
  DashboardQuickAction as QuickAction,
  StatusBadge,
} from "@/components/mobile"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { quickActions } from "@/data/retail-ops-dashboard-data"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { isInvitedStaffProfile, isSalesRepRole } from "@/lib/mobile-roles"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsCloseout,
  type RetailOpsCustomer,
  type RetailOpsProduct,
  type RetailOpsRepSession,
  type RetailOpsSale,
  type RetailOpsShareLink,
  type RetailOpsStaffMember,
  type RetailOpsStockMovement,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import {
  type RetailOpsPlan,
  type RetailOpsSubscription,
  getBusinessSubscription,
  getPlan,
  getUsageLimitState,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { Redirect, useRouter } from "expo-router"
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react"
import { View as RNView, View, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type DashboardMetric = {
  detail: string
  label: string
  tone: "primary" | "success" | "warning" | "neutral"
  value: number
}

type LowStockAlert = {
  id: string
  name: string
  remaining: string
  status: "Low" | "Out" | "Watch"
}

const LOW_STOCK_THRESHOLD = 10
const WATCH_STOCK_THRESHOLD = 20
const DASHBOARD_VARIANT_PREVIEW_LIMIT = 4
const DASHBOARD_REP_SESSION_PREVIEW_LIMIT = 3
const DASHBOARD_LOW_STOCK_PREVIEW_LIMIT = 3
const DASHBOARD_STAFF_PREVIEW_LIMIT = 3
const DASHBOARD_SHARE_LINK_PREVIEW_LIMIT = 3
const DASHBOARD_STOCK_MOVEMENT_PREVIEW_LIMIT = 3
const DASHBOARD_CUSTOMER_PREVIEW_LIMIT = 3
const DASHBOARD_RECENT_SALE_PREVIEW_LIMIT = 5

function getActiveCurrencyCode() {
  const state = useBusinessStore.getState()
  return (
    state.businesses.find((business) => business.id === state.activeBusinessId)
      ?.currency ?? "NGN"
  )
}

function formatMoney(valueMinor: number, currencyCode?: string) {
  return formatMinorMoney(
    valueMinor,
    currencyCode === "NGN" || !currencyCode
      ? getActiveCurrencyCode()
      : currencyCode,
  )
}

function colorWithAlpha(color: string, opacity: number) {
  const normalizedOpacity = Math.min(1, Math.max(0, opacity))
  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(
    color,
  )

  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${normalizedOpacity})`
  }

  const normalizedHex = color.replace("#", "").trim()
  const expandedHex =
    normalizedHex.length === 3
      ? normalizedHex
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalizedHex

  if (/^[0-9a-fA-F]{6}$/.test(expandedHex)) {
    const red = Number.parseInt(expandedHex.slice(0, 2), 16)
    const green = Number.parseInt(expandedHex.slice(2, 4), 16)
    const blue = Number.parseInt(expandedHex.slice(4, 6), 16)

    return `rgba(${red}, ${green}, ${blue}, ${normalizedOpacity})`
  }

  return color
}

function getStockStatus(stock: number): LowStockAlert["status"] {
  if (stock <= 0) return "Out"
  if (stock <= LOW_STOCK_THRESHOLD) return "Low"
  return "Watch"
}

function getLowStockAlerts(products: RetailOpsProduct[]) {
  return products.flatMap((product) => {
    const primaryStock = product.currentStock ?? product.startingStock ?? 0
    const rows: LowStockAlert[] = []

    if (primaryStock <= WATCH_STOCK_THRESHOLD) {
      rows.push({
        id: `${product.id}-primary`,
        name: product.name,
        remaining: `${primaryStock} ${product.unitName}`,
        status: getStockStatus(primaryStock),
      })
    }

    for (const variant of product.variants) {
      const variantStock = variant.currentStock ?? variant.startingStock ?? 0

      if (variantStock > WATCH_STOCK_THRESHOLD) continue

      rows.push({
        id: `${product.id}-${variant.id}`,
        name: `${product.name} - ${variant.name}`,
        remaining: `${variantStock} ${variant.name}`,
        status: getStockStatus(variantStock),
      })
    }

    return rows
  })
}

type QuickActionProps = (typeof quickActions)[number] & {
  onPress?: () => void
}

type RecentSaleItem = {
  attendant: string
  customer: string
  id: string
  item: string
  method: string
  syncStatus?: RetailOpsSale["syncStatus"]
  total: number
}

type MoreNavigationItem = {
  description: string
  icon: IconKeys
  label: string
  onPress: () => void
}

type RetailOpsDashboardSurfaceMode = "admin" | "sales-rep"

type RetailOpsDashboardSurfaceProps = {
  surface?: RetailOpsDashboardSurfaceMode
}

type ProductionDashboardSummary = {
  inventory: {
    lowStockCount: number
    stockUnitCount: number
  }
  sales: {
    orderCount: number
    pendingOrderCount: number
    totalMinor: number
  }
  sessions: {
    openCount: number
  }
}

type ProductionRecentSale = {
  customer: {
    name: string | null
  }
  id: string
  lines: Array<{
    productName: string
    unitName: string
  }>
  orderNumber: string
  payment: {
    method: string | null
  }
  retailOps: {
    externalId: string | null
  }
  totalMinor: number
}

type ProductionCustomerBookEntry = {
  email: string | null
  id: string
  lastOrder?: {
    orderNumber: string
  } | null
  lastSeenAt: Date | string
  name: string
  orderCount: number
  phone: string | null
}

type ProductionStaffMember = {
  createdAt?: Date | string
  id: string
  invitedAt?: Date | string | null
  role: string
  status: string
  user: {
    displayName?: string | null
    email: string
    name?: string | null
  }
}

type ProductionSubscriptionSnapshot = {
  plan: RetailOpsPlan
  subscription: {
    currentPeriodEndsAt: string | null
    planId: RetailOpsSubscription["planId"]
    status: RetailOpsSubscription["status"]
    trialEndsAt: string | null
    updatedAt: string
  }
  usage: {
    businesses: number
    products: number
    staff: number
  }
}

function formatPaymentMethod(method: RetailOpsSale["paymentMethod"]) {
  return method === "cash" ? "Cash" : "Transfer"
}

function formatProductionPaymentMethod(method: string | null) {
  const normalizedMethod = method?.trim().toLowerCase() ?? ""

  if (
    normalizedMethod.includes("transfer") ||
    normalizedMethod.includes("bank")
  ) {
    return "Transfer"
  }

  if (normalizedMethod.includes("card")) return "Card"
  if (normalizedMethod.includes("credit")) return "Credit"

  return "Cash"
}

function getOpenCloseoutSales(
  sales: RetailOpsSale[],
  closeouts: RetailOpsCloseout[],
) {
  const latestCloseout = closeouts[0]

  if (!latestCloseout) return sales

  const latestCloseoutTime = new Date(latestCloseout.createdAt).getTime()

  if (Number.isNaN(latestCloseoutTime)) return sales

  return sales.filter((sale) => {
    const saleTime = new Date(sale.createdAt).getTime()

    return !Number.isNaN(saleTime) && saleTime > latestCloseoutTime
  })
}

function getSalePaymentTotals(sales: RetailOpsSale[]) {
  return sales.reduce(
    (totals, sale) => {
      if (sale.paymentMethod === "cash") {
        totals.cash += sale.totalMinor
      } else {
        totals.transfer += sale.totalMinor
      }

      totals.gross += sale.totalMinor

      return totals
    },
    {
      cash: 0,
      gross: 0,
      transfer: 0,
    },
  )
}

function isToday(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return false

  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function isActiveBusinessRecord(
  record: {
    businessId?: string
  },
  activeBusinessId: string | null,
) {
  return (
    !activeBusinessId ||
    (record.businessId ?? activeBusinessId) === activeBusinessId
  )
}

function toRecentSaleItem(sale: RetailOpsSale): RecentSaleItem {
  return {
    attendant: sale.attendantName,
    customer: sale.customerName,
    id: sale.id,
    item: `${sale.productName} - ${sale.unitName}`,
    method: formatPaymentMethod(sale.paymentMethod),
    syncStatus: sale.syncStatus,
    total: sale.totalMinor,
  }
}

function toProductionRecentSaleItem(
  sale: ProductionRecentSale,
): RecentSaleItem {
  const firstLine = sale.lines[0]

  return {
    attendant: "Synced sale",
    customer: sale.customer.name ?? "Walk-in customer",
    id: sale.orderNumber || sale.id,
    item: firstLine
      ? `${firstLine.productName} - ${firstLine.unitName}`
      : "Retail sale",
    method: formatProductionPaymentMethod(sale.payment.method),
    syncStatus: "synced",
    total: sale.totalMinor,
  }
}

function toIsoDateString(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString()

  if (value instanceof Date) return value.toISOString()

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return new Date().toISOString()

  return date.toISOString()
}

function toProductionStaffPreview(
  staff: ProductionStaffMember,
): RetailOpsStaffMember {
  const normalizedStatus = staff.status.trim().toLowerCase()
  const status: RetailOpsStaffMember["status"] =
    normalizedStatus === "suspended"
      ? "suspended"
      : normalizedStatus === "active"
        ? "active"
        : "pending"
  const name =
    staff.user.displayName?.trim() ||
    staff.user.name?.trim() ||
    staff.user.email

  return {
    email: staff.user.email,
    id: `production-${staff.id}`,
    invitedAt: toIsoDateString(staff.invitedAt ?? staff.createdAt),
    name,
    remoteId: staff.id,
    role: "attendant",
    status,
    syncStatus: "synced",
  }
}

function toProductionCustomerPreview(
  customer: ProductionCustomerBookEntry,
): RetailOpsCustomer {
  return {
    id: `production-${customer.id}`,
    lastSeenAt: toIsoDateString(customer.lastSeenAt),
    name: customer.name,
    remoteId: customer.id,
    saleCount: customer.orderCount,
    syncStatus: "synced",
  }
}

function getStaffPreviewKey(staff: RetailOpsStaffMember) {
  return staff.remoteId ?? staff.email.trim().toLowerCase()
}

function getCustomerPreviewKey(customer: RetailOpsCustomer) {
  return customer.remoteId ?? customer.name.trim().toLowerCase()
}

function RecentSaleCard({ sale }: { sale: RecentSaleItem }) {
  return (
    <DashboardRecordRow
      detail={`${sale.customer} by ${sale.attendant}`}
      icon="Receipt"
      metadata={sale.id}
      title={sale.item}
      trailing={
        <Text className="font-extrabold text-foreground">
          {formatMinorMoney(sale.total, getActiveCurrencyCode())}
        </Text>
      }
    >
      {sale.syncStatus === "pending" ? (
        <StatusBadge icon="Clock" label="Pending sync" tone="warning" />
      ) : null}
      <StatusBadge label={sale.method} tone="primary" />
    </DashboardRecordRow>
  )
}

function StaffStatusBadge({ staff }: { staff: RetailOpsStaffMember }) {
  const isPending = staff.status === "pending"

  return (
    <StatusBadge
      icon={isPending ? "Clock" : "CheckCircle2"}
      label={isPending ? "Invite pending" : "Active"}
      tone={isPending ? "warning" : "success"}
    />
  )
}

function StaffCard({ staff }: { staff: RetailOpsStaffMember }) {
  return (
    <DashboardRecordRow
      detail={staff.email}
      icon="User"
      metadata="Attendant"
      title={staff.name}
      trailing={<StaffStatusBadge staff={staff} />}
    >
      {staff.syncStatus === "pending" ? (
        <StatusBadge icon="Clock" label="Pending sync" tone="primary" />
      ) : null}
    </DashboardRecordRow>
  )
}

function ProductLinkCard({
  link,
  onDeactivate,
  onManage,
}: {
  link: RetailOpsShareLink
  onDeactivate: () => void
  onManage: () => void
}) {
  const isActive = link.status === "active"

  return (
    <DashboardRecordRow
      detail={link.url}
      icon="Share"
      metadata={`${link.views} views - ${link.orders} orders`}
      title={link.productName}
      trailing={
        <StatusBadge
          icon={isActive ? "CheckCircle2" : "XCircle"}
          label={isActive ? "Active" : "Inactive"}
          tone={isActive ? "success" : "muted"}
        />
      }
    >
      <Pressable
        className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
        haptic
        onPress={onManage}
        transition
      >
        <Text className="text-xs font-bold text-primary">Manage</Text>
      </Pressable>
      {isActive ? (
        <Pressable
          className="rounded-full bg-destructive/10 px-3 py-2 active:bg-destructive/20"
          haptic
          onPress={onDeactivate}
          transition
        >
          <Text className="text-xs font-bold text-destructive">Deactivate</Text>
        </Pressable>
      ) : null}
    </DashboardRecordRow>
  )
}

function formatCustomerLastSeen(value: string | undefined) {
  if (!value) return "Recent"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recent"

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

function CustomerCard({ customer }: { customer: RetailOpsCustomer }) {
  const saleCount = customer.saleCount ?? 1

  return (
    <DashboardRecordRow
      detail={`Last sale ${formatCustomerLastSeen(customer.lastSeenAt)}`}
      icon="Users"
      title={customer.name}
      trailing={
        <StatusBadge
          label={`${saleCount} sale${saleCount === 1 ? "" : "s"}`}
          tone="primary"
        />
      }
    >
      {(customer.syncStatus ?? "pending") === "pending" ? (
        <StatusBadge icon="Clock" label="Pending sync" tone="warning" />
      ) : null}
    </DashboardRecordRow>
  )
}

function stockMovementLabel(type: RetailOpsStockMovement["type"]) {
  if (type === "conversion_in") return "Conversion in"
  if (type === "conversion_out") return "Conversion out"
  if (type === "opening_stock") return "Opening stock"
  if (type === "stock_adjustment") return "Stock adjustment"
  if (type === "stock_intake") return "Stock intake"
  return "Sale"
}

function StockMovementCard({
  movement,
}: {
  movement: RetailOpsStockMovement
}) {
  const isIncrease = movement.quantity >= 0

  return (
    <DashboardRecordRow
      detail={stockMovementLabel(movement.type)}
      icon={isIncrease ? "TrendingUp" : "TrendingDown"}
      title={movement.productName}
      trailing={
        <Text
          className={cn(
            "font-extrabold",
            isIncrease ? "text-success" : "text-destructive",
          )}
        >
          {isIncrease ? "+" : ""}
          {movement.quantity} {movement.unitName}
        </Text>
      }
    >
      {movement.syncStatus === "pending" ? (
        <StatusBadge icon="Clock" label="Pending sync" tone="warning" />
      ) : null}
    </DashboardRecordRow>
  )
}

function closeoutStatusLabel(status: RetailOpsCloseout["approvalStatus"]) {
  if (status === "approved") return "Approved"
  if (status === "flagged") return "Flagged"
  return "Pending review"
}

function closeoutStatusTone(
  status: RetailOpsCloseout["approvalStatus"],
): DashboardTone {
  if (status === "approved") return "success"
  if (status === "flagged") return "destructive"
  return "warning"
}

function formatSessionTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return "Today"

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function getSessionVarianceCount(session: RetailOpsRepSession) {
  return session.openingInventoryLines.filter((line) => line.variance !== 0)
    .length
}

function CloseoutSummaryCard({
  latestCloseout,
  onPress,
  openSalesCount,
  paymentTotals,
}: {
  latestCloseout: RetailOpsCloseout | null
  onPress: () => void
  openSalesCount: number
  paymentTotals: {
    cash: number
    gross: number
    transfer: number
  }
}) {
  return (
    <DashboardPanel
      actionLabel="Close day"
      description="Confirm payments and closing stock for admin review."
      icon="ClipboardCheck"
      onActionPress={onPress}
      title="Day closeout"
    >
      <View className="flex-row gap-3">
        <DashboardStatTile label="Open sales" value={openSalesCount} />
        <DashboardStatTile
          label="Expected"
          value={formatMoney(paymentTotals.gross, "NGN")}
        />
      </View>

      <View className="flex-row gap-3">
        <DashboardStatTile
          label="Cash"
          value={formatMoney(paymentTotals.cash, "NGN")}
        />
        <DashboardStatTile
          label="Transfer"
          value={formatMoney(paymentTotals.transfer, "NGN")}
        />
      </View>

      {latestCloseout ? (
        <DashboardInlineStatus
          label={`${closeoutStatusLabel(latestCloseout.approvalStatus)}${
            latestCloseout.syncStatus === "pending" ? " - Pending sync" : ""
          }`}
          title="Last closeout"
          tone={closeoutStatusTone(latestCloseout.approvalStatus)}
        />
      ) : null}
    </DashboardPanel>
  )
}

function RepSessionStatusCard({
  currentSession,
  hasInventory,
  onClockIn,
  onCreateSale,
  openSessions,
}: {
  currentSession: RetailOpsRepSession | null
  hasInventory: boolean
  onClockIn: () => void
  onCreateSale: () => void
  openSessions: RetailOpsRepSession[]
}) {
  const totalVarianceCount = openSessions.reduce(
    (total, session) => total + getSessionVarianceCount(session),
    0,
  )
  const visibleOpenSessions = openSessions.slice(
    0,
    DASHBOARD_REP_SESSION_PREVIEW_LIMIT,
  )
  const title = currentSession
    ? "Sales day open"
    : hasInventory
      ? "Opening stock required"
      : "Inventory required"
  const description = currentSession
    ? `${currentSession.attendantName} is clocked in and can record sales.`
    : hasInventory
      ? "Clock in and confirm opening inventory before the first sale."
      : "Add an item before reps can start the sales day."
  const sessionTone: DashboardTone = currentSession ? "success" : "warning"

  return (
    <DashboardPanel
      description={description}
      icon={currentSession ? "CircleCheck" : "Clock"}
      title="Rep sessions"
      tone={sessionTone}
    >
      <DashboardInlineStatus
        label={title}
        title="Session state"
        tone={sessionTone}
      />

      <View className="flex-row gap-3">
        <DashboardStatTile label="Clocked in" value={openSessions.length} />
        <DashboardStatTile
          label="Variances"
          tone={totalVarianceCount > 0 ? "destructive" : "success"}
          value={totalVarianceCount}
        />
      </View>

      {openSessions.length > 0 ? (
        <View>
          {visibleOpenSessions.map((session) => {
            const varianceCount = getSessionVarianceCount(session)

            return (
              <DashboardRecordRow
                detail={`Since ${formatSessionTime(session.clockedInAt)}`}
                icon="User"
                key={session.id}
                title={session.attendantName}
                trailing={
                  <Text
                    className={cn(
                      "text-xs font-bold",
                      varianceCount > 0 ? "text-destructive" : "text-success",
                    )}
                  >
                    {varianceCount > 0
                      ? `${varianceCount} variance${
                          varianceCount === 1 ? "" : "s"
                        }`
                      : "Balanced"}
                  </Text>
                }
              />
            )
          })}
          {openSessions.length > visibleOpenSessions.length ? (
            <Text className="text-xs font-semibold text-muted-foreground">
              Showing first {visibleOpenSessions.length} of{" "}
              {openSessions.length} open sessions.
            </Text>
          ) : null}
        </View>
      ) : null}

      <Pressable
        className={cn(
          "h-11 flex-row items-center justify-center gap-2 rounded-xl active:opacity-90",
          currentSession ? "bg-primary" : "bg-primary/10",
          !hasInventory && "opacity-60",
        )}
        disabled={!hasInventory}
        haptic
        onPress={currentSession ? onCreateSale : onClockIn}
        transition
      >
        <Icon
          className={cn(
            "size-sm",
            currentSession ? "text-primary-foreground" : "text-primary",
          )}
          name={currentSession ? "PlusCircle" : "Clock"}
        />
        <Text
          className={cn(
            "font-semibold",
            currentSession ? "text-primary-foreground" : "text-primary",
          )}
        >
          {currentSession ? "New sale" : "Clock in"}
        </Text>
      </Pressable>
    </DashboardPanel>
  )
}

function PlanUsageStat({
  label,
  limit,
  used,
}: {
  label: string
  limit: number
  used: number
}) {
  const limitState = getUsageLimitState(used, limit)

  return (
    <DashboardStatTile
      label={label}
      tone={limitState.isAtLimit ? "destructive" : "neutral"}
      value={limitState.label}
    />
  )
}

function subscriptionStatusLabel(status: RetailOpsSubscription["status"]) {
  if (status === "trialing") return "Trial"
  if (status === "past_due") return "Past due"
  if (status === "cancelled") return "Cancelled"
  return "Active"
}

function PlanStatusCard({
  onPress,
  plan,
  subscription,
  usage,
}: {
  onPress: () => void
  plan: RetailOpsPlan
  subscription: RetailOpsSubscription
  usage: {
    businesses: number
    products: number
    staff: number
  }
}) {
  return (
    <DashboardPanel
      actionLabel="Plans"
      description={`${plan.name} plan controls products, staff, businesses, reports, and offline device limits.`}
      icon="CreditCard"
      onActionPress={onPress}
      title="Subscription"
      tone="primary"
    >
      <DashboardInlineStatus
        label={subscriptionStatusLabel(subscription.status)}
        title={plan.name}
        tone="primary"
      />

      <View className="flex-row gap-3">
        <PlanUsageStat
          label="Products"
          limit={plan.limits.products}
          used={usage.products}
        />
        <PlanUsageStat
          label="Staff"
          limit={plan.limits.staff}
          used={usage.staff}
        />
      </View>

      <PlanUsageStat
        label="Businesses"
        limit={plan.limits.businesses}
        used={usage.businesses}
      />
    </DashboardPanel>
  )
}

function ReportsSummaryCard({
  onPress,
  pendingSyncCount,
  stockUnitCount,
  todaySalesCount,
  todayTotal,
  varianceCount,
}: {
  onPress: () => void
  pendingSyncCount: number
  stockUnitCount: number
  todaySalesCount: number
  todayTotal: number
  varianceCount: number
}) {
  return (
    <DashboardPanel
      actionLabel="Open"
      description="Daily sales, stock, cash, variance, and movement snapshots."
      icon="PieChart"
      onActionPress={onPress}
      title="Reports"
    >
      <View className="flex-row gap-3">
        <DashboardStatTile
          detail={`${todaySalesCount} sale${todaySalesCount === 1 ? "" : "s"}`}
          label="Today"
          value={formatMoney(todayTotal, "NGN")}
        />
        <DashboardStatTile
          detail="Product and variants"
          label="Stock units"
          value={stockUnitCount}
        />
      </View>

      <View className="flex-row gap-3">
        <DashboardStatTile
          label="Variance"
          tone={varianceCount > 0 ? "destructive" : "success"}
          value={varianceCount}
        />
        <DashboardStatTile
          label="Pending sync"
          tone={pendingSyncCount > 0 ? "warning" : "success"}
          value={pendingSyncCount}
        />
      </View>
    </DashboardPanel>
  )
}

function SetupPrompt({
  isAttendant,
  onAddItem,
}: {
  isAttendant?: boolean
  onAddItem: () => void
}) {
  if (isAttendant) {
    return (
      <DashboardPanel
        description="Products and stock will appear here after an owner or manager sets up inventory for this business."
        icon="Warehouse"
        title="Inventory not assigned yet"
      />
    )
  }

  return (
    <DashboardPanel
      actionLabel="Add item"
      description="Create a product, set units like bag or kilogram, then enter starting stock."
      icon="Warehouse"
      onActionPress={onAddItem}
      title="Add your first item"
      tone="primary"
    />
  )
}

function InventorySetupSummary({
  canManageInventory,
  onConvert,
  onRestock,
  onShare,
  product,
}: {
  canManageInventory?: boolean
  onConvert: () => void
  onRestock: () => void
  onShare: () => void
  product: RetailOpsProduct
}) {
  const currentStock = product.currentStock ?? product.startingStock
  const visibleVariants = product.variants.slice(
    0,
    DASHBOARD_VARIANT_PREVIEW_LIMIT,
  )

  return (
    <DashboardPanel
      description={`${product.name} has ${currentStock} ${product.unitName}${
        currentStock === 1 ? "" : "s"
      } ready to sell.`}
      icon="CircleCheck"
      title="Inventory started"
      tone="success"
    >
      <View className="gap-3">
        <DashboardRecordRow
          detail={`Primary unit: ${product.unitName}`}
          icon="Warehouse"
          title={product.name}
          trailing={
            <Text className="font-extrabold text-foreground">
              {formatMinorMoney(product.priceMinor, getActiveCurrencyCode())}
            </Text>
          }
        />
        {visibleVariants.length > 0 ? (
          <View>
            {visibleVariants.map((variant) => (
              <DashboardRecordRow
                detail={`${
                  variant.currentStock ?? variant.startingStock ?? 0
                } in stock`}
                icon="List"
                key={variant.id}
                title={variant.name}
                trailing={
                  <Text className="text-sm font-bold text-foreground">
                    {formatMinorMoney(
                      variant.priceMinor,
                      getActiveCurrencyCode(),
                    )}
                  </Text>
                }
              />
            ))}
            {product.variants.length > visibleVariants.length ? (
              <Text className="text-xs font-medium text-muted-foreground">
                Showing first {visibleVariants.length} of{" "}
                {product.variants.length} variants. Open Share or Create sale to
                browse the full list.
              </Text>
            ) : null}
          </View>
        ) : null}
        <StatusBadge icon="Clock" label="Pending sync" tone="warning" />
        <View className="flex-row gap-2">
          {canManageInventory ? (
            <>
              <Pressable
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
                haptic
                onPress={onRestock}
                transition
              >
                <Icon className="size-sm text-primary" name="Truck" />
                <Text className="text-sm font-bold text-primary">Restock</Text>
              </Pressable>
              <Pressable
                className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
                haptic
                onPress={onConvert}
                transition
              >
                <Icon className="size-sm text-primary" name="Wrench" />
                <Text className="text-sm font-bold text-primary">Convert</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
            haptic
            onPress={onShare}
            transition
          >
            <Icon className="size-sm text-primary" name="Share" />
            <Text className="text-sm font-bold text-primary">Share</Text>
          </Pressable>
        </View>
      </View>
    </DashboardPanel>
  )
}

function DashboardMoreSheet({
  items,
  modal,
}: {
  items: MoreNavigationItem[]
  modal: ReturnType<typeof useModal>
}) {
  return (
    <Modal
      accessibilityLabel="More navigation"
      ref={modal.ref}
      snapPoints={["48%"]}
      title="More"
    >
      <View className="gap-2 px-4 pb-5">
        {items.map((item) => (
          <Pressable
            className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-accent"
            haptic
            key={item.label}
            onPress={item.onPress}
            transition
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Icon
                className="size-sm text-muted-foreground"
                name={item.icon}
              />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-extrabold text-foreground">
                {item.label}
              </Text>
              <Text
                className="text-xs leading-4 text-muted-foreground"
                numberOfLines={2}
              >
                {item.description}
              </Text>
            </View>
            <Icon
              className="size-sm text-muted-foreground"
              name="ChevronRight"
            />
          </Pressable>
        ))}
      </View>
    </Modal>
  )
}

function DashboardActionPickerSheet({
  items,
  modal,
}: {
  items: MoreNavigationItem[]
  modal: ReturnType<typeof useModal>
}) {
  return (
    <Modal
      accessibilityLabel="Create action"
      ref={modal.ref}
      snapPoints={["42%"]}
      title="Create"
    >
      <View className="gap-2 px-4 pb-5">
        {items.map((item) => (
          <Pressable
            className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-accent"
            haptic
            key={item.label}
            onPress={item.onPress}
            transition
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-sm text-primary" name={item.icon} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-extrabold text-foreground">
                {item.label}
              </Text>
              <Text
                className="text-xs leading-4 text-muted-foreground"
                numberOfLines={2}
              >
                {item.description}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Modal>
  )
}

function DashboardSettingsSheet({
  items,
  modal,
}: {
  items: MoreNavigationItem[]
  modal: ReturnType<typeof useModal>
}) {
  return (
    <Modal
      accessibilityLabel="Workspace settings"
      ref={modal.ref}
      snapPoints={["64%"]}
      title="Settings"
    >
      <View className="gap-2 px-4 pb-5">
        {items.map((item) => (
          <Pressable
            className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-accent"
            haptic
            key={item.label}
            onPress={item.onPress}
            transition
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Icon
                className="size-sm text-muted-foreground"
                name={item.icon}
              />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-extrabold text-foreground">
                {item.label}
              </Text>
              <Text className="text-xs leading-4 text-muted-foreground">
                {item.description}
              </Text>
            </View>
            <Icon
              className="size-sm text-muted-foreground"
              name="ChevronRight"
            />
          </Pressable>
        ))}
      </View>
    </Modal>
  )
}

function DashboardThemeSheet({
  colorScheme,
  modal,
  onSelect,
}: {
  colorScheme: "light" | "dark"
  modal: ReturnType<typeof useModal>
  onSelect: (scheme: "light" | "dark" | "system") => void
}) {
  const options: Array<{
    description: string
    icon: IconKeys
    label: string
    value: "light" | "dark" | "system"
  }> = [
    {
      description: "Follow the device theme setting.",
      icon: "SlidersHorizontal",
      label: "System",
      value: "system",
    },
    {
      description: "Use the brighter app surface.",
      icon: "Eye",
      label: "Light",
      value: "light",
    },
    {
      description: "Use the darker app surface.",
      icon: "EyeOff",
      label: "Dark",
      value: "dark",
    },
  ]

  return (
    <Modal
      accessibilityLabel="Theme settings"
      ref={modal.ref}
      snapPoints={["46%"]}
      title="Theme"
    >
      <View className="gap-2 px-4 pb-5">
        {options.map((option) => {
          const selected =
            option.value === "system" ? false : option.value === colorScheme

          return (
            <Pressable
              className="flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-accent"
              haptic
              key={option.value}
              onPress={() => onSelect(option.value)}
              transition
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Icon
                  className="size-sm text-muted-foreground"
                  name={option.icon}
                />
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-extrabold text-foreground">
                  {option.label}
                </Text>
                <Text className="text-xs leading-4 text-muted-foreground">
                  {option.description}
                </Text>
              </View>
              {selected ? <StatusBadge label="Active" tone="success" /> : null}
            </Pressable>
          )
        })}
      </View>
    </Modal>
  )
}

function RetailOpsHomeHero({
  businessName,
  headerAction,
  onBusinessPress,
  onPrimaryPress,
  onSearchPress,
  primaryActionLabel,
  roleLabel,
  searchPlaceholder,
  summaryDetail,
  summaryLabel,
  summaryValue,
}: {
  businessName: string
  headerAction?: ReactNode
  onBusinessPress: () => void
  onPrimaryPress: () => void
  onSearchPress: () => void
  primaryActionLabel: string
  roleLabel: string
  searchPlaceholder: string
  summaryDetail: string
  summaryLabel: string
  summaryValue: string
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const isCompact = width < 380
  const heroControlBackground = colorWithAlpha(colors.primaryForeground, 0.15)
  const heroPanelBackground = colorWithAlpha(colors.primaryForeground, 0.12)

  return (
    <RNView
      style={{
        backgroundColor: colors.primary,
        borderBottomLeftRadius: 36,
        borderBottomRightRadius: 36,
        overflow: "hidden",
      }}
    >
      <RNView
        style={{
          paddingBottom: isCompact ? 24 : 28,
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: insets.top + 18,
        }}
      >
        <View className="gap-5">
          <View className="flex-row items-center justify-between gap-4">
            <Pressable
              accessibilityRole="button"
              className="min-w-0 flex-1 gap-1 active:opacity-85"
              haptic
              onPress={onBusinessPress}
              transition
            >
              <Text className="text-xs font-bold uppercase tracking-[1px] text-primary-foreground">
                {roleLabel}
              </Text>
              <View className="flex-row items-center gap-2">
                <Icon
                  className="size-sm text-primary-foreground"
                  name="MapPin"
                />
                <Text
                  className="text-lg font-extrabold text-primary-foreground"
                  numberOfLines={1}
                >
                  {businessName}
                </Text>
                <Icon
                  className="size-sm text-primary-foreground"
                  name="ChevronDown"
                />
              </View>
            </Pressable>
            {headerAction ? (
              <RNView
                style={{
                  alignItems: "center",
                  backgroundColor: heroControlBackground,
                  borderRadius: 999,
                  height: 44,
                  justifyContent: "center",
                  width: 44,
                }}
              >
                {headerAction}
              </RNView>
            ) : null}
          </View>

          <Pressable
            accessibilityLabel="Search workspace"
            accessibilityRole="button"
            className="h-12 flex-row items-center gap-3 rounded-full bg-background px-4 active:opacity-90"
            haptic
            onPress={onSearchPress}
            transition
          >
            <Icon className="size-sm text-muted-foreground" name="Search" />
            <Text
              className="min-w-0 flex-1 text-sm font-semibold text-muted-foreground"
              numberOfLines={2}
            >
              {searchPlaceholder}
            </Text>
          </Pressable>

          <RNView
            style={{
              backgroundColor: heroPanelBackground,
              borderRadius: 30,
            }}
          >
            <View
              className={cn(
                "flex-row items-center gap-4",
                isCompact ? "p-3" : "p-4",
              )}
            >
              <View className="min-w-0 flex-1 gap-2">
                <Text
                  className="text-xs font-bold uppercase tracking-[1px] text-primary-foreground"
                  numberOfLines={1}
                >
                  {summaryLabel}
                </Text>
                <Text
                  adjustsFontSizeToFit
                  className={cn(
                    "font-extrabold text-primary-foreground",
                    isCompact ? "text-2xl leading-8" : "text-3xl leading-9",
                  )}
                  minimumFontScale={0.7}
                  numberOfLines={1}
                >
                  {summaryValue}
                </Text>
                <Text
                  className="text-sm leading-5 text-primary-foreground"
                  numberOfLines={isCompact ? 3 : 2}
                >
                  {summaryDetail}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  className="self-start rounded-full bg-primary-foreground px-4 py-2 active:opacity-90"
                  haptic
                  onPress={onPrimaryPress}
                  transition
                >
                  <Text className="text-xs font-extrabold text-primary">
                    {primaryActionLabel}
                  </Text>
                </Pressable>
              </View>
              {isCompact ? null : (
                <View className="h-24 w-24 items-center justify-center rounded-[28px] bg-primary-foreground">
                  <Icon className="size-2xl text-primary" name="BarChart3" />
                </View>
              )}
            </View>
          </RNView>
        </View>
      </RNView>
    </RNView>
  )
}

function AdminHomeOverview({
  firstProduct,
  lowStockAlerts,
  onCloseout,
  onCustomers,
  onSales,
  onSalesReps,
  onServices,
  onStocks,
  openRepSessionCount,
  openSalesCount,
  productCount,
  recentSale,
  stockUnitCount,
  todaySalesCount,
  todayTotal,
}: {
  firstProduct: RetailOpsProduct | null
  lowStockAlerts: LowStockAlert[]
  onCloseout: () => void
  onCustomers: () => void
  onSales: () => void
  onSalesReps: () => void
  onServices: () => void
  onStocks: () => void
  openRepSessionCount: number
  openSalesCount: number
  productCount: number
  recentSale: RecentSaleItem | null
  stockUnitCount: number
  todaySalesCount: number
  todayTotal: number
}) {
  const primaryLowStock = lowStockAlerts[0]

  return (
    <>
      <View className="gap-4">
        <View className="flex-row flex-wrap gap-3">
          <DashboardStatTile
            detail={`${todaySalesCount} sale${todaySalesCount === 1 ? "" : "s"}`}
            label="Today"
            tone="primary"
            value={formatMoney(todayTotal, "NGN")}
          />
          <DashboardStatTile
            detail={`${productCount} product${productCount === 1 ? "" : "s"}`}
            label="Stock"
            tone={lowStockAlerts.length > 0 ? "warning" : "success"}
            value={stockUnitCount}
          />
        </View>

        <View className="gap-3">
          <Text className="text-xl font-extrabold text-foreground">
            Service categories
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <AdminHomeCategory
              icon="ReceiptText"
              label="Sales"
              onPress={onSales}
            />
            <AdminHomeCategory
              icon="Warehouse"
              label="Stocks"
              onPress={onStocks}
            />
            <AdminHomeCategory
              icon="UserPlus"
              label="Sales Reps"
              onPress={onSalesReps}
            />
            <AdminHomeCategory
              icon="ClipboardList"
              label="Services"
              onPress={onServices}
            />
            <AdminHomeCategory
              icon="Users"
              label="Customers"
              onPress={onCustomers}
            />
          </View>
        </View>
      </View>

      <DashboardPanel
        actionLabel="Closeout"
        description="A compact view of the operations that need owner attention."
        icon="LayoutDashboard"
        onActionPress={onCloseout}
        title="Current operations"
        tone={primaryLowStock ? "warning" : "neutral"}
      >
        <View className="gap-3">
          <DashboardRecordRow
            detail={
              firstProduct
                ? `${firstProduct.currentStock ?? firstProduct.startingStock ?? 0} ${firstProduct.unitName} available`
                : "Add your first item to start tracking sales and stock."
            }
            icon="Warehouse"
            title={firstProduct?.name ?? "Inventory setup"}
            trailing={
              primaryLowStock ? (
                <StatusBadge label={primaryLowStock.status} tone="warning" />
              ) : null
            }
          />
          <DashboardRecordRow
            detail={
              recentSale
                ? `${recentSale.customer} by ${recentSale.attendant}`
                : "Completed sales will appear here."
            }
            icon="ReceiptText"
            title={recentSale?.item ?? "No recent sale yet"}
            trailing={
              recentSale ? (
                <Text className="font-extrabold text-foreground">
                  {formatMinorMoney(recentSale.total, getActiveCurrencyCode())}
                </Text>
              ) : null
            }
          />
          <View className="flex-row flex-wrap gap-3">
            <DashboardInlineStatus
              label={`${openRepSessionCount} open`}
              title="Rep sessions"
              tone={openRepSessionCount > 0 ? "primary" : "neutral"}
            />
            <DashboardInlineStatus
              label={`${openSalesCount} open`}
              title="Closeout queue"
              tone={openSalesCount > 0 ? "warning" : "success"}
            />
          </View>
        </View>
      </DashboardPanel>
    </>
  )
}

function AdminHomeCategory({
  icon,
  label,
  onPress,
}: {
  icon: IconKeys
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-24 w-[47%] justify-center gap-3 rounded-[24px] bg-muted p-4 active:opacity-90"
      haptic
      onPress={onPress}
      transition
    >
      <View className="size-10 items-center justify-center rounded-full bg-card">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <Text className="font-extrabold text-foreground">{label}</Text>
    </Pressable>
  )
}

function SalesRepHomeOverview({
  attendantName,
  currentSession,
  firstProduct,
  onClockIn,
  onCloseout,
  onCreateSale,
  onCustomers,
  onServiceOrders,
  openSalesCount,
  todaySalesCount,
  todayTotal,
}: {
  attendantName: string
  currentSession: RetailOpsRepSession | null
  firstProduct: RetailOpsProduct | null
  onClockIn: () => void
  onCloseout: () => void
  onCreateSale: () => void
  onCustomers: () => void
  onServiceOrders: () => void
  openSalesCount: number
  todaySalesCount: number
  todayTotal: number
}) {
  const canSell = !!firstProduct && !!currentSession
  const description = currentSession
    ? "Record sales, check customers, and close out your assigned shift."
    : firstProduct
      ? "Clock in before recording sales for this workspace."
      : "Ask an admin to finish stock setup before starting sales."

  return (
    <DashboardPanel
      actionLabel={canSell ? "New sale" : "Clock in"}
      description={description}
      icon={canSell ? "ReceiptText" : "Clock"}
      onActionPress={canSell ? onCreateSale : onClockIn}
      title={`Hi, ${attendantName}`}
      tone={canSell ? "success" : "warning"}
    >
      <View className="flex-row flex-wrap gap-3">
        <DashboardStatTile
          detail="Recorded today"
          label="Sales"
          tone="success"
          value={todaySalesCount}
        />
        <DashboardStatTile
          detail="Today total"
          label="Amount"
          tone="primary"
          value={formatMoney(todayTotal, "NGN")}
        />
      </View>
      <View className="flex-row gap-2">
        <Pressable
          className={cn(
            "flex-1 flex-row items-center justify-center gap-2 rounded-xl px-3 py-3",
            canSell ? "bg-primary active:bg-primary/90" : "bg-muted",
          )}
          haptic
          onPress={canSell ? onCreateSale : onClockIn}
          transition
        >
          <Icon
            className={cn(
              "size-sm",
              canSell ? "text-primary-foreground" : "text-muted-foreground",
            )}
            name={canSell ? "Plus" : "Clock"}
          />
          <Text
            className={cn(
              "text-sm font-bold",
              canSell ? "text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {canSell ? "Sale" : "Clock in"}
          </Text>
        </Pressable>
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
          haptic
          onPress={onServiceOrders}
          transition
        >
          <Icon className="size-sm text-primary" name="ClipboardList" />
          <Text className="text-sm font-bold text-primary">Services</Text>
        </Pressable>
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
          haptic
          onPress={onCloseout}
          transition
        >
          <Icon className="size-sm text-primary" name="ClipboardCheck" />
          <Text className="text-sm font-bold text-primary">Closeout</Text>
        </Pressable>
      </View>
      <Pressable
        className="min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-muted px-3 py-3 active:bg-accent"
        haptic
        onPress={onCustomers}
        transition
      >
        <Icon className="size-sm text-foreground" name="Users" />
        <Text className="text-sm font-bold text-foreground">Customers</Text>
      </Pressable>
      <DashboardRecordRow
        detail={
          firstProduct
            ? `${firstProduct.currentStock ?? firstProduct.startingStock ?? 0} ${firstProduct.unitName} available for sales`
            : "Assigned stock will appear after an admin completes inventory setup."
        }
        icon="Warehouse"
        title={firstProduct?.name ?? "Assigned stock"}
        trailing={
          firstProduct ? (
            <StatusBadge
              label={canSell ? "Ready" : "Clock in"}
              tone={canSell ? "success" : "warning"}
            />
          ) : null
        }
      />
      <DashboardInlineStatus
        label={`${openSalesCount} open`}
        title="Closeout queue"
        tone={openSalesCount > 0 ? "warning" : "success"}
      />
    </DashboardPanel>
  )
}

export function RetailOpsDashboardSurface({
  surface,
}: RetailOpsDashboardSurfaceProps = {}) {
  const router = useRouter()
  const trpc = useTRPC()
  const { isAuthenticated, profile } = useAuthContext()
  const { colorScheme, setColorScheme } = useColorScheme()
  const colors = useColors()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const businesses = useBusinessStore((state) => state.businesses)
  const ensureBusiness = useBusinessStore((state) => state.ensureBusiness)
  const setActiveBusiness = useBusinessStore((state) => state.setActiveBusiness)
  const updateBusinessCurrency = useBusinessStore(
    (state) => state.updateBusinessCurrency,
  )
  const tenantQuery = useQuery(
    trpc.tenant.current.queryOptions(undefined, {
      enabled: isAuthenticated,
      retry: false,
    }),
  )
  const activeBusiness = businesses.find(
    (business) => business.id === activeBusinessId,
  )
  const actionModal = useModal()
  const moreModal = useModal()
  const settingsModal = useModal()
  const themeModal = useModal()
  const setupPromptedBusinessRef = useRef<string | null>(null)
  const attendantName = profile?.name ?? "Store Owner"
  const profileIsSalesRep = isSalesRepRole(profile?.role)
  const isAttendantDashboard =
    surface === "sales-rep" || (!surface && profileIsSalesRep)
  const showSecondaryAdminHomeSections = false
  const canManageInventory = !isAttendantDashboard
  const visibleQuickActions = useMemo(
    () =>
      quickActions.filter(
        (action) => !isAttendantDashboard || action.label === "New sale",
      ),
    [isAttendantDashboard],
  )
  const businessDisplayName =
    activeBusiness?.name ?? profile?.businessName ?? "Retail workspace"
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const deactivateShareLink = useRetailOpsStore(
    (state) => state.deactivateShareLink,
  )
  const allCloseouts = useRetailOpsStore((state) => state.closeouts)
  const allCustomers = useRetailOpsStore((state) => state.customers)
  const allProducts = useRetailOpsStore((state) => state.products)
  const allRepSessions = useRetailOpsStore((state) => state.repSessions)
  const allSales = useRetailOpsStore((state) => state.sales)
  const allShareLinks = useRetailOpsStore((state) => state.shareLinks)
  const allStaff = useRetailOpsStore((state) => state.staff)
  const allStockMovements = useRetailOpsStore((state) => state.stockMovements)
  const allSyncEvents = useRetailOpsStore((state) => state.syncEvents)
  const closeouts = useMemo(
    () =>
      allCloseouts.filter((closeout) =>
        isActiveBusinessRecord(closeout, activeBusinessId),
      ),
    [activeBusinessId, allCloseouts],
  )
  const customers = useMemo(
    () =>
      allCustomers.filter((customer) =>
        isActiveBusinessRecord(customer, activeBusinessId),
      ),
    [activeBusinessId, allCustomers],
  )
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const products = useMemo(
    () =>
      allProducts.filter((product) =>
        isActiveBusinessRecord(product, activeBusinessId),
      ),
    [activeBusinessId, allProducts],
  )
  const repSessions = useMemo(
    () =>
      allRepSessions.filter((session) =>
        isActiveBusinessRecord(session, activeBusinessId),
      ),
    [activeBusinessId, allRepSessions],
  )
  const sales = useMemo(
    () =>
      allSales.filter((sale) => isActiveBusinessRecord(sale, activeBusinessId)),
    [activeBusinessId, allSales],
  )
  const shareLinks = useMemo(
    () =>
      allShareLinks.filter((link) =>
        isActiveBusinessRecord(link, activeBusinessId),
      ),
    [activeBusinessId, allShareLinks],
  )
  const staff = useMemo(
    () =>
      allStaff.filter((staffMember) =>
        isActiveBusinessRecord(staffMember, activeBusinessId),
      ),
    [activeBusinessId, allStaff],
  )
  const stockMovements = useMemo(
    () =>
      allStockMovements.filter((movement) =>
        isActiveBusinessRecord(movement, activeBusinessId),
      ),
    [activeBusinessId, allStockMovements],
  )
  const syncEvents = useMemo(
    () =>
      allSyncEvents.filter((event) =>
        isActiveBusinessRecord(event, activeBusinessId),
      ),
    [activeBusinessId, allSyncEvents],
  )
  const dashboardRange = useMemo(() => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)

    return {
      from,
      to: new Date(),
    }
  }, [])
  const canReadProductionDashboard = isAuthenticated && !isOfflineMode
  const dashboardSummaryQuery = useQuery(
    trpc.retailOps.summary.queryOptions(dashboardRange, {
      enabled: canReadProductionDashboard,
      retry: false,
    }),
  )
  const productionRecentSalesQuery = useQuery(
    trpc.retailOps.recentSales.queryOptions(
      {
        ...dashboardRange,
        limit: 5,
      },
      {
        enabled: canReadProductionDashboard,
        retry: false,
      },
    ),
  )
  const productionSubscriptionQuery = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      enabled: canReadProductionDashboard,
      retry: false,
    }),
  )
  const productionStaffQuery = useQuery(
    trpc.retailOps.staff.queryOptions(
      {
        limit: 3,
        role: "cashier",
        status: "all",
      },
      {
        enabled: canReadProductionDashboard,
        retry: false,
      },
    ),
  )
  const productionCustomersQuery = useQuery(
    trpc.retailOps.customerBook.queryOptions(
      {
        limit: 3,
      },
      {
        enabled: canReadProductionDashboard,
        retry: false,
      },
    ),
  )
  const productionSummary = dashboardSummaryQuery.data as
    | ProductionDashboardSummary
    | undefined
  const productionRecentSales = (productionRecentSalesQuery.data ??
    []) as ProductionRecentSale[]
  const productionSubscriptionSnapshot = productionSubscriptionQuery.data as
    | ProductionSubscriptionSnapshot
    | undefined
  const productionStaff = (productionStaffQuery.data ??
    []) as ProductionStaffMember[]
  const productionCustomers = (productionCustomersQuery.data ??
    []) as ProductionCustomerBookEntry[]
  const firstProduct = products[0] ?? null
  const productionInventoryKnown =
    canReadProductionDashboard && dashboardSummaryQuery.isSuccess
  const shouldPromptFirstProduct =
    isAuthenticated &&
    !!activeBusinessId &&
    !firstProduct &&
    ((productionInventoryKnown &&
      (productionSummary?.inventory.stockUnitCount ?? 0) === 0) ||
      !canReadProductionDashboard ||
      dashboardSummaryQuery.isError)
  const localSubscription = getBusinessSubscription(
    subscriptions,
    activeBusinessId,
  )
  const useProductionSubscriptionSnapshot =
    canReadProductionDashboard &&
    !!productionSubscriptionSnapshot &&
    !productionSubscriptionQuery.isError
  const subscription: RetailOpsSubscription = useProductionSubscriptionSnapshot
    ? {
        businessId: activeBusinessId ?? "production-business",
        currentPeriodEndsAt:
          productionSubscriptionSnapshot.subscription.currentPeriodEndsAt ??
          undefined,
        planId: productionSubscriptionSnapshot.subscription.planId,
        status: productionSubscriptionSnapshot.subscription.status,
        trialEndsAt:
          productionSubscriptionSnapshot.subscription.trialEndsAt ?? undefined,
        updatedAt: productionSubscriptionSnapshot.subscription.updatedAt,
      }
    : localSubscription
  const subscriptionPlan = useProductionSubscriptionSnapshot
    ? productionSubscriptionSnapshot.plan
    : getPlan(subscription.planId)
  const subscriptionUsage = useProductionSubscriptionSnapshot
    ? {
        businesses: productionSubscriptionSnapshot.usage.businesses,
        products: productionSubscriptionSnapshot.usage.products,
        staff: productionSubscriptionSnapshot.usage.staff,
      }
    : {
        businesses: businesses.length,
        products: products.length,
        staff: staff.length,
      }
  const openRepSessions = repSessions.filter(
    (session) => session.status === "open",
  )
  const currentRepSession =
    openRepSessions.find(
      (session) => session.attendantName === attendantName,
    ) ?? null
  const lastSyncSummary = useRetailOpsStore((state) => state.lastSyncSummary)
  const pendingSyncEvents = syncEvents.filter(
    (event) => event.status === "pending",
  )
  const failedSyncEvents = syncEvents.filter(
    (event) => event.status === "failed",
  )
  const conflictSyncEvents = syncEvents.filter(
    (event) => event.status === "conflict",
  )
  const openSyncEventCount =
    pendingSyncEvents.length +
    failedSyncEvents.length +
    conflictSyncEvents.length
  const syncBannerClassName = isOfflineMode
    ? "border-warn/30 bg-warn/10"
    : conflictSyncEvents.length > 0
      ? "border-warn/30 bg-warn/10"
      : failedSyncEvents.length > 0
        ? "border-destructive/30 bg-destructive/10"
        : pendingSyncEvents.length > 0
          ? "border-primary/30 bg-primary/10"
          : "border-success/30 bg-success/10"
  const syncBannerIconClassName = isOfflineMode
    ? "text-warn"
    : conflictSyncEvents.length > 0
      ? "text-warn"
      : failedSyncEvents.length > 0
        ? "text-destructive"
        : pendingSyncEvents.length > 0
          ? "text-primary"
          : "text-success"
  const syncBannerIconName =
    isOfflineMode || conflictSyncEvents.length > 0
      ? "TriangleAlert"
      : failedSyncEvents.length > 0
        ? "TriangleAlert"
        : "CircleCheck"
  const syncBannerText = isOfflineMode
    ? "Offline mode. Changes will be applied when next you connect."
    : conflictSyncEvents.length > 0
      ? `${conflictSyncEvents.length} sync conflict${
          conflictSyncEvents.length === 1 ? "" : "s"
        } need review.`
      : failedSyncEvents.length > 0
        ? `${failedSyncEvents.length} local change${
            failedSyncEvents.length === 1 ? "" : "s"
          } need retry.`
        : pendingSyncEvents.length > 0
          ? `${pendingSyncEvents.length} local change${
              pendingSyncEvents.length === 1 ? "" : "s"
            } pending sync.`
          : lastSyncSummary
            ? `Last sync ${lastSyncSummary.status} at ${formatSessionTime(
                lastSyncSummary.completedAt,
              )}. Applied ${lastSyncSummary.appliedCount} of ${
                lastSyncSummary.totalCount
              }.`
            : "Online. Local changes are synced."
  const todaySales = sales.filter((sale) => isToday(sale.createdAt))
  const todayPaymentTotals = getSalePaymentTotals(todaySales)
  const productionDashboardReady =
    canReadProductionDashboard &&
    !!productionSummary &&
    !dashboardSummaryQuery.isError
  const localPendingOrderCount = shareLinks.reduce(
    (total, link) => total + link.orders,
    0,
  )
  const lowStockAlerts = getLowStockAlerts(products)
  const localStockUnitCount = products.reduce(
    (total, product) => total + 1 + product.variants.length,
    0,
  )
  const visibleLowStockAlerts = lowStockAlerts.slice(
    0,
    DASHBOARD_LOW_STOCK_PREVIEW_LIMIT,
  )
  const dashboardTodayTotal = productionDashboardReady
    ? productionSummary.sales.totalMinor
    : todayPaymentTotals.gross
  const dashboardTodaySalesCount = productionDashboardReady
    ? productionSummary.sales.orderCount
    : todaySales.length
  const pendingOrderCount = productionDashboardReady
    ? productionSummary.sales.pendingOrderCount
    : localPendingOrderCount
  const lowStockCount = productionDashboardReady
    ? productionSummary.inventory.lowStockCount
    : lowStockAlerts.length
  const activeRepCount = productionDashboardReady
    ? productionSummary.sessions.openCount
    : openRepSessions.length
  const stockUnitCount = productionDashboardReady
    ? productionSummary.inventory.stockUnitCount
    : localStockUnitCount
  const latestCloseout = closeouts[0] ?? null
  const closeoutVarianceCount = latestCloseout
    ? [
        latestCloseout.cashVarianceMinor,
        latestCloseout.transferVarianceMinor,
        ...latestCloseout.inventoryLines.map((line) => line.variance),
      ].filter((variance) => variance !== 0).length
    : 0
  const openCloseoutSales = getOpenCloseoutSales(sales, closeouts)
  const closeoutPaymentTotals = getSalePaymentTotals(openCloseoutSales)
  const metrics: DashboardMetric[] = [
    {
      detail:
        dashboardTodaySalesCount === 1
          ? "1 sale recorded today"
          : `${dashboardTodaySalesCount} sales recorded today`,
      label: "Today sales",
      tone: "primary",
      value: dashboardTodayTotal,
    },
    {
      detail:
        shareLinks.length > 0
          ? "From product share links"
          : "No product-link orders",
      label: "Pending orders",
      tone: "success",
      value: pendingOrderCount,
    },
    {
      detail:
        lowStockCount > 0 ? "Needs attention soon" : "Stock levels look okay",
      label: "Low stock",
      tone: "warning",
      value: lowStockCount,
    },
    {
      detail:
        activeRepCount === 1
          ? "1 rep clocked in"
          : `${activeRepCount} reps clocked in`,
      label: "Active reps",
      tone: "neutral",
      value: activeRepCount,
    },
  ]
  const productionRecentSaleItems = productionRecentSales.map(
    toProductionRecentSaleItem,
  )
  const productionRecentIds = new Set(
    productionRecentSales.map((sale) => sale.id),
  )
  const productionRecentExternalIds = new Set(
    productionRecentSales
      .map((sale) => sale.retailOps.externalId)
      .filter((externalId): externalId is string => !!externalId),
  )
  const localRecentSaleItems = sales
    .filter((sale) => {
      if (sale.syncStatus !== "synced") return true
      if (sale.remoteId && productionRecentIds.has(sale.remoteId)) return false
      if (productionRecentExternalIds.has(sale.id)) return false

      return true
    })
    .map(toRecentSaleItem)
  const recentSalePreviewRows =
    canReadProductionDashboard && !productionRecentSalesQuery.isError
      ? [...localRecentSaleItems, ...productionRecentSaleItems]
      : localRecentSaleItems
  const visibleRecentSales = recentSalePreviewRows.slice(
    0,
    DASHBOARD_RECENT_SALE_PREVIEW_LIMIT,
  )
  const productionStaffPreview = productionStaff.map(toProductionStaffPreview)
  const localStaffPreview = staff.filter(
    (staffMember) =>
      staffMember.syncStatus !== "synced" || !staffMember.remoteId,
  )
  const staffPreviewRows =
    canReadProductionDashboard && !productionStaffQuery.isError
      ? (() => {
          const seen = new Set(productionStaffPreview.map(getStaffPreviewKey))
          const mergedStaff = [...productionStaffPreview]

          for (const staffMember of localStaffPreview) {
            const key = getStaffPreviewKey(staffMember)

            if (!seen.has(key)) {
              seen.add(key)
              mergedStaff.push(staffMember)
            }
          }

          return mergedStaff
        })()
      : staff
  const visibleStaffPreview = staffPreviewRows.slice(
    0,
    DASHBOARD_STAFF_PREVIEW_LIMIT,
  )
  const productionCustomerPreview = productionCustomers.map(
    toProductionCustomerPreview,
  )
  const localCustomerPreview = customers.filter(
    (customer) => customer.syncStatus !== "synced" || !customer.remoteId,
  )
  const customerPreviewRows =
    canReadProductionDashboard && !productionCustomersQuery.isError
      ? (() => {
          const seen = new Set(
            productionCustomerPreview.map(getCustomerPreviewKey),
          )
          const mergedCustomers = [...productionCustomerPreview]

          for (const customer of localCustomerPreview) {
            const key = getCustomerPreviewKey(customer)

            if (!seen.has(key)) {
              seen.add(key)
              mergedCustomers.push(customer)
            }
          }

          return mergedCustomers
        })()
      : customers
  const visibleCustomerPreview = customerPreviewRows.slice(
    0,
    DASHBOARD_CUSTOMER_PREVIEW_LIMIT,
  )
  const visibleShareLinks = shareLinks.slice(
    0,
    DASHBOARD_SHARE_LINK_PREVIEW_LIMIT,
  )
  const visibleStockMovements = stockMovements.slice(
    0,
    DASHBOARD_STOCK_MOVEMENT_PREVIEW_LIMIT,
  )
  const openFirstProductSetup = useCallback(() => {
    router.push("/first-product-setup-modal")
  }, [router])
  const openStockIntake = useCallback(() => {
    router.push("/stock-intake-modal")
  }, [router])
  const openCreateSale = useCallback(() => {
    router.push("/create-sale-modal")
  }, [router])
  const openRepClockIn = useCallback(() => {
    router.push("/rep-clock-in-modal")
  }, [router])
  const openCloseout = useCallback(() => {
    router.push("/closeout-modal")
  }, [router])
  const openReports = useCallback(() => {
    router.push("/reports-modal")
  }, [router])
  const openSubscription = useCallback(() => {
    router.push("/subscription-modal")
  }, [router])
  const openBusinessSwitch = useCallback(() => {
    router.push("/business-switch-modal")
  }, [router])
  const openCustomerBook = useCallback(() => {
    router.push("/customer-book-modal")
  }, [router])
  const openSyncStatus = useCallback(() => {
    router.push("/sync-status-modal")
  }, [router])
  const openProductShare = useCallback(() => {
    router.push("/product-share-modal")
  }, [router])
  const openServiceOrders = useCallback(() => {
    router.push("/service-orders-modal")
  }, [router])

  const handleQuickAction = (label: QuickActionProps["label"]) => {
    if (label === "Add item") {
      if (isAttendantDashboard) return
      openFirstProductSetup()
      return
    }

    if (label === "New sale") {
      if (!firstProduct) {
        if (!isAttendantDashboard) {
          openFirstProductSetup()
        }
        return
      }

      if (currentRepSession) {
        openCreateSale()
      } else {
        openRepClockIn()
      }
      return
    }

    if (label === "Add staff") {
      if (isAttendantDashboard) return
      router.push("/staff-invite-modal")
    }
  }
  const syncBanner = (
    <Pressable
      className={cn(
        "flex-row items-start gap-2 rounded-2xl border p-3 active:opacity-90",
        syncBannerClassName,
      )}
      haptic
      onPress={openSyncStatus}
      testID="retail-sync-banner"
      transition
    >
      <Icon
        className={cn("mt-0.5 size-base shrink-0", syncBannerIconClassName)}
        name={isOfflineMode ? "Wind" : syncBannerIconName}
      />
      <View className="min-w-0 flex-1 shrink">
        <Text className="text-sm font-medium leading-5 text-foreground">
          {syncBannerText}
        </Text>
      </View>
      {isOfflineMode ? null : (
        <Icon
          className="mt-0.5 size-sm shrink-0 text-muted-foreground"
          name="ChevronRight"
        />
      )}
    </Pressable>
  )
  const shellCentralAction: MobileAppShellNavItem = {
    accessibilityLabel: "Create sale",
    icon: "Plus",
    label: "Sale",
    onPress: () =>
      isAttendantDashboard
        ? handleQuickAction("New sale")
        : actionModal.present(),
  }
  const actionPickerItems: MoreNavigationItem[] = [
    {
      description: "Start a sale for the current session.",
      icon: "ReceiptText",
      label: "New sale",
      onPress: () => {
        actionModal.dismiss()
        handleQuickAction("New sale")
      },
    },
    {
      description: "Receive dry-cleaning items and update due orders.",
      icon: "ClipboardList",
      label: "Service order",
      onPress: () => {
        actionModal.dismiss()
        openServiceOrders()
      },
    },
    {
      description: "Record restock, adjustment, or inventory movement.",
      icon: "Warehouse",
      label: "Stock entry",
      onPress: () => {
        actionModal.dismiss()
        firstProduct ? openStockIntake() : openFirstProductSetup()
      },
    },
    {
      description: "Invite a sales rep into this workspace.",
      icon: "UserPlus",
      label: "Sales rep",
      onPress: () => {
        actionModal.dismiss()
        router.push("/staff-invite-modal")
      },
    },
  ]
  const moreNavigationItems: MoreNavigationItem[] = [
    {
      description: "Invite reps and review their access.",
      icon: "UserPlus",
      label: "Sales Reps",
      onPress: () => {
        moreModal.dismiss()
        router.push("/staff-invite-modal")
      },
    },
    {
      description: "Set up services and manage dry-cleaning orders.",
      icon: "ClipboardList",
      label: "Services",
      onPress: () => {
        moreModal.dismiss()
        openServiceOrders()
      },
    },
    {
      description: "Find saved customers and recent purchase activity.",
      icon: "Users",
      label: "Customers",
      onPress: () => {
        moreModal.dismiss()
        openCustomerBook()
      },
    },
    {
      description: "Manage business switching and workspace settings.",
      icon: "Settings",
      label: "Settings",
      onPress: () => {
        moreModal.dismiss()
        settingsModal.present()
      },
    },
    {
      description: "Choose system, light, or dark app themes.",
      icon: "SlidersHorizontal",
      label: "Theme",
      onPress: () => {
        moreModal.dismiss()
        themeModal.present()
      },
    },
  ]
  const settingsNavigationItems: MoreNavigationItem[] = [
    {
      description: "Switch businesses or add another workspace.",
      icon: "Building2",
      label: "Business",
      onPress: () => {
        settingsModal.dismiss()
        openBusinessSwitch()
      },
    },
    {
      description: "Review plan usage and subscription limits.",
      icon: "CreditCard",
      label: "Subscription",
      onPress: () => {
        settingsModal.dismiss()
        openSubscription()
      },
    },
    {
      description: "Open sales, stock, and closeout reports.",
      icon: "BarChart3",
      label: "Reports",
      onPress: () => {
        settingsModal.dismiss()
        openReports()
      },
    },
    {
      description: "Review offline queue, retries, and conflicts.",
      icon: "Wind",
      label: "Sync status",
      onPress: () => {
        settingsModal.dismiss()
        openSyncStatus()
      },
    },
    {
      description: "Set a PIN and fingerprint unlock for this phone.",
      icon: "Lock",
      label: "App lock",
      onPress: () => {
        settingsModal.dismiss()
        router.push("/app-lock-modal" as never)
      },
    },
    {
      description: "Check the installed build, channel, runtime, and updates.",
      icon: "Download",
      label: "App updates",
      onPress: () => {
        settingsModal.dismiss()
        router.push("/updates")
      },
    },
  ]
  const handleThemeSelection = (scheme: "light" | "dark" | "system") => {
    setColorScheme(scheme)
    themeModal.dismiss()
  }
  const shellNavItems: MobileAppShellNavItem[] = [
    {
      icon: "LayoutDashboard",
      isActive: true,
      label: "Home",
      onPress: () => undefined,
    },
    {
      icon: "ReceiptText",
      label: "Sales",
      onPress: () => handleQuickAction("New sale"),
    },
    {
      icon: "Warehouse",
      label: "Stocks",
      onPress: () =>
        firstProduct ? openStockIntake() : openFirstProductSetup(),
      ownerOnly: true,
    },
    {
      icon: isAttendantDashboard ? "Users" : "more",
      label: isAttendantDashboard ? "Customers" : "More",
      onPress: () =>
        isAttendantDashboard ? openCustomerBook() : moreModal.present(),
      ownerOnly: false,
    },
  ]

  useEffect(() => {
    if (!isAuthenticated) return

    if (!activeBusinessId && businesses[0]?.id) {
      setActiveBusiness(businesses[0].id)
      return
    }

    if (!activeBusinessId && profile?.businessName) {
      ensureBusiness({
        currency: profile.currencyCode,
        id: profile.businessId,
        name: profile.businessName,
      })
    }
  }, [
    activeBusinessId,
    businesses,
    ensureBusiness,
    isAuthenticated,
    profile?.businessId,
    profile?.businessName,
    profile?.currencyCode,
    setActiveBusiness,
  ])

  useEffect(() => {
    const currencyCode =
      tenantQuery.data?.activeStore?.currencyCode ??
      tenantQuery.data?.tenant.currencyCode
    if (!activeBusinessId || !currencyCode) return

    updateBusinessCurrency(activeBusinessId, currencyCode)
  }, [
    activeBusinessId,
    tenantQuery.data?.activeStore?.currencyCode,
    tenantQuery.data?.tenant.currencyCode,
    updateBusinessCurrency,
  ])

  useEffect(() => {
    if (
      !shouldPromptFirstProduct ||
      !activeBusinessId ||
      isAttendantDashboard
    ) {
      return
    }
    if (setupPromptedBusinessRef.current === activeBusinessId) return

    setupPromptedBusinessRef.current = activeBusinessId
    openFirstProductSetup()
  }, [
    activeBusinessId,
    isAttendantDashboard,
    openFirstProductSetup,
    shouldPromptFirstProduct,
  ])

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (isInvitedStaffProfile(profile)) {
    return <Redirect href="/staff-onboarding" />
  }

  if (surface === "admin" && profileIsSalesRep) {
    return <Redirect href="/sales-rep-home" />
  }

  if (surface === "sales-rep" && !profileIsSalesRep) {
    return <Redirect href="/admin-home" />
  }

  return (
    <MobileAppShell
      businessName={businessDisplayName}
      centralAction={shellCentralAction}
      hero={
        <RetailOpsHomeHero
          businessName={businessDisplayName}
          headerAction={<Logout tone="hero" />}
          onBusinessPress={openBusinessSwitch}
          onPrimaryPress={() =>
            isAttendantDashboard ? handleQuickAction("New sale") : openReports()
          }
          onSearchPress={openCustomerBook}
          primaryActionLabel={
            isAttendantDashboard
              ? currentRepSession
                ? "Record sale"
                : "Clock in"
              : "Review sales"
          }
          roleLabel={isAttendantDashboard ? "Sales rep home" : "Admin home"}
          searchPlaceholder={
            isAttendantDashboard
              ? "Search customers and recent sales"
              : "Search sales, stock, reps, customers"
          }
          summaryDetail={
            isAttendantDashboard
              ? currentRepSession
                ? `${openCloseoutSales.length} sale${
                    openCloseoutSales.length === 1 ? "" : "s"
                  } waiting for closeout.`
                : "Clock in to begin recording sales for this workspace."
              : `${dashboardTodaySalesCount} sale${
                  dashboardTodaySalesCount === 1 ? "" : "s"
                } today, ${lowStockCount} stock alert${
                  lowStockCount === 1 ? "" : "s"
                }, ${openRepSessions.length} active rep${
                  openRepSessions.length === 1 ? "" : "s"
                }.`
          }
          summaryLabel={
            isAttendantDashboard ? "Your shift snapshot" : "Today snapshot"
          }
          summaryValue={formatMoney(dashboardTodayTotal, "NGN")}
        />
      }
      keyboardBottomOffset={140}
      navItems={shellNavItems}
      onBusinessPress={openBusinessSwitch}
      role={isAttendantDashboard ? "attendant" : "owner"}
      scrolledStatusBarColor={colors.card}
      showHeader={false}
      statusBarColor={colors.primary}
      syncBanner={syncBanner}
      title="Dashboard"
    >
      {isAttendantDashboard ? (
        <SalesRepHomeOverview
          attendantName={attendantName}
          currentSession={currentRepSession}
          firstProduct={firstProduct ?? null}
          onClockIn={() => (firstProduct ? openRepClockIn() : undefined)}
          onCloseout={() => (firstProduct ? openCloseout() : undefined)}
          onCreateSale={() => handleQuickAction("New sale")}
          onCustomers={openCustomerBook}
          onServiceOrders={openServiceOrders}
          openSalesCount={openCloseoutSales.length}
          todaySalesCount={dashboardTodaySalesCount}
          todayTotal={dashboardTodayTotal}
        />
      ) : (
        <AdminHomeOverview
          firstProduct={firstProduct ?? null}
          lowStockAlerts={lowStockAlerts}
          onCloseout={() =>
            firstProduct ? openCloseout() : openFirstProductSetup()
          }
          onCustomers={openCustomerBook}
          onSales={() => handleQuickAction("New sale")}
          onSalesReps={() => router.push("/staff-invite-modal")}
          onServices={openServiceOrders}
          onStocks={() =>
            firstProduct ? openStockIntake() : openFirstProductSetup()
          }
          openRepSessionCount={openRepSessions.length}
          openSalesCount={openCloseoutSales.length}
          productCount={products.length}
          recentSale={visibleRecentSales[0] ?? null}
          stockUnitCount={stockUnitCount}
          todaySalesCount={dashboardTodaySalesCount}
          todayTotal={dashboardTodayTotal}
        />
      )}

      {showSecondaryAdminHomeSections ? (
        <RepSessionStatusCard
          currentSession={currentRepSession}
          hasInventory={!!firstProduct}
          onClockIn={() =>
            firstProduct
              ? openRepClockIn()
              : isAttendantDashboard
                ? undefined
                : openFirstProductSetup()
          }
          onCreateSale={openCreateSale}
          openSessions={openRepSessions}
        />
      ) : null}

      {showSecondaryAdminHomeSections ? (
        <PlanStatusCard
          onPress={openSubscription}
          plan={subscriptionPlan}
          subscription={subscription}
          usage={subscriptionUsage}
        />
      ) : null}

      {showSecondaryAdminHomeSections ? (
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </View>
      ) : null}

      {showSecondaryAdminHomeSections ? (
        <View className="gap-3">
          <Text className="text-lg font-bold text-foreground">
            Quick actions
          </Text>
          <View className="flex-row gap-3">
            {visibleQuickActions.map((action) => (
              <QuickAction
                key={action.label}
                {...action}
                onPress={() => handleQuickAction(action.label)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {showSecondaryAdminHomeSections ? (
        <>
          <ReportsSummaryCard
            onPress={openReports}
            pendingSyncCount={openSyncEventCount}
            stockUnitCount={stockUnitCount}
            todaySalesCount={dashboardTodaySalesCount}
            todayTotal={dashboardTodayTotal}
            varianceCount={closeoutVarianceCount}
          />

          <CloseoutSummaryCard
            latestCloseout={closeouts[0] ?? null}
            onPress={() =>
              firstProduct ? openCloseout() : openFirstProductSetup()
            }
            openSalesCount={openCloseoutSales.length}
            paymentTotals={closeoutPaymentTotals}
          />
        </>
      ) : null}

      {showSecondaryAdminHomeSections ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-foreground">Low stock</Text>
          </View>
          <View className="gap-3">
            {lowStockAlerts.length > 0 ? (
              <>
                {visibleLowStockAlerts.map((item) => (
                  <DashboardRecordRow
                    detail={`${item.remaining} remaining`}
                    icon={item.status === "Out" ? "TriangleAlert" : "Clock"}
                    key={item.id}
                    title={item.name}
                    trailing={
                      <StatusBadge
                        icon={item.status === "Out" ? "TriangleAlert" : "Clock"}
                        label={item.status}
                        tone="warning"
                      />
                    }
                  />
                ))}
                {lowStockAlerts.length > visibleLowStockAlerts.length ? (
                  <Text className="text-xs font-semibold text-muted-foreground">
                    Showing first {visibleLowStockAlerts.length} of{" "}
                    {lowStockAlerts.length} low-stock alerts.
                  </Text>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon="Warehouse"
                message={
                  products.length > 0
                    ? "Stock alerts will appear here when any unit drops near its reorder level."
                    : "Add your first item to start tracking stock alerts."
                }
                title="No low-stock items"
              />
            )}
          </View>
        </View>
      ) : null}

      {showSecondaryAdminHomeSections ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-lg font-bold text-foreground">
              Attendants
            </Text>
            <Pressable
              className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
              haptic
              onPress={() => router.push("/staff-invite-modal")}
              transition
            >
              <Text className="text-xs font-bold text-primary">Invite</Text>
            </Pressable>
          </View>
          {visibleStaffPreview.length > 0 ? (
            <View className="gap-3">
              {visibleStaffPreview.map((staffMember) => (
                <StaffCard key={staffMember.id} staff={staffMember} />
              ))}
              {staffPreviewRows.length > visibleStaffPreview.length ? (
                <Text className="text-xs font-semibold text-muted-foreground">
                  Showing first {visibleStaffPreview.length} of{" "}
                  {staffPreviewRows.length} attendants.
                </Text>
              ) : null}
            </View>
          ) : (
            <EmptyState
              actionLabel="Invite attendant"
              actionProps={{
                onPress: () => router.push("/staff-invite-modal"),
              }}
              icon="UserPlus"
              message="Invite your first attendant when you are ready to share sales work."
              title="No attendants yet"
            />
          )}
        </View>
      ) : null}

      {showSecondaryAdminHomeSections && shareLinks.length > 0 ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-lg font-bold text-foreground">
              Product links
            </Text>
            <Pressable
              className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
              haptic
              onPress={openProductShare}
              transition
            >
              <Text className="text-xs font-bold text-primary">New link</Text>
            </Pressable>
          </View>
          <View className="gap-3">
            {visibleShareLinks.map((link) => (
              <ProductLinkCard
                key={link.id}
                link={link}
                onDeactivate={() => deactivateShareLink(link.id)}
                onManage={openProductShare}
              />
            ))}
            {shareLinks.length > visibleShareLinks.length ? (
              <Text className="text-xs font-semibold text-muted-foreground">
                Showing first {visibleShareLinks.length} of {shareLinks.length}{" "}
                product links.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {showSecondaryAdminHomeSections ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-lg font-bold text-foreground">
              Stock movements
            </Text>
            {canManageInventory ? (
              <Pressable
                className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
                haptic
                onPress={() =>
                  firstProduct ? openStockIntake() : openFirstProductSetup()
                }
                transition
              >
                <Text className="text-xs font-bold text-primary">Record</Text>
              </Pressable>
            ) : null}
          </View>
          {stockMovements.length > 0 ? (
            <View className="gap-3">
              {visibleStockMovements.map((movement) => (
                <StockMovementCard key={movement.id} movement={movement} />
              ))}
              {stockMovements.length > visibleStockMovements.length ? (
                <Text className="text-xs font-semibold text-muted-foreground">
                  Showing first {visibleStockMovements.length} of{" "}
                  {stockMovements.length} stock movements.
                </Text>
              ) : null}
            </View>
          ) : (
            <EmptyState
              icon="ListChecks"
              message="Opening stock, restocks, adjustments, conversions, and sales will appear here."
              title="No stock movement yet"
            />
          )}
        </View>
      ) : null}

      {isAttendantDashboard ? (
        <>
          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-lg font-bold text-foreground">
                Customer book
              </Text>
              <Pressable
                className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
                haptic
                onPress={openCustomerBook}
                transition
              >
                <Text className="text-xs font-bold text-primary">View all</Text>
              </Pressable>
            </View>
            {visibleCustomerPreview.length > 0 ? (
              <View className="gap-3">
                {visibleCustomerPreview.map((customer) => (
                  <CustomerCard customer={customer} key={customer.id} />
                ))}
                {customerPreviewRows.length > visibleCustomerPreview.length ? (
                  <Text className="text-xs font-semibold text-muted-foreground">
                    Showing first {visibleCustomerPreview.length} of{" "}
                    {customerPreviewRows.length} customers.
                  </Text>
                ) : null}
              </View>
            ) : (
              <EmptyState
                icon="Users"
                message="Customer names from completed sales will appear here."
                title="No saved customers yet"
              />
            )}
          </View>

          <View className="gap-3">
            <Text className="text-lg font-bold text-foreground">
              Recent sales
            </Text>
            <View className="gap-3">
              {visibleRecentSales.length > 0 ? (
                <>
                  {visibleRecentSales.map((sale) => (
                    <RecentSaleCard key={sale.id} sale={sale} />
                  ))}
                  {recentSalePreviewRows.length > visibleRecentSales.length ? (
                    <Text className="text-xs font-semibold text-muted-foreground">
                      Showing first {visibleRecentSales.length} of{" "}
                      {recentSalePreviewRows.length} recent sales.
                    </Text>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  icon="ReceiptText"
                  message="Completed sales will appear here as soon as they are recorded."
                  title="No sales yet"
                />
              )}
            </View>
          </View>
        </>
      ) : null}

      <DashboardActionPickerSheet
        items={actionPickerItems}
        modal={actionModal}
      />
      <DashboardMoreSheet items={moreNavigationItems} modal={moreModal} />
      <DashboardSettingsSheet
        items={settingsNavigationItems}
        modal={settingsModal}
      />
      <DashboardThemeSheet
        colorScheme={colorScheme}
        modal={themeModal}
        onSelect={handleThemeSelection}
      />
    </MobileAppShell>
  )
}

export default function DashboardRoute() {
  const { isAuthenticated, profile } = useAuthContext()

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (isInvitedStaffProfile(profile)) {
    return <Redirect href="/staff-onboarding" />
  }

  return (
    <Redirect
      href={isSalesRepRole(profile?.role) ? "/sales-rep-home" : "/admin-home"}
    />
  )
}
