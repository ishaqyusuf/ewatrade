import { Logout } from "@/components/logout"
import {
  BusinessSwitchSheet,
  CloseoutSheet,
  CreateSaleSheet,
  CustomerBookSheet,
  EmptyState,
  FirstProductSetupSheet,
  MobileAppShell,
  type MobileAppShellNavItem,
  ProductShareSheet,
  RepClockInSheet,
  ReportsSheet,
  StaffInviteSheet,
  StatusBadge,
  StockIntakeSheet,
  SubscriptionPlanSheet,
  SyncStatusSheet,
  UnitConversionSheet,
} from "@/components/mobile"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { quickActions } from "@/data/retail-ops-dashboard-data"
import { useAuthContext } from "@/hooks/use-auth"
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
import { formatMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { Redirect } from "expo-router"
import { useEffect, useMemo, useRef } from "react"
import { View } from "react-native"

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

function MetricCard({ detail, label, tone, value }: DashboardMetric) {
  const displayValue =
    label === "Today sales" ? formatMoney(value, "NGN") : String(value)

  return (
    <View className="w-[48%] gap-3 rounded-2xl border border-border bg-card p-4">
      <View
        className={cn(
          "h-9 w-9 items-center justify-center rounded-xl",
          tone === "primary" && "bg-primary/10",
          tone === "success" && "bg-emerald-500/10",
          tone === "warning" && "bg-amber-500/10",
          tone === "neutral" && "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "size-base",
            tone === "primary" && "text-primary",
            tone === "success" && "text-emerald-600",
            tone === "warning" && "text-amber-600",
            tone === "neutral" && "text-muted-foreground",
          )}
          name={tone === "warning" ? "TriangleAlert" : "TrendingUp"}
        />
      </View>
      <View className="gap-1">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          {label}
        </Text>
        <Text className="text-xl font-bold text-foreground">
          {displayValue}
        </Text>
        <Text className="text-xs text-muted-foreground">{detail}</Text>
      </View>
    </View>
  )
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

function QuickAction({ description, icon, label, onPress }: QuickActionProps) {
  return (
    <Pressable
      className="flex-1 gap-2 rounded-2xl border border-border bg-card p-3 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="size-base text-primary" name={icon as IconKeys} />
      </View>
      <View className="gap-1">
        <Text className="text-sm font-bold text-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </View>
    </Pressable>
  )
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
        totals.cash += sale.total
      } else {
        totals.transfer += sale.total
      }

      totals.gross += sale.total

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
    total: sale.total,
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

function isAttendantRole(role: string | undefined) {
  const normalizedRole = role?.trim().toUpperCase()

  return normalizedRole === "CASHIER" || normalizedRole === "OPERATOR"
}

function isInvitedStaffProfile(
  profile: {
    role?: string
    status?: string
  } | null,
) {
  const role = profile?.role?.trim().toUpperCase()
  const status = profile?.status?.trim().toUpperCase()

  return (
    status === "INVITED" &&
    (role === "CASHIER" || role === "MANAGER" || role === "OPERATOR")
  )
}

function RecentSaleCard({ sale }: { sale: RecentSaleItem }) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{sale.item}</Text>
          <Text className="text-sm text-muted-foreground">
            {sale.customer} by {sale.attendant}
          </Text>
        </View>
        <Text className="font-bold text-foreground">
          {formatMoney(sale.total, "NGN")}
        </Text>
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-xs font-semibold uppercase text-muted-foreground">
          {sale.id}
        </Text>
        <View className="flex-row items-center gap-2">
          {sale.syncStatus === "pending" ? (
            <StatusBadge icon="Clock" label="Pending sync" tone="warning" />
          ) : null}
          <StatusBadge label={sale.method} tone="primary" />
        </View>
      </View>
    </View>
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
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{staff.name}</Text>
          <Text className="text-sm text-muted-foreground">{staff.email}</Text>
        </View>
        <StaffStatusBadge staff={staff} />
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          Attendant
        </Text>
        {staff.syncStatus === "pending" ? (
          <StatusBadge icon="Clock" label="Pending sync" tone="primary" />
        ) : null}
      </View>
    </View>
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
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">
            {link.productName}
          </Text>
          <Text
            className="text-xs leading-5 text-muted-foreground"
            numberOfLines={2}
          >
            {link.url}
          </Text>
        </View>
        <StatusBadge
          icon={isActive ? "CheckCircle2" : "XCircle"}
          label={isActive ? "Active" : "Inactive"}
          tone={isActive ? "success" : "muted"}
        />
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row gap-3">
          <Text className="text-xs font-bold text-muted-foreground">
            {link.views} views
          </Text>
          <Text className="text-xs font-bold text-muted-foreground">
            {link.orders} orders
          </Text>
        </View>
        <View className="flex-row gap-2">
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
              <Text className="text-xs font-bold text-destructive">
                Deactivate
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
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
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{customer.name}</Text>
          <Text className="text-sm text-muted-foreground">
            Last sale {formatCustomerLastSeen(customer.lastSeenAt)}
          </Text>
        </View>
        <StatusBadge
          label={`${saleCount} sale${saleCount === 1 ? "" : "s"}`}
          tone="primary"
        />
      </View>
      {(customer.syncStatus ?? "pending") === "pending" ? (
        <StatusBadge icon="Clock" label="Pending sync" tone="warning" />
      ) : null}
    </View>
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
    <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-1 gap-1">
        <Text className="font-semibold text-foreground">
          {movement.productName}
        </Text>
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          {stockMovementLabel(movement.type)}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text
          className={cn(
            "font-bold",
            isIncrease ? "text-emerald-700" : "text-destructive",
          )}
        >
          {isIncrease ? "+" : ""}
          {movement.quantity} {movement.unitName}
        </Text>
        {movement.syncStatus === "pending" ? (
          <StatusBadge icon="Clock" label="Pending sync" tone="warning" />
        ) : null}
      </View>
    </View>
  )
}

function closeoutStatusLabel(status: RetailOpsCloseout["approvalStatus"]) {
  if (status === "approved") return "Approved"
  if (status === "flagged") return "Flagged"
  return "Pending review"
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
    <View className="gap-4 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-bold text-foreground">Day closeout</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Confirm payments and closing stock for admin review.
          </Text>
        </View>
        <Pressable
          className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
          haptic
          onPress={onPress}
          transition
        >
          <Text className="text-xs font-bold text-primary">Close day</Text>
        </Pressable>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Open sales
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {openSalesCount}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Expected
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {formatMoney(paymentTotals.gross, "NGN")}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Cash
          </Text>
          <Text className="mt-1 text-sm font-bold text-foreground">
            {formatMoney(paymentTotals.cash, "NGN")}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Transfer
          </Text>
          <Text className="mt-1 text-sm font-bold text-foreground">
            {formatMoney(paymentTotals.transfer, "NGN")}
          </Text>
        </View>
      </View>

      {latestCloseout ? (
        <View className="flex-row items-center justify-between gap-3 rounded-xl bg-amber-500/10 px-3 py-2">
          <Text className="text-sm font-semibold text-foreground">
            Last closeout
          </Text>
          <Text className="text-xs font-bold text-amber-700">
            {closeoutStatusLabel(latestCloseout.approvalStatus)}
            {latestCloseout.syncStatus === "pending" ? " - Pending sync" : ""}
          </Text>
        </View>
      ) : null}
    </View>
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

  return (
    <View className="gap-4 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-bold text-foreground">Rep sessions</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {description}
          </Text>
        </View>
        <View
          className={cn(
            "rounded-full px-3 py-1",
            currentSession ? "bg-emerald-500/10" : "bg-amber-500/10",
          )}
        >
          <Text
            className={cn(
              "text-xs font-bold",
              currentSession ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {title}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Clocked in
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {openSessions.length}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Variances
          </Text>
          <Text
            className={cn(
              "mt-1 text-lg font-bold",
              totalVarianceCount > 0 ? "text-destructive" : "text-emerald-700",
            )}
          >
            {totalVarianceCount}
          </Text>
        </View>
      </View>

      {openSessions.length > 0 ? (
        <View className="gap-2">
          {visibleOpenSessions.map((session) => {
            const varianceCount = getSessionVarianceCount(session)

            return (
              <View
                className="flex-row items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2"
                key={session.id}
              >
                <View className="flex-1 gap-1">
                  <Text className="text-sm font-semibold text-foreground">
                    {session.attendantName}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Since {formatSessionTime(session.clockedInAt)}
                  </Text>
                </View>
                <Text
                  className={cn(
                    "text-xs font-bold",
                    varianceCount > 0 ? "text-destructive" : "text-emerald-700",
                  )}
                >
                  {varianceCount > 0
                    ? `${varianceCount} variance${
                        varianceCount === 1 ? "" : "s"
                      }`
                    : "Balanced"}
                </Text>
              </View>
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
    </View>
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
    <View className="flex-1 rounded-xl bg-muted p-3">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </Text>
      <Text
        className={cn(
          "mt-1 text-lg font-bold",
          limitState.isAtLimit ? "text-destructive" : "text-foreground",
        )}
      >
        {limitState.label}
      </Text>
    </View>
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
    <View className="gap-4 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-bold text-foreground">Subscription</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {plan.name} plan controls products, staff, businesses, reports, and
            offline device limits.
          </Text>
        </View>
        <Pressable
          className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
          haptic
          onPress={onPress}
          transition
        >
          <Text className="text-xs font-bold text-primary">Plans</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center justify-between gap-3 rounded-xl bg-primary/10 px-3 py-2">
        <View className="flex-row items-center gap-2">
          <Icon className="size-sm text-primary" name="CreditCard" />
          <Text className="text-sm font-semibold text-foreground">
            {plan.name}
          </Text>
        </View>
        <Text className="text-xs font-bold text-primary">
          {subscriptionStatusLabel(subscription.status)}
        </Text>
      </View>

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
    </View>
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
    <View className="gap-4 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-bold text-foreground">Reports</Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Daily sales, stock, cash, variance, and movement snapshots.
          </Text>
        </View>
        <Pressable
          className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
          haptic
          onPress={onPress}
          transition
        >
          <Text className="text-xs font-bold text-primary">Open</Text>
        </Pressable>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Today
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {formatMoney(todayTotal, "NGN")}
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            {todaySalesCount} sale{todaySalesCount === 1 ? "" : "s"}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Stock units
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {stockUnitCount}
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Product and variants
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Variance
          </Text>
          <Text
            className={cn(
              "mt-1 text-lg font-bold",
              varianceCount > 0 ? "text-destructive" : "text-emerald-700",
            )}
          >
            {varianceCount}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Pending sync
          </Text>
          <Text
            className={cn(
              "mt-1 text-lg font-bold",
              pendingSyncCount > 0 ? "text-amber-700" : "text-emerald-700",
            )}
          >
            {pendingSyncCount}
          </Text>
        </View>
      </View>
    </View>
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
      <View className="gap-4 rounded-2xl border border-border bg-card p-4">
        <View className="flex-row gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-muted">
            <Icon
              className="size-base text-muted-foreground"
              name="Warehouse"
            />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-base font-bold text-foreground">
              Inventory not assigned yet
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Products and stock will appear here after an owner or manager sets
              up inventory for this business.
            </Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className="gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <View className="flex-row gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="size-base text-primary" name="Warehouse" />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-base font-bold text-foreground">
            Add your first item
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Create a product, set units like bag or kilogram, then enter
            starting stock.
          </Text>
        </View>
      </View>
      <Pressable
        className="h-11 items-center justify-center rounded-xl bg-primary active:bg-primary/90"
        haptic
        onPress={onAddItem}
        transition
      >
        <Text className="font-semibold text-primary-foreground">Add item</Text>
      </Pressable>
    </View>
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
    <View className="gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
      <View className="flex-row gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10">
          <Icon className="size-base text-emerald-600" name="CircleCheck" />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-base font-bold text-foreground">
            Inventory started
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {product.name} has {currentStock} {product.unitName}
            {currentStock === 1 ? "" : "s"} ready to sell.
          </Text>
        </View>
      </View>

      <View className="gap-3 rounded-2xl border border-border bg-card p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="font-semibold text-foreground">
              {product.name}
            </Text>
            <Text className="text-sm text-muted-foreground">
              Primary unit: {product.unitName}
            </Text>
          </View>
          <Text className="font-bold text-foreground">
            {formatMoney(product.price, "NGN")}
          </Text>
        </View>
        {visibleVariants.length > 0 ? (
          <View className="gap-2">
            {visibleVariants.map((variant) => (
              <View
                className="flex-row items-center justify-between rounded-xl bg-muted px-3 py-2"
                key={variant.id}
              >
                <View className="flex-1 gap-1">
                  <Text className="text-sm font-medium text-foreground">
                    {variant.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {variant.currentStock ?? variant.startingStock ?? 0} in
                    stock
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-foreground">
                  {formatMoney(variant.price, "NGN")}
                </Text>
              </View>
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
        <View className="self-start rounded-full bg-amber-500/10 px-3 py-1">
          <Text className="text-xs font-bold text-amber-700">Pending sync</Text>
        </View>
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
    </View>
  )
}

export default function DashboardRoute() {
  const trpc = useTRPC()
  const { isAuthenticated, profile } = useAuthContext()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const businesses = useBusinessStore((state) => state.businesses)
  const ensureBusiness = useBusinessStore((state) => state.ensureBusiness)
  const setActiveBusiness = useBusinessStore((state) => state.setActiveBusiness)
  const activeBusiness = businesses.find(
    (business) => business.id === activeBusinessId,
  )
  const businessModal = useModal()
  const closeoutModal = useModal()
  const conversionModal = useModal()
  const customerModal = useModal()
  const reportsModal = useModal()
  const sessionModal = useModal()
  const saleModal = useModal()
  const shareModal = useModal()
  const setupModal = useModal()
  const staffModal = useModal()
  const stockModal = useModal()
  const subscriptionModal = useModal()
  const syncModal = useModal()
  const setupPromptedBusinessRef = useRef<string | null>(null)
  const attendantName = profile?.name ?? "Store Owner"
  const isAttendantDashboard = isAttendantRole(profile?.role)
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
    ? "border-amber-500/30 bg-amber-500/10"
    : conflictSyncEvents.length > 0
      ? "border-amber-500/30 bg-amber-500/10"
      : failedSyncEvents.length > 0
        ? "border-destructive/30 bg-destructive/10"
        : pendingSyncEvents.length > 0
          ? "border-primary/30 bg-primary/10"
          : "border-emerald-500/30 bg-emerald-500/10"
  const syncBannerIconClassName = isOfflineMode
    ? "text-amber-600"
    : conflictSyncEvents.length > 0
      ? "text-amber-600"
      : failedSyncEvents.length > 0
        ? "text-destructive"
        : pendingSyncEvents.length > 0
          ? "text-primary"
          : "text-emerald-600"
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
        latestCloseout.cashVariance,
        latestCloseout.transferVariance,
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

  const handleQuickAction = (label: QuickActionProps["label"]) => {
    if (label === "Add item") {
      if (isAttendantDashboard) return
      setupModal.present()
      return
    }

    if (label === "New sale") {
      if (!firstProduct) {
        if (!isAttendantDashboard) {
          setupModal.present()
        }
        return
      }

      if (currentRepSession) {
        saleModal.present()
      } else {
        sessionModal.present()
      }
      return
    }

    if (label === "Add staff") {
      if (isAttendantDashboard) return
      staffModal.present()
    }
  }
  const syncBanner = (
    <Pressable
      className={cn(
        "flex-row items-start gap-2 rounded-2xl border p-3 active:opacity-90",
        syncBannerClassName,
      )}
      haptic
      onPress={() => syncModal.present()}
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
    onPress: () => handleQuickAction("New sale"),
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
      label: "Stock",
      onPress: () =>
        firstProduct ? stockModal.present() : setupModal.present(),
      ownerOnly: true,
    },
    {
      icon: "Users",
      label: isAttendantDashboard ? "Customers" : "Staff",
      onPress: () =>
        isAttendantDashboard ? customerModal.present() : staffModal.present(),
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
    setActiveBusiness,
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
    setupModal.present()
  }, [
    activeBusinessId,
    isAttendantDashboard,
    setupModal,
    shouldPromptFirstProduct,
  ])

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (isInvitedStaffProfile(profile)) {
    return <Redirect href="/staff-onboarding" />
  }

  return (
    <MobileAppShell
      businessName={businessDisplayName}
      centralAction={shellCentralAction}
      headerAction={<Logout />}
      keyboardBottomOffset={140}
      navItems={shellNavItems}
      onBusinessPress={() => businessModal.present()}
      role={isAttendantDashboard ? "attendant" : "owner"}
      syncBanner={syncBanner}
      title="Dashboard"
    >
      {firstProduct ? (
        <InventorySetupSummary
          canManageInventory={canManageInventory}
          onRestock={() => stockModal.present()}
          onConvert={() => conversionModal.present()}
          onShare={() => shareModal.present()}
          product={firstProduct}
        />
      ) : (
        <SetupPrompt
          isAttendant={isAttendantDashboard}
          onAddItem={() => setupModal.present()}
        />
      )}

      <RepSessionStatusCard
        currentSession={currentRepSession}
        hasInventory={!!firstProduct}
        onClockIn={() =>
          firstProduct
            ? sessionModal.present()
            : isAttendantDashboard
              ? undefined
              : setupModal.present()
        }
        onCreateSale={() => saleModal.present()}
        openSessions={openRepSessions}
      />

      {isAttendantDashboard ? null : (
        <PlanStatusCard
          onPress={() => subscriptionModal.present()}
          plan={subscriptionPlan}
          subscription={subscription}
          usage={subscriptionUsage}
        />
      )}

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </View>

      <View className="gap-3">
        <Text className="text-lg font-bold text-foreground">Quick actions</Text>
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

      {isAttendantDashboard ? null : (
        <>
          <ReportsSummaryCard
            onPress={() => reportsModal.present()}
            pendingSyncCount={openSyncEventCount}
            stockUnitCount={stockUnitCount}
            todaySalesCount={dashboardTodaySalesCount}
            todayTotal={dashboardTodayTotal}
            varianceCount={closeoutVarianceCount}
          />

          <CloseoutSummaryCard
            latestCloseout={closeouts[0] ?? null}
            onPress={() =>
              firstProduct ? closeoutModal.present() : setupModal.present()
            }
            openSalesCount={openCloseoutSales.length}
            paymentTotals={closeoutPaymentTotals}
          />
        </>
      )}

      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">Low stock</Text>
        </View>
        <View className="gap-3">
          {lowStockAlerts.length > 0 ? (
            <>
              {visibleLowStockAlerts.map((item) => (
                <View
                  className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                  key={item.id}
                >
                  <View className="flex-1 gap-1">
                    <Text className="font-semibold text-foreground">
                      {item.name}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {item.remaining} remaining
                    </Text>
                  </View>
                  <StatusBadge
                    icon={item.status === "Out" ? "TriangleAlert" : "Clock"}
                    label={item.status}
                    tone="warning"
                  />
                </View>
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

      {isAttendantDashboard ? null : (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-lg font-bold text-foreground">
              Attendants
            </Text>
            <Pressable
              className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
              haptic
              onPress={() => staffModal.present()}
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
              actionProps={{ onPress: () => staffModal.present() }}
              icon="UserPlus"
              message="Invite your first attendant when you are ready to share sales work."
              title="No attendants yet"
            />
          )}
        </View>
      )}

      {shareLinks.length > 0 ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-lg font-bold text-foreground">
              Product links
            </Text>
            <Pressable
              className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
              haptic
              onPress={() => shareModal.present()}
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
                onManage={() => shareModal.present()}
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
                firstProduct ? stockModal.present() : setupModal.present()
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

      <View className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-lg font-bold text-foreground">
            Customer book
          </Text>
          <Pressable
            className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
            haptic
            onPress={() => customerModal.present()}
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
        <Text className="text-lg font-bold text-foreground">Recent sales</Text>
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

      <FirstProductSetupSheet
        onComplete={setupModal.dismiss}
        ref={setupModal.ref}
      />
      <BusinessSwitchSheet
        onComplete={businessModal.dismiss}
        ref={businessModal.ref}
      />
      <CloseoutSheet
        attendantName={attendantName}
        onComplete={closeoutModal.dismiss}
        ref={closeoutModal.ref}
      />
      <CreateSaleSheet
        attendantName={attendantName}
        onComplete={saleModal.dismiss}
        ref={saleModal.ref}
      />
      <CustomerBookSheet
        onComplete={customerModal.dismiss}
        ref={customerModal.ref}
      />
      <ProductShareSheet onComplete={shareModal.dismiss} ref={shareModal.ref} />
      <RepClockInSheet
        attendantName={attendantName}
        onComplete={sessionModal.dismiss}
        ref={sessionModal.ref}
      />
      <ReportsSheet onComplete={reportsModal.dismiss} ref={reportsModal.ref} />
      <StaffInviteSheet onComplete={staffModal.dismiss} ref={staffModal.ref} />
      <StockIntakeSheet onComplete={stockModal.dismiss} ref={stockModal.ref} />
      <SubscriptionPlanSheet
        onComplete={subscriptionModal.dismiss}
        ref={subscriptionModal.ref}
        usage={subscriptionUsage}
      />
      <UnitConversionSheet
        onComplete={conversionModal.dismiss}
        ref={conversionModal.ref}
      />
      <SyncStatusSheet onComplete={syncModal.dismiss} ref={syncModal.ref} />
    </MobileAppShell>
  )
}
