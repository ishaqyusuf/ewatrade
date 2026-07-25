import { ActionButton } from "@/components/mobile/action-button"
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
  description: string
  eyebrow: string
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
      eyebrow: "Order queued",
      title: "Order saved successfully",
    }
  }

  if (kind === "order") {
    return {
      description:
        "The order has been recorded and is ready for the next step.",
      eyebrow: "Order created",
      title: "Sale complete",
    }
  }

  if (kind === "service") {
    return {
      description:
        "Your service is now available in the catalog and ready to use.",
      eyebrow: "Service created",
      title: "Your service is ready",
    }
  }

  return {
    description:
      "Your product is now available in the catalog and ready to use.",
    eyebrow: "Product created",
    title: "Your product is ready",
  }
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

          <Text className="text-center text-xs font-bold uppercase tracking-[1.8px] text-success">
            {copy.eyebrow}
          </Text>
          <Text className="mt-3 text-center text-3xl font-extrabold leading-9 text-foreground">
            {copy.title}
          </Text>
          <Text className="mt-3 max-w-[320px] text-center text-sm leading-6 text-muted-foreground">
            {copy.description}
          </Text>

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
