import { MobileAppShell, StatusBanner } from "@/components/mobile";
import { Icon } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { useAuthContext } from "@/hooks/use-auth";
import { isSalesRepRole } from "@/lib/mobile-roles";
import {
  activeBusinessOfflineCommands,
  getOfflineProvisionalProjection,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore";
import { useOperationalModeStore } from "@/store/operationalModeStore";
import { useTRPC } from "@/trpc/client";
import { formatMinorMoney } from "@ewatrade/utils";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";

export function OperationsDashboardSurface() {
  const router = useRouter();
  const trpc = useTRPC();
  const { profile } = useAuthContext();
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode);
  const allCommands = useOfflineCommandStore((state) => state.commands);
  const commands = activeBusinessOfflineCommands(
    allCommands,
    profile?.businessId,
  );
  const provisional = getOfflineProvisionalProjection(commands);
  const isAttendant = isSalesRepRole(profile?.role);
  const catalog = useQuery(
    trpc.catalog.listItems.queryOptions(
      {},
      { enabled: !isOffline, retry: false },
    ),
  );
  const orders = useQuery(
    trpc.orders.list.queryOptions(
      { limit: 8 },
      { enabled: !isOffline, retry: false },
    ),
  );
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: false },
      { enabled: !isOffline && !isAttendant, retry: false },
    ),
  );
  const service = useQuery(
    trpc.services.queue.queryOptions(
      { limit: 8 },
      { enabled: !isOffline, retry: false },
    ),
  );
  const orderRows = orders.data ?? [];
  const currency = profile?.currencyCode ?? "NGN";
  const orderValue = orderRows.reduce(
    (total, order) => total + order.totalMinor,
    0,
  );
  const hasProduct = catalog.data?.some((item) => item.kind === "product");
  const packagedBalanceCount =
    balances.data?.rows.filter((row) => row.kind === "PACKAGED_STOCK").length ??
    0;
  const navItems = [
    {
      icon: "home" as const,
      isActive: true,
      label: "Home",
      onPress: () => undefined,
    },
    {
      icon: "Warehouse" as const,
      label: "Catalog",
      onPress: () => router.push("/catalog-items-modal" as never),
      ownerOnly: true,
    },
    {
      icon: "Wrench" as const,
      label: "Work",
      onPress: () => router.push("/service-jobs-modal" as never),
    },
    {
      icon: "analytics" as const,
      label: "Reports",
      onPress: () => router.push("/reports-modal" as never),
      ownerOnly: true,
    },
  ];

  return (
    <MobileAppShell
      businessName={profile?.businessName ?? "Business"}
      centralAction={{
        icon: "Plus",
        label: "New order",
        onPress: () => router.push("/create-sale-modal" as never),
      }}
      navItems={navItems}
      role={isAttendant ? "attendant" : "owner"}
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

      <View className="rounded-3xl border border-border bg-card p-5">
        <View className="flex-row items-center justify-between border-b border-border pb-4">
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
        <View className="flex-row items-center justify-between pt-4">
          <Metric
            label="Balances"
            value={String(
              (balances.data?.rows.length ?? 0) +
                provisional.inventoryOperations,
            )}
          />
          <View className="h-9 w-px bg-border" />
          <Metric
            label="Active work"
            value={String(
              (service.data?.length ?? 0) + provisional.serviceOperations,
            )}
          />
        </View>
      </View>

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
          {isAttendant ? (
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
          <QuickAction
            icon="Lock"
            label="App lock"
            onPress={() => router.push("/app-lock-modal" as never)}
          />
          {!isAttendant ? (
            <QuickAction
              icon="CreditCard"
              label="Plans"
              onPress={() => router.push("/subscription-modal" as never)}
            />
          ) : null}
        </View>
      </View>

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
        ) : orderRows.length === 0 ? (
          <View className="items-center gap-2 rounded-3xl border border-dashed border-border p-8">
            <Icon className="size-base text-muted-foreground" name="Receipt" />
            <Text className="font-bold text-foreground">No orders yet</Text>
            <Text className="text-center text-sm text-muted-foreground">
              Your Product and Service Offerings will appear in one order flow.
            </Text>
          </View>
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

      {(catalog.data?.length ?? 0) === 0 && !catalog.isLoading ? (
        <Pressable
          className="flex-row items-center gap-3 rounded-3xl bg-primary p-5"
          haptic
          onPress={() => router.push("/first-product-setup-modal" as never)}
        >
          <Icon className="size-base text-primary-foreground" name="Plus" />
          <View className="min-w-0 flex-1">
            <Text className="font-extrabold text-primary-foreground">
              Add your first item
            </Text>
            <Text className="mt-1 text-sm text-primary-foreground">
              Create a Product or Service with the shortest valid setup.
            </Text>
          </View>
        </Pressable>
      ) : null}
    </MobileAppShell>
  );
}

export default OperationsDashboardSurface;

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
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: "ClipboardCheck" | "CreditCard" | "Lock" | "RefreshCw" | "Warehouse";
  label: string;
  onPress: () => void;
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
  );
}
