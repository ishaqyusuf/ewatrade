"use client"

import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import {
  Analytics01Icon,
  Archive01Icon,
  Calendar03Icon,
  Store04Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"

type RetailOpsSummary = RouterOutputs["retailOps"]["summary"]
type RetailOpsInventoryRow = RouterOutputs["retailOps"]["inventory"][number]
type RetailOpsSalesByRepRow = RouterOutputs["retailOps"]["salesByRep"][number]
type RetailOpsSalesByProductRow =
  RouterOutputs["retailOps"]["salesByProduct"][number]
type RetailOpsCreditSale = RouterOutputs["retailOps"]["creditSales"][number]
type RetailOpsPriceHistoryRow =
  RouterOutputs["retailOps"]["priceHistory"][number]
type RetailOpsStockMovementRow =
  RouterOutputs["retailOps"]["stockMovements"][number]
type RetailOpsPaymentReconciliationRow =
  RouterOutputs["retailOps"]["paymentReconciliation"][number]
type RetailOpsSyncConflict = RouterOutputs["retailOps"]["syncConflicts"][number]
type RetailOpsSyncRun = RouterOutputs["retailOps"]["syncHistory"][number]

type TenantOption = {
  name: string
  slug: string
}

type StoreOption = {
  currencyCode: string
  id: string
  name: string
  slug: string
  status: string
}

type CsvCell = Date | null | number | string | undefined
type CsvRow = Record<string, CsvCell>
type SelectOption = {
  label: string
  value: string
}
type PaymentMethodKey = "card" | "cash" | "credit" | "transfer"

type PaymentMethodBreakdownRow = {
  declaredMinor: number
  key: PaymentMethodKey
  label: string
  reconciledMinor: number
  repCount: number
  salesMinor: number
  sessionCount: number
  varianceMinor: number
}

const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
] as const

const PAYMENT_METHOD_OPTIONS: Array<
  SelectOption & { value: PaymentMethodKey }
> = [
  { label: "Cash", value: "cash" },
  { label: "Transfer", value: "transfer" },
  { label: "Card/POS", value: "card" },
  { label: "Credit", value: "credit" },
]

type DatePreset = (typeof DATE_PRESETS)[number]["value"]

const STOCK_MOVEMENT_TYPE_LABELS: Record<
  RetailOpsStockMovementRow["type"],
  string
> = {
  conversion_in: "Conversion in",
  conversion_out: "Conversion out",
  opening_stock: "Opening stock",
  sale: "Sale",
  staff_assignment: "Staff assignment",
  staff_return: "Staff return",
  stock_adjustment: "Stock adjustment",
  stock_intake: "Stock intake",
}

type Props = {
  defaultStoreId: string | null
  stores: StoreOption[]
  tenant: TenantOption
}

function toDateInputValue(date: Date) {
  const localDate = new Date(date)
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset())

  return localDate.toISOString().slice(0, 10)
}

function dateFromInput(value: string, boundary: "end" | "start") {
  const date = new Date(`${value}T00:00:00`)

  if (boundary === "end") {
    date.setHours(23, 59, 59, 999)
  }

  return date
}

function getDefaultRange() {
  const today = new Date()

  return {
    from: toDateInputValue(today),
    to: toDateInputValue(today),
  }
}

function getPresetRange(preset: DatePreset) {
  const today = new Date()
  const from = new Date(today)

  if (preset === "7d") {
    from.setDate(today.getDate() - 6)
  }

  if (preset === "30d") {
    from.setDate(today.getDate() - 29)
  }

  return {
    from: toDateInputValue(from),
    to: toDateInputValue(today),
  }
}

function formatMoney(amountMinor: number | null | undefined, currency: string) {
  const amount = (amountMinor ?? 0) / 100

  return new Intl.NumberFormat("en-NG", {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(amount)
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NG").format(value ?? 0)
}

function formatSignedNumber(value: number | null | undefined) {
  const normalized = value ?? 0
  const prefix = normalized > 0 ? "+" : ""

  return `${prefix}${formatNumber(normalized)}`
}

function formatOptionalNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : formatNumber(value)
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function normalizeCsvCell(value: CsvCell) {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value === null || value === undefined) {
    return ""
  }

  return String(value)
}

function escapeCsvCell(value: CsvCell) {
  const normalized = normalizeCsvCell(value)

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`
  }

  return normalized
}

function downloadCsv(filename: string, rows: CsvRow[]) {
  if (rows.length === 0) {
    return
  }

  const headers = Object.keys(rows[0] ?? {})
  const csv = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvCell(row[header])).join(","),
    ),
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function printReport() {
  window.print()
}

function getCurrency(
  selectedStore: StoreOption | undefined,
  summary: RetailOpsSummary | undefined,
) {
  return summary?.store.currencyCode ?? selectedStore?.currencyCode ?? "NGN"
}

function getExpectedCash(rows: RetailOpsPaymentReconciliationRow[]) {
  return rows.reduce((total, row) => total + row.expectedCashMinor, 0)
}

function getDeclaredCash(rows: RetailOpsPaymentReconciliationRow[]) {
  return rows.reduce(
    (total, row) =>
      total + (row.closingFloatMinor ?? row.declarations?.cashMinor ?? 0),
    0,
  )
}

function getVarianceCash(rows: RetailOpsPaymentReconciliationRow[]) {
  return rows.reduce((total, row) => total + (row.variance.cashMinor ?? 0), 0)
}

function getInventoryVarianceRows(rows: RetailOpsPaymentReconciliationRow[]) {
  return rows.flatMap((row) =>
    (row.inventory?.lines ?? [])
      .filter((line) => line.varianceQuantity !== 0)
      .map((line) => ({
        attendant: row.user.displayName,
        countedQuantity: line.countedQuantity,
        expectedQuantity: line.expectedQuantity,
        note: line.note,
        productName: line.product.name,
        sessionId: row.id,
        status: row.status,
        unitName: line.unit.name,
        varianceQuantity: line.varianceQuantity,
      })),
  )
}

function getTableState(
  isLoading: boolean,
  error: { message?: string } | null,
  rowCount: number,
  filteredRowCount = rowCount,
) {
  if (isLoading) {
    return "Loading report rows..."
  }

  if (error) {
    return error.message ?? "Unable to load report rows."
  }

  if (rowCount === 0) {
    return "No rows for this range."
  }

  if (filteredRowCount === 0) {
    return "No rows match the active filters."
  }

  return null
}

function getUniqueOptions(values: string[]) {
  return Array.from(
    values.reduce((options, value) => {
      const normalized = value.trim()

      if (normalized) {
        options.set(normalized, normalized)
      }

      return options
    }, new Map<string, string>()),
  )
    .map<SelectOption>(([value, label]) => ({ label, value }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

function matchesSelect(value: string | null | undefined, selected: string) {
  return selected === "all" || value === selected
}

function matchesProductLines(
  lines: RetailOpsCreditSale["lines"],
  selectedProduct: string,
  selectedUnit: string,
) {
  if (selectedProduct === "all" && selectedUnit === "all") {
    return true
  }

  return lines.some(
    (line) =>
      matchesSelect(line.productName, selectedProduct) &&
      matchesSelect(line.unitName, selectedUnit),
  )
}

function getSyncRunLastError(row: RetailOpsSyncRun) {
  return (
    row.events.find((event) => event.errorMessage || event.errorCode) ?? null
  )
}

function formatSyncEventType(type: RetailOpsSyncConflict["type"]) {
  return type
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getSalesByRepPaymentMinor(
  row: RetailOpsSalesByRepRow,
  method: PaymentMethodKey,
) {
  if (method === "cash") return row.cashMinor
  if (method === "transfer") return row.transferMinor
  if (method === "card") return row.cardMinor

  return row.creditMinor
}

function formatStockMovementType(type: RetailOpsStockMovementRow["type"]) {
  return STOCK_MOVEMENT_TYPE_LABELS[type]
}

function getReconciliationPaymentMinor(
  row: RetailOpsPaymentReconciliationRow,
  method: PaymentMethodKey,
) {
  if (method === "cash") return row.payments.cashMinor
  if (method === "transfer") return row.payments.transferMinor
  if (method === "card") return row.payments.cardMinor

  return row.payments.creditMinor
}

function getReconciliationDeclaredMinor(
  row: RetailOpsPaymentReconciliationRow,
  method: PaymentMethodKey,
) {
  if (method === "cash") {
    return row.closingFloatMinor ?? row.declarations?.cashMinor ?? null
  }

  if (method === "transfer") return row.declarations?.transferMinor ?? null
  if (method === "card") return row.declarations?.cardMinor ?? null

  return row.declarations?.creditMinor ?? null
}

function getReconciliationVarianceMinor(
  row: RetailOpsPaymentReconciliationRow,
  method: PaymentMethodKey,
) {
  if (method === "cash") return row.variance.cashMinor ?? null
  if (method === "transfer") return row.variance.transferMinor ?? null
  if (method === "card") return row.variance.cardMinor ?? null

  return row.variance.creditMinor ?? null
}

function hasPaymentMethodReconciliationActivity(
  row: RetailOpsPaymentReconciliationRow,
  method: PaymentMethodKey,
) {
  const paymentMinor = getReconciliationPaymentMinor(row, method)
  const declaredMinor = getReconciliationDeclaredMinor(row, method)
  const varianceMinor = getReconciliationVarianceMinor(row, method)

  if (paymentMinor > 0) return true
  if ((declaredMinor ?? 0) > 0) return true
  if ((varianceMinor ?? 0) !== 0) return true

  return method === "cash" && row.expectedCashMinor > 0
}

function getPaymentMethodBreakdownRows(
  salesRows: RetailOpsSalesByRepRow[],
  reconciliationRows: RetailOpsPaymentReconciliationRow[],
): PaymentMethodBreakdownRow[] {
  return PAYMENT_METHOD_OPTIONS.map((method) => {
    const salesMinor = salesRows.reduce(
      (total, row) => total + getSalesByRepPaymentMinor(row, method.value),
      0,
    )
    const reconciledMinor = reconciliationRows.reduce(
      (total, row) => total + getReconciliationPaymentMinor(row, method.value),
      0,
    )
    const declaredMinor = reconciliationRows.reduce(
      (total, row) =>
        total + (getReconciliationDeclaredMinor(row, method.value) ?? 0),
      0,
    )
    const varianceMinor = reconciliationRows.reduce(
      (total, row) =>
        total + (getReconciliationVarianceMinor(row, method.value) ?? 0),
      0,
    )

    return {
      declaredMinor,
      key: method.value,
      label: method.label,
      reconciledMinor,
      repCount: salesRows.filter(
        (row) => getSalesByRepPaymentMinor(row, method.value) > 0,
      ).length,
      salesMinor,
      sessionCount: reconciliationRows.filter((row) =>
        hasPaymentMethodReconciliationActivity(row, method.value),
      ).length,
      varianceMinor,
    }
  })
}

function MetricCard({
  label,
  tone = "default",
  value,
  detail,
}: {
  detail: string
  label: string
  tone?: "default" | "warning"
  value: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-4 shadow-sm",
        tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : "border-border/70",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function FilterSelect({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean
  label: string
  onChange: (value: string) => void
  options: SelectOption[]
  value: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function SectionHeader({
  title,
  description,
  csvFilename,
  csvRows,
}: {
  csvFilename: string
  csvRows: CsvRow[]
  description: string
  title: string
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={csvRows.length === 0}
        onClick={() => downloadCsv(csvFilename, csvRows)}
        className="w-full justify-center rounded-lg print:hidden sm:w-auto"
      >
        <HugeiconsIcon icon={Archive01Icon} className="size-4" />
        CSV
      </Button>
    </div>
  )
}

function ReportShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm print:break-inside-avoid print:shadow-none",
        className,
      )}
    >
      {children}
    </section>
  )
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-8 text-center text-sm text-muted-foreground"
      >
        {message}
      </td>
    </tr>
  )
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  )
}

function TableCell({
  children,
  align = "left",
}: {
  align?: "left" | "right"
  children: React.ReactNode
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-4 py-3 text-sm",
        align === "right" && "text-right tabular-nums",
      )}
    >
      {children}
    </td>
  )
}

export function RetailOpsReports({ defaultStoreId, stores, tenant }: Props) {
  const trpc = useTRPC()
  const defaultRange = useMemo(() => getDefaultRange(), [])
  const [selectedStoreId, setSelectedStoreId] = useState(defaultStoreId ?? "")
  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)
  const [selectedAttendant, setSelectedAttendant] = useState("all")
  const [selectedProduct, setSelectedProduct] = useState("all")
  const [selectedUnit, setSelectedUnit] = useState("all")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("all")
  const [selectedStockMovementType, setSelectedStockMovementType] =
    useState("all")
  const [selectedCreditAging, setSelectedCreditAging] = useState("all")
  const [selectedCloseoutStatus, setSelectedCloseoutStatus] = useState("all")
  const [selectedSyncStatus, setSelectedSyncStatus] = useState("all")
  const [selectedSyncDevice, setSelectedSyncDevice] = useState("all")

  const selectedStore = stores.find((store) => store.id === selectedStoreId)
  const reportRange = useMemo(
    () => ({
      from: dateFromInput(fromDate, "start"),
      storeId: selectedStoreId || undefined,
      to: dateFromInput(toDate, "end"),
    }),
    [fromDate, selectedStoreId, toDate],
  )
  const queriesEnabled = Boolean(selectedStoreId)

  const summaryQuery = useQuery(
    trpc.retailOps.summary.queryOptions(reportRange, {
      enabled: queriesEnabled,
      retry: false,
    }),
  )
  const inventoryQuery = useQuery(
    trpc.retailOps.inventory.queryOptions(
      { storeId: selectedStoreId || undefined },
      {
        enabled: queriesEnabled,
        retry: false,
      },
    ),
  )
  const salesByRepQuery = useQuery(
    trpc.retailOps.salesByRep.queryOptions(reportRange, {
      enabled: queriesEnabled,
      retry: false,
    }),
  )
  const salesByProductQuery = useQuery(
    trpc.retailOps.salesByProduct.queryOptions(reportRange, {
      enabled: queriesEnabled,
      retry: false,
    }),
  )
  const priceHistoryQuery = useQuery(
    trpc.retailOps.priceHistory.queryOptions(
      { ...reportRange, limit: 50 },
      {
        enabled: queriesEnabled,
        retry: false,
      },
    ),
  )
  const stockMovementsQuery = useQuery(
    trpc.retailOps.stockMovements.queryOptions(
      { ...reportRange, limit: 50 },
      {
        enabled: queriesEnabled,
        retry: false,
      },
    ),
  )
  const creditSalesQuery = useQuery(
    trpc.retailOps.creditSales.queryOptions(
      { ...reportRange, limit: 50 },
      {
        enabled: queriesEnabled,
        retry: false,
      },
    ),
  )
  const reconciliationQuery = useQuery(
    trpc.retailOps.paymentReconciliation.queryOptions(reportRange, {
      enabled: queriesEnabled,
      retry: false,
    }),
  )
  const syncHistoryQuery = useQuery(
    trpc.retailOps.syncHistory.queryOptions(
      { limit: 50 },
      {
        enabled: queriesEnabled,
        retry: false,
      },
    ),
  )
  const syncConflictsQuery = useQuery(
    trpc.retailOps.syncConflicts.queryOptions(
      { limit: 25 },
      {
        enabled: queriesEnabled,
        retry: false,
      },
    ),
  )
  const reviewSyncConflictMutation = useMutation(
    trpc.retailOps.reviewSyncConflict.mutationOptions(),
  )

  const summary = summaryQuery.data
  const inventoryRows = inventoryQuery.data ?? []
  const salesByRepRows = salesByRepQuery.data ?? []
  const salesByProductRows = salesByProductQuery.data ?? []
  const priceHistoryRows = priceHistoryQuery.data ?? []
  const stockMovementRows = stockMovementsQuery.data ?? []
  const creditSalesRows = creditSalesQuery.data ?? []
  const reconciliationRows = reconciliationQuery.data ?? []
  const syncHistoryRows = syncHistoryQuery.data ?? []
  const syncConflictRows = syncConflictsQuery.data ?? []
  const inventoryVarianceRows = useMemo(
    () => getInventoryVarianceRows(reconciliationRows),
    [reconciliationRows],
  )
  const attendantOptions = useMemo(
    () =>
      getUniqueOptions([
        ...salesByRepRows.map((row) => row.displayName),
        ...creditSalesRows.map((row) => row.actor.displayName),
        ...reconciliationRows.map((row) => row.user.displayName),
        ...inventoryVarianceRows.map((row) => row.attendant),
      ]),
    [
      creditSalesRows,
      inventoryVarianceRows,
      reconciliationRows,
      salesByRepRows,
    ],
  )
  const productOptions = useMemo(
    () =>
      getUniqueOptions([
        ...salesByProductRows.map((row) => row.productName),
        ...priceHistoryRows.map((row) => row.product.name),
        ...stockMovementRows.map((row) => row.product.name),
        ...inventoryRows.map((row) => row.productName),
        ...creditSalesRows.flatMap((row) =>
          row.lines.map((line) => line.productName),
        ),
        ...inventoryVarianceRows.map((row) => row.productName),
      ]),
    [
      creditSalesRows,
      inventoryRows,
      inventoryVarianceRows,
      priceHistoryRows,
      salesByProductRows,
      stockMovementRows,
    ],
  )
  const unitOptions = useMemo(
    () =>
      getUniqueOptions([
        ...salesByProductRows.map((row) => row.unitName),
        ...priceHistoryRows.map((row) => row.unit.name),
        ...stockMovementRows.map((row) => row.unit.name),
        ...inventoryRows.map((row) => row.unitName),
        ...creditSalesRows.flatMap((row) =>
          row.lines.map((line) => line.unitName),
        ),
        ...inventoryVarianceRows.map((row) => row.unitName),
      ]),
    [
      creditSalesRows,
      inventoryRows,
      inventoryVarianceRows,
      priceHistoryRows,
      salesByProductRows,
      stockMovementRows,
    ],
  )
  const stockMovementTypeOptions = useMemo(
    () =>
      getUniqueOptions(
        stockMovementRows.map((row) => formatStockMovementType(row.type)),
      ),
    [stockMovementRows],
  )
  const creditAgingOptions = useMemo(
    () =>
      getUniqueOptions(
        creditSalesRows.map((row) => row.aging.bucket.replaceAll("_", " ")),
      ),
    [creditSalesRows],
  )
  const closeoutStatusOptions = useMemo(
    () => getUniqueOptions(reconciliationRows.map((row) => row.status)),
    [reconciliationRows],
  )
  const syncStatusOptions = useMemo(
    () => getUniqueOptions(syncHistoryRows.map((row) => row.status)),
    [syncHistoryRows],
  )
  const syncDeviceOptions = useMemo(
    () =>
      getUniqueOptions(
        [
          ...syncHistoryRows.map((row) => row.deviceId ?? "unknown device"),
          ...syncConflictRows.map((row) => row.deviceId ?? "unknown device"),
        ],
      ),
    [syncConflictRows, syncHistoryRows],
  )
  const filteredSalesByRepRows = useMemo(
    () =>
      salesByRepRows.filter(
        (row) =>
          matchesSelect(row.displayName, selectedAttendant) &&
          (selectedPaymentMethod === "all" ||
            getSalesByRepPaymentMinor(
              row,
              selectedPaymentMethod as PaymentMethodKey,
            ) > 0),
      ),
    [salesByRepRows, selectedAttendant, selectedPaymentMethod],
  )
  const filteredSalesByProductRows = useMemo(
    () =>
      salesByProductRows.filter(
        (row) =>
          matchesSelect(row.productName, selectedProduct) &&
          matchesSelect(row.unitName, selectedUnit),
      ),
    [salesByProductRows, selectedProduct, selectedUnit],
  )
  const filteredInventoryRows = useMemo(
    () =>
      inventoryRows.filter(
        (row) =>
          matchesSelect(row.productName, selectedProduct) &&
          matchesSelect(row.unitName, selectedUnit),
      ),
    [inventoryRows, selectedProduct, selectedUnit],
  )
  const filteredPriceHistoryRows = useMemo(
    () =>
      priceHistoryRows.filter(
        (row) =>
          matchesSelect(row.product.name, selectedProduct) &&
          matchesSelect(row.unit.name, selectedUnit),
      ),
    [priceHistoryRows, selectedProduct, selectedUnit],
  )
  const filteredStockMovementRows = useMemo(
    () =>
      stockMovementRows.filter(
        (row) =>
          matchesSelect(row.product.name, selectedProduct) &&
          matchesSelect(row.unit.name, selectedUnit) &&
          matchesSelect(
            formatStockMovementType(row.type),
            selectedStockMovementType,
          ),
      ),
    [
      selectedProduct,
      selectedStockMovementType,
      selectedUnit,
      stockMovementRows,
    ],
  )
  const filteredCreditSalesRows = useMemo(
    () =>
      creditSalesRows.filter(
        (row) =>
          matchesSelect(row.actor.displayName, selectedAttendant) &&
          (selectedPaymentMethod === "all" ||
            selectedPaymentMethod === "credit") &&
          matchesSelect(
            row.aging.bucket.replaceAll("_", " "),
            selectedCreditAging,
          ) &&
          matchesProductLines(row.lines, selectedProduct, selectedUnit),
      ),
    [
      creditSalesRows,
      selectedAttendant,
      selectedCreditAging,
      selectedPaymentMethod,
      selectedProduct,
      selectedUnit,
    ],
  )
  const filteredReconciliationRows = useMemo(
    () =>
      reconciliationRows.filter(
        (row) =>
          matchesSelect(row.user.displayName, selectedAttendant) &&
          matchesSelect(row.status, selectedCloseoutStatus) &&
          (selectedPaymentMethod === "all" ||
            hasPaymentMethodReconciliationActivity(
              row,
              selectedPaymentMethod as PaymentMethodKey,
            )),
      ),
    [
      reconciliationRows,
      selectedAttendant,
      selectedCloseoutStatus,
      selectedPaymentMethod,
    ],
  )
  const paymentMethodBreakdownRows = useMemo(
    () => getPaymentMethodBreakdownRows(salesByRepRows, reconciliationRows),
    [reconciliationRows, salesByRepRows],
  )
  const filteredPaymentMethodBreakdownRows = useMemo(
    () =>
      paymentMethodBreakdownRows.filter((row) =>
        matchesSelect(row.key, selectedPaymentMethod),
      ),
    [paymentMethodBreakdownRows, selectedPaymentMethod],
  )
  const filteredInventoryVarianceRows = useMemo(
    () =>
      inventoryVarianceRows.filter(
        (row) =>
          matchesSelect(row.attendant, selectedAttendant) &&
          matchesSelect(row.productName, selectedProduct) &&
          matchesSelect(row.unitName, selectedUnit) &&
          matchesSelect(row.status, selectedCloseoutStatus),
      ),
    [
      inventoryVarianceRows,
      selectedAttendant,
      selectedCloseoutStatus,
      selectedProduct,
      selectedUnit,
    ],
  )
  const filteredSyncHistoryRows = useMemo(
    () =>
      syncHistoryRows.filter(
        (row) =>
          matchesSelect(row.status, selectedSyncStatus) &&
          matchesSelect(row.deviceId ?? "unknown device", selectedSyncDevice),
      ),
    [selectedSyncDevice, selectedSyncStatus, syncHistoryRows],
  )
  const filteredSyncConflictRows = useMemo(
    () =>
      syncConflictRows.filter((row) =>
        matchesSelect(row.deviceId ?? "unknown device", selectedSyncDevice),
      ),
    [selectedSyncDevice, syncConflictRows],
  )
  const currency = getCurrency(selectedStore, summary)
  const isLoading =
    summaryQuery.isLoading ||
    inventoryQuery.isLoading ||
    salesByRepQuery.isLoading ||
    salesByProductQuery.isLoading ||
    priceHistoryQuery.isLoading ||
    stockMovementsQuery.isLoading ||
    creditSalesQuery.isLoading ||
    reconciliationQuery.isLoading ||
    syncHistoryQuery.isLoading
  const firstError =
    summaryQuery.error ??
    inventoryQuery.error ??
    salesByRepQuery.error ??
    salesByProductQuery.error ??
    priceHistoryQuery.error ??
    stockMovementsQuery.error ??
    creditSalesQuery.error ??
    reconciliationQuery.error ??
    syncHistoryQuery.error ??
    null
  const expectedCashMinor = getExpectedCash(reconciliationRows)
  const declaredCashMinor = getDeclaredCash(reconciliationRows)
  const varianceCashMinor = getVarianceCash(reconciliationRows)

  const salesByRepCsv = useMemo(
    () =>
      filteredSalesByRepRows.map((row) => ({
        attendant: row.displayName,
        email: row.email,
        sales_count: row.orderCount,
        quantity: row.quantity,
        gross_minor: row.grossMinor,
        cash_minor: row.cashMinor,
        transfer_minor: row.transferMinor,
        card_minor: row.cardMinor,
        credit_minor: row.creditMinor,
        last_sold_at: row.lastSoldAt,
        sessions: row.cashierSessionIds.join(" | "),
      })),
    [filteredSalesByRepRows],
  )
  const salesByProductCsv = useMemo(
    () =>
      filteredSalesByProductRows.map((row) => ({
        product: row.productName,
        unit: row.unitName,
        quantity: row.quantity,
        gross_minor: row.grossMinor,
      })),
    [filteredSalesByProductRows],
  )
  const inventoryCsv = useMemo(
    () =>
      filteredInventoryRows.map((row) => ({
        product: row.productName,
        unit: row.unitName,
        on_hand: row.onHandQuantity,
        reserved: row.reservedQuantity,
        available: row.onHandQuantity - row.reservedQuantity,
        price_minor: row.priceMinor,
        default_unit: row.isDefault ? "yes" : "no",
      })),
    [filteredInventoryRows],
  )
  const priceHistoryCsv = useMemo(
    () =>
      filteredPriceHistoryRows.map((row) => ({
        product: row.product.name,
        unit: row.unit.name,
        sku: row.unit.sku,
        source: row.source,
        previous_price_minor: row.previousPriceMinor,
        price_minor: row.priceMinor,
        current_price_minor: row.currentPriceMinor,
        effective_at: row.effectiveAt,
        actor_user_id: row.actorUserId,
        reason: row.reason,
      })),
    [filteredPriceHistoryRows],
  )
  const stockMovementsCsv = useMemo(
    () =>
      filteredStockMovementRows.map((row) => ({
        product: row.product.name,
        unit: row.unit.name,
        movement_type: formatStockMovementType(row.type),
        direction: row.direction,
        quantity: row.quantity,
        signed_quantity: row.signedQuantity,
        previous_on_hand: row.previousOnHandQuantity,
        on_hand: row.onHandQuantity,
        related_unit: row.relatedUnit?.name,
        related_quantity: row.relatedUnit?.quantity,
        source_name: row.sourceName,
        happened_at: row.happenedAt,
        external_id: row.externalId,
        note: row.note,
      })),
    [filteredStockMovementRows],
  )
  const creditSalesCsv = useMemo(
    () =>
      filteredCreditSalesRows.map((row) => ({
        order_number: row.orderNumber,
        customer: row.customer.name,
        email: row.customer.email,
        attendant: row.actor.displayName,
        total_minor: row.totalMinor,
        paid_minor: row.paidMinor,
        balance_minor: row.balanceMinor,
        due_at: row.dueAt,
        aging_bucket: row.aging.bucket,
        overdue_days: row.aging.overdueDays,
      })),
    [filteredCreditSalesRows],
  )
  const paymentMethodBreakdownCsv = useMemo(
    () =>
      filteredPaymentMethodBreakdownRows.map((row) => ({
        payment_method: row.label,
        sales_minor: row.salesMinor,
        reconciled_minor: row.reconciledMinor,
        declared_minor: row.declaredMinor,
        variance_minor: row.varianceMinor,
        attendant_count: row.repCount,
        session_count: row.sessionCount,
      })),
    [filteredPaymentMethodBreakdownRows],
  )
  const reconciliationCsv = useMemo(
    () =>
      filteredReconciliationRows.map((row) => ({
        session_id: row.id,
        attendant: row.user.displayName,
        status: row.status,
        opened_at: row.openedAt,
        closed_at: row.closedAt,
        receipts: row.payments.receiptCount,
        expected_cash_minor: row.expectedCashMinor,
        declared_cash_minor:
          row.closingFloatMinor ?? row.declarations?.cashMinor,
        cash_variance_minor: row.variance.cashMinor,
        transfer_minor: row.payments.transferMinor,
        card_minor: row.payments.cardMinor,
        credit_minor: row.payments.creditMinor,
      })),
    [filteredReconciliationRows],
  )
  const varianceCsv = useMemo(
    () =>
      filteredInventoryVarianceRows.map((row) => ({
        session_id: row.sessionId,
        attendant: row.attendant,
        product: row.productName,
        unit: row.unitName,
        expected: row.expectedQuantity,
        counted: row.countedQuantity,
        variance: row.varianceQuantity,
        note: row.note,
      })),
    [filteredInventoryVarianceRows],
  )
  const syncHistoryCsv = useMemo(
    () =>
      filteredSyncHistoryRows.map((row) => {
        const lastError = getSyncRunLastError(row)

        return {
          sync_run_id: row.id,
          status: row.status,
          device_id: row.deviceId,
          actor_user_id: row.actorUserId,
          total: row.totalCount,
          applied: row.appliedCount,
          failed: row.failedCount,
          skipped: row.skippedCount,
          completed_at: row.completedAt,
          last_error_code: lastError?.errorCode,
          last_error_message: lastError?.errorMessage,
        }
      }),
    [filteredSyncHistoryRows],
  )
  const syncConflictsCsv = useMemo(
    () =>
      filteredSyncConflictRows.map((row) => ({
        event_id: row.eventId,
        event_type: formatSyncEventType(row.type),
        device_id: row.deviceId,
        actor_user_id: row.actorUserId,
        sync_run_id: row.syncRunId,
        error_code: row.errorCode,
        error_message: row.errorMessage,
        resolution_action: row.resolutionAction,
        resolution_detail: row.resolutionDetail,
        processed_at: row.processedAt,
      })),
    [filteredSyncConflictRows],
  )
  const hasActiveTableFilters =
    selectedAttendant !== "all" ||
    selectedProduct !== "all" ||
    selectedUnit !== "all" ||
    selectedPaymentMethod !== "all" ||
    selectedStockMovementType !== "all" ||
    selectedCreditAging !== "all" ||
    selectedCloseoutStatus !== "all" ||
    selectedSyncStatus !== "all" ||
    selectedSyncDevice !== "all"
  const salesByRepState = getTableState(
    salesByRepQuery.isLoading,
    salesByRepQuery.error,
    salesByRepRows.length,
    filteredSalesByRepRows.length,
  )
  const salesByProductState = getTableState(
    salesByProductQuery.isLoading,
    salesByProductQuery.error,
    salesByProductRows.length,
    filteredSalesByProductRows.length,
  )
  const inventoryState = getTableState(
    inventoryQuery.isLoading,
    inventoryQuery.error,
    inventoryRows.length,
    filteredInventoryRows.length,
  )
  const priceHistoryState = getTableState(
    priceHistoryQuery.isLoading,
    priceHistoryQuery.error,
    priceHistoryRows.length,
    filteredPriceHistoryRows.length,
  )
  const stockMovementsState = getTableState(
    stockMovementsQuery.isLoading,
    stockMovementsQuery.error,
    stockMovementRows.length,
    filteredStockMovementRows.length,
  )
  const creditSalesState = getTableState(
    creditSalesQuery.isLoading,
    creditSalesQuery.error,
    creditSalesRows.length,
    filteredCreditSalesRows.length,
  )
  const reconciliationState = getTableState(
    reconciliationQuery.isLoading,
    reconciliationQuery.error,
    reconciliationRows.length,
    filteredReconciliationRows.length,
  )
  const varianceState = getTableState(
    reconciliationQuery.isLoading,
    reconciliationQuery.error,
    inventoryVarianceRows.length,
    filteredInventoryVarianceRows.length,
  )
  const syncHistoryState = getTableState(
    syncHistoryQuery.isLoading,
    syncHistoryQuery.error,
    syncHistoryRows.length,
    filteredSyncHistoryRows.length,
  )
  const syncConflictState = syncConflictsQuery.isLoading
    ? "Loading conflict rows..."
    : syncConflictsQuery.error
      ? syncConflictsQuery.error.message
      : syncConflictRows.length === 0
        ? "No unreviewed sync conflicts."
        : filteredSyncConflictRows.length === 0
          ? "No conflicts match the active sync device filter."
          : null

  function applyPreset(preset: DatePreset) {
    const nextRange = getPresetRange(preset)

    setFromDate(nextRange.from)
    setToDate(nextRange.to)
  }

  function clearTableFilters() {
    setSelectedAttendant("all")
    setSelectedProduct("all")
    setSelectedUnit("all")
    setSelectedPaymentMethod("all")
    setSelectedStockMovementType("all")
    setSelectedCreditAging("all")
    setSelectedCloseoutStatus("all")
    setSelectedSyncStatus("all")
    setSelectedSyncDevice("all")
  }

  function reviewSyncConflict(eventId: string) {
    if (reviewSyncConflictMutation.isPending) return

    reviewSyncConflictMutation.mutate(
      { eventId },
      {
        onSuccess: () => {
          void syncConflictsQuery.refetch()
          void syncHistoryQuery.refetch()
        },
      },
    )
  }

  const syncRunIssueCount = syncHistoryRows.filter(
    (row) => row.status === "failed" || row.status === "partial",
  ).length
  const syncIssueCount = syncRunIssueCount + syncConflictRows.length

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 print:p-0 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={Analytics01Icon} className="size-4" />
            Analytics
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Retail Ops Reports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant.name} · {tenant.slug}.ewatrade.com
          </p>
          <p className="mt-1 hidden text-xs text-muted-foreground print:block">
            {selectedStore?.name ?? "All stores"} · {fromDate} to {toDate}
          </p>
        </div>

        <div className="grid gap-3 rounded-lg border border-border/70 bg-background p-3 shadow-sm print:hidden md:grid-cols-[minmax(180px,1fr)_auto_auto]">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Store04Icon} className="size-3.5" />
              Store
            </span>
            <select
              value={selectedStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {stores.length === 0 ? (
                <option value="">No stores</option>
              ) : (
                stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Calendar03Icon} className="size-3.5" />
                From
              </span>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(event) => {
                  if (event.target.value) {
                    setFromDate(event.target.value)
                  }
                }}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              <span>To</span>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(event) => {
                  if (event.target.value) {
                    setToDate(event.target.value)
                  }
                }}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>

          <div className="flex items-end gap-1">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset.value)}
                className="rounded-lg"
              >
                {preset.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={printReport}
              className="rounded-lg"
            >
              <HugeiconsIcon icon={Archive01Icon} className="size-4" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-border/70 bg-background p-3 shadow-sm print:hidden md:grid-cols-2 xl:grid-cols-[repeat(9,minmax(120px,1fr))_auto]">
        <FilterSelect
          label="Attendant"
          value={selectedAttendant}
          options={attendantOptions}
          disabled={!queriesEnabled || attendantOptions.length === 0}
          onChange={setSelectedAttendant}
        />
        <FilterSelect
          label="Product"
          value={selectedProduct}
          options={productOptions}
          disabled={!queriesEnabled || productOptions.length === 0}
          onChange={setSelectedProduct}
        />
        <FilterSelect
          label="Unit"
          value={selectedUnit}
          options={unitOptions}
          disabled={!queriesEnabled || unitOptions.length === 0}
          onChange={setSelectedUnit}
        />
        <FilterSelect
          label="Payment method"
          value={selectedPaymentMethod}
          options={PAYMENT_METHOD_OPTIONS}
          disabled={!queriesEnabled}
          onChange={setSelectedPaymentMethod}
        />
        <FilterSelect
          label="Movement"
          value={selectedStockMovementType}
          options={stockMovementTypeOptions}
          disabled={!queriesEnabled || stockMovementTypeOptions.length === 0}
          onChange={setSelectedStockMovementType}
        />
        <FilterSelect
          label="Credit aging"
          value={selectedCreditAging}
          options={creditAgingOptions}
          disabled={!queriesEnabled || creditAgingOptions.length === 0}
          onChange={setSelectedCreditAging}
        />
        <FilterSelect
          label="Closeout status"
          value={selectedCloseoutStatus}
          options={closeoutStatusOptions}
          disabled={!queriesEnabled || closeoutStatusOptions.length === 0}
          onChange={setSelectedCloseoutStatus}
        />
        <FilterSelect
          label="Sync status"
          value={selectedSyncStatus}
          options={syncStatusOptions}
          disabled={!queriesEnabled || syncStatusOptions.length === 0}
          onChange={setSelectedSyncStatus}
        />
        <FilterSelect
          label="Sync device"
          value={selectedSyncDevice}
          options={syncDeviceOptions}
          disabled={!queriesEnabled || syncDeviceOptions.length === 0}
          onChange={setSelectedSyncDevice}
        />
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasActiveTableFilters}
            onClick={clearTableFilters}
            className="h-9 w-full rounded-lg"
          >
            Reset
          </Button>
        </div>
      </div>

      {firstError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {firstError.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard
          label="Gross sales"
          value={formatMoney(summary?.sales.totalMinor, currency)}
          detail={`${formatNumber(summary?.sales.orderCount)} orders in range`}
        />
        <MetricCard
          label="Expected cash"
          value={formatMoney(
            expectedCashMinor || summary?.payments.cashMinor,
            currency,
          )}
          detail={`${formatNumber(summary?.payments.receiptCount)} receipts`}
        />
        <MetricCard
          label="Declared cash"
          value={formatMoney(declaredCashMinor, currency)}
          detail={`${formatNumber(reconciliationRows.length)} closed sessions`}
        />
        <MetricCard
          label="Cash variance"
          value={formatMoney(varianceCashMinor, currency)}
          detail="Declared minus expected cash"
          tone={varianceCashMinor === 0 ? "default" : "warning"}
        />
        <MetricCard
          label="Credit balance"
          value={formatMoney(
            creditSalesRows.reduce((total, row) => total + row.balanceMinor, 0),
            currency,
          )}
          detail={`${formatNumber(creditSalesRows.length)} open credit sales`}
        />
        <MetricCard
          label="Stock units"
          value={formatNumber(summary?.inventory.stockUnitCount)}
          detail={`${formatNumber(summary?.inventory.lowStockCount)} low stock`}
        />
        <MetricCard
          label="Stock moves"
          value={formatNumber(stockMovementRows.length)}
          detail={`${formatNumber(
            stockMovementRows.filter((row) => row.direction === "out").length,
          )} outgoing`}
        />
        <MetricCard
          label="Sync issues"
          value={formatNumber(syncIssueCount)}
          detail={`${formatNumber(syncConflictRows.length)} conflicts, ${formatNumber(
            syncHistoryRows.length,
          )} recent runs`}
          tone={syncIssueCount > 0 ? "warning" : "default"}
        />
      </div>

      <ReportShell>
        <SectionHeader
          title="Payment method breakdown"
          description="Sales buckets compared with reconciled receipts and closeout declarations."
          csvFilename="retail-ops-payment-methods.csv"
          csvRows={paymentMethodBreakdownCsv}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead className="bg-muted/60">
              <tr>
                <TableHeading>Method</TableHeading>
                <TableHeading>Sales amount</TableHeading>
                <TableHeading>Reconciled</TableHeading>
                <TableHeading>Declared</TableHeading>
                <TableHeading>Variance</TableHeading>
                <TableHeading>Attendants</TableHeading>
                <TableHeading>Sessions</TableHeading>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {filteredPaymentMethodBreakdownRows.map((row) => (
                <tr key={row.key}>
                  <TableCell>
                    <span className="font-medium">{row.label}</span>
                  </TableCell>
                  <TableCell align="right">
                    {formatMoney(row.salesMinor, currency)}
                  </TableCell>
                  <TableCell align="right">
                    {formatMoney(row.reconciledMinor, currency)}
                  </TableCell>
                  <TableCell align="right">
                    {formatMoney(row.declaredMinor, currency)}
                  </TableCell>
                  <TableCell align="right">
                    <span
                      className={cn(
                        "font-medium",
                        row.varianceMinor !== 0 && "text-amber-700",
                      )}
                    >
                      {formatMoney(row.varianceMinor, currency)}
                    </span>
                  </TableCell>
                  <TableCell align="right">
                    {formatNumber(row.repCount)}
                  </TableCell>
                  <TableCell align="right">
                    {formatNumber(row.sessionCount)}
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportShell>

      <div className="grid gap-6 2xl:grid-cols-2">
        <ReportShell>
          <SectionHeader
            title="Sales by attendant"
            description="Gross sales, payment split, quantity, and linked sessions."
            csvFilename="retail-ops-sales-by-attendant.csv"
            csvRows={salesByRepCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Attendant</TableHeading>
                  <TableHeading>Sales</TableHeading>
                  <TableHeading>Qty</TableHeading>
                  <TableHeading>Gross</TableHeading>
                  <TableHeading>Cash</TableHeading>
                  <TableHeading>Transfer</TableHeading>
                  <TableHeading>Credit</TableHeading>
                  <TableHeading>Last sale</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {salesByRepState ? (
                  <EmptyRow colSpan={8} message={salesByRepState} />
                ) : (
                  filteredSalesByRepRows.map((row) => (
                    <tr key={row.actorUserId ?? row.displayName}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.email ?? "No email"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(row.orderCount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(row.quantity)}
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(row.grossMinor, currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(row.cashMinor, currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(row.transferMinor, currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(row.creditMinor, currency)}
                      </TableCell>
                      <TableCell>{formatDateTime(row.lastSoldAt)}</TableCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>

        <ReportShell>
          <SectionHeader
            title="Sales by product and unit"
            description="Sale-time product and unit snapshots for the selected range."
            csvFilename="retail-ops-sales-by-product.csv"
            csvRows={salesByProductCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Product</TableHeading>
                  <TableHeading>Unit</TableHeading>
                  <TableHeading>Quantity</TableHeading>
                  <TableHeading>Gross</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {salesByProductState ? (
                  <EmptyRow colSpan={4} message={salesByProductState} />
                ) : (
                  filteredSalesByProductRows.map((row) => (
                    <tr key={`${row.productId}:${row.unitName}`}>
                      <TableCell>
                        <span className="font-medium">{row.productName}</span>
                      </TableCell>
                      <TableCell>{row.unitName}</TableCell>
                      <TableCell align="right">
                        {formatNumber(row.quantity)}
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(row.grossMinor, currency)}
                      </TableCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <ReportShell>
          <SectionHeader
            title="Stock balance"
            description="Current product/unit balances and price snapshots."
            csvFilename="retail-ops-stock-balance.csv"
            csvRows={inventoryCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Product</TableHeading>
                  <TableHeading>Unit</TableHeading>
                  <TableHeading>On hand</TableHeading>
                  <TableHeading>Reserved</TableHeading>
                  <TableHeading>Available</TableHeading>
                  <TableHeading>Price</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {inventoryState ? (
                  <EmptyRow colSpan={6} message={inventoryState} />
                ) : (
                  filteredInventoryRows.map((row) => {
                    const available = row.onHandQuantity - row.reservedQuantity

                    return (
                      <tr key={row.unitId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{row.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.isDefault ? "Primary unit" : "Variant"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{row.unitName}</TableCell>
                        <TableCell align="right">
                          {formatNumber(row.onHandQuantity)}
                        </TableCell>
                        <TableCell align="right">
                          {formatNumber(row.reservedQuantity)}
                        </TableCell>
                        <TableCell align="right">
                          <span
                            className={cn(
                              "font-medium",
                              available <= 5 && "text-amber-700",
                            )}
                          >
                            {formatNumber(available)}
                          </span>
                        </TableCell>
                        <TableCell align="right">
                          {formatMoney(row.priceMinor, currency)}
                        </TableCell>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>

        <ReportShell>
          <SectionHeader
            title="Price history"
            description="Metadata-backed product-unit price changes for the selected range."
            csvFilename="retail-ops-price-history.csv"
            csvRows={priceHistoryCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Product</TableHeading>
                  <TableHeading>Unit</TableHeading>
                  <TableHeading>Previous</TableHeading>
                  <TableHeading>New price</TableHeading>
                  <TableHeading>Current</TableHeading>
                  <TableHeading>Source</TableHeading>
                  <TableHeading>Effective</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {priceHistoryState ? (
                  <EmptyRow colSpan={7} message={priceHistoryState} />
                ) : (
                  filteredPriceHistoryRows.map((row) => (
                    <tr key={row.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.reason ?? "No reason"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{row.unit.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {row.unit.sku}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        {row.previousPriceMinor === null
                          ? "-"
                          : formatMoney(row.previousPriceMinor, currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(row.priceMinor, currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(row.currentPriceMinor, currency)}
                      </TableCell>
                      <TableCell>
                        {row.source === "retail_ops_product_setup"
                          ? "setup"
                          : "price update"}
                      </TableCell>
                      <TableCell>{formatDateTime(row.effectiveAt)}</TableCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>

        <ReportShell className="2xl:col-span-2">
          <SectionHeader
            title="Stock movements"
            description="Stock setup, sales, custody, closeout adjustment, intake, and conversion history."
            csvFilename="retail-ops-stock-movements.csv"
            csvRows={stockMovementsCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Product</TableHeading>
                  <TableHeading>Unit</TableHeading>
                  <TableHeading>Movement</TableHeading>
                  <TableHeading>Delta</TableHeading>
                  <TableHeading>Balance</TableHeading>
                  <TableHeading>Related unit</TableHeading>
                  <TableHeading>Source</TableHeading>
                  <TableHeading>When</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {stockMovementsState ? (
                  <EmptyRow colSpan={8} message={stockMovementsState} />
                ) : (
                  filteredStockMovementRows.map((row) => (
                    <tr key={row.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.note ?? "No note"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{row.unit.name}</TableCell>
                      <TableCell>{formatStockMovementType(row.type)}</TableCell>
                      <TableCell align="right">
                        <span
                          className={cn(
                            "font-medium",
                            row.direction === "in"
                              ? "text-emerald-700"
                              : "text-red-700",
                          )}
                        >
                          {formatSignedNumber(row.signedQuantity)}
                        </span>
                      </TableCell>
                      <TableCell align="right">
                        {formatOptionalNumber(row.previousOnHandQuantity)}
                        {" -> "}
                        {formatOptionalNumber(row.onHandQuantity)}
                      </TableCell>
                      <TableCell>
                        {row.relatedUnit
                          ? `${row.relatedUnit.name} (${formatNumber(
                              row.relatedUnit.quantity,
                            )})`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>
                            {row.sourceName ??
                              (row.type === "stock_intake"
                                ? "Stock intake"
                                : row.type === "stock_adjustment"
                                  ? "Stock adjustment"
                                  : row.type === "opening_stock"
                                    ? "Opening stock"
                                    : row.type === "sale"
                                      ? "Sale"
                                      : row.type === "staff_assignment"
                                        ? "Staff assignment"
                                        : row.type === "staff_return"
                                          ? "Staff return"
                                          : "Unit conversion")}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {row.externalId}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{formatDateTime(row.happenedAt)}</TableCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <ReportShell>
          <SectionHeader
            title="Credit sales"
            description="Open balances from credit checkout activity."
            csvFilename="retail-ops-credit-sales.csv"
            csvRows={creditSalesCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Order</TableHeading>
                  <TableHeading>Customer</TableHeading>
                  <TableHeading>Balance</TableHeading>
                  <TableHeading>Due</TableHeading>
                  <TableHeading>Aging</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {creditSalesState ? (
                  <EmptyRow colSpan={5} message={creditSalesState} />
                ) : (
                  filteredCreditSalesRows.map((row) => (
                    <tr key={row.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.orderNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.actor.displayName}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {row.customer.name ?? "Walk-in customer"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.customer.email ?? "No email"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(row.balanceMinor, currency)}
                      </TableCell>
                      <TableCell>{formatDateTime(row.dueAt)}</TableCell>
                      <TableCell>
                        {row.aging.bucket.replaceAll("_", " ")}
                      </TableCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <ReportShell>
          <SectionHeader
            title="Payment reconciliation"
            description="Expected cash against closeout declarations by session."
            csvFilename="retail-ops-payment-reconciliation.csv"
            csvRows={reconciliationCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Session</TableHeading>
                  <TableHeading>Attendant</TableHeading>
                  <TableHeading>Status</TableHeading>
                  <TableHeading>Receipts</TableHeading>
                  <TableHeading>Expected cash</TableHeading>
                  <TableHeading>Declared cash</TableHeading>
                  <TableHeading>Variance</TableHeading>
                  <TableHeading>Closed</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {reconciliationState ? (
                  <EmptyRow colSpan={8} message={reconciliationState} />
                ) : (
                  filteredReconciliationRows.map((row) => {
                    const declaredCash =
                      row.closingFloatMinor ?? row.declarations?.cashMinor ?? 0
                    const cashVariance = row.variance.cashMinor ?? 0

                    return (
                      <tr key={row.id}>
                        <TableCell>
                          <span className="font-mono text-xs">{row.id}</span>
                        </TableCell>
                        <TableCell>{row.user.displayName}</TableCell>
                        <TableCell>{row.status.toLowerCase()}</TableCell>
                        <TableCell align="right">
                          {formatNumber(row.payments.receiptCount)}
                        </TableCell>
                        <TableCell align="right">
                          {formatMoney(row.expectedCashMinor, currency)}
                        </TableCell>
                        <TableCell align="right">
                          {formatMoney(declaredCash, currency)}
                        </TableCell>
                        <TableCell align="right">
                          <span
                            className={cn(
                              "font-medium",
                              cashVariance !== 0 && "text-amber-700",
                            )}
                          >
                            {formatMoney(cashVariance, currency)}
                          </span>
                        </TableCell>
                        <TableCell>{formatDateTime(row.closedAt)}</TableCell>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>

        <ReportShell>
          <SectionHeader
            title="Sync operations"
            description="Recent offline replay outcomes by status, device, and event counts."
            csvFilename="retail-ops-sync-operations.csv"
            csvRows={syncHistoryCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Status</TableHeading>
                  <TableHeading>Device</TableHeading>
                  <TableHeading>Total</TableHeading>
                  <TableHeading>Applied</TableHeading>
                  <TableHeading>Failed</TableHeading>
                  <TableHeading>Skipped</TableHeading>
                  <TableHeading>Last issue</TableHeading>
                  <TableHeading>Completed</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {syncHistoryState ? (
                  <EmptyRow colSpan={8} message={syncHistoryState} />
                ) : (
                  filteredSyncHistoryRows.map((row) => {
                    const lastError = getSyncRunLastError(row)

                    return (
                      <tr key={row.id}>
                        <TableCell>
                          <span
                            className={cn(
                              "rounded-full px-2 py-1 text-xs font-medium",
                              row.status === "succeeded" &&
                                "bg-emerald-50 text-emerald-700",
                              row.status === "failed" &&
                                "bg-red-50 text-red-700",
                              row.status === "partial" &&
                                "bg-amber-50 text-amber-700",
                              row.status === "skipped" &&
                                "bg-muted text-muted-foreground",
                            )}
                          >
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">
                            {row.deviceId ?? "unknown device"}
                          </span>
                        </TableCell>
                        <TableCell align="right">
                          {formatNumber(row.totalCount)}
                        </TableCell>
                        <TableCell align="right">
                          {formatNumber(row.appliedCount)}
                        </TableCell>
                        <TableCell align="right">
                          {formatNumber(row.failedCount)}
                        </TableCell>
                        <TableCell align="right">
                          {formatNumber(row.skippedCount)}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[260px]">
                            <p className="truncate text-sm">
                              {lastError?.errorMessage ?? "-"}
                            </p>
                            {lastError?.errorCode ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {lastError.errorCode}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{formatDateTime(row.completedAt)}</TableCell>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>

        <ReportShell className="2xl:col-span-2">
          <SectionHeader
            title="Sync conflict review"
            description="Unreviewed server conflicts with the next business action to resolve them."
            csvFilename="retail-ops-sync-conflicts.csv"
            csvRows={syncConflictsCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Event</TableHeading>
                  <TableHeading>Device</TableHeading>
                  <TableHeading>Actor</TableHeading>
                  <TableHeading>Issue</TableHeading>
                  <TableHeading>Action</TableHeading>
                  <TableHeading>Processed</TableHeading>
                  <TableHeading>Review</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {syncConflictState ? (
                  <EmptyRow colSpan={7} message={syncConflictState} />
                ) : (
                  filteredSyncConflictRows.map((row) => (
                    <tr key={row.id}>
                      <TableCell>
                        <div className="max-w-[260px]">
                          <p className="font-medium">
                            {formatSyncEventType(row.type)}
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {row.eventId}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {row.deviceId ?? "unknown device"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {row.actorUserId ?? "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[280px]">
                          <p className="truncate text-sm">
                            {row.errorMessage ?? "Conflict requires review"}
                          </p>
                          {row.errorCode ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {row.errorCode}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <p className="text-sm font-medium">
                            {row.resolutionAction}
                          </p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {row.resolutionDetail}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{formatDateTime(row.processedAt)}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={reviewSyncConflictMutation.isPending}
                          onClick={() => reviewSyncConflict(row.eventId)}
                          className="rounded-lg"
                        >
                          {reviewSyncConflictMutation.isPending
                            ? "Reviewing"
                            : "Review"}
                        </Button>
                      </TableCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {reviewSyncConflictMutation.error ? (
            <div className="border-t border-border/70 px-4 py-3 text-xs text-destructive">
              {reviewSyncConflictMutation.error.message}
            </div>
          ) : null}
        </ReportShell>
      </div>

      <div className="grid gap-6">
        <ReportShell>
          <SectionHeader
            title="Stock variance"
            description="Closeout inventory differences reported by attendants."
            csvFilename="retail-ops-stock-variance.csv"
            csvRows={varianceCsv}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="bg-muted/60">
                <tr>
                  <TableHeading>Product</TableHeading>
                  <TableHeading>Unit</TableHeading>
                  <TableHeading>Attendant</TableHeading>
                  <TableHeading>Expected</TableHeading>
                  <TableHeading>Counted</TableHeading>
                  <TableHeading>Variance</TableHeading>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {varianceState ? (
                  <EmptyRow colSpan={6} message={varianceState} />
                ) : (
                  filteredInventoryVarianceRows.map((row) => (
                    <tr
                      key={`${row.sessionId}:${row.productName}:${row.unitName}`}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.note ?? "No note"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{row.unitName}</TableCell>
                      <TableCell>{row.attendant}</TableCell>
                      <TableCell align="right">
                        {formatNumber(row.expectedQuantity)}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(row.countedQuantity)}
                      </TableCell>
                      <TableCell align="right">
                        <span className="font-medium text-amber-700">
                          {formatNumber(row.varianceQuantity)}
                        </span>
                      </TableCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ReportShell>
      </div>

      <div className="rounded-lg border border-border/70 bg-background px-4 py-3 text-xs text-muted-foreground print:hidden">
        {isLoading
          ? "Loading production report reads..."
          : "Report tables use tenant-scoped Retail Ops tRPC reads. Use PDF for browser print-to-PDF export. Durable stock ledgers, durable price-history tables, and packaged/scheduled exports remain future slices."}
      </div>
    </div>
  )
}
