import { ActionButton } from "@/components/mobile/action-button"
import { commercialOrderHref } from "@/components/mobile/commerce/commerce-model"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { StatusPill } from "@/components/mobile/green-till/kit"
import { MobileScreen } from "@/components/mobile/screen"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import type {
  OperationSuccessKind,
  OperationSuccessParams,
} from "@/lib/operation-success-navigation"
import { useRouter } from "expo-router"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type SuccessCopy = {
  description?: string
  title: string
}

function getSuccessCopy(
  kind: OperationSuccessKind,
  status: OperationSuccessParams["status"],
): SuccessCopy {
  if (kind === "order" && status === "queued") {
    return {
      description:
        "The order is saved on this device and will sync when you are back online.",
      title: "Order queued",
    }
  }

  if (kind === "order") return { title: "Order created" }
  if (kind === "service") return { title: "Service added" }
  return { title: "Product added" }
}

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
  const market = useMobileDesign("create-sale") === "market-day"
  const kind =
    params.kind === "order" ||
    params.kind === "product" ||
    params.kind === "service"
      ? params.kind
      : "order"
  const copy = getSuccessCopy(kind, params.status)
  const resolvedPaymentLabel = paymentLabel(params.paymentState)
  const itemLabel =
    params.itemCount === "1" ? "1 item" : `${params.itemCount ?? "0"} items`

  if (kind === "order" && !market) return <SaleSuccess params={params} />

  return (
    <View className="flex-1 bg-background">
      <View
        style={{
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          paddingTop: Math.max(insets.top, 20) + 20,
          flex: 1,
        }}
      >
        <View className="flex-1 items-center justify-center px-6 py-8">
          <View className="mb-7 h-28 w-28 items-center justify-center rounded-full bg-success/10">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-success">
              <Icon
                className="size-2xl text-success-foreground"
                name="Check"
                strokeWidth={2.4}
              />
            </View>
          </View>

          <Text className="mt-3 text-center text-3xl font-extrabold leading-9 text-foreground">
            {copy.title}
          </Text>
          {copy.description ? (
            <Text className="mt-3 max-w-[320px] text-center text-sm leading-6 text-muted-foreground">
              {copy.description}
            </Text>
          ) : null}

          <View className="mt-8 w-full rounded-2xl bg-muted px-4">
            {kind === "order" ? (
              <>
                {params.reference ? (
                  <SuccessDetailRow label="Order" value={params.reference} />
                ) : null}
                {params.amount ? (
                  <SuccessDetailRow label="Total" value={params.amount} />
                ) : null}
                <SuccessDetailRow label="Items" value={itemLabel} />
                <SuccessDetailRow
                  label="Customer"
                  value={params.customer || "Guest customer"}
                />
                {resolvedPaymentLabel ? (
                  <SuccessDetailRow
                    label="Payment"
                    value={resolvedPaymentLabel}
                  />
                ) : null}
              </>
            ) : (
              <>
                <SuccessDetailRow
                  label={kind === "service" ? "Service" : "Product"}
                  value={params.name || "New catalog item"}
                />
                <SuccessDetailRow
                  label="Type"
                  value={kind === "service" ? "Service" : "Product"}
                />
                <SuccessDetailRow label="Status" value="Available in catalog" />
              </>
            )}
          </View>
        </View>

        <View className="px-6">
          <ActionButton
            accessibilityLabel="Go to home"
            onPress={() => router.replace("/dashboard")}
            trailingIcon="ArrowRight"
          >
            Go to home
          </ActionButton>
        </View>
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
