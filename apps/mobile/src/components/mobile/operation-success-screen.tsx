import { ActionButton } from "@/components/mobile/action-button"
import { commercialOrderHref } from "@/components/mobile/commerce/commerce-model"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import {
  GhostPreview,
  QuickActionRow,
  StatusPill,
} from "@/components/mobile/green-till/kit"
import { MobileScreen } from "@/components/mobile/screen"
import { Text } from "@/components/ui/text"
import type { OperationSuccessParams } from "@/lib/operation-success-navigation"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

function paymentLabel(paymentState: OperationSuccessParams["paymentState"]) {
  if (paymentState === "paid") return "Paid in full"
  if (paymentState === "partially_paid") return "Part payment"
  if (paymentState === "pending") return "Payment pending"

  return undefined
}

function SuccessDetailRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View className="min-h-12 flex-row items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text
        className="min-w-0 flex-1 text-right text-sm font-extrabold text-foreground"
        numberOfLines={2}
        selectable
      >
        {value}
      </Text>
    </View>
  )
}

export function OperationSuccessScreen({
  params,
}: {
  params: OperationSuccessParams
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const kind =
    params.kind === "order" ||
    params.kind === "product" ||
    params.kind === "service"
      ? params.kind
      : "order"

  if (kind === "order") return <SaleSuccess params={params} />
  return (
    <View className="flex-1 bg-background px-[18px]">
      <View
        style={{
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          paddingTop: Math.max(insets.top, 20) + 20,
        }}
      >
        <HeroCard
          cta={{
            icon: "Receipt",
            label: "Take your first order",
            onPress: () => router.replace("/create-sale-modal" as never),
            testID: "item-success-first-order",
          }}
          done
          sub="Available in your catalog. You can change it any time."
          testID="item-success-hero"
          title={`${params.name || "Your item"} is ready to sell`}
        />
        <QuickActionRow
          actions={[
            {
              icon: "Plus",
              label: "Add another",
              onPress: () =>
                router.replace("/first-product-setup-modal" as never),
            },
            {
              icon: "Package",
              label: "Catalog",
              onPress: () => router.replace("/catalog-items-modal" as never),
            },
            {
              icon: "House",
              label: "Home",
              onPress: () => router.replace("/dashboard"),
            },
          ]}
        />
        <GhostPreview message="Today’s sales appear on Home after your first order." />
      </View>
    </View>
  )
}

function SaleSuccess({ params }: { params: OperationSuccessParams }) {
  const router = useRouter()
  const queued = params.status === "queued"
  const method =
    params.paymentMethod === "cash"
      ? "Cash"
      : params.paymentMethod === "bank_transfer"
        ? "Transfer"
        : params.paymentMethod === "pos"
          ? "POS"
          : undefined
  return (
    <MobileScreen contentClassName="gap-4 px-[18px]">
      <HeroCard
        label={queued ? "Order queued" : "Sale recorded"}
        amount={params.amount}
        sub={
          queued
            ? "Saved on this device. It will sync when you reconnect."
            : params.reference
        }
        pill={{
          label: queued ? "Pending sync" : "Recorded",
          tone: queued ? "offline" : "synced",
        }}
        stats={[
          { label: "Customer", value: params.customer || "Walk-in" },
          {
            label: "In this sale",
            value: `${params.itemCount ?? "0"} items${params.unitCount ? ` · ${params.unitCount} units` : ""}`,
          },
        ]}
      />
      <View className="gap-3 rounded-[20px] bg-card p-3.5">
        <StatusPill
          label={paymentLabel(params.paymentState) ?? "Payment pending"}
          tone={params.paymentState === "paid" ? "ok" : "warn"}
        />
        {method ? (
          <SuccessDetailRow label="Payment method" value={method} />
        ) : null}
        {params.balance && params.paymentState !== "paid" ? (
          <SuccessDetailRow label="Balance due" value={params.balance} />
        ) : null}
      </View>
      <ActionButton
        tone="gold"
        icon="Plus"
        onPress={() => router.replace("/create-sale-modal")}
      >
        New sale
      </ActionButton>
      <ActionButton
        tone="soft"
        icon="Receipt"
        disabled={queued || !params.orderId}
        onPress={() => {
          if (params.orderId && !queued)
            router.push({
              pathname: "/order-receipts-modal",
              params: { orderIds: params.orderId },
            })
        }}
      >
        {queued ? "Receipt available after sync" : "Receipt"}
      </ActionButton>
      {queued ? (
        <ActionButton
          variant="outline"
          onPress={() => router.push("/sync-status-modal")}
        >
          View sync status
        </ActionButton>
      ) : params.orderId ? (
        <ActionButton
          variant="outline"
          onPress={() => {
            if (params.orderId) router.push(commercialOrderHref(params.orderId))
          }}
        >
          View order
        </ActionButton>
      ) : null}
      <ActionButton
        variant="ghost"
        accessibilityLabel="Go to home"
        onPress={() => router.replace("/dashboard")}
      >
        Go to home
      </ActionButton>
    </MobileScreen>
  )
}
