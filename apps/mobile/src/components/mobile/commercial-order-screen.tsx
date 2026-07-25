import { ActionButton } from "@/components/mobile/action-button"
import {
  CommercialOrderOverviewContent,
  CommercialOrderOverviewHeader,
  CommercialOrderOverviewPrimaryAction,
} from "@/components/mobile/commerce/commercial-order-overview"
import { buildCommercialOrderActivity } from "@/components/mobile/commerce/commercial-order-overview-model"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { MoneyField } from "@/components/mobile/money-field"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  formatMinorMoney,
  majorToMinor,
  minorToMajorInput,
} from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useRouter } from "expo-router"
import { useMemo, useState } from "react"

type PaymentMethod = RouterInputs["orders"]["recordPayment"]["method"]

const PAYMENT_METHODS: Array<[PaymentMethod, string]> = [
  ["cash", "Cash"],
  ["bank_transfer", "Transfer"],
  ["pos", "POS"],
  ["card", "Card"],
  ["other", "Other"],
]

export function CommercialOrderScreen({ orderId }: { orderId: string }) {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const paymentModal = useModal()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [amountPaid, setAmountPaid] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const orderQuery = useQuery(
    trpc.orders.get.queryOptions(
      { orderId },
      { enabled: !isOffline, retry: false },
    ),
  )
  const cachedOrders = useQuery(
    trpc.orders.list.queryOptions(
      { limit: 100 },
      { enabled: false, retry: false },
    ),
  )
  const order =
    orderQuery.data ??
    cachedOrders.data?.find((candidate) => candidate.id === orderId) ??
    null

  async function refreshOrderQueries() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.orders.get.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.customerCount.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
      queryClient.invalidateQueries(trpc.catalog.listItemsPage.queryFilter()),
      queryClient.invalidateQueries(trpc.inventory.balanceReport.queryFilter()),
    ])
  }

  const paymentMutation = useMutation(
    trpc.orders.recordPayment.mutationOptions({
      onError: (failure) => {
        setNotice(null)
        setError(failure.message)
      },
      onSuccess: async () => {
        setAmountPaid("")
        setError(null)
        setNotice("Payment recorded.")
        setPaymentReference("")
        paymentModal.dismiss()
        await refreshOrderQueries()
      },
    }),
  )
  const fulfilmentMutation = useMutation(
    trpc.orders.fulfillProductLine.mutationOptions({
      onError: (failure) => {
        setNotice(null)
        setError(failure.message)
      },
      onSuccess: async () => {
        setError(null)
        setNotice("Product fulfilment recorded.")
        await refreshOrderQueries()
      },
    }),
  )
  const fulfilAllMutation = useMutation(
    trpc.orders.fulfillProducts.mutationOptions({
      onError: (failure) => {
        setNotice(null)
        setError(failure.message)
      },
      onSuccess: async (result) => {
        setError(null)
        setNotice(
          result.fulfilledLineCount === 1
            ? "1 Product line fulfilled."
            : `${result.fulfilledLineCount} Product lines fulfilled.`,
        )
        await refreshOrderQueries()
      },
    }),
  )

  const activity = useMemo(
    () => (order ? buildCommercialOrderActivity(order) : []),
    [order],
  )

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace("/dashboard")
  }

  function openCustomer() {
    if (!order) return
    router.push({
      params: { customerOrderId: order.id },
      pathname: "/customer-book-modal",
    } as never)
  }

  function openPaymentForm() {
    if (!order || order.balanceDueMinor <= 0) return
    setAmountPaid(minorToMajorInput(order.balanceDueMinor))
    setError(null)
    paymentModal.present()
  }

  function recordPayment() {
    if (!order || isOffline) return
    const amountMinor = majorToMinor(amountPaid)
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid payment amount.")
      return
    }
    if (amountMinor > order.balanceDueMinor) {
      setError("Payment cannot exceed the balance due.")
      return
    }
    paymentMutation.mutate({
      amountMinor,
      clientPaymentId: `payment-${Crypto.randomUUID()}`,
      method: paymentMethod,
      orderId: order.id,
      reference: paymentReference.trim() || undefined,
    })
  }

  function cancelPayment() {
    setError(null)
    setTimeout(paymentModal.dismiss, 120)
  }

  function fulfilProductLine(orderLineId: string) {
    if (isOffline || fulfilAllMutation.isPending) return
    fulfilmentMutation.mutate({
      clientOperationId: `fulfilment-${Crypto.randomUUID()}`,
      orderLineId,
      schemaVersion: 1,
    })
  }

  function fulfilAllProducts() {
    if (!order || isOffline || fulfilmentMutation.isPending) return
    fulfilAllMutation.mutate({
      clientOperationId: `fulfilment-all-${Crypto.randomUUID()}`,
      orderId: order.id,
      schemaVersion: 1,
    })
  }

  if (!order) {
    return (
      <MobileScreen
        contentClassName="gap-6 pb-12"
        refreshControl={<QueryRefreshControl />}
        scroll
      >
        <CommercialOrderOverviewHeader onBack={goBack} title="Order overview" />
        <View className="flex-1 items-center justify-center py-16">
          {orderQuery.isPending && !isOffline ? (
            <EmptyState
              icon="ReceiptText"
              message="Loading the latest Commercial Order state."
              title="Loading order"
            />
          ) : (
            <EmptyState
              icon="ReceiptText"
              message={
                isOffline
                  ? "This Order is not available in the current device cache. Reconnect to load it."
                  : (orderQuery.error?.message ?? "Commercial Order not found.")
              }
              title={
                isOffline ? "Order unavailable offline" : "Order not found"
              }
            />
          )}
        </View>
        <ActionButton onPress={goBack} variant="outline">
          Back to orders
        </ActionButton>
      </MobileScreen>
    )
  }

  const hasBalanceDue = order.balanceDueMinor > 0

  return (
    <View className="flex-1 bg-background">
      <MobileScreen
        contentClassName={hasBalanceDue ? "gap-7 pb-32" : "gap-7 pb-12"}
        keyboardBottomOffset={140}
        refreshControl={<QueryRefreshControl />}
        scroll
      >
        <CommercialOrderOverviewContent
          activity={activity}
          error={error}
          fulfillingOrderLineId={
            fulfilmentMutation.isPending
              ? fulfilmentMutation.variables?.orderLineId
              : undefined
          }
          isFulfillingAll={fulfilAllMutation.isPending}
          isOffline={isOffline}
          notice={notice}
          onBack={goBack}
          onFulfillAll={fulfilAllProducts}
          onFulfillLine={fulfilProductLine}
          onOpenCustomer={openCustomer}
          order={order}
        />
      </MobileScreen>

      {hasBalanceDue ? (
        <CommercialOrderOverviewPrimaryAction
          disabled={isOffline}
          onPress={openPaymentForm}
        />
      ) : null}

      <Modal
        enableDynamicSizing
        maxDynamicContentSize={640}
        ref={paymentModal.ref}
        snapPoints={["72%"]}
        title="Record payment"
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={280}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-8">
            <View className="gap-1">
              <Text
                className="text-lg font-extrabold text-foreground"
                selectable
              >
                Balance due
              </Text>
              <Text
                className="text-2xl font-extrabold tabular-nums text-foreground"
                selectable
              >
                {formatMinorMoney(order.balanceDueMinor, order.currencyCode)}
              </Text>
            </View>
            {error ? (
              <StatusBanner
                icon="AlertCircle"
                message={error}
                title="Payment was not recorded"
                tone="destructive"
              />
            ) : null}
            <MoneyField
              currencyCode={order.currencyCode}
              label="Amount received"
              onChangeValue={setAmountPaid}
              value={amountPaid}
            />
            <View className="gap-2">
              <Text className="text-sm font-bold text-foreground">
                Payment method
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {PAYMENT_METHODS.map(([value, label]) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected: paymentMethod === value }}
                    className={
                      paymentMethod === value
                        ? "min-h-11 items-center justify-center rounded-xl bg-foreground px-4"
                        : "min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4"
                    }
                    haptic
                    key={value}
                    onPress={() => setPaymentMethod(value)}
                  >
                    <Text
                      className={
                        paymentMethod === value
                          ? "text-sm font-bold text-background"
                          : "text-sm font-bold text-foreground"
                      }
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <FormField
              label="Payment reference"
              onChangeText={setPaymentReference}
              placeholder="Optional"
              value={paymentReference}
            />
            <View className="flex-row gap-3">
              <ActionButton
                className="flex-1"
                onPress={cancelPayment}
                variant="outline"
              >
                Cancel
              </ActionButton>
              <ActionButton
                className="flex-1"
                isLoading={paymentMutation.isPending}
                loadingLabel="Saving"
                onPress={recordPayment}
              >
                Save payment
              </ActionButton>
            </View>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    </View>
  )
}
