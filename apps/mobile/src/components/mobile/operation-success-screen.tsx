import { ActionButton } from "@/components/mobile/action-button"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import {
  GhostPreview,
  QuickActionRow,
  StatusPill,
} from "@/components/mobile/green-till/kit"
import { MobileScreen } from "@/components/mobile/screen"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { isSalesRepRole } from "@/lib/mobile-roles"
import {
  type OperationSuccessParams,
  type OutcomeExit,
  exitOutcome,
  rebaseOutcomeOnHome,
} from "@/lib/operation-success-navigation"
import { useRoute } from "@react-navigation/native"
import { useNavigation, useRouter } from "expo-router"
import { useEffect, useRef } from "react"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { WhatsAppFollowUp } from "./customer-messages/whatsapp-action"

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
  const internalUse = kind === "product" && params.usage === "INTERNAL_USE"
  return (
    <View className="flex-1 bg-background px-[18px]">
      <View
        style={{
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          paddingTop: Math.max(insets.top, 20) + 20,
        }}
      >
        <HeroCard
          cta={
            internalUse
              ? {
                  icon: "Package",
                  label: "Open catalog",
                  onPress: () =>
                    router.replace("/catalog-items-modal" as never),
                  testID: "item-success-catalog",
                }
              : {
                  icon: "Receipt",
                  label: "Take your first order",
                  onPress: () => router.replace("/create-sale-modal" as never),
                  testID: "item-success-first-order",
                }
          }
          done
          sub={
            internalUse
              ? "Hidden from customer orders. Record its stock with Stock in."
              : "Available in your catalog. You can change it any time."
          }
          testID="item-success-hero"
          title={
            internalUse
              ? `${params.name || "Your item"} is saved for business use`
              : `${params.name || "Your item"} is ready to sell`
          }
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
        {internalUse ? null : (
          <GhostPreview message="Today’s sales appear on Home after your first order." />
        )}
      </View>
    </View>
  )
}

function SaleSuccess({ params }: { params: OperationSuccessParams }) {
  const navigation = useNavigation()
  const route = useRoute()
  const { profile } = useAuthContext()
  const salesRep = isSalesRepRole(profile?.role)
  // Cold or direct entry: guarantee Home under this outcome (same route key),
  // so system back and swipe reach Home. Every action then leaves the outcome.
  const rebased = useRef(false)
  useEffect(() => {
    if (rebased.current) return
    rebased.current = true
    rebaseOutcomeOnHome(
      navigation,
      { key: route.key, name: route.name, params: route.params },
      { salesRep },
    )
  }, [navigation, route.key, route.name, route.params, salesRep])
  const leave = (exit: OutcomeExit) =>
    exitOutcome(navigation, exit, { salesRep })
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
        {params.moneyAccount && params.paymentState !== "pending" ? (
          <SuccessDetailRow
            label={queued ? "Into, once synced" : "Into"}
            value={params.moneyAccount}
          />
        ) : null}
        {params.balance && params.paymentState !== "paid" ? (
          <SuccessDetailRow label="Balance due" value={params.balance} />
        ) : null}
      </View>
      {/* Only a recorded Order; a queued sale has no server Order yet. The
          server hides it when the Order has no customer phone. */}
      {!queued && params.orderId ? (
        <WhatsAppFollowUp
          done="Sale recorded."
          hasPhone
          // Leave the outcome first: history becomes Home → composer.
          onOpen={() => {
            if (params.orderId)
              leave({
                to: "customer-message",
                orderId: params.orderId,
                eventKey: "order.recorded",
              })
          }}
          target={{ orderId: params.orderId, eventKey: "order.recorded" }}
        />
      ) : null}
      <ActionButton
        tone="gold"
        icon="Plus"
        onPress={() =>
          leave({ to: "new-sale", service: params.saleKind === "service" })
        }
      >
        New sale
      </ActionButton>
      <ActionButton
        tone="soft"
        icon="Receipt"
        disabled={queued || !params.orderId}
        onPress={() => {
          if (params.orderId && !queued)
            leave({ to: "receipt", orderId: params.orderId })
        }}
      >
        {queued ? "Receipt available after sync" : "Receipt"}
      </ActionButton>
      {queued ? (
        <ActionButton
          variant="outline"
          onPress={() => leave({ to: "sync-status" })}
        >
          View sync status
        </ActionButton>
      ) : params.orderId ? (
        <ActionButton
          variant="outline"
          onPress={() => {
            if (params.orderId) leave({ to: "order", orderId: params.orderId })
          }}
        >
          View order
        </ActionButton>
      ) : null}
      <ActionButton
        variant="ghost"
        accessibilityLabel="Go to home"
        onPress={() => leave({ to: "home" })}
      >
        Go to home
      </ActionButton>
    </MobileScreen>
  )
}
