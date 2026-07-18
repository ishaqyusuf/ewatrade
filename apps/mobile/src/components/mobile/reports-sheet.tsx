import { ActionButton } from "@/components/mobile/action-button"
import {
  ReportMetricTile,
  type ReportRowItem,
  ReportSection,
  type ReportTone,
} from "@/components/mobile/report-flow"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { buildRetailOpsReportCsv } from "@/lib/reports-export"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsCloseout,
  type RetailOpsProduct,
  type RetailOpsSale,
  type RetailOpsStockMovement,
  type RetailOpsSyncSummary,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useQuery } from "@tanstack/react-query"
import { forwardRef, useMemo, useState } from "react"
import { Share, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type ReportsSheetProps = {
  onComplete?: () => void
}

type ReportsContentProps = ReportsSheetProps & {
  presentation?: "screen" | "sheet"
}

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

type ReportMetric = {
  label: string
  tone?: ReportTone
  value: string
}

type SyncDeviceConflictFilter = "all" | "current"

type ProductionInventoryRow = {
  onHandQuantity: number
  priceMinor: number
  productId: string
  productName: string
  unitId: string
  unitName: string
}

type ProductionSalesByProductRow = {
  grossMinor: number
  productId: string
  productName: string
  quantity: number
  unitName: string
}

type ProductionSalesByRepRow = {
  cashMinor: number
  creditMinor: number
  displayName: string
  grossMinor: number
  orderCount: number
  quantity: number
  transferMinor: number
}

type ProductionCreditSaleRow = {
  actor: {
    displayName: string
  }
  aging: {
    bucket: string
    overdueDays: number | null
  }
  balanceMinor: number
  currencyCode: string
  customer: {
    name: string | null
  }
  dueAt: Date | string | null
  id: string
  orderNumber: string
}

type ProductionPaymentReconciliationRow = {
  closedAt: Date | string | null
  expectedCashMinor: number
  id: string
  review: {
    status: string
  } | null
  user: {
    displayName: string
  }
  variance: {
    cardMinor: number | null
    cashMinor: number | null
    creditMinor: number | null
    transferMinor: number | null
  }
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

function formatQuantity(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)))
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

function formatReportDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return "Unknown time"

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  })
}

function getPaymentTotals(sales: RetailOpsSale[]) {
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

function getProductStockRows(products: RetailOpsProduct[]): ReportRowItem[] {
  return products.flatMap((product) => {
    const primaryStock = product.currentStock ?? product.startingStock ?? 0
    const primaryRow = {
      detail: `${formatMinorMoney(product.priceMinor, getActiveCurrencyCode())} per ${product.unitName}`,
      id: `${product.id}-primary`,
      label: `${product.name} - ${product.unitName}`,
      tone:
        primaryStock <= 0
          ? "danger"
          : primaryStock <= 5
            ? "warning"
            : "default",
      value: formatQuantity(primaryStock),
    } satisfies ReportRowItem
    const variantRows = product.variants.map((variant) => {
      const variantStock = variant.currentStock ?? variant.startingStock ?? 0

      return {
        detail: `${formatMinorMoney(variant.priceMinor, getActiveCurrencyCode())} per ${variant.name}`,
        id: `${product.id}-${variant.id}`,
        label: `${product.name} - ${variant.name}`,
        tone:
          variantStock <= 0
            ? "danger"
            : variantStock <= 5
              ? "warning"
              : "default",
        value: formatQuantity(variantStock),
      } satisfies ReportRowItem
    })

    return [primaryRow, ...variantRows]
  })
}

function getProductionStockRows(
  inventory: ProductionInventoryRow[],
): ReportRowItem[] {
  return inventory.map((unit) => ({
    detail: `${formatMoney(unit.priceMinor, "NGN")} per ${unit.unitName}`,
    id: `${unit.productId}-${unit.unitId}`,
    label: `${unit.productName} - ${unit.unitName}`,
    tone:
      unit.onHandQuantity <= 0
        ? "danger"
        : unit.onHandQuantity <= 5
          ? "warning"
          : "default",
    value: formatQuantity(unit.onHandQuantity),
  }))
}

function getSalesByRepRows(sales: RetailOpsSale[]): ReportRowItem[] {
  const grouped = new Map<
    string,
    {
      count: number
      total: number
    }
  >()

  for (const sale of sales) {
    const current = grouped.get(sale.attendantName) ?? {
      count: 0,
      total: 0,
    }

    grouped.set(sale.attendantName, {
      count: current.count + 1,
      total: current.total + sale.totalMinor,
    })
  }

  return Array.from(grouped.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([attendantName, summary]) => ({
      detail: `${summary.count} sale${summary.count === 1 ? "" : "s"}`,
      id: attendantName,
      label: attendantName,
      value: formatMoney(summary.total, "NGN"),
    }))
}

function getProductionSalesByRepRows(
  salesByRep: ProductionSalesByRepRow[],
): ReportRowItem[] {
  return salesByRep.map((rep) => ({
    detail: `${rep.orderCount} sale${
      rep.orderCount === 1 ? "" : "s"
    } · ${formatQuantity(rep.quantity)} units · cash ${formatMoney(
      rep.cashMinor,
      "NGN",
    )} · transfer ${formatMoney(rep.transferMinor, "NGN")} · credit ${formatMoney(
      rep.creditMinor,
      "NGN",
    )}`,
    id: rep.displayName,
    label: rep.displayName,
    value: formatMoney(rep.grossMinor, "NGN"),
  }))
}

function getSalesByProductRows(sales: RetailOpsSale[]): ReportRowItem[] {
  const grouped = new Map<
    string,
    {
      quantity: number
      total: number
      unitName: string
    }
  >()

  for (const sale of sales) {
    const key = `${sale.productName}-${sale.unitName}`
    const current = grouped.get(key) ?? {
      quantity: 0,
      total: 0,
      unitName: sale.unitName,
    }

    grouped.set(key, {
      quantity: current.quantity + sale.quantity,
      total: current.total + sale.totalMinor,
      unitName: sale.unitName,
    })
  }

  return Array.from(grouped.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([label, summary]) => ({
      detail: `${formatQuantity(summary.quantity)} ${summary.unitName}`,
      id: label,
      label,
      value: formatMoney(summary.total, "NGN"),
    }))
}

function getProductionSalesByProductRows(
  salesByProduct: ProductionSalesByProductRow[],
): ReportRowItem[] {
  return salesByProduct.map((row) => ({
    detail: `${formatQuantity(row.quantity)} ${row.unitName}`,
    id: `${row.productId}-${row.unitName}`,
    label: `${row.productName} - ${row.unitName}`,
    value: formatMoney(row.grossMinor, "NGN"),
  }))
}

function stockMovementLabel(type: RetailOpsStockMovement["type"]) {
  if (type === "conversion_in") return "Conversion in"
  if (type === "conversion_out") return "Conversion out"
  if (type === "opening_stock") return "Opening stock"
  if (type === "stock_adjustment") return "Stock adjustment"
  if (type === "stock_intake") return "Stock intake"
  return "Sale"
}

function getMovementRows(
  stockMovements: RetailOpsStockMovement[],
): ReportRowItem[] {
  return stockMovements
    .filter((movement) =>
      [
        "conversion_in",
        "conversion_out",
        "opening_stock",
        "stock_adjustment",
        "stock_intake",
      ].includes(movement.type),
    )
    .slice(0, 8)
    .map((movement) => ({
      detail: stockMovementLabel(movement.type),
      id: movement.id,
      label: `${movement.productName} - ${movement.unitName}`,
      tone: movement.quantity < 0 ? "danger" : "default",
      value: `${movement.quantity > 0 ? "+" : ""}${formatQuantity(
        movement.quantity,
      )}`,
    }))
}

function getVarianceRows(closeouts: RetailOpsCloseout[]): ReportRowItem[] {
  const latestCloseout = closeouts[0]

  if (!latestCloseout) return []

  const paymentRows = [
    {
      detail: "Expected versus declared cash",
      id: `${latestCloseout.id}-cash`,
      label: "Cash variance",
      tone:
        latestCloseout.cashVarianceMinor === 0
          ? "success"
          : latestCloseout.cashVarianceMinor < 0
            ? "danger"
            : "warning",
      value: formatMoney(latestCloseout.cashVarianceMinor, "NGN"),
    },
    {
      detail: "Expected versus declared transfer",
      id: `${latestCloseout.id}-transfer`,
      label: "Transfer variance",
      tone:
        latestCloseout.transferVarianceMinor === 0
          ? "success"
          : latestCloseout.transferVarianceMinor < 0
            ? "danger"
            : "warning",
      value: formatMoney(latestCloseout.transferVarianceMinor, "NGN"),
    },
  ] satisfies ReportRowItem[]
  const stockRows = latestCloseout.inventoryLines
    .filter((line) => line.variance !== 0)
    .map((line) => ({
      detail: `${line.unitName} closing stock`,
      id: `${latestCloseout.id}-${line.productId}-${line.variantId ?? "primary"}`,
      label: line.productName,
      tone: line.variance < 0 ? "danger" : "warning",
      value: `${line.variance > 0 ? "+" : ""}${formatQuantity(line.variance)}`,
    })) satisfies ReportRowItem[]

  return [...paymentRows, ...stockRows]
}

function formatVarianceValue(value: number | null) {
  if (value === null) return "Not declared"

  return formatMoney(value, "NGN")
}

function getVarianceTone(value: number | null): ReportRowItem["tone"] {
  if (value === null) return "default"
  if (value === 0) return "success"

  return value < 0 ? "danger" : "warning"
}

function getProductionVarianceRows(
  reconciliationRows: ProductionPaymentReconciliationRow[],
): ReportRowItem[] {
  return reconciliationRows.flatMap((row) => {
    const detail = `${row.user.displayName} · ${
      row.closedAt ? formatReportDateTime(row.closedAt) : "Open session"
    }`

    return [
      {
        detail,
        id: `${row.id}-cash`,
        label: "Cash variance",
        tone: getVarianceTone(row.variance.cashMinor),
        value: formatVarianceValue(row.variance.cashMinor),
      },
      {
        detail,
        id: `${row.id}-transfer`,
        label: "Transfer variance",
        tone: getVarianceTone(row.variance.transferMinor),
        value: formatVarianceValue(row.variance.transferMinor),
      },
      {
        detail,
        id: `${row.id}-card`,
        label: "Card variance",
        tone: getVarianceTone(row.variance.cardMinor),
        value: formatVarianceValue(row.variance.cardMinor),
      },
      {
        detail,
        id: `${row.id}-credit`,
        label: "Credit variance",
        tone: getVarianceTone(row.variance.creditMinor),
        value: formatVarianceValue(row.variance.creditMinor),
      },
    ] satisfies ReportRowItem[]
  })
}

function getProductionCreditSaleRows(
  creditSales: ProductionCreditSaleRow[],
): ReportRowItem[] {
  return creditSales.map((sale) => ({
    detail: `${sale.customer.name ?? "Customer"} · ${
      sale.actor.displayName
    } · ${
      sale.dueAt ? `Due ${formatReportDateTime(sale.dueAt)}` : "No due date"
    } · ${
      sale.aging.overdueDays === null
        ? "Not overdue"
        : `${sale.aging.overdueDays} overdue day${
            sale.aging.overdueDays === 1 ? "" : "s"
          }`
    }`,
    id: sale.id,
    label: sale.orderNumber,
    tone: sale.aging.bucket === "overdue" ? "danger" : "warning",
    value: formatMoney(sale.balanceMinor, sale.currencyCode),
  }))
}

function getLastSyncTone(
  status: RetailOpsSyncSummary["status"],
): ReportMetric["tone"] {
  if (status === "failed") return "danger"
  if (status === "partial") return "warning"

  return "success"
}

function getSyncOperationRows({
  conflictSyncCount,
  failedSyncCount,
  isOfflineMode,
  lastSyncSummary,
  offlineDeviceId,
  pendingSyncCount,
}: {
  conflictSyncCount: number
  failedSyncCount: number
  isOfflineMode: boolean
  lastSyncSummary?: RetailOpsSyncSummary
  offlineDeviceId: string
  pendingSyncCount: number
}): ReportRowItem[] {
  const openSyncCount = pendingSyncCount + failedSyncCount + conflictSyncCount
  const queueTone =
    failedSyncCount > 0 || conflictSyncCount > 0
      ? "danger"
      : pendingSyncCount > 0
        ? "warning"
        : "success"

  return [
    {
      detail: isOfflineMode
        ? "Local changes will be applied when next you connect."
        : "Production sync is available for replay.",
      id: "connection-mode",
      label: "Connection mode",
      tone: isOfflineMode ? "warning" : "success",
      value: isOfflineMode ? "Offline" : "Online",
    },
    {
      detail: "Registered offline sync identity",
      id: "offline-device",
      label: "Current device",
      value: offlineDeviceId.slice(-8) || "Pending",
    },
    {
      detail: lastSyncSummary
        ? `${formatReportDateTime(lastSyncSummary.completedAt)} from ${lastSyncSummary.deviceId.slice(-8)}`
        : "Sync has not completed on this device yet.",
      id: "last-sync",
      label: "Last sync",
      tone: lastSyncSummary
        ? getLastSyncTone(lastSyncSummary.status)
        : "default",
      value: lastSyncSummary?.status ?? "None",
    },
    {
      detail: `${pendingSyncCount} pending, ${failedSyncCount} retry, ${conflictSyncCount} review`,
      id: "sync-queue",
      label: "Open sync queue",
      tone: queueTone,
      value: String(openSyncCount),
    },
  ]
}

function formatDeviceFilterLabel(deviceId?: string | null) {
  if (!deviceId) return "unknown device"

  return deviceId.slice(-8) || deviceId
}

function getSyncConflictBusinessImpact(input: {
  errorMessage?: string | null
  type: string
}) {
  const normalizedMessage = input.errorMessage?.toLowerCase() ?? ""

  if (
    input.type === "sale_created" ||
    normalizedMessage.includes("stock") ||
    normalizedMessage.includes("inventory")
  ) {
    return "Sales or stock totals may be incomplete until inventory is reviewed and the event is replayed."
  }

  if (
    input.type === "closeout_created" ||
    input.type === "rep_session_opened" ||
    normalizedMessage.includes("session")
  ) {
    return "Attendant session, closeout, or variance reporting may be incomplete until session state is corrected."
  }

  if (input.type === "customer_upsert") {
    return "Customer history may stay device-only until the customer record is matched or retried."
  }

  if (input.type === "staff_invited") {
    return "The staff invite may not be usable until the invite event syncs."
  }

  if (input.type.startsWith("share_link")) {
    return "Product link status or link analytics may differ from production."
  }

  return "Production reports may be missing this local business event until it is reviewed."
}

function getSyncConflictRows(
  conflicts: Array<{
    deviceId: string | null
    errorMessage: string | null
    eventId: string
    id: string
    resolutionAction: string
    resolutionDetail: string
    type: string
  }>,
): ReportRowItem[] {
  return conflicts.map((conflict) => ({
    detail: `${getSyncConflictBusinessImpact({
      errorMessage: conflict.errorMessage,
      type: conflict.type,
    })} Recommended: ${conflict.resolutionAction}. ${
      conflict.resolutionDetail
    }`,
    id: conflict.id,
    label: `${conflict.type.replace(/_/g, " ")} · ${formatDeviceFilterLabel(
      conflict.deviceId,
    )}`,
    tone: "danger",
    value: conflict.eventId.slice(-8) || "Review",
  }))
}

function SyncDeviceFilterControl({
  currentDeviceId,
  onChange,
  value,
}: {
  currentDeviceId: string
  onChange: (value: SyncDeviceConflictFilter) => void
  value: SyncDeviceConflictFilter
}) {
  return (
    <View className="flex-row rounded-full bg-muted p-1">
      {[
        { label: "All devices", value: "all" },
        {
          label: `This device ${formatDeviceFilterLabel(currentDeviceId)}`,
          value: "current",
        },
      ].map((option) => {
        const isSelected = option.value === value

        return (
          <Pressable
            className={cn(
              "min-h-9 flex-1 items-center justify-center rounded-full px-3",
              isSelected ? "bg-background" : "active:bg-background/60",
            )}
            haptic
            key={option.value}
            onPress={() => onChange(option.value as SyncDeviceConflictFilter)}
          >
            <Text
              className={cn(
                "text-xs font-bold",
                isSelected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function ReportsContent({
  onComplete,
  presentation = "sheet",
}: ReportsContentProps) {
  const trpc = useTRPC()
  const [syncDeviceFilter, setSyncDeviceFilter] =
    useState<SyncDeviceConflictFilter>("all")
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const allCloseouts = useRetailOpsStore((state) => state.closeouts)
  const allProducts = useRetailOpsStore((state) => state.products)
  const allSales = useRetailOpsStore((state) => state.sales)
  const allStockMovements = useRetailOpsStore((state) => state.stockMovements)
  const allSyncEvents = useRetailOpsStore((state) => state.syncEvents)
  const closeouts = useMemo(
    () =>
      allCloseouts.filter((closeout) =>
        isActiveBusinessRecord(closeout, activeBusinessId),
      ),
    [activeBusinessId, allCloseouts],
  )
  const products = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          (product.kind ?? "product") === "product" &&
          isActiveBusinessRecord(product, activeBusinessId),
      ),
    [activeBusinessId, allProducts],
  )
  const sales = useMemo(
    () =>
      allSales.filter((sale) => isActiveBusinessRecord(sale, activeBusinessId)),
    [activeBusinessId, allSales],
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
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const lastSyncSummary = useRetailOpsStore((state) => state.lastSyncSummary)
  const offlineDeviceId = useRetailOpsStore((state) => state.offlineDeviceId)
  const reportRange = useMemo(() => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)

    return {
      from,
      to: new Date(),
    }
  }, [])
  const canReadProductionReports = !isOfflineMode
  const summaryQuery = useQuery(
    trpc.retailOps.summary.queryOptions(reportRange, {
      enabled: canReadProductionReports,
      retry: false,
    }),
  )
  const inventoryQuery = useQuery(
    trpc.retailOps.inventory.queryOptions(
      {},
      {
        enabled: canReadProductionReports,
        retry: false,
      },
    ),
  )
  const salesByRepQuery = useQuery(
    trpc.retailOps.salesByRep.queryOptions(reportRange, {
      enabled: canReadProductionReports,
      retry: false,
    }),
  )
  const salesByProductQuery = useQuery(
    trpc.retailOps.salesByProduct.queryOptions(reportRange, {
      enabled: canReadProductionReports,
      retry: false,
    }),
  )
  const creditSalesQuery = useQuery(
    trpc.retailOps.creditSales.queryOptions(
      {
        ...reportRange,
        limit: 8,
      },
      {
        enabled: canReadProductionReports,
        retry: false,
      },
    ),
  )
  const paymentReconciliationQuery = useQuery(
    trpc.retailOps.paymentReconciliation.queryOptions(reportRange, {
      enabled: canReadProductionReports,
      retry: false,
    }),
  )
  const syncConflictsQuery = useQuery(
    trpc.retailOps.syncConflicts.queryOptions(
      {
        deviceId: syncDeviceFilter === "current" ? offlineDeviceId : undefined,
        limit: 12,
      },
      {
        enabled: canReadProductionReports,
        retry: false,
      },
    ),
  )
  const tenantSyncConflictsCountQuery = useQuery(
    trpc.retailOps.syncConflicts.queryOptions(
      {
        limit: 50,
      },
      {
        enabled: canReadProductionReports,
        retry: false,
      },
    ),
  )
  const todaySales = useMemo(
    () => sales.filter((sale) => isToday(sale.createdAt)),
    [sales],
  )
  const todayTotals = useMemo(() => getPaymentTotals(todaySales), [todaySales])
  const latestCloseout = closeouts[0] ?? null
  const pendingSyncCount = syncEvents.filter(
    (event) => event.status === "pending",
  ).length
  const failedSyncCount = syncEvents.filter(
    (event) => event.status === "failed",
  ).length
  const conflictSyncCount = syncEvents.filter(
    (event) => event.status === "conflict",
  ).length
  const openSyncCount = pendingSyncCount + failedSyncCount + conflictSyncCount
  const summary = summaryQuery.data
  const reconciliationRows = useMemo(
    () => paymentReconciliationQuery.data ?? [],
    [paymentReconciliationQuery.data],
  )
  const latestProductionCloseout = reconciliationRows[0] ?? null
  const productStockRows = useMemo(
    () =>
      inventoryQuery.data?.length
        ? getProductionStockRows(inventoryQuery.data)
        : getProductStockRows(products),
    [inventoryQuery.data, products],
  )
  const salesByRepRows = useMemo(
    () =>
      salesByRepQuery.data?.length
        ? getProductionSalesByRepRows(salesByRepQuery.data)
        : getSalesByRepRows(todaySales),
    [salesByRepQuery.data, todaySales],
  )
  const salesByProductRows = useMemo(
    () =>
      salesByProductQuery.data?.length
        ? getProductionSalesByProductRows(salesByProductQuery.data)
        : getSalesByProductRows(todaySales),
    [salesByProductQuery.data, todaySales],
  )
  const creditSaleRows = useMemo(
    () => getProductionCreditSaleRows(creditSalesQuery.data ?? []),
    [creditSalesQuery.data],
  )
  const movementRows = useMemo(
    () => getMovementRows(stockMovements),
    [stockMovements],
  )
  const varianceRows = useMemo(
    () =>
      reconciliationRows.length > 0
        ? getProductionVarianceRows(reconciliationRows)
        : getVarianceRows(closeouts),
    [closeouts, reconciliationRows],
  )
  const syncOperationRows = useMemo(
    () =>
      getSyncOperationRows({
        conflictSyncCount,
        failedSyncCount,
        isOfflineMode,
        lastSyncSummary,
        offlineDeviceId,
        pendingSyncCount,
      }),
    [
      conflictSyncCount,
      failedSyncCount,
      isOfflineMode,
      lastSyncSummary,
      offlineDeviceId,
      pendingSyncCount,
    ],
  )
  const syncConflictRows = useMemo(
    () => getSyncConflictRows(syncConflictsQuery.data ?? []),
    [syncConflictsQuery.data],
  )
  const reportSourceRows = useMemo(() => {
    const queryErrors = [
      summaryQuery.isError,
      inventoryQuery.isError,
      salesByRepQuery.isError,
      salesByProductQuery.isError,
      creditSalesQuery.isError,
      paymentReconciliationQuery.isError,
      syncConflictsQuery.isError,
    ].filter(Boolean).length
    const queryFetching = [
      summaryQuery.isFetching,
      inventoryQuery.isFetching,
      salesByRepQuery.isFetching,
      salesByProductQuery.isFetching,
      creditSalesQuery.isFetching,
      paymentReconciliationQuery.isFetching,
      syncConflictsQuery.isFetching,
    ].some(Boolean)

    return [
      {
        detail: isOfflineMode
          ? "Local reports are shown while this device is offline."
          : queryErrors > 0
            ? `${queryErrors} production report request${
                queryErrors === 1 ? "" : "s"
              } could not load. Local data is shown where available.`
            : queryFetching
              ? "Refreshing production report data."
              : "Production report data is current for this session.",
        id: "report-source",
        label: "Report source",
        tone: isOfflineMode || queryErrors > 0 ? "warning" : "success",
        value: isOfflineMode ? "Local" : queryErrors > 0 ? "Mixed" : "Online",
      },
    ] satisfies ReportRowItem[]
  }, [
    creditSalesQuery.isError,
    creditSalesQuery.isFetching,
    inventoryQuery.isError,
    inventoryQuery.isFetching,
    isOfflineMode,
    paymentReconciliationQuery.isError,
    paymentReconciliationQuery.isFetching,
    salesByProductQuery.isError,
    salesByProductQuery.isFetching,
    salesByRepQuery.isError,
    salesByRepQuery.isFetching,
    summaryQuery.isError,
    summaryQuery.isFetching,
    syncConflictsQuery.isError,
    syncConflictsQuery.isFetching,
  ])
  const reportSource = reportSourceRows[0]?.value ?? "Local"
  const reportCsvSections = useMemo(
    () => [
      {
        rows: reportSourceRows,
        title: "Source",
      },
      {
        rows: syncConflictRows,
        title: "Server sync conflicts",
      },
      {
        rows: syncOperationRows,
        title: "Sync operations",
      },
      {
        rows: salesByRepRows,
        title: "Sales by attendant",
      },
      {
        rows: salesByProductRows,
        title: "Sales by product and unit",
      },
      {
        rows: creditSaleRows,
        title: "Credit sales",
      },
      {
        rows: productStockRows,
        title: "Stock balances and price snapshot",
      },
      {
        rows: movementRows,
        title: "Stock movement history",
      },
      {
        rows: varianceRows,
        title: "Cash and stock variance",
      },
    ],
    [
      creditSaleRows,
      movementRows,
      productStockRows,
      reportSourceRows,
      salesByProductRows,
      salesByRepRows,
      syncConflictRows,
      syncOperationRows,
      varianceRows,
    ],
  )

  async function exportReportCsv() {
    const csv = buildRetailOpsReportCsv({
      businessId: activeBusinessId,
      generatedAt: new Date(),
      sections: reportCsvSections,
      source: reportSource,
      syncDeviceFilter:
        syncDeviceFilter === "current"
          ? `current device ${formatDeviceFilterLabel(offlineDeviceId)}`
          : "all devices",
    })

    await Share.share({
      message: csv,
      title: "Ewatrade retail reports.csv",
    })
  }

  const contentClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"

  const content = (
    <View className={contentClassName}>
      <View className="gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="size-base text-primary" name="BarChart3" />
        </View>
        <View className="gap-2">
          <Text className="text-xl font-bold text-foreground">
            Retail reports
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Today, stock, payment, variance, and movement snapshots for the
            active business.
          </Text>
        </View>
      </View>

      <ReportSection
        empty="Report source is not available."
        rows={reportSourceRows}
        title="Source"
      />

      <View className="flex-row gap-3">
        <ReportMetricTile
          label="Today sales"
          value={formatMoney(
            summary?.sales.totalMinor ?? todayTotals.gross,
            "NGN",
          )}
        />
        <ReportMetricTile
          label="Transactions"
          value={String(summary?.sales.orderCount ?? todaySales.length)}
        />
      </View>

      <View className="flex-row gap-3">
        <ReportMetricTile
          label="Expected cash"
          value={formatMoney(
            latestProductionCloseout?.expectedCashMinor ??
              summary?.payments.cashMinor ??
              todayTotals.cash,
            "NGN",
          )}
        />
        <ReportMetricTile
          label="Transfer"
          value={formatMoney(
            summary?.payments.transferMinor ?? todayTotals.transfer,
            "NGN",
          )}
        />
      </View>

      <View className="flex-row gap-3">
        <ReportMetricTile
          label="Open sync"
          tone={openSyncCount > 0 ? "warning" : "success"}
          value={String(openSyncCount)}
        />
        <ReportMetricTile
          label="Last closeout"
          tone={
            latestProductionCloseout?.review || latestCloseout
              ? "warning"
              : "default"
          }
          value={
            latestProductionCloseout?.review?.status.replace(/_/g, " ") ??
            latestCloseout?.approvalStatus.replace(/_/g, " ") ??
            "None"
          }
        />
      </View>

      <View className="flex-row gap-3">
        <ReportMetricTile
          label="Server conflicts"
          tone={
            (tenantSyncConflictsCountQuery.data?.length ?? 0) > 0
              ? "danger"
              : "success"
          }
          value={String(tenantSyncConflictsCountQuery.data?.length ?? 0)}
        />
        <ReportMetricTile
          label="Filtered conflicts"
          tone={syncConflictRows.length > 0 ? "danger" : "success"}
          value={String(syncConflictRows.length)}
        />
      </View>

      <View className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-bold text-foreground">
              Server sync conflicts
            </Text>
            <Text className="mt-1 text-sm leading-5 text-muted-foreground">
              Tenant-level unreviewed conflicts, with a current-device filter
              for field diagnosis.
            </Text>
          </View>
          <Icon
            className={cn(
              "size-sm",
              syncConflictsQuery.isFetching
                ? "text-primary"
                : "text-muted-foreground",
            )}
            name="TriangleAlert"
          />
        </View>

        <SyncDeviceFilterControl
          currentDeviceId={offlineDeviceId}
          onChange={setSyncDeviceFilter}
          value={syncDeviceFilter}
        />

        <ReportSection
          empty={
            syncConflictsQuery.isError
              ? "Server conflicts are unavailable for this role or connection."
              : syncConflictsQuery.isFetching
                ? "Loading server conflicts..."
                : "No unreviewed server conflicts for this filter."
          }
          rows={syncConflictRows}
          title="Conflict review"
        />
      </View>

      <ReportSection
        empty="No sync operations have been recorded on this device."
        rows={syncOperationRows}
        title="Sync operations"
      />

      <ReportSection
        empty="No sales have been recorded today."
        rows={salesByRepRows}
        title="Sales by attendant"
      />

      <ReportSection
        empty="No product sales have been recorded today."
        rows={salesByProductRows}
        title="Sales by product and unit"
      />

      <ReportSection
        empty="No outstanding credit sales are visible for this range."
        rows={creditSaleRows}
        title="Credit sales"
      />

      <ReportSection
        empty="Add inventory to see stock balances."
        rows={productStockRows}
        title="Stock balances and price snapshot"
      />

      <ReportSection
        empty="No stock movement history yet."
        rows={movementRows}
        title="Stock movement history"
      />

      <ReportSection
        empty="No closeout variance has been recorded."
        rows={varianceRows}
        title="Cash and stock variance"
      />

      <StatusBanner
        icon="FileText"
        message="CSV export includes the visible report rows, source state, and current sync-device conflict filter."
        title="Export scope"
        tone="muted"
      />

      <ActionButton
        onPress={() => {
          void exportReportCsv()
        }}
        testID="retail-reports-export-csv"
        variant="outline"
      >
        Export CSV
      </ActionButton>

      <ActionButton onPress={onComplete} variant="outline">
        Done
      </ActionButton>
    </View>
  )

  if (presentation === "screen") {
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={140}
        contentContainerStyle={{ paddingBottom: 120 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </KeyboardAwareScrollView>
    )
  }

  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={112}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </BottomSheetKeyboardAwareScrollView>
  )
}

export const ReportsSheet = forwardRef<BottomSheetModal, ReportsSheetProps>(
  (props, ref) => {
    return (
      <Modal enableDynamicSizing ref={ref} snapPoints={["92%"]} title="Reports">
        <ReportsContent {...props} presentation="sheet" />
      </Modal>
    )
  },
)

ReportsSheet.displayName = "ReportsSheet"
