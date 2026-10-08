import { ActionButton } from "@/components/mobile/action-button"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import {
  GhostPreview,
  QuickActionRow,
} from "@/components/mobile/green-till/kit"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
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

  if (kind !== "order")
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
            label={kind === "service" ? "Service added" : "Product added"}
            pill={{ label: "Saved", tone: "synced" }}
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
