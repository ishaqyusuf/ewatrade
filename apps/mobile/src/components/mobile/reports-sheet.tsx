import { ActionButton } from "@/components/mobile/action-button";
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useBusinessStore } from "@/store/businessStore";
import {
  type RetailOpsCloseout,
  type RetailOpsProduct,
  type RetailOpsSale,
  type RetailOpsStockMovement,
  type RetailOpsSyncSummary,
  useRetailOpsStore,
} from "@/store/retailOpsStore";
import { useTRPC } from "@/trpc/client";
import { formatMoney } from "@ewatrade/utils";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useMemo } from "react";
import { View } from "react-native";

type ReportsSheetProps = {
  onComplete?: () => void;
};

type ReportMetric = {
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
  value: string;
};

type ReportRowItem = {
  detail?: string;
  id: string;
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
  value: string;
};

type ProductionInventoryRow = {
  onHandQuantity: number;
  priceMinor: number;
  productId: string;
  productName: string;
  unitId: string;
  unitName: string;
};

type ProductionSalesByProductRow = {
  grossMinor: number;
  productId: string;
  productName: string;
  quantity: number;
  unitName: string;
};

type ProductionSalesByRepRow = {
  cashMinor: number;
  creditMinor: number;
  displayName: string;
  grossMinor: number;
  orderCount: number;
  quantity: number;
  transferMinor: number;
};

type ProductionCreditSaleRow = {
  actor: {
    displayName: string;
  };
  aging: {
    bucket: string;
    overdueDays: number;
  };
  balanceMinor: number;
  currencyCode: string;
  customer: {
    name: string | null;
  };
  dueAt: Date | string | null;
  id: string;
  orderNumber: string;
};

type ProductionPaymentReconciliationRow = {
  closedAt: Date | string | null;
  expectedCashMinor: number;
  id: string;
  review: {
    status: string;
  } | null;
  user: {
    displayName: string;
  };
  variance: {
    cardMinor: number | null;
    cashMinor: number | null;
    creditMinor: number | null;
    transferMinor: number | null;
  };
};

function isActiveBusinessRecord(
  record: {
    businessId?: string;
  },
  activeBusinessId: string | null,
) {
  return (
    !activeBusinessId ||
    (record.businessId ?? activeBusinessId) === activeBusinessId
  );
}

function formatQuantity(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

function isToday(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatReportDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown time";

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function getPaymentTotals(sales: RetailOpsSale[]) {
  return sales.reduce(
    (totals, sale) => {
      if (sale.paymentMethod === "cash") {
        totals.cash += sale.total;
      } else {
        totals.transfer += sale.total;
      }

      totals.gross += sale.total;

      return totals;
    },
    {
      cash: 0,
      gross: 0,
      transfer: 0,
    },
  );
}

function getProductStockRows(products: RetailOpsProduct[]): ReportRowItem[] {
  return products.flatMap((product) => {
    const primaryStock = product.currentStock ?? product.startingStock ?? 0;
    const primaryRow = {
      detail: `${formatMoney(product.price, "NGN")} per ${product.unitName}`,
      id: `${product.id}-primary`,
      label: `${product.name} - ${product.unitName}`,
      tone:
        primaryStock <= 0
          ? "danger"
          : primaryStock <= 5
            ? "warning"
            : "default",
      value: formatQuantity(primaryStock),
    } satisfies ReportRowItem;
    const variantRows = product.variants.map((variant) => {
      const variantStock = variant.currentStock ?? variant.startingStock ?? 0;

      return {
        detail: `${formatMoney(variant.price, "NGN")} per ${variant.name}`,
        id: `${product.id}-${variant.id}`,
        label: `${product.name} - ${variant.name}`,
        tone:
          variantStock <= 0
            ? "danger"
            : variantStock <= 5
              ? "warning"
              : "default",
        value: formatQuantity(variantStock),
      } satisfies ReportRowItem;
    });

    return [primaryRow, ...variantRows];
  });
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
  }));
}

function getSalesByRepRows(sales: RetailOpsSale[]): ReportRowItem[] {
  const grouped = new Map<
    string,
    {
      count: number;
      total: number;
    }
  >();

  for (const sale of sales) {
    const current = grouped.get(sale.attendantName) ?? {
      count: 0,
      total: 0,
    };

    grouped.set(sale.attendantName, {
      count: current.count + 1,
      total: current.total + sale.total,
    });
  }

  return Array.from(grouped.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([attendantName, summary]) => ({
      detail: `${summary.count} sale${summary.count === 1 ? "" : "s"}`,
      id: attendantName,
      label: attendantName,
      value: formatMoney(summary.total, "NGN"),
    }));
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
  }));
}

function getSalesByProductRows(sales: RetailOpsSale[]): ReportRowItem[] {
  const grouped = new Map<
    string,
    {
      quantity: number;
      total: number;
      unitName: string;
    }
  >();

  for (const sale of sales) {
    const key = `${sale.productName}-${sale.unitName}`;
    const current = grouped.get(key) ?? {
      quantity: 0,
      total: 0,
      unitName: sale.unitName,
    };

    grouped.set(key, {
      quantity: current.quantity + sale.quantity,
      total: current.total + sale.total,
      unitName: sale.unitName,
    });
  }

  return Array.from(grouped.entries())
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([label, summary]) => ({
      detail: `${formatQuantity(summary.quantity)} ${summary.unitName}`,
      id: label,
      label,
      value: formatMoney(summary.total, "NGN"),
    }));
}

function getProductionSalesByProductRows(
  salesByProduct: ProductionSalesByProductRow[],
): ReportRowItem[] {
  return salesByProduct.map((row) => ({
    detail: `${formatQuantity(row.quantity)} ${row.unitName}`,
    id: `${row.productId}-${row.unitName}`,
    label: `${row.productName} - ${row.unitName}`,
    value: formatMoney(row.grossMinor, "NGN"),
  }));
}

function stockMovementLabel(type: RetailOpsStockMovement["type"]) {
  if (type === "conversion_in") return "Conversion in";
  if (type === "conversion_out") return "Conversion out";
  if (type === "opening_stock") return "Opening stock";
  if (type === "stock_adjustment") return "Stock adjustment";
  if (type === "stock_intake") return "Stock intake";
  return "Sale";
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
    }));
}

function getVarianceRows(closeouts: RetailOpsCloseout[]): ReportRowItem[] {
  const latestCloseout = closeouts[0];

  if (!latestCloseout) return [];

  const paymentRows = [
    {
      detail: "Expected versus declared cash",
      id: `${latestCloseout.id}-cash`,
      label: "Cash variance",
      tone:
        latestCloseout.cashVariance === 0
          ? "success"
          : latestCloseout.cashVariance < 0
            ? "danger"
            : "warning",
      value: formatMoney(latestCloseout.cashVariance, "NGN"),
    },
    {
      detail: "Expected versus declared transfer",
      id: `${latestCloseout.id}-transfer`,
      label: "Transfer variance",
      tone:
        latestCloseout.transferVariance === 0
          ? "success"
          : latestCloseout.transferVariance < 0
            ? "danger"
            : "warning",
      value: formatMoney(latestCloseout.transferVariance, "NGN"),
    },
  ] satisfies ReportRowItem[];
  const stockRows = latestCloseout.inventoryLines
    .filter((line) => line.variance !== 0)
    .map((line) => ({
      detail: `${line.unitName} closing stock`,
      id: `${latestCloseout.id}-${line.productId}-${line.variantId ?? "primary"}`,
      label: line.productName,
      tone: line.variance < 0 ? "danger" : "warning",
      value: `${line.variance > 0 ? "+" : ""}${formatQuantity(line.variance)}`,
    })) satisfies ReportRowItem[];

  return [...paymentRows, ...stockRows];
}

function formatVarianceValue(value: number | null) {
  if (value === null) return "Not declared";

  return formatMoney(value, "NGN");
}

function getVarianceTone(value: number | null): ReportRowItem["tone"] {
  if (value === null) return "default";
  if (value === 0) return "success";

  return value < 0 ? "danger" : "warning";
}

function getProductionVarianceRows(
  reconciliationRows: ProductionPaymentReconciliationRow[],
): ReportRowItem[] {
  return reconciliationRows.flatMap((row) => {
    const detail = `${row.user.displayName} · ${
      row.closedAt ? formatReportDateTime(row.closedAt) : "Open session"
    }`;

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
    ] satisfies ReportRowItem[];
  });
}

function getProductionCreditSaleRows(
  creditSales: ProductionCreditSaleRow[],
): ReportRowItem[] {
  return creditSales.map((sale) => ({
    detail: `${sale.customer.name ?? "Customer"} · ${
      sale.actor.displayName
    } · ${
      sale.dueAt ? `Due ${formatReportDateTime(sale.dueAt)}` : "No due date"
    } · ${sale.aging.overdueDays} overdue day${
      sale.aging.overdueDays === 1 ? "" : "s"
    }`,
    id: sale.id,
    label: sale.orderNumber,
    tone: sale.aging.bucket === "overdue" ? "danger" : "warning",
    value: formatMoney(sale.balanceMinor, sale.currencyCode),
  }));
}

function getLastSyncTone(
  status: RetailOpsSyncSummary["status"],
): ReportMetric["tone"] {
  if (status === "failed") return "danger";
  if (status === "partial") return "warning";

  return "success";
}

function getSyncOperationRows({
  conflictSyncCount,
  failedSyncCount,
  isOfflineMode,
  lastSyncSummary,
  offlineDeviceId,
  pendingSyncCount,
}: {
  conflictSyncCount: number;
  failedSyncCount: number;
  isOfflineMode: boolean;
  lastSyncSummary?: RetailOpsSyncSummary;
  offlineDeviceId: string;
  pendingSyncCount: number;
}): ReportRowItem[] {
  const openSyncCount = pendingSyncCount + failedSyncCount + conflictSyncCount;
  const queueTone =
    failedSyncCount > 0 || conflictSyncCount > 0
      ? "danger"
      : pendingSyncCount > 0
        ? "warning"
        : "success";

  return [
    {
      detail: isOfflineMode
        ? "Local sales stay on this device until replay."
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
  ];
}

function ReportMetricCard({ label, tone = "default", value }: ReportMetric) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-card p-4">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </Text>
      <Text
        className={cn(
          "mt-2 text-lg font-bold",
          tone === "success" && "text-emerald-700",
          tone === "warning" && "text-amber-700",
          tone === "danger" && "text-destructive",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </Text>
    </View>
  );
}

function ReportRow({ item }: { item: ReportRowItem }) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl bg-muted px-3 py-3">
      <View className="flex-1 gap-1">
        <Text className="text-sm font-semibold text-foreground">
          {item.label}
        </Text>
        {item.detail ? (
          <Text className="text-xs text-muted-foreground">{item.detail}</Text>
        ) : null}
      </View>
      <Text
        className={cn(
          "text-sm font-bold",
          item.tone === "success" && "text-emerald-700",
          item.tone === "warning" && "text-amber-700",
          item.tone === "danger" && "text-destructive",
          (!item.tone || item.tone === "default") && "text-foreground",
        )}
      >
        {item.value}
      </Text>
    </View>
  );
}

function ReportSection({
  empty,
  rows,
  title,
}: {
  empty: string;
  rows: ReportRowItem[];
  title: string;
}) {
  return (
    <View className="gap-3">
      <Text className="text-base font-bold text-foreground">{title}</Text>
      {rows.length > 0 ? (
        <View className="gap-2">
          {rows.map((item) => (
            <ReportRow item={item} key={item.id} />
          ))}
        </View>
      ) : (
        <View className="rounded-2xl border border-dashed border-border p-4">
          <Text className="text-sm leading-5 text-muted-foreground">
            {empty}
          </Text>
        </View>
      )}
    </View>
  );
}

export const ReportsSheet = forwardRef<BottomSheetModal, ReportsSheetProps>(
  ({ onComplete }, ref) => {
    const trpc = useTRPC();
    const activeBusinessId = useBusinessStore(
      (state) => state.activeBusinessId,
    );
    const closeouts = useRetailOpsStore((state) =>
      state.closeouts.filter((closeout) =>
        isActiveBusinessRecord(closeout, activeBusinessId),
      ),
    );
    const products = useRetailOpsStore((state) =>
      state.products.filter((product) =>
        isActiveBusinessRecord(product, activeBusinessId),
      ),
    );
    const sales = useRetailOpsStore((state) =>
      state.sales.filter((sale) =>
        isActiveBusinessRecord(sale, activeBusinessId),
      ),
    );
    const stockMovements = useRetailOpsStore((state) =>
      state.stockMovements.filter((movement) =>
        isActiveBusinessRecord(movement, activeBusinessId),
      ),
    );
    const syncEvents = useRetailOpsStore((state) =>
      state.syncEvents.filter((event) =>
        isActiveBusinessRecord(event, activeBusinessId),
      ),
    );
    const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode);
    const lastSyncSummary = useRetailOpsStore((state) => state.lastSyncSummary);
    const offlineDeviceId = useRetailOpsStore((state) => state.offlineDeviceId);
    const reportRange = useMemo(() => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);

      return {
        from,
        to: new Date(),
      };
    }, []);
    const canReadProductionReports = !isOfflineMode;
    const summaryQuery = useQuery(
      trpc.retailOps.summary.queryOptions(reportRange, {
        enabled: canReadProductionReports,
        retry: false,
      }),
    );
    const inventoryQuery = useQuery(
      trpc.retailOps.inventory.queryOptions(
        {},
        {
          enabled: canReadProductionReports,
          retry: false,
        },
      ),
    );
    const salesByRepQuery = useQuery(
      trpc.retailOps.salesByRep.queryOptions(reportRange, {
        enabled: canReadProductionReports,
        retry: false,
      }),
    );
    const salesByProductQuery = useQuery(
      trpc.retailOps.salesByProduct.queryOptions(reportRange, {
        enabled: canReadProductionReports,
        retry: false,
      }),
    );
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
    );
    const paymentReconciliationQuery = useQuery(
      trpc.retailOps.paymentReconciliation.queryOptions(reportRange, {
        enabled: canReadProductionReports,
        retry: false,
      }),
    );
    const todaySales = useMemo(
      () => sales.filter((sale) => isToday(sale.createdAt)),
      [sales],
    );
    const todayTotals = useMemo(
      () => getPaymentTotals(todaySales),
      [todaySales],
    );
    const latestCloseout = closeouts[0] ?? null;
    const pendingSyncCount = syncEvents.filter(
      (event) => event.status === "pending",
    ).length;
    const failedSyncCount = syncEvents.filter(
      (event) => event.status === "failed",
    ).length;
    const conflictSyncCount = syncEvents.filter(
      (event) => event.status === "conflict",
    ).length;
    const openSyncCount =
      pendingSyncCount + failedSyncCount + conflictSyncCount;
    const summary = summaryQuery.data;
    const reconciliationRows = useMemo(
      () => paymentReconciliationQuery.data ?? [],
      [paymentReconciliationQuery.data],
    );
    const latestProductionCloseout = reconciliationRows[0] ?? null;
    const productStockRows = useMemo(
      () =>
        inventoryQuery.data?.length
          ? getProductionStockRows(inventoryQuery.data)
          : getProductStockRows(products),
      [inventoryQuery.data, products],
    );
    const salesByRepRows = useMemo(
      () =>
        salesByRepQuery.data?.length
          ? getProductionSalesByRepRows(salesByRepQuery.data)
          : getSalesByRepRows(todaySales),
      [salesByRepQuery.data, todaySales],
    );
    const salesByProductRows = useMemo(
      () =>
        salesByProductQuery.data?.length
          ? getProductionSalesByProductRows(salesByProductQuery.data)
          : getSalesByProductRows(todaySales),
      [salesByProductQuery.data, todaySales],
    );
    const creditSaleRows = useMemo(
      () => getProductionCreditSaleRows(creditSalesQuery.data ?? []),
      [creditSalesQuery.data],
    );
    const movementRows = useMemo(
      () => getMovementRows(stockMovements),
      [stockMovements],
    );
    const varianceRows = useMemo(
      () =>
        reconciliationRows.length > 0
          ? getProductionVarianceRows(reconciliationRows)
          : getVarianceRows(closeouts),
      [closeouts, reconciliationRows],
    );
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
    );
    const reportSourceRows = useMemo(() => {
      const queryErrors = [
        summaryQuery.isError,
        inventoryQuery.isError,
        salesByRepQuery.isError,
        salesByProductQuery.isError,
        creditSalesQuery.isError,
        paymentReconciliationQuery.isError,
      ].filter(Boolean).length;
      const queryFetching = [
        summaryQuery.isFetching,
        inventoryQuery.isFetching,
        salesByRepQuery.isFetching,
        salesByProductQuery.isFetching,
        creditSalesQuery.isFetching,
        paymentReconciliationQuery.isFetching,
      ].some(Boolean);

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
      ] satisfies ReportRowItem[];
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
    ]);

    return (
      <Modal enableDynamicSizing ref={ref} snapPoints={["92%"]} title="Reports">
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={112}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-6">
            <View className="gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Icon className="size-base text-primary" name="BarChart3" />
              </View>
              <View className="gap-2">
                <Text className="text-xl font-bold text-foreground">
                  Retail reports
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  Today, stock, payment, variance, and movement snapshots for
                  the active business.
                </Text>
              </View>
            </View>

            <ReportSection
              empty="Report source is not available."
              rows={reportSourceRows}
              title="Source"
            />

            <View className="flex-row gap-3">
              <ReportMetricCard
                label="Today sales"
                value={formatMoney(
                  summary?.sales.totalMinor ?? todayTotals.gross,
                  "NGN",
                )}
              />
              <ReportMetricCard
                label="Transactions"
                value={String(summary?.sales.orderCount ?? todaySales.length)}
              />
            </View>

            <View className="flex-row gap-3">
              <ReportMetricCard
                label="Expected cash"
                value={formatMoney(
                  latestProductionCloseout?.expectedCashMinor ??
                    summary?.payments.cashMinor ??
                    todayTotals.cash,
                  "NGN",
                )}
              />
              <ReportMetricCard
                label="Transfer"
                value={formatMoney(
                  summary?.payments.transferMinor ?? todayTotals.transfer,
                  "NGN",
                )}
              />
            </View>

            <View className="flex-row gap-3">
              <ReportMetricCard
                label="Open sync"
                tone={openSyncCount > 0 ? "warning" : "success"}
                value={String(openSyncCount)}
              />
              <ReportMetricCard
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

            <View className="rounded-2xl bg-muted p-4">
              <Text className="text-sm leading-5 text-muted-foreground">
                Export-ready report tables are reserved for the production
                reporting slice.
              </Text>
            </View>

            <ActionButton onPress={onComplete} variant="outline">
              Done
            </ActionButton>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    );
  },
);

ReportsSheet.displayName = "ReportsSheet";
